const express = require('express');
const { query, getClient } = require('../config/database');
const { authenticate, contactRateLimit } = require('../middleware/auth');
const { validateCreateContact, validateUpdateContact, validateUUID, contentFilter } = require('../middleware/validation');
const { auditLog } = require('../middleware/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { touchContact, getStaleContacts } = require('../services/decay-reminders');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/contacts
 * List contacts with search and filtering
 */
router.get('/', async (req, res) => {
  try {
    const {
      search,
      tag,
      school,
      company,
      event_name,
      source,
      is_favorite,
      sort = 'created_at',
      order = 'desc',
      page = 1,
      limit = 50,
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [req.user.id];
    let paramIndex = 2;

    let whereClause = 'WHERE c.user_id = $1';

    // Full-text search on name
    if (search) {
      whereClause += ` AND (c.full_name ILIKE $${paramIndex} OR c.nickname ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filter by tag
    if (tag) {
      whereClause += ` AND EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_name = $${paramIndex})`;
      params.push(tag);
      paramIndex++;
    }

    // Filter by school
    if (school) {
      whereClause += ` AND EXISTS (SELECT 1 FROM contact_professional cp WHERE cp.contact_id = c.id AND cp.school ILIKE $${paramIndex})`;
      params.push(`%${school}%`);
      paramIndex++;
    }

    // Filter by company
    if (company) {
      whereClause += ` AND EXISTS (SELECT 1 FROM contact_professional cp WHERE cp.contact_id = c.id AND cp.company ILIKE $${paramIndex})`;
      params.push(`%${company}%`);
      paramIndex++;
    }

    // Filter by event
    if (event_name) {
      whereClause += ` AND EXISTS (SELECT 1 FROM contact_context cc WHERE cc.contact_id = c.id AND cc.event_name ILIKE $${paramIndex})`;
      params.push(`%${event_name}%`);
      paramIndex++;
    }

    // Filter by source
    if (source) {
      whereClause += ` AND c.source = $${paramIndex}`;
      params.push(source);
      paramIndex++;
    }

    // Filter favorites
    if (is_favorite === 'true') {
      whereClause += ' AND c.is_favorite = TRUE';
    }

    // Validate sort column
    const validSorts = ['created_at', 'updated_at', 'full_name'];
    const sortColumn = validSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Count total
    const countResult = await query(
      `SELECT COUNT(*) as total FROM contacts c ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Fetch contacts with related data
    params.push(parseInt(limit, 10));
    params.push(offset);

    const contactsResult = await query(
      `SELECT
        c.id, c.full_name, c.nickname, c.pronouns, c.avatar_url,
        c.is_favorite, c.source, c.created_at, c.updated_at,
        cp.school, cp.graduation_year, cp.major, cp.company, cp.job_title,
        cc.event_name, cc.met_date, cc.how_met,
        (SELECT array_agg(ct.tag_name) FROM contact_tags ct WHERE ct.contact_id = c.id) as tags
      FROM contacts c
      LEFT JOIN contact_professional cp ON cp.contact_id = c.id
      LEFT JOIN contact_context cc ON cc.contact_id = c.id
      ${whereClause}
      ORDER BY c.${sortColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    res.json({
      contacts: contactsResult.rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    logger.error('List contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

/**
 * GET /api/contacts/stale
 * Get contacts that haven't been interacted with in N days
 */
router.get('/stale', async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 45;
    const stale = await getStaleContacts(req.user.id, days);
    res.json({ contacts: stale, threshold_days: days });
  } catch (error) {
    logger.error('Get stale contacts error:', error);
    res.status(500).json({ error: 'Failed to get stale contacts' });
  }
});

/**
 * GET /api/contacts/:id
 * Get a single contact with all details
 */
router.get('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch main contact
    const contactResult = await query(
      'SELECT * FROM contacts WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = contactResult.rows[0];

    // Fetch all related data in parallel
    const [professional, social, appearance, context, notes, tags] = await Promise.all([
      query('SELECT * FROM contact_professional WHERE contact_id = $1', [id]),
      query('SELECT * FROM contact_social WHERE contact_id = $1', [id]),
      query('SELECT * FROM contact_appearance WHERE contact_id = $1', [id]),
      query('SELECT * FROM contact_context WHERE contact_id = $1', [id]),
      query('SELECT * FROM contact_notes WHERE contact_id = $1 ORDER BY created_at DESC', [id]),
      query('SELECT * FROM contact_tags WHERE contact_id = $1', [id]),
    ]);

    // Decrypt encrypted blob if present
    if (contact.encrypted_blob) {
      try {
        contact.encrypted_data = decrypt(contact.encrypted_blob);
      } catch (e) {
        logger.warn('Failed to decrypt contact blob');
      }
    }
    delete contact.encrypted_blob;

    res.json({
      ...contact,
      professional: professional.rows[0] || null,
      social: social.rows,
      appearance: appearance.rows[0] || null,
      context: context.rows[0] || null,
      notes: notes.rows,
      tags: tags.rows.map((t) => t.tag_name),
    });
  } catch (error) {
    logger.error('Get contact error:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

/**
 * POST /api/contacts
 * Create a new contact with all related data
 */
router.post(
  '/',
  contactRateLimit,
  validateCreateContact,
  contentFilter,
  auditLog('create_contact', 'contact'),
  async (req, res) => {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const {
        full_name,
        nickname,
        pronouns,
        avatar_url,
        source = 'manual',
        is_favorite = false,
        professional,
        social,
        appearance,
        context,
        notes,
        tags,
      } = req.body;

      // Create contact
      const contactResult = await client.query(
        `INSERT INTO contacts (user_id, full_name, nickname, pronouns, avatar_url, source, is_favorite)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.id, full_name, nickname, pronouns, avatar_url, source, is_favorite]
      );
      const contact = contactResult.rows[0];

      // Create professional info
      if (professional) {
        await client.query(
          `INSERT INTO contact_professional (contact_id, school, graduation_year, major, company, job_title, department)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            contact.id,
            professional.school,
            professional.graduation_year,
            professional.major,
            professional.company,
            professional.job_title,
            professional.department,
          ]
        );
      }

      // Create social links
      if (social && social.length > 0) {
        for (const s of social) {
          await client.query(
            `INSERT INTO contact_social (contact_id, platform, handle, url)
             VALUES ($1, $2, $3, $4)`,
            [contact.id, s.platform, s.handle, s.url]
          );
        }
      }

      // Create appearance
      if (appearance) {
        await client.query(
          `INSERT INTO contact_appearance (contact_id, height_range, hair_color, glasses, distinguishing_features)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            contact.id,
            appearance.height_range,
            appearance.hair_color,
            appearance.glasses,
            appearance.distinguishing_features || [],
          ]
        );
      }

      // Create context
      if (context) {
        await client.query(
          `INSERT INTO contact_context (contact_id, how_met, event_name, met_date, location, mutual_connections)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            contact.id,
            context.how_met,
            context.event_name,
            context.met_date,
            context.location,
            context.mutual_connections || [],
          ]
        );
      }

      // Create notes
      if (notes && notes.length > 0) {
        for (const note of notes) {
          await client.query(
            'INSERT INTO contact_notes (contact_id, content, source) VALUES ($1, $2, $3)',
            [contact.id, note.content, note.source || 'manual']
          );
        }
      }

      // Create tags
      if (tags && tags.length > 0) {
        for (const tagName of tags) {
          await client.query(
            'INSERT INTO contact_tags (contact_id, tag_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [contact.id, tagName.trim()]
          );
        }
      }

      // Increment daily contact count
      await client.query(
        'UPDATE users SET daily_contact_count = daily_contact_count + 1 WHERE id = $1',
        [req.user.id]
      );

      await client.query('COMMIT');

      logger.info(`Contact created: ${contact.id} by user ${req.user.id}`);

      res.status(201).json({
        id: contact.id,
        message: 'Contact created successfully',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Create contact error:', error);
      res.status(500).json({ error: 'Failed to create contact' });
    } finally {
      client.release();
    }
  }
);

/**
 * PUT /api/contacts/:id
 * Update a contact
 */
router.put(
  '/:id',
  validateUpdateContact,
  contentFilter,
  auditLog('update_contact', 'contact'),
  async (req, res) => {
    const client = await getClient();

    try {
      // Verify ownership
      const existing = await client.query(
        'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );

      if (existing.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Contact not found' });
      }

      await client.query('BEGIN');

      const { full_name, nickname, pronouns, avatar_url, is_favorite, professional, social, appearance, context, notes, tags } =
        req.body;

      // Update main contact fields
      await client.query(
        `UPDATE contacts SET
          full_name = COALESCE($1, full_name),
          nickname = COALESCE($2, nickname),
          pronouns = COALESCE($3, pronouns),
          avatar_url = COALESCE($4, avatar_url),
          is_favorite = COALESCE($5, is_favorite)
        WHERE id = $6`,
        [full_name, nickname, pronouns, avatar_url, is_favorite, req.params.id]
      );

      // Upsert professional
      if (professional) {
        await client.query(
          `INSERT INTO contact_professional (contact_id, school, graduation_year, major, company, job_title, department)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (contact_id) DO UPDATE SET
             school = COALESCE(EXCLUDED.school, contact_professional.school),
             graduation_year = COALESCE(EXCLUDED.graduation_year, contact_professional.graduation_year),
             major = COALESCE(EXCLUDED.major, contact_professional.major),
             company = COALESCE(EXCLUDED.company, contact_professional.company),
             job_title = COALESCE(EXCLUDED.job_title, contact_professional.job_title),
             department = COALESCE(EXCLUDED.department, contact_professional.department)`,
          [
            req.params.id,
            professional.school,
            professional.graduation_year,
            professional.major,
            professional.company,
            professional.job_title,
            professional.department,
          ]
        );
      }

      // Replace social links
      if (social) {
        await client.query('DELETE FROM contact_social WHERE contact_id = $1', [req.params.id]);
        for (const s of social) {
          await client.query(
            'INSERT INTO contact_social (contact_id, platform, handle, url) VALUES ($1, $2, $3, $4)',
            [req.params.id, s.platform, s.handle, s.url]
          );
        }
      }

      // Upsert appearance
      if (appearance) {
        await client.query(
          `INSERT INTO contact_appearance (contact_id, height_range, hair_color, glasses, distinguishing_features)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (contact_id) DO UPDATE SET
             height_range = COALESCE(EXCLUDED.height_range, contact_appearance.height_range),
             hair_color = COALESCE(EXCLUDED.hair_color, contact_appearance.hair_color),
             glasses = COALESCE(EXCLUDED.glasses, contact_appearance.glasses),
             distinguishing_features = COALESCE(EXCLUDED.distinguishing_features, contact_appearance.distinguishing_features)`,
          [
            req.params.id,
            appearance.height_range,
            appearance.hair_color,
            appearance.glasses,
            appearance.distinguishing_features || [],
          ]
        );
      }

      // Upsert context
      if (context) {
        await client.query(
          `INSERT INTO contact_context (contact_id, how_met, event_name, met_date, location, mutual_connections)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (contact_id) DO UPDATE SET
             how_met = COALESCE(EXCLUDED.how_met, contact_context.how_met),
             event_name = COALESCE(EXCLUDED.event_name, contact_context.event_name),
             met_date = COALESCE(EXCLUDED.met_date, contact_context.met_date),
             location = COALESCE(EXCLUDED.location, contact_context.location),
             mutual_connections = COALESCE(EXCLUDED.mutual_connections, contact_context.mutual_connections)`,
          [
            req.params.id,
            context.how_met,
            context.event_name,
            context.met_date,
            context.location,
            context.mutual_connections || [],
          ]
        );
      }

      // Replace tags
      if (tags) {
        await client.query('DELETE FROM contact_tags WHERE contact_id = $1', [req.params.id]);
        for (const tagName of tags) {
          await client.query(
            'INSERT INTO contact_tags (contact_id, tag_name) VALUES ($1, $2)',
            [req.params.id, tagName.trim()]
          );
        }
      }

      await client.query('COMMIT');

      res.json({ message: 'Contact updated successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Update contact error:', error);
      res.status(500).json({ error: 'Failed to update contact' });
    } finally {
      client.release();
    }
  }
);

/**
 * DELETE /api/contacts/:id
 */
router.delete(
  '/:id',
  validateUUID,
  auditLog('delete_contact', 'contact'),
  async (req, res) => {
    try {
      const result = await query(
        'DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING id',
        [req.params.id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
      logger.error('Delete contact error:', error);
      res.status(500).json({ error: 'Failed to delete contact' });
    }
  }
);

/**
 * POST /api/contacts/:id/notes
 * Add a note to a contact
 */
router.post('/:id/notes', authenticate, async (req, res) => {
  try {
    const { content, source = 'manual' } = req.body;

    // Verify ownership
    const contact = await query('SELECT id FROM contacts WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);

    if (contact.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const result = await query(
      'INSERT INTO contact_notes (contact_id, content, source) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, content, source]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Add note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

/**
 * POST /api/contacts/:id/tags
 * Add tags to a contact
 */
router.post('/:id/tags', authenticate, async (req, res) => {
  try {
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags array is required' });
    }

    // Verify ownership
    const contact = await query('SELECT id FROM contacts WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);

    if (contact.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    for (const tagName of tags) {
      await query(
        'INSERT INTO contact_tags (contact_id, tag_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.id, tagName.trim()]
      );
    }

    const result = await query('SELECT tag_name FROM contact_tags WHERE contact_id = $1', [
      req.params.id,
    ]);

    res.json({ tags: result.rows.map((t) => t.tag_name) });
  } catch (error) {
    logger.error('Add tags error:', error);
    res.status(500).json({ error: 'Failed to add tags' });
  }
});

/**
 * POST /api/contacts/:id/touch
 * Update last_interaction_at for a contact (marks as recently engaged)
 */
router.post('/:id/touch', validateUUID, async (req, res) => {
  try {
    const contact = await query(
      'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (contact.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await touchContact(req.params.id);
    res.json({ message: 'Contact interaction updated' });
  } catch (error) {
    logger.error('Touch contact error:', error);
    res.status(500).json({ error: 'Failed to update contact interaction' });
  }
});

module.exports = router;

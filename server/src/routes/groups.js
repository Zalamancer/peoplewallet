const express = require('express');
const { query, getClient } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/groups
 * Create a new contact group
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, color = '#007AFF', icon = 'people' } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const result = await query(
      `INSERT INTO contact_groups (user_id, name, description, color, icon)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, name.trim(), description?.trim() || null, color, icon]
    );

    logger.info(`Group created: ${result.rows[0].id} by user ${req.user.id}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A group with this name already exists' });
    }
    logger.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

/**
 * GET /api/groups
 * List user's groups with member counts
 */
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT g.*,
        COUNT(gm.id)::int AS member_count
      FROM contact_groups g
      LEFT JOIN contact_group_members gm ON gm.group_id = g.id
      WHERE g.user_id = $1
      GROUP BY g.id
      ORDER BY g.name ASC`,
      [req.user.id]
    );

    res.json({ groups: result.rows });
  } catch (error) {
    logger.error('List groups error:', error);
    res.status(500).json({ error: 'Failed to list groups' });
  }
});

/**
 * GET /api/groups/suggestions
 * Suggest groups based on shared event_name, school, or company
 */
router.get('/suggestions', async (req, res) => {
  try {
    // Find contacts sharing the same event_name
    const eventSuggestions = await query(
      `SELECT cc.event_name AS value, 'event' AS type, COUNT(*)::int AS contact_count
       FROM contact_context cc
       JOIN contacts c ON c.id = cc.contact_id
       WHERE c.user_id = $1 AND cc.event_name IS NOT NULL AND cc.event_name != ''
       GROUP BY cc.event_name
       HAVING COUNT(*) >= 2
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
      [req.user.id]
    );

    // Find contacts sharing the same school
    const schoolSuggestions = await query(
      `SELECT cp.school AS value, 'school' AS type, COUNT(*)::int AS contact_count
       FROM contact_professional cp
       JOIN contacts c ON c.id = cp.contact_id
       WHERE c.user_id = $1 AND cp.school IS NOT NULL AND cp.school != ''
       GROUP BY cp.school
       HAVING COUNT(*) >= 2
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
      [req.user.id]
    );

    // Find contacts sharing the same company
    const companySuggestions = await query(
      `SELECT cp.company AS value, 'company' AS type, COUNT(*)::int AS contact_count
       FROM contact_professional cp
       JOIN contacts c ON c.id = cp.contact_id
       WHERE c.user_id = $1 AND cp.company IS NOT NULL AND cp.company != ''
       GROUP BY cp.company
       HAVING COUNT(*) >= 2
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
      [req.user.id]
    );

    // Filter out suggestions that already have groups with the same name
    const existingGroups = await query(
      'SELECT name FROM contact_groups WHERE user_id = $1',
      [req.user.id]
    );
    const existingNames = new Set(existingGroups.rows.map((g) => g.name.toLowerCase()));

    const allSuggestions = [
      ...eventSuggestions.rows,
      ...schoolSuggestions.rows,
      ...companySuggestions.rows,
    ].filter((s) => !existingNames.has(s.value.toLowerCase()));

    res.json({ suggestions: allSuggestions });
  } catch (error) {
    logger.error('Group suggestions error:', error);
    res.status(500).json({ error: 'Failed to get group suggestions' });
  }
});

/**
 * GET /api/groups/:id
 * Get a group with its members
 */
router.get('/:id', async (req, res) => {
  try {
    const groupResult = await query(
      'SELECT * FROM contact_groups WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const group = groupResult.rows[0];

    // Fetch members with contact details
    const membersResult = await query(
      `SELECT c.id, c.full_name, c.nickname, c.avatar_url, c.is_favorite, c.source,
        cp.company, cp.job_title, cp.school,
        cc.event_name,
        gm.added_at,
        (SELECT array_agg(ct.tag_name) FROM contact_tags ct WHERE ct.contact_id = c.id) AS tags
      FROM contact_group_members gm
      JOIN contacts c ON c.id = gm.contact_id
      LEFT JOIN contact_professional cp ON cp.contact_id = c.id
      LEFT JOIN contact_context cc ON cc.contact_id = c.id
      WHERE gm.group_id = $1
      ORDER BY c.full_name ASC`,
      [req.params.id]
    );

    res.json({
      ...group,
      members: membersResult.rows,
      member_count: membersResult.rows.length,
    });
  } catch (error) {
    logger.error('Get group error:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

/**
 * PUT /api/groups/:id
 * Update a group
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, description, color, icon } = req.body;

    const result = await query(
      `UPDATE contact_groups SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        color = COALESCE($3, color),
        icon = COALESCE($4, icon)
      WHERE id = $5 AND user_id = $6
      RETURNING *`,
      [name?.trim(), description?.trim(), color, icon, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A group with this name already exists' });
    }
    logger.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

/**
 * DELETE /api/groups/:id
 * Delete a group (does not delete the contacts themselves)
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM contact_groups WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    logger.error('Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

/**
 * POST /api/groups/:id/members
 * Add contacts to a group (batch)
 * Body: { contact_ids: [uuid, uuid, ...] }
 */
router.post('/:id/members', async (req, res) => {
  const client = await getClient();

  try {
    const { contact_ids } = req.body;

    if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
      client.release();
      return res.status(400).json({ error: 'contact_ids array is required' });
    }

    // Verify group ownership
    const group = await client.query(
      'SELECT id FROM contact_groups WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (group.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Group not found' });
    }

    await client.query('BEGIN');

    let added = 0;
    for (const contactId of contact_ids) {
      // Verify contact ownership
      const contact = await client.query(
        'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
        [contactId, req.user.id]
      );

      if (contact.rows.length > 0) {
        await client.query(
          `INSERT INTO contact_group_members (group_id, contact_id)
           VALUES ($1, $2)
           ON CONFLICT (group_id, contact_id) DO NOTHING`,
          [req.params.id, contactId]
        );
        added++;
      }
    }

    await client.query('COMMIT');

    res.json({ message: `${added} contact(s) added to group`, added });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Add group members error:', error);
    res.status(500).json({ error: 'Failed to add contacts to group' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/groups/:id/members
 * Remove contacts from a group
 * Body: { contact_ids: [uuid, uuid, ...] }
 */
router.delete('/:id/members', async (req, res) => {
  try {
    const { contact_ids } = req.body;

    if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
      return res.status(400).json({ error: 'contact_ids array is required' });
    }

    // Verify group ownership
    const group = await query(
      'SELECT id FROM contact_groups WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (group.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const result = await query(
      `DELETE FROM contact_group_members
       WHERE group_id = $1 AND contact_id = ANY($2::uuid[])
       RETURNING id`,
      [req.params.id, contact_ids]
    );

    res.json({
      message: `${result.rows.length} contact(s) removed from group`,
      removed: result.rows.length,
    });
  } catch (error) {
    logger.error('Remove group members error:', error);
    res.status(500).json({ error: 'Failed to remove contacts from group' });
  }
});

/**
 * GET /api/groups/:id/export
 * Export group contacts as CSV or vCard
 * Query: ?format=csv|vcard (default: csv)
 */
router.get('/:id/export', async (req, res) => {
  try {
    const { format = 'csv' } = req.query;

    // Verify group ownership
    const groupResult = await query(
      'SELECT * FROM contact_groups WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const group = groupResult.rows[0];

    // Fetch members with details
    const membersResult = await query(
      `SELECT c.full_name, c.nickname, c.pronouns,
        cp.company, cp.job_title, cp.school, cp.major, cp.graduation_year,
        cc.event_name, cc.how_met, cc.location,
        (SELECT string_agg(cs.handle, ', ') FROM contact_social cs WHERE cs.contact_id = c.id AND cs.platform = 'linkedin') AS linkedin,
        (SELECT string_agg(cs.handle, ', ') FROM contact_social cs WHERE cs.contact_id = c.id AND cs.platform = 'instagram') AS instagram,
        (SELECT string_agg(ct.tag_name, ', ') FROM contact_tags ct WHERE ct.contact_id = c.id) AS tags
      FROM contact_group_members gm
      JOIN contacts c ON c.id = gm.contact_id
      LEFT JOIN contact_professional cp ON cp.contact_id = c.id
      LEFT JOIN contact_context cc ON cc.contact_id = c.id
      WHERE gm.group_id = $1
      ORDER BY c.full_name ASC`,
      [req.params.id]
    );

    const members = membersResult.rows;

    if (format === 'vcard') {
      // Generate vCard 3.0 format
      let vcards = '';
      for (const m of members) {
        const nameParts = (m.full_name || '').split(' ');
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
        const firstName = nameParts[0] || '';

        vcards += 'BEGIN:VCARD\r\n';
        vcards += 'VERSION:3.0\r\n';
        vcards += `FN:${m.full_name}\r\n`;
        vcards += `N:${lastName};${firstName};;;\r\n`;
        if (m.company || m.job_title) {
          vcards += `ORG:${m.company || ''}\r\n`;
          vcards += `TITLE:${m.job_title || ''}\r\n`;
        }
        if (m.nickname) {
          vcards += `NICKNAME:${m.nickname}\r\n`;
        }
        if (m.tags) {
          vcards += `CATEGORIES:${m.tags}\r\n`;
        }
        if (m.event_name) {
          vcards += `NOTE:Met at ${m.event_name}${m.how_met ? ' - ' + m.how_met : ''}\r\n`;
        }
        vcards += 'END:VCARD\r\n\r\n';
      }

      res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${group.name.replace(/[^a-zA-Z0-9]/g, '_')}_contacts.vcf"`
      );
      return res.send(vcards);
    }

    // Default: CSV format
    const headers = [
      'Full Name', 'Nickname', 'Pronouns', 'Company', 'Job Title',
      'School', 'Major', 'Graduation Year', 'Event', 'How Met',
      'Location', 'LinkedIn', 'Instagram', 'Tags',
    ];

    const escapeCSV = (val) => {
      if (!val) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let csv = headers.join(',') + '\r\n';
    for (const m of members) {
      csv += [
        m.full_name, m.nickname, m.pronouns, m.company, m.job_title,
        m.school, m.major, m.graduation_year, m.event_name, m.how_met,
        m.location, m.linkedin, m.instagram, m.tags,
      ].map(escapeCSV).join(',') + '\r\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${group.name.replace(/[^a-zA-Z0-9]/g, '_')}_contacts.csv"`
    );
    res.send(csv);
  } catch (error) {
    logger.error('Export group error:', error);
    res.status(500).json({ error: 'Failed to export group' });
  }
});

/**
 * POST /api/groups/auto-create
 * Auto-create a group from a suggestion and populate with matching contacts
 * Body: { name: string, type: 'event' | 'school' | 'company', value: string, color?: string, icon?: string }
 */
router.post('/auto-create', async (req, res) => {
  const client = await getClient();

  try {
    const { name, type, value, color = '#007AFF', icon = 'people' } = req.body;

    if (!name || !type || !value) {
      client.release();
      return res.status(400).json({ error: 'name, type, and value are required' });
    }

    await client.query('BEGIN');

    // Create the group
    const groupResult = await client.query(
      `INSERT INTO contact_groups (user_id, name, description, color, icon)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, name.trim(), `Auto-created from ${type}: ${value}`, color, icon]
    );
    const group = groupResult.rows[0];

    // Find matching contacts based on type
    let contactsQuery;
    if (type === 'event') {
      contactsQuery = await client.query(
        `SELECT c.id FROM contacts c
         JOIN contact_context cc ON cc.contact_id = c.id
         WHERE c.user_id = $1 AND cc.event_name = $2`,
        [req.user.id, value]
      );
    } else if (type === 'school') {
      contactsQuery = await client.query(
        `SELECT c.id FROM contacts c
         JOIN contact_professional cp ON cp.contact_id = c.id
         WHERE c.user_id = $1 AND cp.school = $2`,
        [req.user.id, value]
      );
    } else if (type === 'company') {
      contactsQuery = await client.query(
        `SELECT c.id FROM contacts c
         JOIN contact_professional cp ON cp.contact_id = c.id
         WHERE c.user_id = $1 AND cp.company = $2`,
        [req.user.id, value]
      );
    }

    // Add matching contacts to the group
    let added = 0;
    if (contactsQuery && contactsQuery.rows.length > 0) {
      for (const row of contactsQuery.rows) {
        await client.query(
          `INSERT INTO contact_group_members (group_id, contact_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [group.id, row.id]
        );
        added++;
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      ...group,
      member_count: added,
      message: `Group created with ${added} contact(s)`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A group with this name already exists' });
    }
    logger.error('Auto-create group error:', error);
    res.status(500).json({ error: 'Failed to auto-create group' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/groups/for-contact/:contactId
 * Get all groups a specific contact belongs to
 */
router.get('/for-contact/:contactId', async (req, res) => {
  try {
    // Verify contact ownership
    const contact = await query(
      'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
      [req.params.contactId, req.user.id]
    );

    if (contact.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const result = await query(
      `SELECT g.*, gm.added_at
       FROM contact_groups g
       JOIN contact_group_members gm ON gm.group_id = g.id
       WHERE gm.contact_id = $1 AND g.user_id = $2
       ORDER BY g.name ASC`,
      [req.params.contactId, req.user.id]
    );

    res.json({ groups: result.rows });
  } catch (error) {
    logger.error('Get contact groups error:', error);
    res.status(500).json({ error: 'Failed to get contact groups' });
  }
});

module.exports = router;

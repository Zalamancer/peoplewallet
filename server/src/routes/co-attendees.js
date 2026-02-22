const express = require('express');
const { query, getClient } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { recordSignal } = require('../services/scoring');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/co-attendees/:eventId
 * Get all co-attendees for an event.
 * Respects attendance_visibility settings:
 *  - 'public': always visible
 *  - 'mutual_only': visible only if current user has saved them as a contact
 *  - 'private': never visible
 * Also indicates whether each co-attendee is already saved as a contact.
 */
router.get('/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const {
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const userId = req.user.id;

    // Build the base query: find users who co-attended this event with the current user
    const params = [eventId, userId];
    let paramIndex = 3;

    let searchClause = '';
    if (search) {
      searchClause = ` AND (u.name ILIKE $${paramIndex} OR cp.school ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Count total eligible co-attendees (excluding private, applying mutual_only logic)
    const countResult = await query(
      `SELECT COUNT(DISTINCT u.id) as total
       FROM co_attendances ca
       JOIN users u ON u.id = CASE
         WHEN ca.user_a_id = $2 THEN ca.user_b_id
         ELSE ca.user_a_id
       END
       LEFT JOIN contact_professional cp ON cp.contact_id = (
         SELECT c.id FROM contacts c WHERE c.user_id = u.id LIMIT 1
       )
       WHERE ca.event_id = $1
         AND (ca.user_a_id = $2 OR ca.user_b_id = $2)
         AND u.id != $2
         AND COALESCE(u.attendance_visibility, 'public') != 'private'
         AND (
           COALESCE(u.attendance_visibility, 'public') = 'public'
           OR (
             u.attendance_visibility = 'mutual_only'
             AND EXISTS (
               SELECT 1 FROM contacts c
               WHERE c.user_id = $2 AND c.linked_user_id = u.id
             )
           )
         )
         ${searchClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Fetch co-attendees with profile data, pagination, and saved-contact indicator
    const fetchParams = [...params, parseInt(limit, 10), offset];

    const coAttendeesResult = await query(
      `SELECT DISTINCT ON (u.id)
        u.id as user_id,
        u.name,
        u.email,
        u.avatar_url,
        cp.school,
        cp.major,
        cp.graduation_year,
        COALESCE(u.attendance_visibility, 'public') as attendance_visibility,
        ca.created_at as co_attendance_date,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM contacts c
            WHERE c.user_id = $2 AND c.linked_user_id = u.id
          ) THEN TRUE
          ELSE FALSE
        END as is_saved_contact
       FROM co_attendances ca
       JOIN users u ON u.id = CASE
         WHEN ca.user_a_id = $2 THEN ca.user_b_id
         ELSE ca.user_a_id
       END
       LEFT JOIN contacts saved_c ON saved_c.user_id = u.id
       LEFT JOIN contact_professional cp ON cp.contact_id = saved_c.id
       WHERE ca.event_id = $1
         AND (ca.user_a_id = $2 OR ca.user_b_id = $2)
         AND u.id != $2
         AND COALESCE(u.attendance_visibility, 'public') != 'private'
         AND (
           COALESCE(u.attendance_visibility, 'public') = 'public'
           OR (
             u.attendance_visibility = 'mutual_only'
             AND EXISTS (
               SELECT 1 FROM contacts c
               WHERE c.user_id = $2 AND c.linked_user_id = u.id
             )
           )
         )
         ${searchClause}
       ORDER BY u.id, ca.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      fetchParams
    );

    res.json({
      co_attendees: coAttendeesResult.rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    logger.error('Get co-attendees error:', error);
    res.status(500).json({ error: 'Failed to fetch co-attendees' });
  }
});

/**
 * POST /api/co-attendees/save
 * One-tap save a co-attendee as a contact.
 * Fetches the target user's profile, creates a Contact with related records,
 * and auto-assigns to an event-based ContactGroup.
 * Rate limited to 30 saves per hour.
 */
router.post('/save', async (req, res) => {
  const client = await getClient();

  try {
    const { target_user_id, event_id } = req.body;
    const userId = req.user.id;

    if (!target_user_id || !event_id) {
      client.release();
      return res.status(400).json({ error: 'target_user_id and event_id are required' });
    }

    if (target_user_id === userId) {
      client.release();
      return res.status(400).json({ error: 'Cannot save yourself as a contact' });
    }

    // Rate limit: max 30 saves per hour
    const rateLimitResult = await query(
      `SELECT COUNT(*) as save_count
       FROM contacts
       WHERE user_id = $1
         AND source = 'co_attendee'
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [userId]
    );

    if (parseInt(rateLimitResult.rows[0].save_count, 10) >= 30) {
      client.release();
      return res.status(429).json({
        error: 'Co-attendee save rate limit reached (30/hour)',
        retry_after: '1 hour',
      });
    }

    // Fetch target user profile
    const targetUserResult = await query(
      'SELECT id, name, email, avatar_url FROM users WHERE id = $1',
      [target_user_id]
    );

    if (targetUserResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Target user not found' });
    }

    const targetUser = targetUserResult.rows[0];

    // Check if already saved as contact (by linked_user_id or name/email fallback)
    const existingContact = await query(
      `SELECT id FROM contacts
       WHERE user_id = $1
         AND (linked_user_id = $2 OR full_name = $3 OR email = $4)`,
      [userId, target_user_id, targetUser.name, targetUser.email]
    );

    if (existingContact.rows.length > 0) {
      client.release();
      return res.status(409).json({
        error: 'This person is already saved as a contact',
        contact_id: existingContact.rows[0].id,
      });
    }

    // Fetch target user's profile data (from their own contacts or user profile)
    const targetProfileResult = await query(
      `SELECT cp.school, cp.major, cp.graduation_year, cp.company, cp.job_title, cp.department
       FROM contacts c
       JOIN contact_professional cp ON cp.contact_id = c.id
       WHERE c.user_id = $1
       LIMIT 1`,
      [target_user_id]
    );
    const targetProfile = targetProfileResult.rows[0] || {};

    // Fetch event info
    const eventResult = await query(
      'SELECT id, name, event_date FROM events WHERE id = $1',
      [event_id]
    );
    const event = eventResult.rows[0];
    const eventName = event ? event.name : 'Unknown Event';
    const eventDate = event ? event.event_date : new Date();

    await client.query('BEGIN');

    // Create Contact record (linked to the target user since they're a registered user)
    const contactResult = await client.query(
      `INSERT INTO contacts (user_id, full_name, email, avatar_url, source, linked_user_id, link_confidence, linked_at)
       VALUES ($1, $2, $3, $4, 'co_attendee', $5, 'high', NOW()) RETURNING *`,
      [userId, targetUser.name, targetUser.email, targetUser.avatar_url, target_user_id]
    );
    const contact = contactResult.rows[0];

    // Create ContactProfessional from target user's profile data
    if (targetProfile.school || targetProfile.company) {
      await client.query(
        `INSERT INTO contact_professional (contact_id, school, graduation_year, major, company, job_title, department)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          contact.id,
          targetProfile.school || null,
          targetProfile.graduation_year || null,
          targetProfile.major || null,
          targetProfile.company || null,
          targetProfile.job_title || null,
          targetProfile.department || null,
        ]
      );
    }

    // Create ContactContext with event info
    await client.query(
      `INSERT INTO contact_context (contact_id, how_met, event_name, met_date)
       VALUES ($1, 'Co-attended event', $2, $3)`,
      [contact.id, eventName, eventDate]
    );

    // Create EventContact bridge record (if the table exists)
    try {
      await client.query(
        `INSERT INTO event_contacts (event_id, contact_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [event_id, contact.id]
      );
    } catch (bridgeError) {
      // event_contacts table may not exist yet; log and continue
      logger.debug('event_contacts bridge insert skipped:', bridgeError.message);
    }

    // Find or create ContactGroup for this event
    let groupResult = await client.query(
      `SELECT id FROM contact_groups
       WHERE user_id = $1 AND name ILIKE $2`,
      [userId, `${eventName}%`]
    );

    let groupId;
    if (groupResult.rows.length > 0) {
      groupId = groupResult.rows[0].id;
    } else {
      // Create a new group named "[Event Name] ([Date])"
      const dateStr = new Date(eventDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const groupName = `${eventName} (${dateStr})`;

      const newGroup = await client.query(
        `INSERT INTO contact_groups (user_id, name, description, color, icon)
         VALUES ($1, $2, $3, '#007AFF', 'calendar')
         RETURNING id`,
        [userId, groupName, `Auto-created from co-attendee save at ${eventName}`]
      );
      groupId = newGroup.rows[0].id;
    }

    // Add contact to the event's ContactGroup
    await client.query(
      `INSERT INTO contact_group_members (group_id, contact_id)
       VALUES ($1, $2) ON CONFLICT (group_id, contact_id) DO NOTHING`,
      [groupId, contact.id]
    );

    await client.query('COMMIT');

    logger.info(`Co-attendee saved: user ${userId} saved ${target_user_id} as contact ${contact.id} from event ${event_id}`);

    // Record a signal for relationship scoring (non-blocking)
    recordSignal(userId, contact.id, 'co_attendance', { event_id, event_name: eventName }).catch((err) =>
      logger.warn('Failed to record co-attendance signal:', err.message)
    );

    res.status(201).json({
      contact: {
        id: contact.id,
        full_name: contact.full_name,
        avatar_url: contact.avatar_url,
        source: contact.source,
      },
      group_id: groupId,
      message: 'Co-attendee saved as contact successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Save co-attendee error:', error);
    res.status(500).json({ error: 'Failed to save co-attendee as contact' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/co-attendees/check-in
 * Record that the current user has checked into an event.
 * Creates co_attendance records with all other users who have already checked in.
 * Idempotent (ON CONFLICT DO NOTHING).
 */
router.post('/check-in', async (req, res) => {
  const client = await getClient();

  try {
    const { event_id } = req.body;
    const userId = req.user.id;

    if (!event_id) {
      client.release();
      return res.status(400).json({ error: 'event_id is required' });
    }

    await client.query('BEGIN');

    // Mark the user's own attendance (upsert)
    await client.query(
      `INSERT INTO event_attendances (user_id, event_id, checked_in_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, event_id) DO UPDATE SET checked_in_at = NOW()`,
      [userId, event_id]
    );

    // Find all other users who have already checked into this event
    const otherAttendeesResult = await client.query(
      `SELECT user_id FROM event_attendances
       WHERE event_id = $1 AND user_id != $2`,
      [event_id, userId]
    );

    let coAttendancesCreated = 0;
    for (const row of otherAttendeesResult.rows) {
      const otherUserId = row.user_id;
      // Ensure user_a_id < user_b_id for consistent pair ordering
      const userAId = userId < otherUserId ? userId : otherUserId;
      const userBId = userId < otherUserId ? otherUserId : userId;

      const insertResult = await client.query(
        `INSERT INTO co_attendances (user_a_id, user_b_id, event_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [userAId, userBId, event_id]
      );

      if (insertResult.rows.length > 0) {
        coAttendancesCreated++;
      }
    }

    await client.query('COMMIT');

    logger.info(`Check-in: user ${userId} checked into event ${event_id}, created ${coAttendancesCreated} co-attendance records`);

    res.json({
      message: 'Checked in successfully',
      event_id,
      co_attendees_found: otherAttendeesResult.rows.length,
      co_attendances_created: coAttendancesCreated,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to check in to event' });
  } finally {
    client.release();
  }
});

module.exports = router;

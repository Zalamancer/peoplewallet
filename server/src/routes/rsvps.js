const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/rsvps/events/:eventId/rsvp
 * UPSERT an RSVP for an event. If going, check capacity first.
 * Body: { status: 'going' | 'maybe' | 'not_going' }
 */
router.post('/events/:eventId/rsvp', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const validStatuses = ['going', 'maybe', 'not_going'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    // Verify event exists
    const eventResult = await query(
      'SELECT id, capacity FROM events WHERE id = $1',
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];

    // If status is 'going', check capacity
    if (status === 'going' && event.capacity) {
      const goingCount = await query(
        `SELECT COUNT(*)::int AS count FROM rsvps
         WHERE event_id = $1 AND status = 'going'
         AND user_id != $2`,
        [eventId, req.user.id]
      );

      if (goingCount.rows[0].count >= event.capacity) {
        return res.status(409).json({ error: 'Event is at full capacity' });
      }
    }

    // Upsert the RSVP
    const result = await query(
      `INSERT INTO rsvps (event_id, user_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id, user_id) DO UPDATE SET
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [eventId, req.user.id, status]
    );

    logger.info(`RSVP upserted: user ${req.user.id} -> event ${eventId} (${status})`);
    res.json({ rsvp: result.rows[0] });
  } catch (error) {
    logger.error('RSVP upsert error:', error);
    res.status(500).json({ error: 'Failed to save RSVP' });
  }
});

/**
 * DELETE /api/rsvps/events/:eventId/rsvp
 * Remove the current user's RSVP for an event
 */
router.delete('/events/:eventId/rsvp', async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await query(
      'DELETE FROM rsvps WHERE event_id = $1 AND user_id = $2 RETURNING id',
      [eventId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'RSVP not found' });
    }

    logger.info(`RSVP removed: user ${req.user.id} -> event ${eventId}`);
    res.json({ message: 'RSVP removed successfully' });
  } catch (error) {
    logger.error('Remove RSVP error:', error);
    res.status(500).json({ error: 'Failed to remove RSVP' });
  }
});

/**
 * GET /api/rsvps/events/:eventId/rsvps
 * List RSVPs for an event with user info, paginated
 */
router.get('/events/:eventId/rsvps', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    // Count total RSVPs
    const countResult = await query(
      'SELECT COUNT(*)::int AS total FROM rsvps WHERE event_id = $1',
      [eventId]
    );
    const total = countResult.rows[0].total;

    const rsvpsResult = await query(
      `SELECT r.id, r.status, r.created_at, r.updated_at,
        u.id AS user_id, u.name AS display_name, u.avatar_url
       FROM rsvps r
       JOIN users u ON u.id = r.user_id
       WHERE r.event_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [eventId, parsedLimit, offset]
    );

    res.json({
      rsvps: rsvpsResult.rows,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error('List event RSVPs error:', error);
    res.status(500).json({ error: 'Failed to list RSVPs' });
  }
});

/**
 * GET /api/rsvps/me
 * List current user's RSVPs with event info
 * Filters: status, upcoming_only
 */
router.get('/me', async (req, res) => {
  try {
    const { status, upcoming_only, page = 1, limit = 20 } = req.query;

    const params = [req.user.id];
    let paramIndex = 2;
    let whereClause = 'WHERE r.user_id = $1';

    if (status) {
      whereClause += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (upcoming_only === 'true') {
      whereClause += ' AND e.event_date > NOW()';
    }

    // Count total
    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM rsvps r
       JOIN events e ON e.id = r.event_id
       ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    params.push(parsedLimit);
    params.push(offset);

    const rsvpsResult = await query(
      `SELECT r.id, r.status, r.created_at, r.updated_at,
        e.id AS event_id, e.name AS event_name, e.description AS event_description,
        e.event_date, e.location, e.event_type
       FROM rsvps r
       JOIN events e ON e.id = r.event_id
       ${whereClause}
       ORDER BY e.event_date ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    res.json({
      rsvps: rsvpsResult.rows,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error('List user RSVPs error:', error);
    res.status(500).json({ error: 'Failed to list your RSVPs' });
  }
});

module.exports = router;

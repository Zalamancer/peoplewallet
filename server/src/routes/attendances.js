const express = require('express');
const { query, getClient } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { generateQRPayload, verifyQRPayload } = require('../utils/qr-jwt');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * Helper: populate co_attendances for a newly checked-in user at an event.
 * Finds all other attendees and inserts normalized (user_a_id < user_b_id) pairs.
 */
async function populateCoAttendances(client, userId, eventId) {
  const otherAttendeesResult = await client.query(
    `SELECT user_id FROM event_attendances
     WHERE event_id = $1 AND user_id != $2`,
    [eventId, userId]
  );

  let created = 0;
  for (const row of otherAttendeesResult.rows) {
    const otherUserId = row.user_id;
    const userAId = userId < otherUserId ? userId : otherUserId;
    const userBId = userId < otherUserId ? otherUserId : userId;

    const insertResult = await client.query(
      `INSERT INTO co_attendances (user_a_id, user_b_id, event_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [userAId, userBId, eventId]
    );

    if (insertResult.rows.length > 0) {
      created++;
    }
  }

  return { otherCount: otherAttendeesResult.rows.length, created };
}

/**
 * POST /api/attendances/events/:eventId/checkin
 * QR-based check-in.
 * Body: { qrToken }
 * Verifies QR payload, checks RSVP status, validates check-in window,
 * inserts attendance with method 'qr_scan', and populates co_attendances.
 */
router.post('/events/:eventId/checkin', async (req, res) => {
  const client = await getClient();

  try {
    const { eventId } = req.params;
    const { qrToken } = req.body;
    const userId = req.user.id;

    if (!qrToken) {
      client.release();
      return res.status(400).json({ error: 'qrToken is required' });
    }

    // Verify QR token
    try {
      verifyQRPayload(qrToken, eventId);
    } catch (qrError) {
      client.release();
      return res.status(401).json({ error: 'Invalid or expired QR code' });
    }

    // Check user has RSVP with status 'going'
    const rsvpResult = await query(
      `SELECT id, status FROM event_rsvps
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId]
    );

    if (rsvpResult.rows.length === 0 || rsvpResult.rows[0].status !== 'going') {
      client.release();
      return res.status(403).json({ error: 'You must RSVP as going before checking in' });
    }

    // Fetch event to validate check-in window
    const eventResult = await query(
      'SELECT id, event_date, end_time FROM events WHERE id = $1',
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];
    const now = new Date();
    const eventDate = new Date(event.event_date);

    // Check-in window: 30 min before event_date through end_time or +3 hours
    const windowStart = new Date(eventDate.getTime() - 30 * 60 * 1000);
    const windowEnd = event.end_time
      ? new Date(event.end_time)
      : new Date(eventDate.getTime() + 3 * 60 * 60 * 1000);

    if (now < windowStart || now > windowEnd) {
      client.release();
      return res.status(403).json({
        error: 'Check-in is not available at this time',
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
      });
    }

    await client.query('BEGIN');

    // Insert attendance with method 'qr_scan'
    const attendanceResult = await client.query(
      `INSERT INTO event_attendances (user_id, event_id, method, checked_in_at)
       VALUES ($1, $2, 'qr_scan', NOW())
       ON CONFLICT (user_id, event_id) DO UPDATE SET
         checked_in_at = NOW(),
         method = 'qr_scan'
       RETURNING *`,
      [userId, eventId]
    );

    // Populate co-attendances
    const { otherCount, created } = await populateCoAttendances(client, userId, eventId);

    await client.query('COMMIT');

    logger.info(`QR check-in: user ${userId} checked into event ${eventId}, created ${created} co-attendance records`);

    res.json({
      message: 'Checked in successfully',
      attendance: attendanceResult.rows[0],
      co_attendees_found: otherCount,
      co_attendances_created: created,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('QR check-in error:', error);
    res.status(500).json({ error: 'Failed to check in' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/attendances/events/:eventId/manual-checkin
 * Manual check-in by an officer/president.
 * Body: { userId }
 * Auth: officer/president of event's club.
 * Inserts attendance with method 'manual', checked_in_by = req.user.id.
 */
router.post('/events/:eventId/manual-checkin', async (req, res) => {
  const client = await getClient();

  try {
    const { eventId } = req.params;
    const { userId } = req.body;
    const officerId = req.user.id;

    if (!userId) {
      client.release();
      return res.status(400).json({ error: 'userId is required' });
    }

    // Verify event exists and get club_id
    const eventResult = await query(
      'SELECT id, club_id FROM events WHERE id = $1',
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];

    // Check officer/president role in the event's club
    const membershipResult = await query(
      `SELECT role FROM club_memberships
       WHERE club_id = $1 AND user_id = $2 AND role IN ('officer', 'president')`,
      [event.club_id, officerId]
    );

    if (membershipResult.rows.length === 0) {
      client.release();
      return res.status(403).json({ error: 'Only officers or presidents can manually check in users' });
    }

    await client.query('BEGIN');

    // Insert attendance with method 'manual'
    const attendanceResult = await client.query(
      `INSERT INTO event_attendances (user_id, event_id, method, checked_in_by, checked_in_at)
       VALUES ($1, $2, 'manual', $3, NOW())
       ON CONFLICT (user_id, event_id) DO UPDATE SET
         checked_in_at = NOW(),
         method = 'manual',
         checked_in_by = $3
       RETURNING *`,
      [userId, eventId, officerId]
    );

    // Populate co-attendances
    const { otherCount, created } = await populateCoAttendances(client, userId, eventId);

    await client.query('COMMIT');

    logger.info(`Manual check-in: officer ${officerId} checked in user ${userId} at event ${eventId}, created ${created} co-attendance records`);

    res.json({
      message: 'User checked in successfully',
      attendance: attendanceResult.rows[0],
      co_attendees_found: otherCount,
      co_attendances_created: created,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Manual check-in error:', error);
    res.status(500).json({ error: 'Failed to manually check in user' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/attendances/events/:eventId/qr
 * Generate QR payload for an event.
 * Auth: officer/president of event's club only.
 * Returns { token, expiresIn: 30 }
 */
router.get('/events/:eventId/qr', async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    // Verify event exists and get club_id
    const eventResult = await query(
      'SELECT id, club_id FROM events WHERE id = $1',
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];

    // Check officer/president role
    const membershipResult = await query(
      `SELECT role FROM club_memberships
       WHERE club_id = $1 AND user_id = $2 AND role IN ('officer', 'president')`,
      [event.club_id, userId]
    );

    if (membershipResult.rows.length === 0) {
      return res.status(403).json({ error: 'Only officers or presidents can generate QR codes' });
    }

    const token = generateQRPayload(eventId);

    res.json({ token, expiresIn: 30 });
  } catch (error) {
    logger.error('Generate QR error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

/**
 * GET /api/attendances/events/:eventId/attendances
 * List check-ins for an event with user info.
 * Auth: officer/president of event's club only.
 * Paginated via ?page=1&limit=50
 */
router.get('/events/:eventId/attendances', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.id;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    // Verify event exists and get club_id
    const eventResult = await query(
      'SELECT id, club_id FROM events WHERE id = $1',
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];

    // Check officer/president role
    const membershipResult = await query(
      `SELECT role FROM club_memberships
       WHERE club_id = $1 AND user_id = $2 AND role IN ('officer', 'president')`,
      [event.club_id, userId]
    );

    if (membershipResult.rows.length === 0) {
      return res.status(403).json({ error: 'Only officers or presidents can view attendances' });
    }

    // Count total
    const countResult = await query(
      'SELECT COUNT(*)::int AS total FROM event_attendances WHERE event_id = $1',
      [eventId]
    );
    const total = countResult.rows[0].total;

    // Fetch attendances with user info
    const attendancesResult = await query(
      `SELECT ea.id, ea.user_id, ea.method, ea.checked_in_by, ea.checked_in_at,
              u.name, u.email, u.avatar_url
       FROM event_attendances ea
       JOIN users u ON u.id = ea.user_id
       WHERE ea.event_id = $1
       ORDER BY ea.checked_in_at DESC
       LIMIT $2 OFFSET $3`,
      [eventId, parseInt(limit, 10), offset]
    );

    res.json({
      attendances: attendancesResult.rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    logger.error('List attendances error:', error);
    res.status(500).json({ error: 'Failed to list attendances' });
  }
});

/**
 * GET /api/attendances/me/history
 * User's attended events in reverse chronological order.
 * Includes event name, date, club name, and check-in method.
 * Paginated via ?page=1&limit=20
 */
router.get('/me/history', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user.id;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    // Count total
    const countResult = await query(
      'SELECT COUNT(*)::int AS total FROM event_attendances WHERE user_id = $1',
      [userId]
    );
    const total = countResult.rows[0].total;

    // Fetch attended events with event and club info
    const historyResult = await query(
      `SELECT ea.id AS attendance_id, ea.method, ea.checked_in_at,
              e.id AS event_id, e.name AS event_name, e.event_date, e.location,
              c.id AS club_id, c.name AS club_name
       FROM event_attendances ea
       JOIN events e ON e.id = ea.event_id
       LEFT JOIN clubs c ON c.id = e.club_id
       WHERE ea.user_id = $1
       ORDER BY ea.checked_in_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit, 10), offset]
    );

    res.json({
      history: historyResult.rows,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    logger.error('Attendance history error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
});

module.exports = router;

const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/events/feed
 * AI-powered event feed sorted by feed_score DESC, event_date ASC as tiebreaker.
 * Supports filtering by food_available, is_free, is_on_campus, category,
 * club_id, date_from, date_to, user_clubs_only, and pagination.
 */
router.get('/feed', async (req, res) => {
  try {
    const {
      food_available,
      is_free,
      is_on_campus,
      category,
      event_type,
      club_id,
      date_from,
      date_to,
      date_filter,
      search,
      sort,
      user_clubs_only,
      page = 1,
      limit = 20,
    } = req.query;

    const params = [];
    let paramIndex = 1;
    // By default, hide past events unless a date filter is explicitly set
    let whereClause = 'WHERE 1=1';
    if (!date_from && !date_to && !date_filter) {
      whereClause += ' AND e.event_date >= NOW()';
    }

    // Text search across event name, description, location, club name
    if (search && search.trim()) {
      whereClause += ` AND (
        e.event_name ILIKE $${paramIndex}
        OR e.name ILIKE $${paramIndex}
        OR e.description ILIKE $${paramIndex}
        OR e.location ILIKE $${paramIndex}
        OR e.location_building ILIKE $${paramIndex}
        OR c.name ILIKE $${paramIndex}
      )`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (food_available === 'true') {
      whereClause += ' AND e.food_available = TRUE';
    } else if (food_available === 'false') {
      whereClause += ' AND e.food_available = FALSE';
    }

    if (is_free === 'true') {
      whereClause += ' AND e.is_free = TRUE';
    } else if (is_free === 'false') {
      whereClause += ' AND e.is_free = FALSE';
    }

    if (is_on_campus === 'true') {
      whereClause += ' AND e.is_on_campus = TRUE';
    } else if (is_on_campus === 'false') {
      whereClause += ' AND e.is_on_campus = FALSE';
    }

    // Support both 'category' and 'event_type' param names
    const typeFilter = category || event_type;
    if (typeFilter) {
      whereClause += ` AND e.event_type = $${paramIndex}`;
      params.push(typeFilter);
      paramIndex++;
    }

    if (club_id) {
      whereClause += ` AND e.club_id = $${paramIndex}`;
      params.push(club_id);
      paramIndex++;
    }

    if (date_from) {
      whereClause += ` AND e.event_date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      whereClause += ` AND e.event_date <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }

    // Date filter shortcuts
    if (date_filter === 'today') {
      whereClause += ' AND e.event_date::date = CURRENT_DATE';
    } else if (date_filter === 'week') {
      whereClause += ' AND e.event_date >= CURRENT_DATE AND e.event_date < CURRENT_DATE + INTERVAL \'7 days\'';
    } else if (date_filter === 'month') {
      whereClause += ' AND e.event_date >= CURRENT_DATE AND e.event_date < CURRENT_DATE + INTERVAL \'30 days\'';
    }

    if (user_clubs_only === 'true') {
      whereClause += ` AND e.club_id IN (SELECT ucf.club_id FROM user_club_follows ucf WHERE ucf.user_id = $${paramIndex})`;
      params.push(req.user.id);
      paramIndex++;
    }

    // Count total
    const countResult = await query(
      `SELECT COUNT(*) AS total
       FROM events e
       LEFT JOIN clubs c ON c.id = e.club_id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 100);
    const parsedPage = parseInt(page, 10) || 1;
    const offset = (parsedPage - 1) * parsedLimit;

    params.push(parsedLimit);
    params.push(offset);

    // Sort options
    let orderClause;
    if (sort === 'popular') {
      orderClause = 'ORDER BY e.feed_score DESC NULLS LAST, e.event_date ASC NULLS LAST';
    } else if (sort === 'newest') {
      orderClause = 'ORDER BY e.created_at DESC';
    } else {
      // Default 'upcoming': show events with dates first, sorted by date
      orderClause = 'ORDER BY e.event_date ASC NULLS LAST, e.feed_score DESC NULLS LAST';
    }

    const eventsResult = await query(
      `SELECT e.*,
        c.name AS club_name,
        c.instagram_handle AS club_instagram_handle,
        c.profile_image_url AS club_profile_image_url,
        c.ranking_score AS club_ranking_score,
        c.is_registered AS club_is_registered,
        p.image_urls AS post_image_urls,
        p.likes_count AS post_likes_count,
        p.comments_count AS post_comments_count,
        p.post_url AS post_url
      FROM events e
      LEFT JOIN clubs c ON c.id = e.club_id
      LEFT JOIN posts p ON p.id = e.post_id
      ${whereClause}
      ${orderClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    res.json({
      events: eventsResult.rows,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error('Event feed error:', error);
    res.status(500).json({ error: 'Failed to fetch event feed' });
  }
});

/**
 * GET /api/events/feed/map
 * Returns geocoded events for map view.
 * Same filters as /feed but only events with coordinates, no pagination.
 */
router.get('/feed/map', async (req, res) => {
  try {
    const {
      food_available,
      is_free,
      is_on_campus,
      category,
      club_id,
      date_from,
      date_to,
      user_clubs_only,
    } = req.query;

    const params = [];
    let paramIndex = 1;
    let whereClause = 'WHERE e.latitude IS NOT NULL AND e.longitude IS NOT NULL';

    if (food_available === 'true') {
      whereClause += ' AND e.food_available = TRUE';
    } else if (food_available === 'false') {
      whereClause += ' AND e.food_available = FALSE';
    }

    if (is_free === 'true') {
      whereClause += ' AND e.is_free = TRUE';
    } else if (is_free === 'false') {
      whereClause += ' AND e.is_free = FALSE';
    }

    if (is_on_campus === 'true') {
      whereClause += ' AND e.is_on_campus = TRUE';
    } else if (is_on_campus === 'false') {
      whereClause += ' AND e.is_on_campus = FALSE';
    }

    if (category) {
      whereClause += ` AND e.event_type = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (club_id) {
      whereClause += ` AND e.club_id = $${paramIndex}`;
      params.push(club_id);
      paramIndex++;
    }

    if (date_from) {
      whereClause += ` AND e.event_date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      whereClause += ` AND e.event_date <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }

    if (user_clubs_only === 'true') {
      whereClause += ` AND e.club_id IN (SELECT ucf.club_id FROM user_club_follows ucf WHERE ucf.user_id = $${paramIndex})`;
      params.push(req.user.id);
      paramIndex++;
    }

    const eventsResult = await query(
      `SELECT e.id, e.name, e.latitude, e.longitude, e.event_date,
        e.location, e.location_building, e.event_type,
        e.food_available, e.is_free, e.is_on_campus,
        e.time_start, e.time_end,
        c.name AS club_name
      FROM events e
      LEFT JOIN clubs c ON c.id = e.club_id
      ${whereClause}
      ORDER BY e.event_date ASC NULLS LAST
      LIMIT 200`,
      params
    );

    res.json({ events: eventsResult.rows });
  } catch (error) {
    logger.error('Event map feed error:', error);
    res.status(500).json({ error: 'Failed to fetch map events' });
  }
});

/**
 * GET /api/events/feed/:id
 * Single event detail with full AI-extracted data.
 * Includes club info, original post image_urls, post_url.
 * Also checks user_event_interactions for this user.
 */
router.get('/feed/:id', async (req, res) => {
  try {
    const eventId = req.params.id;

    const eventResult = await query(
      `SELECT e.*,
        c.name AS club_name,
        c.instagram_handle AS club_instagram_handle,
        c.profile_image_url AS club_profile_image_url,
        c.ranking_score AS club_ranking_score,
        c.is_registered AS club_is_registered,
        p.image_urls AS post_image_urls,
        p.caption AS post_caption,
        p.likes_count AS post_likes_count,
        p.comments_count AS post_comments_count,
        p.post_url AS post_url,
        p.posted_at AS post_posted_at
      FROM events e
      LEFT JOIN clubs c ON c.id = e.club_id
      LEFT JOIN posts p ON p.id = e.post_id
      WHERE e.id = $1`,
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];

    // Fetch user's interactions with this event
    const interactionsResult = await query(
      `SELECT interaction_type, created_at
       FROM user_event_interactions
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, req.user.id]
    );

    res.json({
      ...event,
      user_interactions: interactionsResult.rows,
    });
  } catch (error) {
    logger.error('Event feed detail error:', error);
    res.status(500).json({ error: 'Failed to fetch event detail' });
  }
});

/**
 * GET /api/events/calendar
 * Events in calendar format. Query params: month, year.
 * Returns events grouped by date for calendar view rendering.
 */
router.get('/calendar', async (req, res) => {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ error: 'month and year query params are required' });
    }

    const parsedMonth = parseInt(month, 10);
    const parsedYear = parseInt(year, 10);

    if (parsedMonth < 1 || parsedMonth > 12 || parsedYear < 2000) {
      return res.status(400).json({ error: 'Invalid month or year' });
    }

    // Build date range for the given month
    const startDate = `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-01`;
    // Last day of month: go to next month day 1
    const nextMonth = parsedMonth === 12 ? 1 : parsedMonth + 1;
    const nextYear = parsedMonth === 12 ? parsedYear + 1 : parsedYear;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const eventsResult = await query(
      `SELECT e.*,
        c.name AS club_name,
        c.instagram_handle AS club_instagram_handle,
        c.profile_image_url AS club_profile_image_url,
        c.ranking_score AS club_ranking_score,
        c.is_registered AS club_is_registered
      FROM events e
      LEFT JOIN clubs c ON c.id = e.club_id
      WHERE e.event_date >= $1 AND e.event_date < $2
      ORDER BY e.event_date ASC, e.feed_score DESC NULLS LAST`,
      [startDate, endDate]
    );

    // Group events by date
    const groupedByDate = {};
    for (const event of eventsResult.rows) {
      const dateKey = event.event_date
        ? new Date(event.event_date).toISOString().split('T')[0]
        : 'unknown';
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = [];
      }
      groupedByDate[dateKey].push(event);
    }

    res.json({
      month: parsedMonth,
      year: parsedYear,
      events_by_date: groupedByDate,
      total_events: eventsResult.rows.length,
    });
  } catch (error) {
    logger.error('Event calendar error:', error);
    res.status(500).json({ error: 'Failed to fetch event calendar' });
  }
});

/**
 * POST /api/events/:id/interested
 * Mark the user as interested in an event.
 */
router.post('/:id/interested', async (req, res) => {
  try {
    const eventId = req.params.id;

    // Verify event exists
    const eventResult = await query('SELECT id FROM events WHERE id = $1', [eventId]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const result = await query(
      `INSERT INTO user_event_interactions (user_id, event_id, interaction_type)
       VALUES ($1, $2, 'interested')
       ON CONFLICT (user_id, event_id, interaction_type) DO NOTHING
       RETURNING *`,
      [req.user.id, eventId]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'Already marked as interested' });
    }

    logger.info(`User ${req.user.id} marked interested in event ${eventId}`);
    res.status(201).json({ message: 'Marked as interested', interaction: result.rows[0] });
  } catch (error) {
    logger.error('Event interested error:', error);
    res.status(500).json({ error: 'Failed to mark event as interested' });
  }
});

/**
 * POST /api/events/:id/going
 * Mark the user as going to an event.
 */
router.post('/:id/going', async (req, res) => {
  try {
    const eventId = req.params.id;

    // Verify event exists
    const eventResult = await query('SELECT id FROM events WHERE id = $1', [eventId]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const result = await query(
      `INSERT INTO user_event_interactions (user_id, event_id, interaction_type)
       VALUES ($1, $2, 'going')
       ON CONFLICT (user_id, event_id, interaction_type) DO NOTHING
       RETURNING *`,
      [req.user.id, eventId]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'Already marked as going' });
    }

    logger.info(`User ${req.user.id} marked going to event ${eventId}`);
    res.status(201).json({ message: 'Marked as going', interaction: result.rows[0] });
  } catch (error) {
    logger.error('Event going error:', error);
    res.status(500).json({ error: 'Failed to mark event as going' });
  }
});

/**
 * POST /api/events/:id/save
 * Save an event for later.
 */
router.post('/:id/save', async (req, res) => {
  try {
    const eventId = req.params.id;

    // Verify event exists
    const eventResult = await query('SELECT id FROM events WHERE id = $1', [eventId]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const result = await query(
      `INSERT INTO user_event_interactions (user_id, event_id, interaction_type)
       VALUES ($1, $2, 'saved')
       ON CONFLICT (user_id, event_id, interaction_type) DO NOTHING
       RETURNING *`,
      [req.user.id, eventId]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'Event already saved' });
    }

    logger.info(`User ${req.user.id} saved event ${eventId}`);
    res.status(201).json({ message: 'Event saved', interaction: result.rows[0] });
  } catch (error) {
    logger.error('Event save error:', error);
    res.status(500).json({ error: 'Failed to save event' });
  }
});

/**
 * DELETE /api/events/:id/interaction
 * Delete user's interactions with an event.
 * Optional query param: type (to delete a specific interaction type).
 * If no type provided, deletes all interactions for this event.
 */
router.delete('/:id/interaction', async (req, res) => {
  try {
    const eventId = req.params.id;
    const { type } = req.query;

    let result;

    if (type) {
      result = await query(
        `DELETE FROM user_event_interactions
         WHERE user_id = $1 AND event_id = $2 AND interaction_type = $3
         RETURNING *`,
        [req.user.id, eventId, type]
      );
    } else {
      result = await query(
        `DELETE FROM user_event_interactions
         WHERE user_id = $1 AND event_id = $2
         RETURNING *`,
        [req.user.id, eventId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No interactions found to delete' });
    }

    logger.info(`User ${req.user.id} removed interaction(s) for event ${eventId}${type ? ` (type: ${type})` : ''}`);
    res.json({ message: 'Interaction(s) removed', deleted_count: result.rows.length });
  } catch (error) {
    logger.error('Delete event interaction error:', error);
    res.status(500).json({ error: 'Failed to delete event interaction' });
  }
});

module.exports = router;

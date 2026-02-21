const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { getRelevantContacts } = require('../services/event-prep');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/events
 * List user's events (upcoming first)
 */
router.get('/', async (req, res) => {
  try {
    const { upcoming_only } = req.query;

    let whereClause = 'WHERE user_id = $1';
    if (upcoming_only === 'true') {
      whereClause += ' AND event_date > NOW()';
    }

    const result = await query(
      `SELECT * FROM events ${whereClause} ORDER BY event_date ASC`,
      [req.user.id]
    );

    res.json({ events: result.rows });
  } catch (error) {
    logger.error('List events error:', error);
    res.status(500).json({ error: 'Failed to list events' });
  }
});

/**
 * POST /api/events
 * Create a new event
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, event_date, location, event_type = 'networking' } = req.body;

    if (!name || !event_date) {
      return res.status(400).json({ error: 'name and event_date are required' });
    }

    const result = await query(
      `INSERT INTO events (user_id, name, description, event_date, location, event_type)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, name, description, event_date, location, event_type]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

/**
 * GET /api/events/:id
 * Get a single event
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM events WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to get event' });
  }
});

/**
 * PUT /api/events/:id
 * Update an event
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, description, event_date, location, event_type } = req.body;

    const result = await query(
      `UPDATE events SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        event_date = COALESCE($3, event_date),
        location = COALESCE($4, location),
        event_type = COALESCE($5, event_type),
        reminder_sent = FALSE
      WHERE id = $6 AND user_id = $7
      RETURNING *`,
      [name, description, event_date, location, event_type, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

/**
 * DELETE /api/events/:id
 * Delete an event
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM events WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    logger.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

/**
 * GET /api/events/:id/prep
 * Get contacts relevant to this event for pre-event preparation
 */
router.get('/:id/prep', async (req, res) => {
  try {
    const eventResult = await query(
      'SELECT * FROM events WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];
    const contacts = await getRelevantContacts(req.user.id, event.name, event.location);

    res.json({
      event,
      relevantContacts: contacts,
    });
  } catch (error) {
    logger.error('Event prep error:', error);
    res.status(500).json({ error: 'Failed to get event prep data' });
  }
});

module.exports = router;

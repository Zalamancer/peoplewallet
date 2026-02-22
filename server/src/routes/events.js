const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { getRelevantContacts } = require('../services/event-prep');
const { autoTagWithEvent, checkRecentEvent } = require('../services/auto-tag');
const { geocodeEventLocation } = require('../services/campus-geocoder');
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
    const { name, description, event_date, location, event_type = 'networking', has_free_food = false, dress_code, prerequisites } = req.body;

    if (!name || !event_date) {
      return res.status(400).json({ error: 'name and event_date are required' });
    }

    const result = await query(
      `INSERT INTO events (user_id, name, description, event_date, location, event_type, has_free_food, dress_code, prerequisites)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.user.id, name, description, event_date, location, event_type, has_free_food, dress_code || null, prerequisites || null]
    );

    const created = result.rows[0];

    // Non-blocking geocoding
    if (location) {
      geocodeEventLocation(location, null, null)
        .then((coords) => {
          if (coords) {
            query(
              'UPDATE events SET latitude = $1, longitude = $2, geocode_source = $3 WHERE id = $4',
              [coords.lat, coords.lng, coords.source, created.id]
            ).catch((e) => logger.warn(`Geocode update failed for event ${created.id}:`, e.message));
          }
        })
        .catch((e) => logger.warn(`Geocoding failed for event ${created.id}:`, e.message));
    }

    res.status(201).json(created);
  } catch (error) {
    logger.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

/**
 * GET /api/events/recent-attended
 * Get events the user attended in the last 2 hours.
 * Used to trigger post-event capture prompt on mobile.
 */
router.get('/recent-attended', async (req, res) => {
  try {
    const recentEvent = await checkRecentEvent(req.user.id);

    if (!recentEvent) {
      return res.json({ events: [], has_recent: false });
    }

    // Also fetch all recent events (not just the most recent one)
    const result = await query(
      `SELECT * FROM events
       WHERE user_id = $1
         AND event_date <= NOW()
         AND event_date >= NOW() - INTERVAL '2 hours'
       ORDER BY event_date DESC`,
      [req.user.id]
    );

    res.json({
      events: result.rows,
      has_recent: true,
    });
  } catch (error) {
    logger.error('Get recent attended events error:', error);
    res.status(500).json({ error: 'Failed to get recent events' });
  }
});

/**
 * POST /api/events/:id/auto-tag
 * Auto-tag a contact with this event's context.
 * Body: { contact_id }
 */
router.post('/:id/auto-tag', async (req, res) => {
  try {
    const { contact_id } = req.body;
    const eventId = req.params.id;

    if (!contact_id) {
      return res.status(400).json({ error: 'contact_id is required' });
    }

    const result = await autoTagWithEvent(contact_id, eventId, req.user.id);
    res.json(result);
  } catch (error) {
    if (error.message === 'Event not found' || error.message === 'Contact not found') {
      return res.status(404).json({ error: error.message });
    }
    logger.error('Auto-tag contact error:', error);
    res.status(500).json({ error: 'Failed to auto-tag contact with event' });
  }
});

/**
 * GET /api/events/:id/stats
 * Get event stats for organizer view.
 * Returns counts of check-ins, co-attendees, contacts created, and card exchanges.
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const eventId = req.params.id;

    // Verify event ownership
    const eventResult = await query(
      'SELECT * FROM events WHERE id = $1 AND user_id = $2',
      [eventId, req.user.id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];

    // Get counts from bridge tables in parallel
    const [contactsCount, coAttendeesCount, exchangesCount] = await Promise.all([
      // Number of contacts linked to this event
      query(
        'SELECT COUNT(*)::int AS count FROM event_contacts WHERE event_id = $1',
        [eventId]
      ),
      // Number of co-attendance pairs for this event
      query(
        'SELECT COUNT(*)::int AS count FROM co_attendances WHERE event_id = $1',
        [eventId]
      ),
      // Number of card exchanges at this event
      query(
        'SELECT COUNT(*)::int AS count FROM contact_card_exchanges WHERE event_id = $1',
        [eventId]
      ),
    ]);

    res.json({
      event,
      stats: {
        contacts_created: contactsCount.rows[0].count,
        co_attendees: coAttendeesCount.rows[0].count,
        card_exchanges: exchangesCount.rows[0].count,
      },
    });
  } catch (error) {
    logger.error('Get event stats error:', error);
    res.status(500).json({ error: 'Failed to get event stats' });
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
    const { name, description, event_date, location, event_type, has_free_food, dress_code, prerequisites } = req.body;

    const result = await query(
      `UPDATE events SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        event_date = COALESCE($3, event_date),
        location = COALESCE($4, location),
        event_type = COALESCE($5, event_type),
        has_free_food = COALESCE($6, has_free_food),
        dress_code = COALESCE($7, dress_code),
        prerequisites = COALESCE($8, prerequisites),
        reminder_sent = FALSE
      WHERE id = $9 AND user_id = $10
      RETURNING *`,
      [name, description, event_date, location, event_type, has_free_food, dress_code, prerequisites, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const updated = result.rows[0];

    // Re-geocode if location changed
    if (location) {
      geocodeEventLocation(location, null, null)
        .then((coords) => {
          if (coords) {
            query(
              'UPDATE events SET latitude = $1, longitude = $2, geocode_source = $3 WHERE id = $4',
              [coords.lat, coords.lng, coords.source, updated.id]
            ).catch((e) => logger.warn(`Geocode update failed for event ${updated.id}:`, e.message));
          }
        })
        .catch((e) => logger.warn(`Geocoding failed for event ${updated.id}:`, e.message));
    }

    res.json(updated);
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
 * POST /api/events/match
 * Given an event name and/or location (from device calendar), return matching contacts.
 * Used by the Calendar Integration feature to surface relevant contacts
 * before upcoming networking events without requiring a server-side event record.
 */
router.post('/match', async (req, res) => {
  try {
    const { event_name, location } = req.body;

    if (!event_name && !location) {
      return res.status(400).json({ error: 'event_name or location is required' });
    }

    const contacts = await getRelevantContacts(req.user.id, event_name || '', location || '');

    res.json({
      event_name,
      location,
      relevantContacts: contacts,
      count: contacts.length,
    });
  } catch (error) {
    logger.error('Event match error:', { message: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to match contacts for event', details: error.message });
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

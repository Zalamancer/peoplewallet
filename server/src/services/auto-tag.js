const { query, getClient } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Auto-Tag Service
 * Automatically tags contacts with event context when a user saves a contact
 * at or shortly after an event. Creates bridge records, tags, and event groups.
 */

/**
 * Auto-tag a contact with event context.
 * - Updates contact_context with event details
 * - Creates an event_contacts bridge record
 * - Adds event-based tags (event_type, event name)
 * - Creates or reuses a ContactGroup for the event
 * - Adds the contact to the event's group
 *
 * @param {string} contactId - UUID of the contact
 * @param {string} eventId - UUID of the event
 * @param {string} userId - UUID of the authenticated user
 * @returns {Object} Summary of actions taken
 */
const autoTagWithEvent = async (contactId, eventId, userId) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Fetch event details
    const eventResult = await client.query(
      'SELECT * FROM events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );

    if (eventResult.rows.length === 0) {
      throw new Error('Event not found');
    }

    const event = eventResult.rows[0];

    // Verify contact ownership
    const contactResult = await client.query(
      'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );

    if (contactResult.rows.length === 0) {
      throw new Error('Contact not found');
    }

    // 2. Upsert contact_context with event info
    await client.query(
      `INSERT INTO contact_context (contact_id, event_name, met_date, location, event_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (contact_id) DO UPDATE SET
         event_name = COALESCE(EXCLUDED.event_name, contact_context.event_name),
         met_date = COALESCE(EXCLUDED.met_date, contact_context.met_date),
         location = COALESCE(EXCLUDED.location, contact_context.location),
         event_id = COALESCE(EXCLUDED.event_id, contact_context.event_id)`,
      [
        contactId,
        event.name,
        event.event_date ? new Date(event.event_date).toISOString().split('T')[0] : null,
        event.location,
        eventId,
      ]
    );

    // 3. Create event_contacts bridge record
    await client.query(
      `INSERT INTO event_contacts (contact_id, event_id)
       VALUES ($1, $2)
       ON CONFLICT (contact_id, event_id) DO NOTHING`,
      [contactId, eventId]
    );

    // 4. Add event-based tags
    const tagsToAdd = [];

    // Tag with the event type (e.g., "Career Fair", "Conference")
    if (event.event_type) {
      const typeLabel = event.event_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      tagsToAdd.push(typeLabel);
    }

    // Tag with the event name
    if (event.name) {
      tagsToAdd.push(event.name);
    }

    for (const tagName of tagsToAdd) {
      await client.query(
        'INSERT INTO contact_tags (contact_id, tag_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [contactId, tagName.trim()]
      );
    }

    // 5. Check if a ContactGroup already exists for this event
    const groupResult = await client.query(
      'SELECT id FROM contact_groups WHERE event_id = $1 AND user_id = $2',
      [eventId, userId]
    );

    let groupId;

    if (groupResult.rows.length === 0) {
      // Create a new group named "[Event Name] (formatted date)"
      const eventDate = new Date(event.event_date);
      const formattedDate = eventDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const groupName = `${event.name} (${formattedDate})`;

      const newGroup = await client.query(
        `INSERT INTO contact_groups (user_id, name, description, event_id, icon)
         VALUES ($1, $2, $3, $4, 'calendar')
         ON CONFLICT (user_id, name) DO UPDATE SET event_id = EXCLUDED.event_id
         RETURNING id`,
        [userId, groupName, `Auto-created from event: ${event.name}`, eventId]
      );
      groupId = newGroup.rows[0].id;
    } else {
      groupId = groupResult.rows[0].id;
    }

    // 6. Add contact to the event's group
    await client.query(
      `INSERT INTO contact_group_members (group_id, contact_id)
       VALUES ($1, $2)
       ON CONFLICT (group_id, contact_id) DO NOTHING`,
      [groupId, contactId]
    );

    await client.query('COMMIT');

    logger.info(`Auto-tagged contact ${contactId} with event ${eventId} for user ${userId}`);

    return {
      tagged: true,
      event_name: event.name,
      tags_added: tagsToAdd,
      group_id: groupId,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Auto-tag with event error:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check if the user has a recently ended event (within last 2 hours).
 * Used by mobile to determine if the auto-tag prompt should appear.
 *
 * @param {string} userId - UUID of the authenticated user
 * @returns {Object|null} The most recent event or null
 */
const checkRecentEvent = async (userId) => {
  try {
    const result = await query(
      `SELECT id, name, description, event_date, location, event_type
       FROM events
       WHERE user_id = $1
         AND event_date <= NOW()
         AND event_date >= NOW() - INTERVAL '2 hours'
       ORDER BY event_date DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Check recent event error:', error);
    throw error;
  }
};

module.exports = {
  autoTagWithEvent,
  checkRecentEvent,
};

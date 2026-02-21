const { query } = require('../config/database');
const notificationService = require('./notifications');
const logger = require('../utils/logger');

/**
 * Event Prep Reminder Service
 * Sends reminders before upcoming events with relevant contacts to review.
 *
 * Flow:
 * 1. User creates an event (e.g., "UTD Career Fair" on March 5)
 * 2. System finds contacts who were met at similar events or have relevant context
 * 3. 24 hours before, sends a nudge: "Career fair tomorrow! Review these contacts..."
 */

/**
 * Process all upcoming event prep reminders
 * Designed to run as a scheduled job (e.g., hourly)
 */
const processEventPrepReminders = async () => {
  logger.info('Starting event prep reminder job');

  try {
    // Find upcoming events that need reminders
    const result = await query(`
      SELECT
        e.id as event_id,
        e.user_id,
        e.name as event_name,
        e.event_date,
        e.location,
        e.event_type,
        u.name as user_name,
        COALESCE(np.event_prep_hours_before, 24) as hours_before
      FROM events e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN notification_preferences np ON np.user_id = e.user_id
      WHERE
        e.reminder_sent = FALSE
        AND (np.event_prep_reminders IS NULL OR np.event_prep_reminders = TRUE)
        AND e.event_date > NOW()
        AND e.event_date <= NOW() + (COALESCE(np.event_prep_hours_before, 24) || ' hours')::INTERVAL
    `);

    if (result.rows.length === 0) {
      logger.info('No event prep reminders to send');
      return { sent: 0, events: 0 };
    }

    let totalSent = 0;

    for (const event of result.rows) {
      // Find relevant contacts for this event
      const relevantContacts = await getRelevantContacts(event.user_id, event.event_name, event.location);

      let body;
      if (relevantContacts.length > 0) {
        const names = relevantContacts.slice(0, 3).map((c) => c.full_name).join(', ');
        const extra = relevantContacts.length > 3 ? ` and ${relevantContacts.length - 3} more` : '';
        body = `${event.event_name} is coming up! Review your connections: ${names}${extra}`;
      } else {
        body = `${event.event_name} is coming up! Great opportunity to meet new people.`;
      }

      const sent = await notificationService.sendToUser(event.user_id, {
        title: 'Event Prep',
        body,
        data: {
          type: 'event_prep',
          eventId: event.event_id,
          contactIds: relevantContacts.slice(0, 5).map((c) => c.id),
        },
      });

      // Mark reminder as sent
      await query('UPDATE events SET reminder_sent = TRUE WHERE id = $1', [event.event_id]);

      // Log the notification
      await query(
        `INSERT INTO notification_log (user_id, type, title, body, metadata)
         VALUES ($1, 'event_prep', $2, $3, $4)`,
        [
          event.user_id,
          'Event Prep',
          body,
          JSON.stringify({
            event_id: event.event_id,
            event_name: event.event_name,
            relevant_contacts: relevantContacts.length,
          }),
        ]
      );

      totalSent += sent;
    }

    logger.info(`Event prep job complete: ${totalSent} notifications sent for ${result.rows.length} events`);
    return { sent: totalSent, events: result.rows.length };
  } catch (error) {
    logger.error('Event prep reminder job error:', error);
    throw error;
  }
};

/**
 * Find contacts relevant to an upcoming event
 * Matches by event name, location, and tags
 */
const getRelevantContacts = async (userId, eventName, eventLocation) => {
  // Find contacts who were met at a similarly named event or location
  const result = await query(
    `SELECT DISTINCT
      c.id, c.full_name, c.nickname, c.avatar_url,
      cp.school, cp.company, cp.job_title,
      cc.event_name as met_at_event, cc.location as met_at_location
    FROM contacts c
    LEFT JOIN contact_professional cp ON cp.contact_id = c.id
    LEFT JOIN contact_context cc ON cc.contact_id = c.id
    WHERE c.user_id = $1
      AND (
        cc.event_name ILIKE $2
        OR cc.location ILIKE $3
        OR cc.event_name ILIKE $4
      )
    ORDER BY c.updated_at DESC
    LIMIT 10`,
    [
      userId,
      `%${eventName}%`,
      `%${eventLocation || ''}%`,
      `%${extractKeywords(eventName)}%`,
    ]
  );

  return result.rows;
};

/**
 * Extract key word from event name for fuzzy matching
 * e.g., "UTD Spring Career Fair 2026" -> "Career Fair"
 */
const extractKeywords = (eventName) => {
  if (!eventName) return '';
  const stopWords = ['the', 'a', 'an', 'at', 'in', 'on', 'for', 'and', 'or', '2024', '2025', '2026', '2027'];
  const words = eventName.split(/\s+/).filter((w) => !stopWords.includes(w.toLowerCase()) && w.length > 2);
  // Return the most significant words (skip org names at start)
  return words.slice(0, 3).join(' ');
};

module.exports = {
  processEventPrepReminders,
  getRelevantContacts,
};

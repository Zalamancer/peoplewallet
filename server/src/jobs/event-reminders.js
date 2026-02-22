/**
 * Event Reminder Job
 *
 * Runs every 15 minutes via the scheduler.
 * Finds events starting within the next hour where reminder_sent = FALSE,
 * sends EVENT_REMINDER push notifications to all users who RSVP'd 'going',
 * then marks the event's reminder_sent = TRUE.
 */

const { query } = require('../config/database');
const { sendEventReminder } = require('../services/notifications');
const logger = require('../utils/logger');

/**
 * Process event reminders for upcoming events.
 *
 * @returns {Promise<{ events_processed: number, reminders_sent: number }>}
 */
const processEventReminders = async () => {
  logger.info('[EventReminders] Starting event reminder job');

  try {
    // Find events starting within 1 hour that haven't had reminders sent
    const eventsResult = await query(`
      SELECT e.id, e.name, e.location, e.event_date
      FROM events e
      WHERE e.reminder_sent = FALSE
        AND e.event_date > NOW()
        AND e.event_date <= NOW() + INTERVAL '1 hour'
    `);

    if (eventsResult.rows.length === 0) {
      logger.info('[EventReminders] No events needing reminders');
      return { events_processed: 0, reminders_sent: 0 };
    }

    let totalReminders = 0;

    for (const event of eventsResult.rows) {
      try {
        // Get all users who RSVP'd 'going' for this event
        const rsvpResult = await query(
          `SELECT r.user_id
           FROM rsvps r
           WHERE r.event_id = $1 AND r.status = 'going'`,
          [event.id]
        );

        if (rsvpResult.rows.length > 0) {
          logger.info(
            `[EventReminders] Sending reminders for "${event.name}" to ${rsvpResult.rows.length} attendees`
          );

          for (const rsvp of rsvpResult.rows) {
            try {
              await sendEventReminder(rsvp.user_id, event);
              totalReminders++;
            } catch (sendError) {
              logger.error(
                `[EventReminders] Failed to send reminder to user ${rsvp.user_id} for event ${event.id}:`,
                sendError.message
              );
            }
          }
        }

        // Mark reminder as sent regardless (so we don't retry indefinitely)
        await query('UPDATE events SET reminder_sent = TRUE WHERE id = $1', [event.id]);
      } catch (eventError) {
        logger.error(
          `[EventReminders] Failed to process event ${event.id}:`,
          eventError.message
        );
      }
    }

    logger.info(
      `[EventReminders] Complete: ${eventsResult.rows.length} events processed, ${totalReminders} reminders sent`
    );
    return { events_processed: eventsResult.rows.length, reminders_sent: totalReminders };
  } catch (error) {
    logger.error('[EventReminders] Event reminder job failed:', error);
    throw error;
  }
};

module.exports = { processEventReminders };

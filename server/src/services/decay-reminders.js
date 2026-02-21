const { query } = require('../config/database');
const notificationService = require('./notifications');
const logger = require('../utils/logger');

/**
 * Contact Decay Reminder Service
 * Identifies contacts that haven't been interacted with in N days
 * and sends push notifications to remind users to reconnect.
 *
 * Default: 45 days (configurable per user via notification_preferences)
 */

/**
 * Find all stale contacts across all users and send reminders
 * Designed to run as a scheduled job (e.g., daily via cron)
 */
const processDecayReminders = async () => {
  logger.info('Starting contact decay reminder job');

  try {
    // Find users who have decay reminders enabled and have stale contacts
    const result = await query(`
      SELECT
        u.id as user_id,
        u.name as user_name,
        c.id as contact_id,
        c.full_name as contact_name,
        c.last_interaction_at,
        COALESCE(np.decay_interval_days, 45) as decay_days,
        EXTRACT(DAY FROM NOW() - c.last_interaction_at) as days_since_interaction
      FROM users u
      JOIN contacts c ON c.user_id = u.id
      LEFT JOIN notification_preferences np ON np.user_id = u.id
      WHERE
        (np.decay_reminders IS NULL OR np.decay_reminders = TRUE)
        AND c.last_interaction_at < NOW() - (COALESCE(np.decay_interval_days, 45) || ' days')::INTERVAL
        AND NOT EXISTS (
          SELECT 1 FROM notification_log nl
          WHERE nl.user_id = u.id
            AND nl.type = 'decay_reminder'
            AND nl.metadata->>'contact_id' = c.id::TEXT
            AND nl.created_at > NOW() - INTERVAL '7 days'
        )
      ORDER BY u.id, c.last_interaction_at ASC
    `);

    if (result.rows.length === 0) {
      logger.info('No decay reminders to send');
      return { sent: 0, users: 0 };
    }

    // Group by user to batch notifications
    const userContacts = {};
    for (const row of result.rows) {
      if (!userContacts[row.user_id]) {
        userContacts[row.user_id] = {
          userName: row.user_name,
          contacts: [],
        };
      }
      userContacts[row.user_id].contacts.push({
        contactId: row.contact_id,
        contactName: row.contact_name,
        daysSince: Math.floor(row.days_since_interaction),
      });
    }

    let totalSent = 0;
    const userIds = Object.keys(userContacts);

    for (const userId of userIds) {
      const { contacts } = userContacts[userId];

      // Send one notification per user with top 3 stale contacts
      const topContacts = contacts.slice(0, 3);
      const names = topContacts.map((c) => c.contactName).join(', ');
      const extraCount = contacts.length - topContacts.length;

      let body;
      if (contacts.length === 1) {
        body = `You haven't connected with ${contacts[0].contactName} in ${contacts[0].daysSince} days. Time to reconnect?`;
      } else if (extraCount > 0) {
        body = `You haven't connected with ${names} and ${extraCount} more in a while. Time to reconnect?`;
      } else {
        body = `You haven't connected with ${names} in a while. Time to reconnect?`;
      }

      const sent = await notificationService.sendToUser(userId, {
        title: 'Reconnect Reminder',
        body,
        data: {
          type: 'decay_reminder',
          contactIds: topContacts.map((c) => c.contactId),
        },
      });

      // Log the notification
      for (const contact of topContacts) {
        await query(
          `INSERT INTO notification_log (user_id, type, title, body, metadata)
           VALUES ($1, 'decay_reminder', $2, $3, $4)`,
          [
            userId,
            'Reconnect Reminder',
            body,
            JSON.stringify({ contact_id: contact.contactId, days_since: contact.daysSince }),
          ]
        );
      }

      totalSent += sent;
    }

    logger.info(`Decay reminder job complete: ${totalSent} notifications sent to ${userIds.length} users`);
    return { sent: totalSent, users: userIds.length };
  } catch (error) {
    logger.error('Decay reminder job error:', error);
    throw error;
  }
};

/**
 * Update last_interaction_at for a contact
 * Call this when a user views, edits, or adds a note to a contact
 */
const touchContact = async (contactId) => {
  await query(
    'UPDATE contacts SET last_interaction_at = NOW() WHERE id = $1',
    [contactId]
  );
};

/**
 * Get stale contacts for a specific user (for in-app display)
 */
const getStaleContacts = async (userId, daysThreshold = 45) => {
  const result = await query(
    `SELECT
      c.id, c.full_name, c.nickname, c.avatar_url, c.last_interaction_at,
      EXTRACT(DAY FROM NOW() - c.last_interaction_at)::INTEGER as days_since_interaction,
      cp.school, cp.company,
      cc.event_name
    FROM contacts c
    LEFT JOIN contact_professional cp ON cp.contact_id = c.id
    LEFT JOIN contact_context cc ON cc.contact_id = c.id
    WHERE c.user_id = $1
      AND c.last_interaction_at < NOW() - ($2 || ' days')::INTERVAL
    ORDER BY c.last_interaction_at ASC
    LIMIT 20`,
    [userId, daysThreshold]
  );

  return result.rows;
};

module.exports = {
  processDecayReminders,
  touchContact,
  getStaleContacts,
};

const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Notification service for PeopleWallet
 * Uses Expo Push Notifications (works with both FCM and APNs through Expo's push service)
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Notification type constants
 */
const NOTIFICATION_TYPES = {
  EVENT_REMINDER: 'event_reminder',
  RSVP_CONFIRMATION: 'rsvp_confirmation',
  EVENT_UPDATE: 'event_update',
  CLUB_ANNOUNCEMENT: 'club_announcement',
};

/**
 * Send push notification via Expo Push API
 * @param {string} pushToken - Expo push token
 * @param {object} notification - { title, body, data }
 */
const sendPushNotification = async (pushToken, { title, body, data = {} }) => {
  if (!pushToken || !pushToken.startsWith('ExponentPushToken')) {
    logger.warn('Invalid push token, skipping notification');
    return null;
  }

  const message = {
    to: pushToken,
    sound: 'default',
    title,
    body,
    data,
  };

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (result.data?.[0]?.status === 'error') {
      logger.error('Push notification error:', result.data[0].message);
      // If token is invalid, remove it
      if (result.data[0].details?.error === 'DeviceNotRegistered') {
        await removeInvalidToken(pushToken);
      }
      return null;
    }

    return result;
  } catch (error) {
    logger.error('Failed to send push notification:', error);
    return null;
  }
};

/**
 * Send notification to all devices of a user
 */
const sendToUser = async (userId, notification) => {
  try {
    const result = await query(
      'SELECT push_token FROM user_push_tokens WHERE user_id = $1 AND active = TRUE',
      [userId]
    );

    const results = await Promise.allSettled(
      result.rows.map((row) => sendPushNotification(row.push_token, notification))
    );

    const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    logger.info(`Sent ${sent}/${result.rows.length} push notifications to user ${userId}`);
    return sent;
  } catch (error) {
    logger.error('Send to user error:', error);
    return 0;
  }
};

/**
 * Send batch notifications to multiple users
 */
const sendBatch = async (notifications) => {
  // notifications = [{ userId, title, body, data }]
  const results = await Promise.allSettled(
    notifications.map(({ userId, ...notification }) => sendToUser(userId, notification))
  );

  const totalSent = results
    .filter((r) => r.status === 'fulfilled')
    .reduce((sum, r) => sum + r.value, 0);

  logger.info(`Batch notification: sent ${totalSent} total across ${notifications.length} users`);
  return totalSent;
};

/**
 * Register a push token for a user
 */
const registerToken = async (userId, pushToken, platform = 'ios') => {
  await query(
    `INSERT INTO user_push_tokens (user_id, push_token, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT (push_token) DO UPDATE SET
       user_id = $1, platform = $3, active = TRUE, updated_at = NOW()`,
    [userId, pushToken, platform]
  );
  logger.info(`Push token registered for user ${userId}`);
};

/**
 * Unregister a push token
 */
const unregisterToken = async (pushToken) => {
  await query(
    'UPDATE user_push_tokens SET active = FALSE WHERE push_token = $1',
    [pushToken]
  );
};

/**
 * Remove invalid/expired tokens
 */
const removeInvalidToken = async (pushToken) => {
  await query('DELETE FROM user_push_tokens WHERE push_token = $1', [pushToken]);
  logger.info(`Removed invalid push token: ${pushToken.slice(0, 20)}...`);
};

/**
 * Send an event reminder notification to a user
 * @param {string} userId - The user to notify
 * @param {object} event - Event object with id, name, location
 */
const sendEventReminder = async (userId, event) => {
  const locationPart = event.location ? ` at ${event.location}` : '';
  const notification = {
    title: 'Event Reminder',
    body: `Reminder: ${event.name} starts in 1 hour${locationPart}`,
    data: {
      type: NOTIFICATION_TYPES.EVENT_REMINDER,
      eventId: event.id,
    },
  };

  const sent = await sendToUser(userId, notification);

  // Log the notification
  try {
    await query(
      `INSERT INTO notification_log (user_id, type, title, body, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        NOTIFICATION_TYPES.EVENT_REMINDER,
        notification.title,
        notification.body,
        JSON.stringify({ event_id: event.id, event_name: event.name }),
      ]
    );
  } catch (logError) {
    logger.error('Failed to log event reminder notification:', logError);
  }

  return sent;
};

/**
 * Send an RSVP confirmation notification to a user
 * @param {string} userId - The user to notify
 * @param {object} event - Event object with id, name
 */
const sendRsvpConfirmation = async (userId, event) => {
  const notification = {
    title: 'RSVP Confirmed',
    body: `You're going to ${event.name}!`,
    data: {
      type: NOTIFICATION_TYPES.RSVP_CONFIRMATION,
      eventId: event.id,
    },
  };

  const sent = await sendToUser(userId, notification);

  try {
    await query(
      `INSERT INTO notification_log (user_id, type, title, body, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        NOTIFICATION_TYPES.RSVP_CONFIRMATION,
        notification.title,
        notification.body,
        JSON.stringify({ event_id: event.id, event_name: event.name }),
      ]
    );
  } catch (logError) {
    logger.error('Failed to log RSVP confirmation notification:', logError);
  }

  return sent;
};

/**
 * Send an event update notification to all RSVP'd users
 * @param {string[]} userIds - Array of user IDs to notify
 * @param {object} event - Event object with id, name
 * @param {object} changes - Description of what changed (e.g. { location: 'new loc', event_date: '...' })
 */
const sendEventUpdate = async (userIds, event, changes) => {
  const notifications = userIds.map((userId) => ({
    userId,
    title: 'Event Updated',
    body: `Update: ${event.name} has been updated`,
    data: {
      type: NOTIFICATION_TYPES.EVENT_UPDATE,
      eventId: event.id,
      changes,
    },
  }));

  const totalSent = await sendBatch(notifications);

  // Bulk-log notifications
  try {
    for (const userId of userIds) {
      await query(
        `INSERT INTO notification_log (user_id, type, title, body, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          NOTIFICATION_TYPES.EVENT_UPDATE,
          'Event Updated',
          `Update: ${event.name} has been updated`,
          JSON.stringify({ event_id: event.id, event_name: event.name, changes }),
        ]
      );
    }
  } catch (logError) {
    logger.error('Failed to log event update notifications:', logError);
  }

  return totalSent;
};

module.exports = {
  NOTIFICATION_TYPES,
  sendPushNotification,
  sendToUser,
  sendBatch,
  sendEventReminder,
  sendRsvpConfirmation,
  sendEventUpdate,
  registerToken,
  unregisterToken,
  removeInvalidToken,
};

const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Notification service for ProAnimate Connect
 * Uses Expo Push Notifications (works with both FCM and APNs through Expo's push service)
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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

module.exports = {
  sendPushNotification,
  sendToUser,
  sendBatch,
  registerToken,
  unregisterToken,
  removeInvalidToken,
};

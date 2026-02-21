const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const notificationService = require('../services/notifications');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

/**
 * POST /api/notifications/register
 * Register a push token for the authenticated user
 */
router.post('/register', async (req, res) => {
  try {
    const { push_token, platform = 'ios' } = req.body;

    if (!push_token) {
      return res.status(400).json({ error: 'push_token is required' });
    }

    await notificationService.registerToken(req.user.id, push_token, platform);

    res.json({ message: 'Push token registered successfully' });
  } catch (error) {
    logger.error('Register push token error:', error);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

/**
 * DELETE /api/notifications/unregister
 * Unregister a push token
 */
router.delete('/unregister', async (req, res) => {
  try {
    const { push_token } = req.body;

    if (!push_token) {
      return res.status(400).json({ error: 'push_token is required' });
    }

    await notificationService.unregisterToken(push_token);

    res.json({ message: 'Push token unregistered successfully' });
  } catch (error) {
    logger.error('Unregister push token error:', error);
    res.status(500).json({ error: 'Failed to unregister push token' });
  }
});

/**
 * GET /api/notifications/preferences
 * Get notification preferences for the authenticated user
 */
router.get('/preferences', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM notification_preferences WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      // Return defaults
      return res.json({
        decay_reminders: true,
        decay_interval_days: 45,
        event_prep_reminders: true,
        event_prep_hours_before: 24,
        weekly_digest: true,
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get notification preferences error:', error);
    res.status(500).json({ error: 'Failed to get notification preferences' });
  }
});

/**
 * PUT /api/notifications/preferences
 * Update notification preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const {
      decay_reminders,
      decay_interval_days,
      event_prep_reminders,
      event_prep_hours_before,
      weekly_digest,
    } = req.body;

    const result = await query(
      `INSERT INTO notification_preferences (user_id, decay_reminders, decay_interval_days, event_prep_reminders, event_prep_hours_before, weekly_digest)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         decay_reminders = COALESCE($2, notification_preferences.decay_reminders),
         decay_interval_days = COALESCE($3, notification_preferences.decay_interval_days),
         event_prep_reminders = COALESCE($4, notification_preferences.event_prep_reminders),
         event_prep_hours_before = COALESCE($5, notification_preferences.event_prep_hours_before),
         weekly_digest = COALESCE($6, notification_preferences.weekly_digest),
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, decay_reminders, decay_interval_days, event_prep_reminders, event_prep_hours_before, weekly_digest]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update notification preferences error:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

module.exports = router;

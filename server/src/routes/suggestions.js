const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/suggestions/co-attendees
 * Suggest unsaved co-attendees ("people you might know").
 * Ranks by number of co-attended events (more overlap = higher recommendation).
 * Filters by attendance_visibility (only 'public' users).
 * Returns up to 10 suggestions with event context.
 */
router.get('/co-attendees', async (req, res) => {
  try {
    const userId = req.user.id;

    // Find users who co-attended events with the current user,
    // but are NOT already saved as contacts by the current user.
    // Rank by number of shared events (most overlap first).
    const result = await query(
      `SELECT
        u.id AS user_id,
        u.name,
        u.avatar_url,
        u.attendance_visibility,
        COUNT(DISTINCT ca.event_id)::int AS shared_event_count,
        array_agg(DISTINCT e.name) AS shared_event_names,
        array_agg(DISTINCT e.id) AS shared_event_ids
      FROM co_attendances ca
      JOIN events e ON e.id = ca.event_id
      JOIN users u ON u.id = CASE
        WHEN ca.user_a_id = $1 THEN ca.user_b_id
        ELSE ca.user_a_id
      END
      WHERE (ca.user_a_id = $1 OR ca.user_b_id = $1)
        AND u.attendance_visibility = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM contacts c2
          WHERE c2.user_id = $1 AND c2.linked_user_id = u.id
        )
        AND u.id NOT IN (
          SELECT sd.suggested_user_id FROM suggestion_dismissals sd WHERE sd.user_id = $1
        )
      GROUP BY u.id, u.name, u.avatar_url, u.attendance_visibility
      ORDER BY shared_event_count DESC
      LIMIT 10`,
      [userId]
    );

    // Format the response with event context
    const suggestions = result.rows.map((row) => {
      const eventNames = row.shared_event_names.filter(Boolean);
      let context;
      if (eventNames.length === 1) {
        context = `You were both at ${eventNames[0]}`;
      } else if (eventNames.length === 2) {
        context = `You were both at ${eventNames[0]} and ${eventNames[1]}`;
      } else {
        const remaining = eventNames.length - 2;
        context = `You were both at ${eventNames[0]}, ${eventNames[1]}, and ${remaining} more event${remaining > 1 ? 's' : ''}`;
      }

      return {
        user_id: row.user_id,
        name: row.name,
        avatar_url: row.avatar_url,
        shared_event_count: row.shared_event_count,
        shared_events: eventNames,
        context,
      };
    });

    res.json({ suggestions });
  } catch (error) {
    // If suggestion_dismissals table doesn't exist, fall back to simpler query
    if (error.code === '42P01') {
      logger.warn('suggestion_dismissals table not found, running without dismissal filtering');
      try {
        const fallbackResult = await query(
          `SELECT
            u.id AS user_id,
            u.name,
            u.avatar_url,
            COUNT(DISTINCT ca.event_id)::int AS shared_event_count,
            array_agg(DISTINCT e.name) AS shared_event_names
          FROM co_attendances ca
          JOIN events e ON e.id = ca.event_id
          JOIN users u ON u.id = CASE
            WHEN ca.user_a_id = $1 THEN ca.user_b_id
            ELSE ca.user_a_id
          END
          WHERE (ca.user_a_id = $1 OR ca.user_b_id = $1)
            AND u.attendance_visibility = 'public'
            AND NOT EXISTS (
              SELECT 1 FROM contacts c2
              WHERE c2.user_id = $1 AND c2.linked_user_id = u.id
            )
          GROUP BY u.id, u.name, u.avatar_url
          ORDER BY shared_event_count DESC
          LIMIT 10`,
          [req.user.id]
        );

        const suggestions = fallbackResult.rows.map((row) => {
          const eventNames = row.shared_event_names.filter(Boolean);
          let context;
          if (eventNames.length === 1) {
            context = `You were both at ${eventNames[0]}`;
          } else if (eventNames.length === 2) {
            context = `You were both at ${eventNames[0]} and ${eventNames[1]}`;
          } else {
            const remaining = eventNames.length - 2;
            context = `You were both at ${eventNames[0]}, ${eventNames[1]}, and ${remaining} more event${remaining > 1 ? 's' : ''}`;
          }

          return {
            user_id: row.user_id,
            name: row.name,
            avatar_url: row.avatar_url,
            shared_event_count: row.shared_event_count,
            shared_events: eventNames,
            context,
          };
        });

        return res.json({ suggestions });
      } catch (fallbackError) {
        logger.error('Suggestions fallback error:', fallbackError);
        return res.status(500).json({ error: 'Failed to fetch suggestions' });
      }
    }

    logger.error('Get co-attendee suggestions error:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

/**
 * POST /api/suggestions/dismiss
 * Dismiss a suggestion so the suggested user does not appear again.
 */
router.post('/dismiss', async (req, res) => {
  try {
    const { suggested_user_id } = req.body;
    const userId = req.user.id;

    if (!suggested_user_id) {
      return res.status(400).json({ error: 'suggested_user_id is required' });
    }

    if (suggested_user_id === userId) {
      return res.status(400).json({ error: 'Cannot dismiss yourself' });
    }

    // Ensure suggestion_dismissals table exists (create if not)
    await query(
      `CREATE TABLE IF NOT EXISTS suggestion_dismissals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        suggested_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, suggested_user_id)
      )`
    );

    await query(
      `INSERT INTO suggestion_dismissals (user_id, suggested_user_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, suggested_user_id) DO NOTHING`,
      [userId, suggested_user_id]
    );

    logger.info(`User ${userId} dismissed suggestion for user ${suggested_user_id}`);

    res.json({ message: 'Suggestion dismissed' });
  } catch (error) {
    logger.error('Dismiss suggestion error:', error);
    res.status(500).json({ error: 'Failed to dismiss suggestion' });
  }
});

module.exports = router;

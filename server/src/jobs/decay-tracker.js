/**
 * Decay Tracker Background Job
 *
 * Recalculates all relationship scores applying time-based decay,
 * and generates notifications when scores drop below critical thresholds.
 *
 * Thresholds:
 *   - Below 50% of peak_score: creates a 'decay_reminder' notification
 *   - Below 25% of peak_score: creates an urgent 'decay_urgent' notification
 *
 * Designed to run daily at midnight via the scheduler.
 */

const { query } = require('../config/database');
const { recalculateAllScores, applyDecay, SIGNAL_CONFIG } = require('../services/scoring');
const logger = require('../utils/logger');

/**
 * Run the full decay tracking pipeline:
 * 1. Recalculate all scores with current decay
 * 2. Identify scores that crossed notification thresholds
 * 3. Create notification_log entries for decay reminders
 *
 * @returns {Promise<{ recalculated: number, reminders: number, urgent: number }>}
 */
const runDecayTracking = async () => {
  logger.info('[DecayTracker] Starting decay tracking job');

  try {
    // Step 1: Recalculate all scores
    const recalcResult = await recalculateAllScores();

    // Step 2: Find scores that have dropped below 50% of peak (standard reminder)
    const standardDropResult = await query(
      `SELECT
        rs.user_id,
        rs.contact_id,
        rs.score,
        rs.peak_score,
        c.full_name as contact_name
       FROM relationship_scores rs
       JOIN contacts c ON c.id = rs.contact_id
       WHERE rs.peak_score > 0
         AND rs.score < rs.peak_score * 0.5
         AND rs.score >= rs.peak_score * 0.25
         AND NOT EXISTS (
           SELECT 1 FROM notification_log nl
           WHERE nl.user_id = rs.user_id
             AND nl.type = 'decay_reminder'
             AND nl.metadata->>'contact_id' = rs.contact_id::TEXT
             AND nl.created_at > NOW() - INTERVAL '7 days'
         )`
    );

    // Step 3: Find scores that have dropped below 25% of peak (urgent reminder)
    const urgentDropResult = await query(
      `SELECT
        rs.user_id,
        rs.contact_id,
        rs.score,
        rs.peak_score,
        c.full_name as contact_name
       FROM relationship_scores rs
       JOIN contacts c ON c.id = rs.contact_id
       WHERE rs.peak_score > 0
         AND rs.score < rs.peak_score * 0.25
         AND NOT EXISTS (
           SELECT 1 FROM notification_log nl
           WHERE nl.user_id = rs.user_id
             AND nl.type = 'decay_urgent'
             AND nl.metadata->>'contact_id' = rs.contact_id::TEXT
             AND nl.created_at > NOW() - INTERVAL '14 days'
         )`
    );

    // Create standard decay reminder notifications
    let reminders = 0;
    for (const row of standardDropResult.rows) {
      const dropPct = Math.round(((row.peak_score - row.score) / row.peak_score) * 100);

      await query(
        `INSERT INTO notification_log (user_id, type, title, body, metadata)
         VALUES ($1, 'decay_reminder', $2, $3, $4)`,
        [
          row.user_id,
          'Reconnection Reminder',
          `Your connection with ${row.contact_name} is fading. Score dropped ${dropPct}% from peak. Time to reconnect?`,
          JSON.stringify({
            contact_id: row.contact_id,
            score: row.score,
            peak_score: row.peak_score,
            drop_pct: dropPct,
          }),
        ]
      );
      reminders++;
    }

    // Create urgent decay notifications
    let urgent = 0;
    for (const row of urgentDropResult.rows) {
      const dropPct = Math.round(((row.peak_score - row.score) / row.peak_score) * 100);

      await query(
        `INSERT INTO notification_log (user_id, type, title, body, metadata)
         VALUES ($1, 'decay_urgent', $2, $3, $4)`,
        [
          row.user_id,
          'Urgent: Connection Fading',
          `Your connection with ${row.contact_name} has dropped ${dropPct}% from peak. Reach out soon before it fades completely!`,
          JSON.stringify({
            contact_id: row.contact_id,
            score: row.score,
            peak_score: row.peak_score,
            drop_pct: dropPct,
            urgent: true,
          }),
        ]
      );
      urgent++;
    }

    const result = {
      recalculated: recalcResult.processed,
      errors: recalcResult.errors,
      reminders,
      urgent,
    };

    logger.info(`[DecayTracker] Complete: ${result.recalculated} scores recalculated, ${reminders} reminders, ${urgent} urgent notifications`);
    return result;
  } catch (error) {
    logger.error('[DecayTracker] Decay tracking job failed:', error);
    throw error;
  }
};

module.exports = { runDecayTracking };

const { query, getClient } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Relationship Scoring Service
 *
 * Calculates and maintains a relationship score for each contact,
 * based on weighted signals that decay exponentially over time.
 *
 * Signal types and their weights / half-lives:
 *   co_attendance:     +20 points, 30-day half-life
 *   card_exchange:     +30 points, 60-day half-life
 *   note_created:      +15 points, 14-day half-life
 *   profile_view:      +5  points, 7-day half-life
 *   manual_interaction: +10 points, 14-day half-life
 *
 * Decay formula: value * Math.pow(0.5, daysSinceSignal / halfLifeDays)
 */

const SIGNAL_CONFIG = {
  co_attendance:      { points: 20, halfLifeDays: 30 },
  card_exchange:      { points: 30, halfLifeDays: 60 },
  note_created:       { points: 15, halfLifeDays: 14 },
  profile_view:       { points: 5,  halfLifeDays: 7 },
  manual_interaction: { points: 10, halfLifeDays: 14 },
};

/**
 * Apply exponential decay to a signal value.
 * @param {number} baseValue - The original point value
 * @param {number} daysSince - Days since the signal occurred
 * @param {number} halfLifeDays - Number of days for the value to halve
 * @returns {number} Decayed value
 */
const applyDecay = (baseValue, daysSince, halfLifeDays) => {
  return baseValue * Math.pow(0.5, daysSince / halfLifeDays);
};

/**
 * Calculate the relationship score for a user-contact pair
 * based on all recorded signals.
 *
 * @param {string} userId - The user's UUID
 * @param {string} contactId - The contact's UUID
 * @returns {Promise<number>} The computed score
 */
const calculateScore = async (userId, contactId) => {
  try {
    const result = await query(
      `SELECT signal_history, peak_score
       FROM relationship_scores
       WHERE user_id = $1 AND contact_id = $2`,
      [userId, contactId]
    );

    if (result.rows.length === 0) {
      return 0;
    }

    const { signal_history } = result.rows[0];
    const signals = signal_history || [];
    const now = new Date();
    let totalScore = 0;

    for (const signal of signals) {
      const config = SIGNAL_CONFIG[signal.type];
      if (!config) continue;

      const signalDate = new Date(signal.timestamp);
      const daysSince = (now - signalDate) / (1000 * 60 * 60 * 24);
      totalScore += applyDecay(config.points, daysSince, config.halfLifeDays);
    }

    return Math.round(totalScore * 100) / 100;
  } catch (error) {
    logger.error('Calculate score error:', error);
    return 0;
  }
};

/**
 * Record a new signal for a user-contact relationship and recalculate the score.
 *
 * @param {string} userId - The user's UUID
 * @param {string} contactId - The contact's UUID
 * @param {string} signalType - One of: co_attendance, card_exchange, note_created, profile_view, manual_interaction
 * @param {object} metadata - Optional metadata about the signal
 * @returns {Promise<{ score: number, signal_count: number }>}
 */
const recordSignal = async (userId, contactId, signalType, metadata = {}) => {
  try {
    if (!SIGNAL_CONFIG[signalType]) {
      throw new Error(`Unknown signal type: ${signalType}`);
    }

    const newSignal = {
      type: signalType,
      timestamp: new Date().toISOString(),
      metadata,
    };

    // Upsert the relationship_scores row, appending the signal to signal_history
    const result = await query(
      `INSERT INTO relationship_scores (user_id, contact_id, score, peak_score, signal_history, last_signal_at)
       VALUES ($1, $2, 0, 0, $3::jsonb, NOW())
       ON CONFLICT (user_id, contact_id) DO UPDATE SET
         signal_history = relationship_scores.signal_history || $3::jsonb,
         last_signal_at = NOW(),
         updated_at = NOW()
       RETURNING signal_history`,
      [userId, contactId, JSON.stringify([newSignal])]
    );

    // Recalculate score from all signals
    const signals = result.rows[0].signal_history || [];
    const now = new Date();
    let totalScore = 0;

    for (const signal of signals) {
      const config = SIGNAL_CONFIG[signal.type];
      if (!config) continue;

      const signalDate = new Date(signal.timestamp);
      const daysSince = (now - signalDate) / (1000 * 60 * 60 * 24);
      totalScore += applyDecay(config.points, daysSince, config.halfLifeDays);
    }

    totalScore = Math.round(totalScore * 100) / 100;

    // Update score and peak_score
    await query(
      `UPDATE relationship_scores SET
        score = $3,
        peak_score = GREATEST(peak_score, $3),
        updated_at = NOW()
       WHERE user_id = $1 AND contact_id = $2`,
      [userId, contactId, totalScore]
    );

    logger.debug(`Signal recorded: ${signalType} for user ${userId}, contact ${contactId}. Score: ${totalScore}`);

    return { score: totalScore, signal_count: signals.length };
  } catch (error) {
    logger.error('Record signal error:', error);
    throw error;
  }
};

/**
 * Batch recalculate all relationship scores.
 * Designed to run as a nightly cron job.
 *
 * @returns {Promise<{ processed: number, errors: number }>}
 */
const recalculateAllScores = async () => {
  logger.info('Starting batch score recalculation');

  try {
    const result = await query(
      'SELECT id, user_id, contact_id, signal_history, peak_score FROM relationship_scores'
    );

    let processed = 0;
    let errors = 0;
    const now = new Date();

    for (const row of result.rows) {
      try {
        const signals = row.signal_history || [];
        let totalScore = 0;

        for (const signal of signals) {
          const config = SIGNAL_CONFIG[signal.type];
          if (!config) continue;

          const signalDate = new Date(signal.timestamp);
          const daysSince = (now - signalDate) / (1000 * 60 * 60 * 24);
          totalScore += applyDecay(config.points, daysSince, config.halfLifeDays);
        }

        totalScore = Math.round(totalScore * 100) / 100;

        await query(
          `UPDATE relationship_scores SET
            score = $2,
            peak_score = GREATEST(peak_score, $2),
            updated_at = NOW()
           WHERE id = $1`,
          [row.id, totalScore]
        );

        processed++;
      } catch (rowError) {
        logger.error(`Score recalculation failed for row ${row.id}:`, rowError.message);
        errors++;
      }
    }

    logger.info(`Batch score recalculation complete: ${processed} processed, ${errors} errors`);
    return { processed, errors };
  } catch (error) {
    logger.error('Batch score recalculation error:', error);
    throw error;
  }
};

/**
 * Find contacts whose score has decayed significantly.
 * Returns contacts where:
 *   - score dropped >20% from peak_score in the last 30 days, OR
 *   - last_signal_at > 45 days ago
 *
 * @param {string} userId - The user's UUID
 * @returns {Promise<Array>} List of decaying contacts
 */
const getDecayingContacts = async (userId) => {
  try {
    const result = await query(
      `SELECT
        rs.contact_id,
        rs.score,
        rs.peak_score,
        rs.last_signal_at,
        EXTRACT(DAY FROM NOW() - rs.last_signal_at)::INTEGER as days_since_last_signal,
        CASE
          WHEN rs.peak_score > 0 THEN ROUND(((rs.peak_score - rs.score) / rs.peak_score * 100)::numeric, 1)
          ELSE 0
        END as score_drop_pct,
        c.full_name,
        c.nickname,
        c.avatar_url,
        cp.school,
        cp.company
       FROM relationship_scores rs
       JOIN contacts c ON c.id = rs.contact_id
       LEFT JOIN contact_professional cp ON cp.contact_id = c.id
       WHERE rs.user_id = $1
         AND (
           (rs.peak_score > 0 AND rs.score < rs.peak_score * 0.8)
           OR rs.last_signal_at < NOW() - INTERVAL '45 days'
         )
       ORDER BY rs.score ASC
       LIMIT 20`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    logger.error('Get decaying contacts error:', error);
    return [];
  }
};

/**
 * Get top N contacts by relationship score.
 *
 * @param {string} userId - The user's UUID
 * @param {number} limit - Maximum number of contacts to return
 * @returns {Promise<Array>} Top contacts sorted by score descending
 */
const getTopContacts = async (userId, limit = 10) => {
  try {
    const result = await query(
      `SELECT
        rs.contact_id,
        rs.score,
        rs.peak_score,
        rs.last_signal_at,
        c.full_name,
        c.nickname,
        c.avatar_url,
        cp.school,
        cp.company,
        cp.job_title,
        cc.event_name
       FROM relationship_scores rs
       JOIN contacts c ON c.id = rs.contact_id
       LEFT JOIN contact_professional cp ON cp.contact_id = c.id
       LEFT JOIN contact_context cc ON cc.contact_id = c.id
       WHERE rs.user_id = $1 AND rs.score > 0
       ORDER BY rs.score DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  } catch (error) {
    logger.error('Get top contacts error:', error);
    return [];
  }
};

module.exports = {
  calculateScore,
  recordSignal,
  recalculateAllScores,
  getDecayingContacts,
  getTopContacts,
  SIGNAL_CONFIG,
  applyDecay,
};

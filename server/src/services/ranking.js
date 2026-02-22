const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Ranking Service
 *
 * Calculates and maintains ranking_score for clubs (0-100) and
 * feed_score for events.
 *
 * Club ranking_score factors:
 *   | Factor                  | Weight             |
 *   |-------------------------|--------------------|
 *   | Registered on platform  | +40 points         |
 *   | LLM confidence          | +25 max            |
 *   | Official UTD directory  | +15 points         |
 *   | Follower count          | +10 max            |
 *   | Post recency            | +10 max            |
 *
 * Event feed_score formula:
 *   feed_score = club.ranking_score * 0.6 + event.ai_confidence * 40
 */

/**
 * Calculate and update the ranking_score for a single club.
 *
 * @param {string} clubId - UUID of the club
 * @returns {number} The calculated ranking score (0-100)
 */
const calculateClubRankingScore = async (clubId) => {
  try {
    const result = await query(
      `SELECT
        id,
        is_registered,
        llm_confidence,
        in_official_directory,
        follower_count,
        last_post_at
      FROM clubs
      WHERE id = $1`,
      [clubId]
    );

    if (result.rows.length === 0) {
      logger.warn(`Club ${clubId} not found for ranking calculation`);
      return 0;
    }

    const club = result.rows[0];
    let score = 0;

    // Factor 1: Registered on platform (+40 points)
    if (club.is_registered) {
      score += 40;
    }

    // Factor 2: LLM confidence (+25 max)
    if (club.llm_confidence != null) {
      score += club.llm_confidence * 25;
    }

    // Factor 3: Official UTD directory (+15 points)
    if (club.in_official_directory) {
      score += 15;
    }

    // Factor 4: Follower count (+10 max, capped at 10k followers)
    if (club.follower_count != null && club.follower_count > 0) {
      score += Math.min(club.follower_count / 1000, 10);
    }

    // Factor 5: Post recency (+10 max)
    if (club.last_post_at) {
      const daysSincePost = (Date.now() - new Date(club.last_post_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSincePost <= 7) {
        score += 10;
      } else if (daysSincePost <= 30) {
        score += 5;
      }
      // older than 30 days = +0
    }

    // Round to 2 decimal places
    score = Math.round(score * 100) / 100;

    // Update the club's ranking_score
    await query(
      'UPDATE clubs SET ranking_score = $1, updated_at = NOW() WHERE id = $2',
      [score, clubId]
    );

    logger.debug(`Club ${clubId} ranking_score updated to ${score}`);
    return score;
  } catch (error) {
    logger.error(`Error calculating ranking score for club ${clubId}:`, error.message);
    return 0;
  }
};

/**
 * Calculate and update feed_score for a single event.
 *
 * feed_score = club.ranking_score * 0.6 + event.ai_confidence * 40
 *
 * @param {string} eventId - UUID of the event
 * @returns {number} The calculated feed score
 */
const calculateEventFeedScore = async (eventId) => {
  try {
    const result = await query(
      `SELECT e.id, e.ai_confidence, e.club_id, c.ranking_score
       FROM events e
       JOIN clubs c ON c.id = e.club_id
       WHERE e.id = $1`,
      [eventId]
    );

    if (result.rows.length === 0) {
      logger.warn(`Event ${eventId} not found for feed score calculation`);
      return 0;
    }

    const event = result.rows[0];
    const clubRankingScore = event.ranking_score || 0;
    const aiConfidence = event.ai_confidence || 0;
    const feedScore = Math.round((clubRankingScore * 0.6 + aiConfidence * 40) * 100) / 100;

    await query(
      'UPDATE events SET feed_score = $1, updated_at = NOW() WHERE id = $2',
      [feedScore, eventId]
    );

    logger.debug(`Event ${eventId} feed_score updated to ${feedScore}`);
    return feedScore;
  } catch (error) {
    logger.error(`Error calculating feed score for event ${eventId}:`, error.message);
    return 0;
  }
};

/**
 * Recalculate ranking_score for ALL clubs, then recalculate feed_score
 * for all active events.
 *
 * Designed to run as a daily cron job after the post fetcher and
 * event analyzer have completed.
 *
 * @returns {{ clubs_updated: number, events_updated: number }}
 */
const recalculateAllRankings = async () => {
  logger.info('Starting full ranking recalculation');

  let clubs_updated = 0;
  let events_updated = 0;

  try {
    // Step 1: Recalculate all club ranking scores
    const clubsResult = await query('SELECT id FROM clubs');

    for (const club of clubsResult.rows) {
      try {
        await calculateClubRankingScore(club.id);
        clubs_updated++;
      } catch (error) {
        logger.error(`Error recalculating ranking for club ${club.id}:`, error.message);
      }
    }

    logger.info(`Recalculated ranking_score for ${clubs_updated} clubs`);

    // Step 2: Recalculate feed_score for all active events
    const eventsResult = await query(
      "SELECT e.id FROM events e WHERE e.status = 'active'"
    );

    for (const event of eventsResult.rows) {
      try {
        await calculateEventFeedScore(event.id);
        events_updated++;
      } catch (error) {
        logger.error(`Error recalculating feed score for event ${event.id}:`, error.message);
      }
    }

    logger.info(`Recalculated feed_score for ${events_updated} active events`);
  } catch (error) {
    logger.error('Error during full ranking recalculation:', error.message);
  }

  logger.info(`Full ranking recalculation complete: ${clubs_updated} clubs, ${events_updated} events`);
  return { clubs_updated, events_updated };
};

/**
 * Mark events as 'completed' when their event_date has passed.
 *
 * Sets status='completed' for all events where event_date < NOW()
 * and status is still 'active'.
 *
 * @returns {number} Number of events marked as completed
 */
const markCompletedEvents = async () => {
  try {
    const result = await query(
      `UPDATE events
       SET status = 'completed', updated_at = NOW()
       WHERE event_date < NOW()
         AND status = 'active'
       RETURNING id`
    );

    const count = result.rows.length;
    if (count > 0) {
      logger.info(`Marked ${count} past events as completed`);
    }

    return count;
  } catch (error) {
    logger.error('Error marking completed events:', error.message);
    return 0;
  }
};

module.exports = {
  calculateClubRankingScore,
  recalculateAllRankings,
  calculateEventFeedScore,
  markCompletedEvents,
};

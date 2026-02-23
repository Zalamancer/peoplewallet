const { discoverClubsForSchool, classifyPendingAccounts } = require('../services/club-discovery');
const { recalculateAllRankings } = require('../services/ranking');
const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Run club discovery for all schools in the database.
 *
 * For recurring (cron) runs, uses a conservative budget to stay within
 * Google CSE free tier limits. For first-run or manual triggers, use
 * the admin endpoint POST /api/admin/run-discovery instead.
 */
const runClubDiscovery = async () => {
  logger.info('[ClubDiscovery] Starting monthly club discovery for all schools');

  const schoolsResult = await query('SELECT id, name FROM schools ORDER BY created_at ASC');
  const schools = schoolsResult.rows;

  if (schools.length === 0) {
    logger.warn('[ClubDiscovery] No schools in DB, skipping');
    return { schools_processed: 0 };
  }

  const results = { schools_processed: 0, total_discovered: 0, total_promoted: 0, total_classified: 0 };

  for (const school of schools) {
    logger.info(`[ClubDiscovery] Processing school: ${school.name} (${school.id})`);

    try {
      // Conservative budget for recurring cron runs (stays within free tier)
      const discovered = await discoverClubsForSchool(school.id, {
        googleQueryBudget: 10,
        googlePagesPerQuery: 1,
        enableFollowingCrawl: false,
        enableInstagramSearch: false,
      });
      results.total_discovered += discovered.unique_inserted;
      logger.info(`[ClubDiscovery] Discovered ${discovered.unique_inserted} new accounts for ${school.name}`);
    } catch (err) {
      logger.error(`[ClubDiscovery] Discovery failed for ${school.name}:`, err.message);
    }

    try {
      const classified = await classifyPendingAccounts(school.id, {
        batchLimit: 50,
        concurrency: 5,
      });
      results.total_classified += classified.classified;
      results.total_promoted += classified.promoted;
      logger.info(`[ClubDiscovery] Classified ${classified.classified}, promoted ${classified.promoted} for ${school.name}`);
    } catch (err) {
      logger.error(`[ClubDiscovery] Classification failed for ${school.name}:`, err.message);
    }

    results.schools_processed++;
  }

  // Recalculate rankings after all schools are processed
  try {
    const rankings = await recalculateAllRankings();
    results.rankings_updated = rankings.clubs_updated;
    logger.info(`[ClubDiscovery] Recalculated rankings for ${rankings.clubs_updated} clubs`);
  } catch (err) {
    logger.error('[ClubDiscovery] Ranking recalculation failed:', err.message);
  }

  logger.info('[ClubDiscovery] Monthly run complete:', results);
  return results;
};

module.exports = { runClubDiscovery };

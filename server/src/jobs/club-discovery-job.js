const { discoverClubsViaGoogle, classifyPendingAccounts } = require('../services/club-discovery');
const { recalculateAllRankings } = require('../services/ranking');
const logger = require('../utils/logger');

const runClubDiscovery = async () => {
  logger.info('[ClubDiscovery] Starting weekly club discovery');

  // Step 1: Run Google dork queries to discover new accounts
  const discovered = await discoverClubsViaGoogle();
  logger.info(`[ClubDiscovery] Discovered ${discovered.new} new accounts`);

  // Step 2: Classify pending accounts with LLM
  const classified = await classifyPendingAccounts();
  logger.info(`[ClubDiscovery] Classified ${classified.total} accounts, promoted ${classified.promoted}`);

  // Step 3: Recalculate all ranking scores
  const rankings = await recalculateAllRankings();
  logger.info(`[ClubDiscovery] Recalculated rankings for ${rankings.clubs_updated} clubs`);

  return { discovered: discovered.new, classified: classified.total, promoted: classified.promoted, rankings_updated: rankings.clubs_updated };
};

module.exports = { runClubDiscovery };

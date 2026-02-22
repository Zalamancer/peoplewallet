const { fetchAllClubPosts } = require('../services/instagram-fetcher');
const { analyzePendingPosts } = require('../services/event-analyzer');
const { recalculateAllRankings } = require('../services/ranking');
const { markCompletedEvents } = require('../services/ranking');
const logger = require('../utils/logger');

const runPostFetcher = async () => {
  logger.info('[PostFetcher] Starting daily post fetch pipeline');

  // Step 1: Fetch latest posts from all tracked clubs
  const fetchResult = await fetchAllClubPosts();
  logger.info(`[PostFetcher] Fetched ${fetchResult.new_posts} new posts from ${fetchResult.fetched} clubs`);

  // Step 2: Analyze new posts with Claude
  const analysis = await analyzePendingPosts();
  logger.info(`[PostFetcher] Analyzed ${analysis.analyzed} posts, created ${analysis.events_created} events`);

  // Step 3: Recalculate rankings and feed scores
  const rankings = await recalculateAllRankings();
  logger.info(`[PostFetcher] Recalculated rankings for ${rankings.clubs_updated} clubs, ${rankings.events_updated} events`);

  // Step 4: Mark past events as completed
  const cleanup = await markCompletedEvents();
  logger.info(`[PostFetcher] Marked ${cleanup} events as completed`);

  return {
    posts_fetched: fetchResult.new_posts,
    events_created: analysis.events_created,
    rankings_updated: rankings.clubs_updated,
    events_completed: cleanup,
  };
};

module.exports = { runPostFetcher };

/**
 * Simple job scheduler for PeopleWallet
 * Runs decay reminders and event prep nudges on configurable intervals.
 *
 * Usage: node src/jobs/scheduler.js
 * Or import and call startScheduler() from the main server process.
 */

const { processDecayReminders } = require('../services/decay-reminders');
const { processEventPrepReminders } = require('../services/event-prep');
const { processWeeklyDigests } = require('../services/insights');
const { runDecayTracking } = require('../jobs/decay-tracker');
const { generateWeeklyNudges } = require('../jobs/weekly-nudges');
const { processEventReminders } = require('../jobs/event-reminders');
const { refreshExpiredEmbeds } = require('../services/oembed');
const { runClubDiscovery } = require('./club-discovery-job');
const { runPostFetcher } = require('./post-fetcher-job');
const logger = require('../utils/logger');

const HOUR_MS = 60 * 60 * 1000;

/**
 * Run a job with error handling and logging
 */
const runJob = async (name, fn) => {
  const start = Date.now();
  logger.info(`[Scheduler] Starting job: ${name}`);
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logger.info(`[Scheduler] Job ${name} completed in ${duration}ms`, result);
    return result;
  } catch (error) {
    logger.error(`[Scheduler] Job ${name} failed:`, error);
    return null;
  }
};

/**
 * Start all scheduled jobs
 */
const startScheduler = () => {
  logger.info('[Scheduler] Starting job scheduler');

  // Run decay reminders every 6 hours
  setInterval(() => {
    runJob('decay-reminders', processDecayReminders);
  }, 6 * HOUR_MS);

  // Run event prep reminders every hour
  setInterval(() => {
    runJob('event-prep', processEventPrepReminders);
  }, 1 * HOUR_MS);

  // Run event RSVP reminders every 15 minutes (events starting within 1 hour)
  setInterval(() => {
    runJob('event-reminders', processEventReminders);
  }, 15 * 60 * 1000);

  // Run weekly digest generation every 24 hours (Mondays at startup time)
  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 1) { // Monday
      runJob('weekly-digests', processWeeklyDigests);
    }
  }, 24 * HOUR_MS);

  // Run relationship score decay tracking daily at midnight
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() < 10) {
      runJob('decay-tracker', runDecayTracking);
    }
  }, 10 * 60 * 1000); // Check every 10 minutes

  // Run weekly nudges on Sundays at 10am
  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 0 && now.getHours() === 10 && now.getMinutes() < 10) {
      runJob('weekly-nudges', generateWeeklyNudges);
    }
  }, 10 * 60 * 1000); // Check every 10 minutes

  // Refresh expired oEmbed data daily
  setInterval(() => {
    runJob('embed-refresh', refreshExpiredEmbeds);
  }, 24 * HOUR_MS);

  // Club Discovery — 1st Sunday of each month at 2 AM CT
  // Iterates all schools with conservative budget (10 queries each)
  // For full first-run discovery, use POST /api/admin/run-discovery
  setInterval(() => {
    const now = new Date();
    const ctNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    if (ctNow.getDay() === 0 && ctNow.getDate() <= 7 && ctNow.getHours() === 2 && ctNow.getMinutes() < 10) {
      runJob('club-discovery', runClubDiscovery);
    }
  }, 10 * 60 * 1000);

  // Post Fetcher + Event Analyzer — Every 3 days at 5 AM CT (conserves Instagram API free tier)
  // Fetches top 10 clubs, analyzes up to 5 posts per run
  setInterval(() => {
    const now = new Date();
    const ctNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    if (dayOfYear % 3 === 0 && ctNow.getHours() === 5 && ctNow.getMinutes() < 10) {
      runJob('post-fetcher', runPostFetcher);
    }
  }, 10 * 60 * 1000);

  // Run initial check after 30 seconds (let server stabilize)
  setTimeout(() => {
    runJob('decay-reminders', processDecayReminders);
    runJob('event-prep', processEventPrepReminders);
    runJob('event-reminders', processEventReminders);
  }, 30 * 1000);

  logger.info('[Scheduler] Jobs scheduled: decay-reminders (6h), event-prep (1h), event-reminders (15m), weekly-digests (Mon), decay-tracker (daily midnight), weekly-nudges (Sun 10am), embed-refresh (24h), club-discovery (1st Sun/month 2am CT), post-fetcher (every 3 days 5am CT)');
};

// If run directly (node src/jobs/scheduler.js), run once
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

  (async () => {
    logger.info('[Scheduler] Running one-time job execution');
    await runJob('decay-reminders', processDecayReminders);
    await runJob('event-prep', processEventPrepReminders);
    await runJob('event-reminders', processEventReminders);
    await runJob('weekly-digests', processWeeklyDigests);
    await runJob('decay-tracker', runDecayTracking);
    await runJob('weekly-nudges', generateWeeklyNudges);
    await runJob('club-discovery', runClubDiscovery);
    await runJob('post-fetcher', runPostFetcher);
    process.exit(0);
  })();
}

module.exports = { startScheduler };

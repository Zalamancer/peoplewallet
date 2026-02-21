/**
 * Simple job scheduler for ProAnimate Connect
 * Runs decay reminders and event prep nudges on configurable intervals.
 *
 * Usage: node src/jobs/scheduler.js
 * Or import and call startScheduler() from the main server process.
 */

const { processDecayReminders } = require('../services/decay-reminders');
const { processEventPrepReminders } = require('../services/event-prep');
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

  // Run initial check after 30 seconds (let server stabilize)
  setTimeout(() => {
    runJob('decay-reminders', processDecayReminders);
    runJob('event-prep', processEventPrepReminders);
  }, 30 * 1000);

  logger.info('[Scheduler] Jobs scheduled: decay-reminders (6h), event-prep (1h)');
};

// If run directly (node src/jobs/scheduler.js), run once
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

  (async () => {
    logger.info('[Scheduler] Running one-time job execution');
    await runJob('decay-reminders', processDecayReminders);
    await runJob('event-prep', processEventPrepReminders);
    process.exit(0);
  })();
}

module.exports = { startScheduler };

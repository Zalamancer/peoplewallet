const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getFeed, refreshContactFeed } = require('../services/feed');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/feed
 * Returns a paginated activity feed aggregated from saved contacts' social profiles.
 * Items include embedded post previews, profile summary cards, and social links.
 *
 * Query params:
 *   page  - Page number (default: 1)
 *   limit - Items per page (default: 20, max: 50)
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const feed = await getFeed(req.user.id, page, limit);

    res.json(feed);
  } catch (error) {
    logger.error('Feed fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

/**
 * POST /api/feed/refresh/:contactId
 * Force-refresh feed cache for a specific contact
 */
router.post('/refresh/:contactId', async (req, res) => {
  try {
    await refreshContactFeed(req.params.contactId);
    res.json({ message: 'Feed cache refreshed for contact' });
  } catch (error) {
    logger.error('Feed refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh feed' });
  }
});

module.exports = router;

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getInsightsForUser, getRecapForUser } = require('../services/insights');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/insights
 * Returns current AI-generated relationship insights for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const insights = await getInsightsForUser(req.user.id);
    res.json({ insights });
  } catch (error) {
    logger.error('Get insights error:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

/**
 * GET /api/insights/recap
 * Returns period summary stats (semester or month)
 * Query params: period=month|semester
 */
router.get('/recap', async (req, res) => {
  try {
    const period = req.query.period === 'semester' ? 'semester' : 'month';
    const recap = await getRecapForUser(req.user.id, period);
    res.json(recap);
  } catch (error) {
    logger.error('Get recap error:', error);
    res.status(500).json({ error: 'Failed to fetch recap' });
  }
});

module.exports = router;

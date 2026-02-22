const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getMutualConnectionsForContact,
  getAllMutualConnections,
  getMutualConnectionsBetweenUsers,
  discoverMutualConnections,
  discoverAllForUser,
} = require('../services/mutual-connections');
const { validateUUID } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/connections/mutual
 * List all mutual connections for the current user.
 * Returns other users grouped by shared contact count.
 */
router.get('/mutual', async (req, res) => {
  try {
    const connections = await getAllMutualConnections(req.user.id);
    res.json({ connections });
  } catch (error) {
    logger.error('Get all mutual connections error:', error);
    res.status(500).json({ error: 'Failed to fetch mutual connections' });
  }
});

/**
 * GET /api/connections/mutual/:userId
 * Get mutual connections between the current user and a specific other user.
 * Returns the list of shared contacts.
 */
router.get('/mutual/:id', validateUUID, async (req, res) => {
  try {
    const connections = await getMutualConnectionsBetweenUsers(
      req.user.id,
      req.params.id
    );
    res.json({ connections });
  } catch (error) {
    logger.error('Get mutual connections between users error:', error);
    res.status(500).json({ error: 'Failed to fetch mutual connections' });
  }
});

/**
 * POST /api/connections/discover
 * Trigger mutual connection discovery for all contacts of the current user.
 * Useful after bulk import or manual refresh.
 */
router.post('/discover', async (req, res) => {
  try {
    const count = await discoverAllForUser(req.user.id);
    res.json({
      message: `Discovered ${count} new mutual connection(s)`,
      discovered: count,
    });
  } catch (error) {
    logger.error('Discover all mutual connections error:', error);
    res.status(500).json({ error: 'Failed to discover mutual connections' });
  }
});

module.exports = router;

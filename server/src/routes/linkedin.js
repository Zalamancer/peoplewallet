const express = require('express');
const axios = require('axios');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { fetchProfileByUrl } = require('../services/linkedin');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/linkedin/lookup
 * Fetch and extract contact data from a LinkedIn profile URL.
 * Returns structured contact fields for auto-filling the new contact form.
 */
router.post('/lookup', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'LinkedIn profile URL is required' });
    }

    // Basic URL validation
    if (!url.match(/linkedin\.com\/in\//i)) {
      return res.status(400).json({
        error: 'Invalid LinkedIn URL',
        message: 'Please provide a valid LinkedIn profile URL (e.g., linkedin.com/in/username)',
      });
    }

    const result = await fetchProfileByUrl(url);

    res.json(result);
  } catch (error) {
    logger.error('LinkedIn lookup error:', error.message);
    res.status(500).json({
      error: 'LinkedIn lookup failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/linkedin/recent-connections
 * Fetches the user's recent LinkedIn connections using their stored OAuth token.
 * Returns a list of connection profiles sorted by most recently added.
 *
 * LinkedIn heavily restricts the connections API:
 * - Requires r_1st_connections scope (not available to most apps)
 * - Token must be valid and not expired
 *
 * Graceful fallback: returns an empty array with a descriptive message
 * when access is not available.
 */
router.get('/recent-connections', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;
    const maxResults = Math.min(parseInt(limit, 10) || 10, 25);

    // Check if user has a stored LinkedIn access token
    const userResult = await query(
      'SELECT linkedin_access_token, linkedin_id FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (!user?.linkedin_access_token) {
      return res.json({
        connections: [],
        total: 0,
        message: 'LinkedIn account not connected. Connect your LinkedIn account in Settings to enable this feature.',
        connected: false,
      });
    }

    try {
      // Attempt LinkedIn API v2 connections fetch
      const response = await axios.get('https://api.linkedin.com/v2/connections', {
        headers: {
          Authorization: `Bearer ${user.linkedin_access_token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        params: {
          start: 0,
          count: maxResults,
          sortBy: 'RECENTLY_ADDED',
        },
        timeout: 10000,
        validateStatus: () => true,
      });

      if (response.status === 200 && response.data?.elements) {
        const connections = response.data.elements.map((conn) => ({
          id: `linkedin_${conn.miniProfile?.publicIdentifier || conn.entityUrn}`,
          full_name: [conn.miniProfile?.firstName, conn.miniProfile?.lastName]
            .filter(Boolean)
            .join(' '),
          headline: conn.miniProfile?.occupation || null,
          avatar_url: conn.miniProfile?.picture?.rootUrl
            ? `${conn.miniProfile.picture.rootUrl}${conn.miniProfile.picture.artifacts?.[0]?.fileIdentifyingUrlPathSegment || ''}`
            : null,
          profile_url: conn.miniProfile?.publicIdentifier
            ? `https://www.linkedin.com/in/${conn.miniProfile.publicIdentifier}`
            : null,
          connected_at: conn.createdAt
            ? new Date(conn.createdAt).toISOString()
            : new Date().toISOString(),
        }));

        return res.json({
          connections,
          total: connections.length,
          connected: true,
        });
      }

      // Handle token expiration or insufficient permissions
      if (response.status === 401) {
        logger.info('LinkedIn token expired for user', userId);
        return res.json({
          connections: [],
          total: 0,
          message: 'LinkedIn session expired. Please reconnect your LinkedIn account in Settings.',
          connected: false,
          token_expired: true,
        });
      }

      if (response.status === 403) {
        logger.info('LinkedIn connections API access denied for user', userId);
        return res.json({
          connections: [],
          total: 0,
          message: 'LinkedIn connections access is restricted. You can still add contacts using LinkedIn profile URLs.',
          connected: true,
          access_restricted: true,
        });
      }

      logger.warn(`LinkedIn connections API returned status ${response.status}`);
      return res.json({
        connections: [],
        total: 0,
        message: 'Unable to fetch LinkedIn connections at this time.',
        connected: true,
      });
    } catch (apiError) {
      logger.warn('LinkedIn connections API error:', apiError.message);
      return res.json({
        connections: [],
        total: 0,
        message: 'LinkedIn service is temporarily unavailable. Please try again later.',
        connected: true,
      });
    }
  } catch (error) {
    logger.error('Recent connections error:', error);
    res.status(500).json({ error: 'Failed to fetch recent connections' });
  }
});

module.exports = router;

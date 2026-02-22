const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const { fetchProfileByUrl } = require('../services/linkedin');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/social/suggestions
 * Returns suggested contacts from recent social activity.
 * Aggregates recent LinkedIn connections (via stored OAuth token)
 * and returns them as suggestion cards for quick-add.
 *
 * Falls back gracefully when LinkedIn API access is limited or
 * the user has no stored OAuth token.
 */
router.get('/suggestions', async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, limit = 10 } = req.query;
    const maxResults = Math.min(parseInt(limit, 10) || 10, 25);

    const suggestions = [];

    // Fetch LinkedIn suggestions if not filtering by another platform
    if (!platform || platform === 'linkedin') {
      try {
        const linkedinSuggestions = await getLinkedInSuggestions(userId, maxResults);
        suggestions.push(...linkedinSuggestions);
      } catch (linkedinError) {
        logger.warn('LinkedIn suggestions unavailable:', linkedinError.message);
        // Continue - we return whatever we have
      }
    }

    // Fetch Instagram suggestions if not filtering by another platform
    if (!platform || platform === 'instagram') {
      try {
        const instagramSuggestions = await getInstagramSuggestions(userId, maxResults);
        suggestions.push(...instagramSuggestions);
      } catch (instagramError) {
        logger.warn('Instagram suggestions unavailable:', instagramError.message);
      }
    }

    // Sort by recency (most recent first) and limit
    suggestions.sort((a, b) => new Date(b.connected_at) - new Date(a.connected_at));
    const limited = suggestions.slice(0, maxResults);

    // Filter out contacts that already exist in the user's contact list
    const existingNames = await getExistingContactNames(userId);
    const filtered = limited.filter(
      (s) => !existingNames.has(s.full_name?.toLowerCase())
    );

    res.json({
      suggestions: filtered,
      total: filtered.length,
      platforms: {
        linkedin: !platform || platform === 'linkedin',
        instagram: !platform || platform === 'instagram',
      },
    });
  } catch (error) {
    logger.error('Social suggestions error:', error);
    res.status(500).json({ error: 'Failed to fetch social suggestions' });
  }
});

/**
 * Get existing contact names for deduplication
 */
async function getExistingContactNames(userId) {
  const result = await query(
    'SELECT LOWER(full_name) as name FROM contacts WHERE user_id = $1',
    [userId]
  );
  return new Set(result.rows.map((r) => r.name));
}

/**
 * Fetch recent LinkedIn connections using the user's stored OAuth token.
 * LinkedIn's API has strict access limitations, so this handles
 * multiple fallback scenarios gracefully.
 */
async function getLinkedInSuggestions(userId, limit) {
  // Check if user has a LinkedIn access token stored
  const userResult = await query(
    'SELECT linkedin_access_token, linkedin_id FROM users WHERE id = $1',
    [userId]
  );

  const user = userResult.rows[0];
  if (!user?.linkedin_access_token) {
    logger.debug('No LinkedIn token stored for user', userId);
    return [];
  }

  const axios = require('axios');

  try {
    // LinkedIn API v2: fetch connections (requires r_1st_connections scope)
    // Note: LinkedIn severely restricts connection list access for most apps.
    // This endpoint may return 403 for apps without the "Connections" product approved.
    const response = await axios.get('https://api.linkedin.com/v2/connections', {
      headers: {
        Authorization: `Bearer ${user.linkedin_access_token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      params: {
        start: 0,
        count: limit,
        sortBy: 'RECENTLY_ADDED',
      },
      timeout: 10000,
      validateStatus: () => true,
    });

    if (response.status === 200 && response.data?.elements) {
      return response.data.elements.map((conn) => ({
        id: `linkedin_${conn.miniProfile?.publicIdentifier || conn.entityUrn}`,
        full_name: [conn.miniProfile?.firstName, conn.miniProfile?.lastName]
          .filter(Boolean)
          .join(' '),
        headline: conn.miniProfile?.occupation || null,
        avatar_url: conn.miniProfile?.picture?.rootUrl
          ? `${conn.miniProfile.picture.rootUrl}${conn.miniProfile.picture.artifacts?.[0]?.fileIdentifyingUrlPathSegment || ''}`
          : null,
        platform: 'linkedin',
        profile_url: conn.miniProfile?.publicIdentifier
          ? `https://www.linkedin.com/in/${conn.miniProfile.publicIdentifier}`
          : null,
        connected_at: conn.createdAt ? new Date(conn.createdAt).toISOString() : new Date().toISOString(),
      }));
    }

    // If we get 403/401, the token may be expired or the app doesn't have connections access
    if (response.status === 401 || response.status === 403) {
      logger.info(`LinkedIn API returned ${response.status} for connections - token may be expired or insufficient permissions`);

      // Fallback: try to at least return the user's own profile info as a test
      // that the integration is working, but no connections available
      return [];
    }

    logger.warn(`LinkedIn connections API returned unexpected status: ${response.status}`);
    return [];
  } catch (error) {
    logger.warn('LinkedIn connections fetch failed:', error.message);
    return [];
  }
}

/**
 * Instagram suggestions placeholder.
 * Instagram Basic Display API was deprecated in Dec 2024.
 * This returns an empty array but is ready for integration
 * when Instagram's new API becomes available.
 */
async function getInstagramSuggestions(userId, limit) {
  // Instagram Basic Display API has been deprecated.
  // Future: integrate with Instagram Graph API if/when available for this use case.
  logger.debug('Instagram suggestions not yet implemented');
  return [];
}

module.exports = router;

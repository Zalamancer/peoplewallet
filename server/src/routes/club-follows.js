const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/me/clubs
 * Get the authenticated user's followed clubs, sorted by ranking_score DESC.
 */
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, c.ranking_score, c.instagram_handle, c.is_registered, c.follower_count,
        ucf.created_at,
        (SELECT COUNT(*)::int FROM club_memberships cm WHERE cm.club_id = c.id) AS member_count
      FROM user_club_follows ucf
      JOIN clubs c ON c.id = ucf.club_id
      WHERE ucf.user_id = $1
      ORDER BY c.ranking_score DESC NULLS LAST, c.name ASC`,
      [req.user.id]
    );

    res.json({ clubs: result.rows });
  } catch (error) {
    logger.error('Get followed clubs error:', error);
    res.status(500).json({ error: 'Failed to get followed clubs' });
  }
});

/**
 * POST /api/me/clubs/:clubId/follow
 * Follow a club. ON CONFLICT DO NOTHING to handle duplicate follows gracefully.
 */
router.post('/:clubId/follow', async (req, res) => {
  try {
    const { clubId } = req.params;

    // Verify club exists
    const clubResult = await query(
      'SELECT id, name FROM clubs WHERE id = $1',
      [clubId]
    );

    if (clubResult.rows.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const result = await query(
      `INSERT INTO user_club_follows (user_id, club_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, club_id) DO NOTHING
       RETURNING *`,
      [req.user.id, clubId]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'Already following this club' });
    }

    logger.info(`User ${req.user.id} followed club ${clubId}`);
    res.status(201).json({ message: 'Club followed successfully', follow: result.rows[0] });
  } catch (error) {
    logger.error('Follow club error:', error);
    res.status(500).json({ error: 'Failed to follow club' });
  }
});

/**
 * DELETE /api/me/clubs/:clubId/follow
 * Unfollow a club.
 */
router.delete('/:clubId/follow', async (req, res) => {
  try {
    const { clubId } = req.params;

    const result = await query(
      'DELETE FROM user_club_follows WHERE user_id = $1 AND club_id = $2 RETURNING *',
      [req.user.id, clubId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'You are not following this club' });
    }

    logger.info(`User ${req.user.id} unfollowed club ${clubId}`);
    res.json({ message: 'Club unfollowed successfully' });
  } catch (error) {
    logger.error('Unfollow club error:', error);
    res.status(500).json({ error: 'Failed to unfollow club' });
  }
});

module.exports = router;

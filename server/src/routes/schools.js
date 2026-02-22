const express = require('express');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/schools
 * List all schools (simple list for picker)
 * No auth required
 */
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, domain, logo_url
       FROM schools
       ORDER BY name ASC`
    );

    res.json({ schools: result.rows });
  } catch (error) {
    logger.error('List schools error:', error);
    res.status(500).json({ error: 'Failed to list schools' });
  }
});

/**
 * GET /api/schools/:id
 * School detail with club_count and user_count
 * No auth required
 */
router.get('/:id', async (req, res) => {
  try {
    const schoolResult = await query(
      'SELECT * FROM schools WHERE id = $1',
      [req.params.id]
    );

    if (schoolResult.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    const school = schoolResult.rows[0];

    // Fetch club count and user count in parallel
    const [clubCountResult, userCountResult] = await Promise.all([
      query(
        'SELECT COUNT(*)::int AS count FROM clubs WHERE school_id = $1',
        [req.params.id]
      ),
      query(
        'SELECT COUNT(*)::int AS count FROM users WHERE school_id = $1',
        [req.params.id]
      ),
    ]);

    res.json({
      ...school,
      club_count: clubCountResult.rows[0].count,
      user_count: userCountResult.rows[0].count,
    });
  } catch (error) {
    logger.error('Get school error:', error);
    res.status(500).json({ error: 'Failed to fetch school' });
  }
});

module.exports = router;

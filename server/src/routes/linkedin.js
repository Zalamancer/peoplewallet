const express = require('express');
const { authenticate } = require('../middleware/auth');
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

module.exports = router;

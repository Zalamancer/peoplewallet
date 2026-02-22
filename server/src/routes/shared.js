const express = require('express');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/shared/:shareToken
 * Public endpoint — no authentication required
 * Returns a shared contact card's public profile data
 */
router.get('/:shareToken', async (req, res) => {
  try {
    const { shareToken } = req.params;

    if (!shareToken || shareToken.length < 16) {
      return res.status(400).json({ error: 'Invalid share token' });
    }

    // Find the contact by share token (must be share-enabled)
    const contactResult = await query(
      'SELECT id, full_name, nickname, pronouns, avatar_url FROM contacts WHERE share_token = $1 AND share_enabled = TRUE',
      [shareToken]
    );

    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shared card not found or sharing is disabled' });
    }

    const contact = contactResult.rows[0];

    // Fetch public-safe related data in parallel
    const [professional, social, tags] = await Promise.all([
      query('SELECT school, graduation_year, major, company, job_title, department FROM contact_professional WHERE contact_id = $1', [contact.id]),
      query('SELECT platform, handle, url FROM contact_social WHERE contact_id = $1', [contact.id]),
      query('SELECT tag_name FROM contact_tags WHERE contact_id = $1', [contact.id]),
    ]);

    res.json({
      full_name: contact.full_name,
      nickname: contact.nickname,
      pronouns: contact.pronouns,
      avatar_url: contact.avatar_url,
      professional: professional.rows[0] || null,
      social: social.rows,
      tags: tags.rows.map((t) => t.tag_name),
    });
  } catch (error) {
    logger.error('Get shared card error:', error);
    res.status(500).json({ error: 'Failed to fetch shared card' });
  }
});

module.exports = router;

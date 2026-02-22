const express = require('express');
const crypto = require('crypto');
const { query, getClient } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/card-exchange/send
 * Generate a share token for card exchange.
 * Optionally associates the exchange with an event.
 */
router.post('/send', async (req, res) => {
  try {
    const { event_id } = req.body;
    const userId = req.user.id;

    // Generate a unique share token
    const shareToken = crypto.randomBytes(32).toString('hex');

    // Store the share token on the user record (reuse or create)
    // We use a dedicated column approach — update the user's share_token
    await query(
      `UPDATE users SET
        share_token = $1,
        updated_at = NOW()
      WHERE id = $2`,
      [shareToken, userId]
    );

    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://app.peoplewallet.com';
    const shareUrl = `${baseUrl}/card-exchange/${shareToken}`;
    const deepLink = `peoplewallet://card/${userId}`;

    // If event_id provided, validate it
    if (event_id) {
      const eventResult = await query(
        'SELECT id FROM events WHERE id = $1 AND user_id = $2',
        [event_id, userId]
      );

      if (eventResult.rows.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }
    }

    logger.info(`Card exchange token generated for user ${userId}`);

    res.json({
      share_token: shareToken,
      share_url: shareUrl,
      deep_link: deepLink,
      event_id: event_id || null,
    });
  } catch (error) {
    logger.error('Card exchange send error:', error);
    res.status(500).json({ error: 'Failed to generate card exchange token' });
  }
});

/**
 * POST /api/card-exchange/receive
 * Accept a card exchange — creates a contact record from the sender's profile.
 * If mutual exchange is detected, marks both contacts with mutual_connection flag.
 */
router.post('/receive', async (req, res) => {
  const client = await getClient();

  try {
    const { sender_user_id, event_id } = req.body;
    const receiverId = req.user.id;

    if (!sender_user_id) {
      client.release();
      return res.status(400).json({ error: 'sender_user_id is required' });
    }

    if (sender_user_id === receiverId) {
      client.release();
      return res.status(400).json({ error: 'Cannot exchange card with yourself' });
    }

    // Fetch sender's profile
    const senderResult = await client.query(
      'SELECT id, name, email, avatar_url FROM users WHERE id = $1',
      [sender_user_id]
    );

    if (senderResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Sender user not found' });
    }

    const sender = senderResult.rows[0];

    await client.query('BEGIN');

    // Check if receiver already has this sender as a contact (by email or name match)
    const existingContact = await client.query(
      `SELECT id FROM contacts
       WHERE user_id = $1 AND (email = $2 OR full_name = $3)
       LIMIT 1`,
      [receiverId, sender.email, sender.name]
    );

    let contactId;

    if (existingContact.rows.length > 0) {
      // Contact already exists — update it and set linked_user_id
      contactId = existingContact.rows[0].id;
      await client.query(
        `UPDATE contacts SET
          avatar_url = COALESCE($1, avatar_url),
          email = COALESCE($2, email),
          source = 'card_exchange',
          linked_user_id = $3,
          link_confidence = 'high',
          linked_at = NOW(),
          updated_at = NOW()
        WHERE id = $4`,
        [sender.avatar_url, sender.email, sender_user_id, contactId]
      );
    } else {
      // Create a new contact record pre-filled with sender's profile data, linked to sender
      const contactResult = await client.query(
        `INSERT INTO contacts (user_id, full_name, email, avatar_url, source, linked_user_id, link_confidence, linked_at)
         VALUES ($1, $2, $3, $4, 'card_exchange', $5, 'high', NOW())
         RETURNING *`,
        [receiverId, sender.name, sender.email, sender.avatar_url, sender_user_id]
      );
      contactId = contactResult.rows[0].id;
    }

    // Record the card exchange
    await client.query(
      `INSERT INTO contact_card_exchanges (sender_id, receiver_id, event_id)
       VALUES ($1, $2, $3)`,
      [sender_user_id, receiverId, event_id || null]
    );

    // Check if mutual exchange detected (sender also has receiver saved)
    const reverseExchange = await client.query(
      `SELECT id FROM contact_card_exchanges
       WHERE sender_id = $1 AND receiver_id = $2`,
      [receiverId, sender_user_id]
    );

    let isMutual = false;

    if (reverseExchange.rows.length > 0) {
      isMutual = true;

      // Find the contact the sender created for the receiver
      const reverseContact = await client.query(
        `SELECT c.id FROM contacts c
         JOIN users u ON u.id = $2
         WHERE c.user_id = $1 AND (c.email = u.email OR c.full_name = u.name)
         LIMIT 1`,
        [sender_user_id, receiverId]
      );

      // Create user_connections record if both have contacts for each other
      if (reverseContact.rows.length > 0) {
        const contactAId = contactId < reverseContact.rows[0].id ? contactId : reverseContact.rows[0].id;
        const contactBId = contactId < reverseContact.rows[0].id ? reverseContact.rows[0].id : contactId;

        await client.query(
          `INSERT INTO user_connections (user_a_id, user_b_id, contact_a_id, contact_b_id, matched_on, shared_name)
           VALUES ($1, $2, $3, $4, 'card_exchange', $5)
           ON CONFLICT DO NOTHING`,
          [
            receiverId < sender_user_id ? receiverId : sender_user_id,
            receiverId < sender_user_id ? sender_user_id : receiverId,
            contactAId,
            contactBId,
            sender.name,
          ]
        );
      }
    }

    await client.query('COMMIT');

    // Fetch the created/updated contact to return
    const finalContact = await query(
      'SELECT * FROM contacts WHERE id = $1',
      [contactId]
    );

    logger.info(`Card exchange received: sender=${sender_user_id} receiver=${receiverId} mutual=${isMutual}`);

    res.status(201).json({
      contact: finalContact.rows[0],
      is_mutual: isMutual,
      message: isMutual
        ? 'Card exchange complete! You both have each other saved.'
        : 'Contact saved from card exchange.',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Card exchange receive error:', error);
    res.status(500).json({ error: 'Failed to process card exchange' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/card-exchange/mutual/:contactId
 * Check if a card exchange with a given contact is mutual
 * (both users have saved each other).
 */
router.get('/mutual/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    const userId = req.user.id;

    // Verify contact ownership
    const contactResult = await query(
      'SELECT id, email, full_name FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );

    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = contactResult.rows[0];

    // Find the user who this contact represents
    const otherUserResult = await query(
      `SELECT id FROM users
       WHERE (email = $1 OR name = $2) AND id != $3
       LIMIT 1`,
      [contact.email, contact.full_name, userId]
    );

    if (otherUserResult.rows.length === 0) {
      return res.json({ is_mutual: false, reason: 'Contact is not a registered user' });
    }

    const otherUserId = otherUserResult.rows[0].id;

    // Check if the other user has the current user saved as a contact
    const reverseResult = await query(
      `SELECT c.id FROM contacts c
       JOIN users u ON u.id = $2
       WHERE c.user_id = $1 AND (c.email = u.email OR c.full_name = u.name)
       LIMIT 1`,
      [otherUserId, userId]
    );

    const isMutual = reverseResult.rows.length > 0;

    res.json({ is_mutual: isMutual });
  } catch (error) {
    logger.error('Check mutual exchange error:', error);
    res.status(500).json({ error: 'Failed to check mutual exchange status' });
  }
});

module.exports = router;

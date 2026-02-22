const { query } = require('../config/database');
const { normalizeLinkedInUrl } = require('./mutual-connections');
const logger = require('../utils/logger');

/**
 * Attempt to link a contact to a registered PeopleWallet user.
 *
 * Matching hierarchy:
 *   1. Email match → users.email (high confidence, auto-link)
 *   2. LinkedIn match → users.linkedin_id + user_social (high confidence, auto-link)
 *   3. Name match → users.name, 2+ words only (suggested, user must confirm)
 *
 * @param {string} contactId - The contact to link
 * @param {string} ownerUserId - The contact's owner (excluded from matching)
 * @param {object} data - { email, socialLinks, fullName }
 */
const attemptUserLink = async (contactId, ownerUserId, { email, socialLinks, fullName }) => {
  try {
    // Skip if contact is already linked
    const existing = await query(
      'SELECT linked_user_id FROM contacts WHERE id = $1',
      [contactId]
    );
    if (existing.rows.length === 0 || existing.rows[0].linked_user_id) {
      return null;
    }

    // 1. Email match (high confidence)
    if (email) {
      const emailMatch = await query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2 LIMIT 1',
        [email.trim(), ownerUserId]
      );
      if (emailMatch.rows.length > 0) {
        await setLink(contactId, emailMatch.rows[0].id, 'high');
        logger.info(`Contact ${contactId} auto-linked to user ${emailMatch.rows[0].id} via email`);
        return { userId: emailMatch.rows[0].id, confidence: 'high', matchedOn: 'email' };
      }
    }

    // 2. LinkedIn match (high confidence)
    if (socialLinks && socialLinks.length > 0) {
      for (const link of socialLinks) {
        if (link.platform !== 'linkedin') continue;
        const vanity = normalizeLinkedInUrl(link.url || link.handle);
        if (!vanity) continue;

        // Check users.linkedin_id
        const linkedinIdMatch = await query(
          'SELECT id FROM users WHERE linkedin_id = $1 AND id != $2 LIMIT 1',
          [vanity, ownerUserId]
        );
        if (linkedinIdMatch.rows.length > 0) {
          await setLink(contactId, linkedinIdMatch.rows[0].id, 'high');
          logger.info(`Contact ${contactId} auto-linked to user ${linkedinIdMatch.rows[0].id} via linkedin_id`);
          return { userId: linkedinIdMatch.rows[0].id, confidence: 'high', matchedOn: 'linkedin' };
        }

        // Check user_social table
        const socialMatch = await query(
          `SELECT us.user_id FROM user_social us
           WHERE us.platform = 'linkedin'
             AND (
               $1 = ANY(ARRAY[
                 us.handle,
                 SUBSTRING(LOWER(us.url) FROM 'linkedin\\.com/in/([a-z0-9_-]+)')
               ])
             )
             AND us.user_id != $2
           LIMIT 1`,
          [vanity, ownerUserId]
        );
        if (socialMatch.rows.length > 0) {
          await setLink(contactId, socialMatch.rows[0].user_id, 'high');
          logger.info(`Contact ${contactId} auto-linked to user ${socialMatch.rows[0].user_id} via user_social linkedin`);
          return { userId: socialMatch.rows[0].user_id, confidence: 'high', matchedOn: 'linkedin' };
        }
      }
    }

    // 3. Name match (suggested, requires 2+ words)
    if (fullName) {
      const nameParts = fullName.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        const nameMatch = await query(
          'SELECT id FROM users WHERE LOWER(name) = LOWER($1) AND id != $2 LIMIT 1',
          [fullName.trim(), ownerUserId]
        );
        if (nameMatch.rows.length > 0) {
          await setLink(contactId, nameMatch.rows[0].id, 'suggested');
          logger.info(`Contact ${contactId} suggested-linked to user ${nameMatch.rows[0].id} via name`);
          return { userId: nameMatch.rows[0].id, confidence: 'suggested', matchedOn: 'name' };
        }
      }
    }

    return null;
  } catch (error) {
    logger.error('attemptUserLink error:', error);
    return null;
  }
};

/**
 * Set the link between a contact and a user
 */
const setLink = async (contactId, userId, confidence) => {
  await query(
    `UPDATE contacts SET linked_user_id = $1, link_confidence = $2, linked_at = NOW() WHERE id = $3`,
    [userId, confidence, contactId]
  );
};

/**
 * Confirm a suggested link (user confirms name-based match)
 */
const confirmLink = async (contactId, ownerUserId, linkedUserId) => {
  // Verify contact ownership
  const contact = await query(
    'SELECT id, linked_user_id FROM contacts WHERE id = $1 AND user_id = $2',
    [contactId, ownerUserId]
  );
  if (contact.rows.length === 0) {
    throw new Error('Contact not found');
  }

  await query(
    `UPDATE contacts SET linked_user_id = $1, link_confidence = 'high', linked_at = NOW() WHERE id = $2`,
    [linkedUserId, contactId]
  );
};

/**
 * Dismiss/unlink a contact from a user
 */
const dismissLink = async (contactId, ownerUserId) => {
  const contact = await query(
    'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
    [contactId, ownerUserId]
  );
  if (contact.rows.length === 0) {
    throw new Error('Contact not found');
  }

  await query(
    'UPDATE contacts SET linked_user_id = NULL, link_confidence = NULL, linked_at = NULL WHERE id = $1',
    [contactId]
  );
};

module.exports = { attemptUserLink, confirmLink, dismissLink };

const { query, getClient } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Find and store mutual connections for a given contact.
 * Two users have a "mutual connection" when they both have a contact record
 * referring to the same real-world person, matched by:
 *   1. LinkedIn URL (exact match on normalized URL)
 *   2. Email (exact, case-insensitive)
 *   3. Name similarity (exact match, case-insensitive)
 *
 * Only matches contacts belonging to OTHER users (not the same user).
 */
const discoverMutualConnections = async (contactId, userId) => {
  const client = await getClient();
  try {
    // Fetch the contact we're matching against
    const contactResult = await client.query(
      `SELECT c.id, c.full_name, c.email, c.linkedin_url,
              cs.url as social_linkedin_url
       FROM contacts c
       LEFT JOIN contact_social cs ON cs.contact_id = c.id AND cs.platform = 'linkedin'
       WHERE c.id = $1 AND c.user_id = $2`,
      [contactId, userId]
    );

    if (contactResult.rows.length === 0) {
      return [];
    }

    const contact = contactResult.rows[0];
    const linkedinUrl = normalizeLinkedInUrl(contact.linkedin_url || contact.social_linkedin_url);
    const email = contact.email ? contact.email.toLowerCase().trim() : null;
    const fullName = contact.full_name ? contact.full_name.trim() : null;

    if (!linkedinUrl && !email && !fullName) {
      return [];
    }

    // Find matching contacts from other users using application-level matching
    const matches = await findMatchingContacts(client, contact, userId, contactId);

    // Insert discovered connections
    await client.query('BEGIN');
    const newConnections = [];

    for (const match of matches) {
      try {
        const insertResult = await client.query(
          `INSERT INTO user_connections (user_a_id, user_b_id, contact_a_id, contact_b_id, matched_on, shared_name)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (LEAST(contact_a_id, contact_b_id), GREATEST(contact_a_id, contact_b_id))
           DO NOTHING
           RETURNING *`,
          [userId, match.user_id, contactId, match.contact_id, match.matched_on, contact.full_name]
        );
        if (insertResult.rows.length > 0) {
          newConnections.push(insertResult.rows[0]);
        }
      } catch (err) {
        // Ignore duplicate constraint violations, log others
        if (err.code !== '23505') {
          logger.warn('Failed to insert mutual connection:', err.message);
        }
      }
    }

    await client.query('COMMIT');
    return newConnections;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Discover mutual connections error:', error);
    return [];
  } finally {
    client.release();
  }
};

/**
 * Find contacts from other users that match the given contact
 */
const findMatchingContacts = async (client, contact, userId, contactId) => {
  const linkedinUrl = normalizeLinkedInUrl(contact.linkedin_url || contact.social_linkedin_url);
  const email = contact.email ? contact.email.toLowerCase().trim() : null;
  const fullName = contact.full_name ? contact.full_name.toLowerCase().trim() : null;

  const matches = [];

  // 1. Match by LinkedIn URL (highest confidence)
  if (linkedinUrl) {
    const result = await client.query(
      `SELECT DISTINCT c2.id as contact_id, c2.user_id, c2.full_name
       FROM contacts c2
       LEFT JOIN contact_social cs2 ON cs2.contact_id = c2.id AND cs2.platform = 'linkedin'
       WHERE c2.user_id != $1
         AND c2.id != $2
         AND (
           LOWER(TRIM(c2.linkedin_url)) LIKE $3
           OR LOWER(TRIM(cs2.url)) LIKE $3
         )`,
      [userId, contactId, `%${linkedinUrl}%`]
    );
    for (const row of result.rows) {
      matches.push({ ...row, matched_on: 'linkedin' });
    }
  }

  // 2. Match by email (high confidence)
  if (email) {
    const result = await client.query(
      `SELECT DISTINCT c2.id as contact_id, c2.user_id, c2.full_name
       FROM contacts c2
       WHERE c2.user_id != $1
         AND c2.id != $2
         AND LOWER(TRIM(c2.email)) = $3`,
      [userId, contactId, email]
    );
    for (const row of result.rows) {
      // Don't duplicate if already matched by linkedin
      if (!matches.find((m) => m.contact_id === row.contact_id)) {
        matches.push({ ...row, matched_on: 'email' });
      }
    }
  }

  // 3. Match by name (lower confidence, exact match only)
  if (fullName && fullName.split(' ').length >= 2) {
    const result = await client.query(
      `SELECT DISTINCT c2.id as contact_id, c2.user_id, c2.full_name
       FROM contacts c2
       WHERE c2.user_id != $1
         AND c2.id != $2
         AND LOWER(TRIM(c2.full_name)) = $3`,
      [userId, contactId, fullName]
    );
    for (const row of result.rows) {
      // Don't duplicate if already matched by linkedin or email
      if (!matches.find((m) => m.contact_id === row.contact_id)) {
        matches.push({ ...row, matched_on: 'name' });
      }
    }
  }

  return matches;
};

/**
 * Normalize a LinkedIn URL for comparison.
 * Extracts the vanity name / member ID from various LinkedIn URL formats.
 */
const normalizeLinkedInUrl = (url) => {
  if (!url) return null;
  try {
    const cleaned = url.toLowerCase().trim().replace(/\/+$/, '');
    const match = cleaned.match(/linkedin\.com\/in\/([a-z0-9_-]+)/);
    if (match) return match[1];
    return null;
  } catch {
    return null;
  }
};

/**
 * Get mutual connections between the current user and a specific contact.
 * Returns the list of other users who also know this contact.
 */
const getMutualConnectionsForContact = async (contactId, userId) => {
  const result = await query(
    `SELECT
       uc.id,
       uc.matched_on,
       uc.shared_name,
       uc.created_at,
       CASE
         WHEN uc.user_a_id = $2 THEN uc.user_b_id
         ELSE uc.user_a_id
       END as other_user_id,
       CASE
         WHEN uc.user_a_id = $2 THEN uc.contact_b_id
         ELSE uc.contact_a_id
       END as other_contact_id,
       u.name as other_user_name,
       u.avatar_url as other_user_avatar
     FROM user_connections uc
     JOIN users u ON u.id = CASE
       WHEN uc.user_a_id = $2 THEN uc.user_b_id
       ELSE uc.user_a_id
     END
     WHERE (uc.contact_a_id = $1 OR uc.contact_b_id = $1)
       AND (uc.user_a_id = $2 OR uc.user_b_id = $2)
     ORDER BY uc.created_at DESC`,
    [contactId, userId]
  );

  return result.rows;
};

/**
 * Get all mutual connections for the current user.
 * Returns grouped by the other user, with a count of shared contacts.
 */
const getAllMutualConnections = async (userId) => {
  const result = await query(
    `SELECT
       u.id as user_id,
       u.name as user_name,
       u.avatar_url as user_avatar,
       COUNT(*) as shared_count,
       array_agg(DISTINCT uc.shared_name) as shared_names,
       MAX(uc.created_at) as last_discovered
     FROM user_connections uc
     JOIN users u ON u.id = CASE
       WHEN uc.user_a_id = $1 THEN uc.user_b_id
       ELSE uc.user_a_id
     END
     WHERE uc.user_a_id = $1 OR uc.user_b_id = $1
     GROUP BY u.id, u.name, u.avatar_url
     ORDER BY shared_count DESC, last_discovered DESC`,
    [userId]
  );

  return result.rows;
};

/**
 * Get detailed mutual connections between the current user and another user.
 * Returns the list of shared contacts.
 */
const getMutualConnectionsBetweenUsers = async (userId, otherUserId) => {
  const result = await query(
    `SELECT
       uc.id,
       uc.shared_name,
       uc.matched_on,
       uc.created_at,
       CASE
         WHEN uc.user_a_id = $1 THEN uc.contact_a_id
         ELSE uc.contact_b_id
       END as my_contact_id,
       c.full_name as contact_name
     FROM user_connections uc
     JOIN contacts c ON c.id = CASE
       WHEN uc.user_a_id = $1 THEN uc.contact_a_id
       ELSE uc.contact_b_id
     END
     WHERE (uc.user_a_id = $1 AND uc.user_b_id = $2)
        OR (uc.user_a_id = $2 AND uc.user_b_id = $1)
     ORDER BY uc.created_at DESC`,
    [userId, otherUserId]
  );

  return result.rows;
};

/**
 * Run discovery for all contacts of a user (batch operation).
 * Useful when a new user joins or after bulk import.
 */
const discoverAllForUser = async (userId) => {
  const contacts = await query(
    'SELECT id FROM contacts WHERE user_id = $1',
    [userId]
  );

  let totalDiscovered = 0;
  for (const contact of contacts.rows) {
    const discovered = await discoverMutualConnections(contact.id, userId);
    totalDiscovered += discovered.length;
  }

  return totalDiscovered;
};

module.exports = {
  discoverMutualConnections,
  getMutualConnectionsForContact,
  getAllMutualConnections,
  getMutualConnectionsBetweenUsers,
  discoverAllForUser,
  normalizeLinkedInUrl,
};

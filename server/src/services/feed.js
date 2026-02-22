const { query } = require('../config/database');
const logger = require('../utils/logger');
const { getEmbedsForContact } = require('./oembed');

/**
 * Feed Service
 * Aggregates social activity from saved contacts into a scrollable feed.
 * Uses embed-based approach (not API-stored) - generates embed URLs for
 * LinkedIn, Instagram, and Twitter posts from contacts' social profiles.
 *
 * Falls back to "profile summary cards" when no recent activity is available.
 */

const CACHE_TTL_HOURS = 24;
const PLATFORMS = ['linkedin', 'instagram', 'twitter'];

/**
 * Platform-specific embed URL generators
 */
const getEmbedUrl = (platform, handle, url) => {
  switch (platform) {
    case 'linkedin':
      // LinkedIn public profile embed
      if (url) return `https://www.linkedin.com/in/${extractLinkedInVanity(url)}`;
      return handle ? `https://www.linkedin.com/in/${handle}` : null;

    case 'instagram':
      // Instagram embed URL for profile
      if (handle) return `https://www.instagram.com/${handle.replace('@', '')}/`;
      return url || null;

    case 'twitter':
      // Twitter/X embed URL for profile
      if (handle) return `https://twitter.com/${handle.replace('@', '')}`;
      return url || null;

    default:
      return url || null;
  }
};

/**
 * Extract LinkedIn vanity name from URL
 */
const extractLinkedInVanity = (url) => {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return match ? match[1] : url;
};

/**
 * Generate a platform display name
 */
const getPlatformDisplayName = (platform) => {
  const names = {
    linkedin: 'LinkedIn',
    instagram: 'Instagram',
    twitter: 'X (Twitter)',
    github: 'GitHub',
    website: 'Website',
    profile: 'Profile',
  };
  return names[platform] || platform;
};

/**
 * Build a profile summary card for a contact (fallback when no social activity)
 */
const buildProfileSummaryCard = (contact) => {
  const summaryParts = [];

  if (contact.job_title && contact.company) {
    summaryParts.push(`${contact.job_title} at ${contact.company}`);
  } else if (contact.job_title) {
    summaryParts.push(contact.job_title);
  } else if (contact.company) {
    summaryParts.push(`Works at ${contact.company}`);
  }

  if (contact.school) {
    const schoolInfo = contact.major
      ? `${contact.major} at ${contact.school}`
      : contact.school;
    summaryParts.push(schoolInfo);
  }

  if (contact.event_name) {
    summaryParts.push(`Met at ${contact.event_name}`);
  }

  return {
    contact_id: contact.id,
    platform: 'profile',
    content_type: 'summary',
    content_url: null,
    embed_url: null,
    title: contact.full_name,
    summary: summaryParts.length > 0
      ? summaryParts.join(' \u2022 ')
      : 'Saved contact',
    image_url: contact.avatar_url || null,
    fetched_at: new Date().toISOString(),
  };
};

/**
 * Build social feed items from a contact's linked social accounts
 */
const buildSocialFeedItems = (contact, socialLinks) => {
  const items = [];

  for (const social of socialLinks) {
    if (!PLATFORMS.includes(social.platform)) continue;

    const embedUrl = getEmbedUrl(social.platform, social.handle, social.url);
    if (!embedUrl) continue;

    const displayHandle = social.handle
      ? `@${social.handle.replace('@', '')}`
      : getPlatformDisplayName(social.platform);

    // Generate a feed item for this social link
    items.push({
      contact_id: contact.id,
      platform: social.platform,
      content_type: 'post',
      content_url: social.url || embedUrl,
      embed_url: embedUrl,
      title: `${contact.full_name} on ${getPlatformDisplayName(social.platform)}`,
      summary: social.handle
        ? `Check out ${displayHandle}'s latest activity`
        : `View ${contact.full_name}'s ${getPlatformDisplayName(social.platform)} profile`,
      image_url: contact.avatar_url || null,
      fetched_at: new Date().toISOString(),
    });
  }

  return items;
};

/**
 * Check if cached feed items exist and are still valid for a contact
 */
const getCachedItems = async (contactId) => {
  const result = await query(
    `SELECT * FROM feed_cache
     WHERE contact_id = $1 AND expires_at > NOW()
     ORDER BY fetched_at DESC`,
    [contactId]
  );
  return result.rows;
};

/**
 * Cache feed items for a contact
 */
const cacheItems = async (items) => {
  for (const item of items) {
    await query(
      `INSERT INTO feed_cache (contact_id, platform, content_type, content_url, embed_url, title, summary, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [
        item.contact_id,
        item.platform,
        item.content_type,
        item.content_url,
        item.embed_url,
        item.title,
        item.summary,
        item.image_url,
      ]
    );
  }
};

/**
 * Clear expired cache entries
 */
const clearExpiredCache = async () => {
  const result = await query(
    'DELETE FROM feed_cache WHERE expires_at < NOW() RETURNING id'
  );
  if (result.rows.length > 0) {
    logger.info(`Cleared ${result.rows.length} expired feed cache entries`);
  }
};

/**
 * Fetch event activity feed items for a user.
 * Includes: RSVPs by contacts, check-ins by contacts, co-attendance with contacts.
 *
 * @param {string} userId - The authenticated user's ID
 * @returns {Array} Array of event feed items
 */
const getEventFeedItems = async (userId) => {
  const items = [];

  // 1. RSVPs by contacts (contacts who RSVP'd to events the user also has)
  const rsvpResult = await query(
    `SELECT
      r.id AS rsvp_id, r.status, r.created_at AS activity_date,
      e.id AS event_id, e.name AS event_name, e.event_date, e.location,
      c.id AS contact_id, c.full_name AS contact_name, c.avatar_url AS contact_avatar,
      cp.company AS contact_company, cp.job_title AS contact_job_title
    FROM rsvps r
    JOIN events e ON e.id = r.event_id
    JOIN contacts c ON c.user_id = r.user_id AND c.user_id != $1
    JOIN event_contacts ec ON ec.event_id = e.id AND ec.contact_id = c.id
    LEFT JOIN contact_professional cp ON cp.contact_id = c.id
    WHERE c.user_id = $1
      AND r.created_at >= NOW() - INTERVAL '30 days'
    ORDER BY r.created_at DESC
    LIMIT 20`,
    [userId]
  );

  // If the join-based approach yields nothing, try a simpler approach:
  // find RSVPs to events that the user's contacts are linked to via event_contacts
  if (rsvpResult.rows.length === 0) {
    const rsvpAltResult = await query(
      `SELECT
        r.id AS rsvp_id, r.status, r.created_at AS activity_date,
        e.id AS event_id, e.name AS event_name, e.event_date, e.location,
        c.id AS contact_id, c.full_name AS contact_name, c.avatar_url AS contact_avatar,
        cp.company AS contact_company, cp.job_title AS contact_job_title
      FROM event_contacts ec
      JOIN contacts c ON c.id = ec.contact_id AND c.user_id = $1
      JOIN rsvps r ON r.event_id = ec.event_id
      JOIN events e ON e.id = r.event_id
      LEFT JOIN contact_professional cp ON cp.contact_id = c.id
      WHERE r.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY r.created_at DESC
      LIMIT 20`,
      [userId]
    );

    for (const row of rsvpAltResult.rows) {
      items.push({
        contact_id: row.contact_id,
        platform: 'event',
        content_type: 'rsvp',
        content_url: null,
        embed_url: null,
        title: `${row.contact_name} RSVP'd to ${row.event_name}`,
        summary: `Status: ${row.status}${row.location ? ` - ${row.location}` : ''}`,
        image_url: row.contact_avatar,
        fetched_at: row.activity_date,
        event_id: row.event_id,
        event_name: row.event_name,
        event_date: row.event_date,
        contact_name: row.contact_name,
        contact_avatar: row.contact_avatar,
        contact_company: row.contact_company,
        contact_job_title: row.contact_job_title,
      });
    }
  } else {
    for (const row of rsvpResult.rows) {
      items.push({
        contact_id: row.contact_id,
        platform: 'event',
        content_type: 'rsvp',
        content_url: null,
        embed_url: null,
        title: `${row.contact_name} RSVP'd to ${row.event_name}`,
        summary: `Status: ${row.status}${row.location ? ` - ${row.location}` : ''}`,
        image_url: row.contact_avatar,
        fetched_at: row.activity_date,
        event_id: row.event_id,
        event_name: row.event_name,
        event_date: row.event_date,
        contact_name: row.contact_name,
        contact_avatar: row.contact_avatar,
        contact_company: row.contact_company,
        contact_job_title: row.contact_job_title,
      });
    }
  }

  // 2. Check-ins by contacts at events
  const checkinResult = await query(
    `SELECT
      a.id AS attendance_id, a.checked_in_at AS activity_date, a.checkin_method,
      e.id AS event_id, e.name AS event_name, e.event_date, e.location,
      c.id AS contact_id, c.full_name AS contact_name, c.avatar_url AS contact_avatar,
      cp.company AS contact_company, cp.job_title AS contact_job_title
    FROM event_contacts ec
    JOIN contacts c ON c.id = ec.contact_id AND c.user_id = $1
    JOIN attendances a ON a.event_id = ec.event_id
    JOIN events e ON e.id = a.event_id
    LEFT JOIN contact_professional cp ON cp.contact_id = c.id
    WHERE a.checked_in_at >= NOW() - INTERVAL '30 days'
    ORDER BY a.checked_in_at DESC
    LIMIT 20`,
    [userId]
  );

  for (const row of checkinResult.rows) {
    items.push({
      contact_id: row.contact_id,
      platform: 'event',
      content_type: 'checkin',
      content_url: null,
      embed_url: null,
      title: `${row.contact_name} checked in at ${row.event_name}`,
      summary: row.location ? `At ${row.location}` : 'Checked in',
      image_url: row.contact_avatar,
      fetched_at: row.activity_date,
      event_id: row.event_id,
      event_name: row.event_name,
      event_date: row.event_date,
      contact_name: row.contact_name,
      contact_avatar: row.contact_avatar,
      contact_company: row.contact_company,
      contact_job_title: row.contact_job_title,
    });
  }

  // 3. Co-attendance: user and contact at the same event
  const coAttendResult = await query(
    `SELECT
      ca.id AS co_attendance_id, ca.checked_in_at AS activity_date,
      e.id AS event_id, e.name AS event_name, e.event_date, e.location,
      u_other.id AS other_user_id, u_other.name AS other_user_name, u_other.avatar_url AS other_avatar,
      c.id AS contact_id, c.full_name AS contact_name, c.avatar_url AS contact_avatar,
      cp.company AS contact_company, cp.job_title AS contact_job_title
    FROM co_attendances ca
    JOIN events e ON e.id = ca.event_id
    LEFT JOIN users u_other ON u_other.id = CASE
      WHEN ca.user_a_id = $1 THEN ca.user_b_id
      ELSE ca.user_a_id
    END
    LEFT JOIN contacts c ON c.user_id = $1
      AND c.full_name ILIKE u_other.name
    LEFT JOIN contact_professional cp ON cp.contact_id = c.id
    WHERE (ca.user_a_id = $1 OR ca.user_b_id = $1)
      AND ca.checked_in_at >= NOW() - INTERVAL '30 days'
    ORDER BY ca.checked_in_at DESC
    LIMIT 20`,
    [userId]
  );

  for (const row of coAttendResult.rows) {
    const displayName = row.contact_name || row.other_user_name || 'Someone';
    items.push({
      contact_id: row.contact_id,
      platform: 'event',
      content_type: 'co_attendance',
      content_url: null,
      embed_url: null,
      title: `You and ${displayName} attended ${row.event_name}`,
      summary: row.location ? `At ${row.location}` : 'Co-attended event',
      image_url: row.contact_avatar || row.other_avatar,
      fetched_at: row.activity_date,
      event_id: row.event_id,
      event_name: row.event_name,
      event_date: row.event_date,
      contact_name: displayName,
      contact_avatar: row.contact_avatar || row.other_avatar,
      contact_company: row.contact_company,
      contact_job_title: row.contact_job_title,
    });
  }

  return items;
};

/**
 * Get paginated feed for a user
 * Aggregates social activity from all saved contacts
 * and event activity (RSVPs, check-ins, co-attendance)
 *
 * @param {string} userId - The authenticated user's ID
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Items per page
 * @returns {Object} { items, pagination }
 */
const getFeed = async (userId, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;

  // Clean up expired cache periodically (1 in 10 chance per request)
  if (Math.random() < 0.1) {
    clearExpiredCache().catch((err) =>
      logger.error('Failed to clear expired feed cache:', err)
    );
  }

  // Fetch all user's contacts with their social links and professional info
  const contactsResult = await query(
    `SELECT
      c.id, c.full_name, c.avatar_url, c.created_at, c.updated_at,
      cp.company, cp.job_title, cp.school, cp.major,
      cc.event_name
    FROM contacts c
    LEFT JOIN contact_professional cp ON cp.contact_id = c.id
    LEFT JOIN contact_context cc ON cc.contact_id = c.id
    WHERE c.user_id = $1
    ORDER BY c.updated_at DESC`,
    [userId]
  );

  const contacts = contactsResult.rows;

  if (contacts.length === 0) {
    // Even with no contacts, still check for event activity (co-attendance etc.)
    const eventItems = await getEventFeedItems(userId).catch((err) => {
      logger.error('Failed to fetch event feed items:', err);
      return [];
    });

    if (eventItems.length === 0) {
      return {
        items: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      };
    }

    // Sort and paginate event items only
    eventItems.sort((a, b) => new Date(b.fetched_at) - new Date(a.fetched_at));
    const total = eventItems.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedItems = eventItems.slice(offset, offset + limit);
    const itemsWithIds = paginatedItems.map((item, index) => ({
      ...item,
      feed_id: `event-${item.content_type}-${offset + index}`,
    }));
    return { items: itemsWithIds, pagination: { total, page, limit, totalPages } };
  }

  const contactIds = contacts.map((c) => c.id);

  // Fetch social links for all contacts
  const socialResult = await query(
    `SELECT * FROM contact_social
     WHERE contact_id = ANY($1)
     ORDER BY contact_id`,
    [contactIds]
  );

  // Group social links by contact
  const socialByContact = {};
  for (const social of socialResult.rows) {
    if (!socialByContact[social.contact_id]) {
      socialByContact[social.contact_id] = [];
    }
    socialByContact[social.contact_id].push(social);
  }

  // Build feed items for each contact
  const allItems = [];

  for (const contact of contacts) {
    const socialLinks = socialByContact[contact.id] || [];

    // Check cache first
    const cached = await getCachedItems(contact.id);

    if (cached.length > 0) {
      // Use cached items, but enrich with contact info
      for (const item of cached) {
        allItems.push({
          ...item,
          contact_name: contact.full_name,
          contact_avatar: contact.avatar_url,
          contact_company: contact.company,
          contact_job_title: contact.job_title,
        });
      }
      continue;
    }

    // Generate new feed items from social links
    const socialItems = buildSocialFeedItems(contact, socialLinks);

    // Attach embed data from post_embeds table
    let embeds = [];
    try {
      embeds = await getEmbedsForContact(contact.id);
    } catch (err) {
      logger.error(`Failed to fetch embeds for contact ${contact.id}:`, err.message);
    }

    const embedByUrl = {};
    for (const embed of embeds) {
      embedByUrl[embed.post_url] = embed;
    }

    if (socialItems.length > 0) {
      // Cache the generated items
      await cacheItems(socialItems);

      for (const item of socialItems) {
        const embed = embedByUrl[item.content_url] || embedByUrl[item.embed_url];
        allItems.push({
          ...item,
          contact_name: contact.full_name,
          contact_avatar: contact.avatar_url,
          contact_company: contact.company,
          contact_job_title: contact.job_title,
          // Attach embed data if available
          thumbnail_url: embed?.thumbnail_url || null,
          embed_description: embed?.description || null,
          embed_author: embed?.author_name || null,
          html_embed: embed?.html_embed || null,
          embed_title: embed?.title || null,
        });
      }
    } else {
      // Fallback: profile summary card
      const summaryCard = buildProfileSummaryCard(contact);
      allItems.push({
        ...summaryCard,
        contact_name: contact.full_name,
        contact_avatar: contact.avatar_url,
        contact_company: contact.company,
        contact_job_title: contact.job_title,
      });
    }
  }

  // Fetch event activity items and interleave with social feed
  const eventItems = await getEventFeedItems(userId).catch((err) => {
    logger.error('Failed to fetch event feed items:', err);
    return [];
  });

  allItems.push(...eventItems);

  // Sort by fetched_at (most recent first), then by contact updated_at
  allItems.sort((a, b) => {
    const dateA = new Date(a.fetched_at);
    const dateB = new Date(b.fetched_at);
    return dateB - dateA;
  });

  // Paginate
  const total = allItems.length;
  const totalPages = Math.ceil(total / limit);
  const paginatedItems = allItems.slice(offset, offset + limit);

  // Add a unique feed item ID for the client
  const itemsWithIds = paginatedItems.map((item, index) => ({
    ...item,
    feed_id: item.id || `${item.contact_id || 'event'}-${item.platform}-${item.content_type}-${offset + index}`,
  }));

  return {
    items: itemsWithIds,
    pagination: { total, page, limit, totalPages },
  };
};

/**
 * Refresh feed cache for a specific contact
 * Called when a contact's social links are updated
 */
const refreshContactFeed = async (contactId) => {
  try {
    // Clear existing cache for this contact
    await query('DELETE FROM feed_cache WHERE contact_id = $1', [contactId]);
    logger.info(`Feed cache cleared for contact ${contactId}`);
  } catch (error) {
    logger.error(`Failed to refresh feed for contact ${contactId}:`, error);
  }
};

module.exports = {
  getFeed,
  refreshContactFeed,
  clearExpiredCache,
};

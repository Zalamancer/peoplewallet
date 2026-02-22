const axios = require('axios');
const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * oEmbed endpoints by platform
 */
const OEMBED_ENDPOINTS = {
  twitter: 'https://publish.twitter.com/oembed',
  tiktok: 'https://www.tiktok.com/oembed',
};

/**
 * Fetch oEmbed data for a URL
 * @param {string} url - The post URL
 * @param {string} platform - Platform identifier
 * @returns {object|null} Structured embed data
 */
const fetchOEmbed = async (url, platform) => {
  try {
    let data = null;

    if (platform === 'twitter' || platform === 'x') {
      data = await fetchTwitterOEmbed(url);
    } else if (platform === 'tiktok') {
      data = await fetchTikTokOEmbed(url);
    } else if (platform === 'instagram') {
      data = await fetchInstagramOEmbed(url);
    } else if (platform === 'facebook') {
      data = await fetchFacebookOEmbed(url);
    } else {
      data = await fetchOpenGraph(url);
    }

    return data;
  } catch (error) {
    logger.error(`oEmbed fetch error for ${platform}:`, error.message);
    return null;
  }
};

/**
 * Twitter/X oEmbed (free, no auth)
 */
const fetchTwitterOEmbed = async (url) => {
  const response = await axios.get(OEMBED_ENDPOINTS.twitter, {
    params: { url, format: 'json', omit_script: true },
    timeout: 10000,
  });

  const { html, author_name, author_url } = response.data;

  return {
    html_embed: html,
    title: `Post by ${author_name}`,
    description: extractTextFromHtml(html),
    author_name,
    author_handle: author_url?.split('/').pop() || null,
    thumbnail_url: null,
    media_url: null,
  };
};

/**
 * TikTok oEmbed (free, no auth)
 */
const fetchTikTokOEmbed = async (url) => {
  const response = await axios.get(OEMBED_ENDPOINTS.tiktok, {
    params: { url },
    timeout: 10000,
  });

  const { html, title, author_name, author_url, thumbnail_url } = response.data;

  return {
    html_embed: html,
    title: title || `TikTok by ${author_name}`,
    description: title,
    author_name,
    author_handle: author_url?.split('@').pop() || null,
    thumbnail_url,
    media_url: null,
  };
};

/**
 * Instagram oEmbed (requires Meta app token)
 */
const fetchInstagramOEmbed = async (url) => {
  const accessToken = process.env.META_APP_TOKEN;
  if (!accessToken) {
    return fetchOpenGraph(url);
  }

  const response = await axios.get('https://graph.facebook.com/v18.0/instagram_oembed', {
    params: { url, access_token: accessToken, omitscript: true },
    timeout: 10000,
  });

  const { html, author_name, thumbnail_url } = response.data;

  return {
    html_embed: html,
    title: `Post by ${author_name}`,
    description: null,
    author_name,
    author_handle: author_name,
    thumbnail_url,
    media_url: null,
  };
};

/**
 * Facebook oEmbed (requires Meta app token)
 */
const fetchFacebookOEmbed = async (url) => {
  const accessToken = process.env.META_APP_TOKEN;
  if (!accessToken) {
    return fetchOpenGraph(url);
  }

  const response = await axios.get('https://graph.facebook.com/v18.0/oembed_post', {
    params: { url, access_token: accessToken, omitscript: true },
    timeout: 10000,
  });

  const { html, author_name } = response.data;

  return {
    html_embed: html,
    title: `Post by ${author_name}`,
    description: null,
    author_name,
    author_handle: null,
    thumbnail_url: null,
    media_url: null,
  };
};

/**
 * Generic Open Graph fallback — scrape meta tags from HTML
 */
const fetchOpenGraph = async (url) => {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PeopleWallet/1.0; +https://peoplewallet.app)',
      },
      maxRedirects: 3,
    });

    const html = response.data;
    if (typeof html !== 'string') return null;

    const ogTitle = extractMeta(html, 'og:title');
    const ogDescription = extractMeta(html, 'og:description');
    const ogImage = extractMeta(html, 'og:image');
    const ogSiteName = extractMeta(html, 'og:site_name');

    if (!ogTitle && !ogDescription) return null;

    return {
      html_embed: null,
      title: ogTitle || ogSiteName || 'Post',
      description: ogDescription,
      author_name: ogSiteName,
      author_handle: null,
      thumbnail_url: ogImage,
      media_url: null,
    };
  } catch {
    return null;
  }
};

/**
 * Extract an Open Graph meta tag value from HTML
 */
const extractMeta = (html, property) => {
  const regex = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match = html.match(regex);
  if (match) return match[1];

  // Try content first pattern
  const regex2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i');
  const match2 = html.match(regex2);
  return match2 ? match2[1] : null;
};

/**
 * Extract readable text from oEmbed HTML
 */
const extractTextFromHtml = (html) => {
  if (!html) return null;
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 280);
};

/**
 * Detect platform from URL
 */
const detectPlatform = (url) => {
  if (!url) return 'unknown';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook';
  if (url.includes('linkedin.com')) return 'linkedin';
  return 'unknown';
};

/**
 * Fetch and cache oEmbed data for a post URL
 */
const fetchAndCacheEmbed = async (contactId, postUrl, platform) => {
  // Check cache first
  const cached = await query(
    "SELECT * FROM post_embeds WHERE post_url = $1 AND fetch_status = 'success' AND expires_at > NOW()",
    [postUrl]
  );

  if (cached.rows.length > 0) {
    return cached.rows[0];
  }

  const detectedPlatform = platform || detectPlatform(postUrl);
  const embedData = await fetchOEmbed(postUrl, detectedPlatform);

  if (!embedData) {
    // Store error status
    await query(
      `INSERT INTO post_embeds (contact_id, platform, post_url, fetch_status)
       VALUES ($1, $2, $3, 'error')
       ON CONFLICT (post_url) DO UPDATE SET fetch_status = 'error', updated_at = NOW()`,
      [contactId, detectedPlatform, postUrl]
    );
    return null;
  }

  const result = await query(
    `INSERT INTO post_embeds (contact_id, platform, post_url, html_embed, title, description, thumbnail_url, author_name, author_handle, media_url, fetch_status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'success', NOW() + INTERVAL '72 hours')
     ON CONFLICT (post_url) DO UPDATE SET
       html_embed = EXCLUDED.html_embed,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       thumbnail_url = EXCLUDED.thumbnail_url,
       author_name = EXCLUDED.author_name,
       author_handle = EXCLUDED.author_handle,
       media_url = EXCLUDED.media_url,
       fetch_status = 'success',
       expires_at = NOW() + INTERVAL '72 hours',
       updated_at = NOW()
     RETURNING *`,
    [contactId, detectedPlatform, postUrl, embedData.html_embed, embedData.title, embedData.description, embedData.thumbnail_url, embedData.author_name, embedData.author_handle, embedData.media_url]
  );

  return result.rows[0];
};

/**
 * Refresh expired embeds (called by scheduler)
 */
const refreshExpiredEmbeds = async () => {
  const expired = await query(
    "SELECT * FROM post_embeds WHERE expires_at < NOW() AND fetch_status = 'success' LIMIT 50"
  );

  let refreshed = 0;
  for (const embed of expired.rows) {
    try {
      await fetchAndCacheEmbed(embed.contact_id, embed.post_url, embed.platform);
      refreshed++;
    } catch (err) {
      logger.error(`Failed to refresh embed for ${embed.post_url}:`, err.message);
    }
  }

  logger.info(`[oEmbed] Refreshed ${refreshed}/${expired.rows.length} expired embeds`);
  return { refreshed, total: expired.rows.length };
};

/**
 * Get cached embeds for a contact
 */
const getEmbedsForContact = async (contactId) => {
  const result = await query(
    "SELECT * FROM post_embeds WHERE contact_id = $1 AND fetch_status = 'success' AND expires_at > NOW() ORDER BY published_at DESC NULLS LAST",
    [contactId]
  );
  return result.rows;
};

module.exports = {
  fetchOEmbed,
  fetchAndCacheEmbed,
  refreshExpiredEmbeds,
  getEmbedsForContact,
  detectPlatform,
};

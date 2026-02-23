const { query } = require('../config/database');
const logger = require('../utils/logger');
const axios = require('axios');

/**
 * Instagram Fetcher Service — Pipeline 2
 *
 * Fetches the most recent Instagram post from each tracked club.
 * Designed to run daily at 5 AM CT via cron job.
 *
 * Fetching strategy (in order of preference):
 *   1. Apify Instagram Scraper — most reliable, ~$5/1000 posts
 *   2. RapidAPI Instagram endpoints — fallback
 *
 * New posts are queued for AI event analysis (ai_analysis_status='pending').
 */

/**
 * Fetch the latest post from an Instagram profile via Apify.
 *
 * POSTs to the Apify Instagram Scraper actor with the profile URL and
 * a resultsLimit of 1.
 *
 * @param {string} handle - Instagram handle (without @)
 * @returns {object|null} Post data or null on failure
 */
const fetchPostViaApify = async (handle) => {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;

  try {
    // Start the actor run
    const runResponse = await axios.post(
      'https://api.apify.com/v2/acts/apify~instagram-scraper/runs',
      {
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsLimit: 12,
        resultsType: 'posts',
      },
      {
        params: { token },
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    );

    const runId = runResponse.data.data?.id;
    if (!runId) {
      logger.error(`Apify: no run ID returned for @${handle}`);
      return null;
    }

    // Wait for the run to finish (poll with backoff)
    let status = 'RUNNING';
    let attempts = 0;
    const maxAttempts = 30;

    while (status === 'RUNNING' && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;

      const statusResponse = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        {
          params: { token },
          timeout: 15000,
        }
      );

      status = statusResponse.data.data?.status;
    }

    if (status !== 'SUCCEEDED') {
      logger.error(`Apify run ${runId} did not succeed for @${handle}: status=${status}`);
      return null;
    }

    // Fetch the dataset items
    const datasetResponse = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
      {
        params: { token, format: 'json' },
        timeout: 15000,
      }
    );

    const items = datasetResponse.data;
    if (!items || items.length === 0) {
      logger.info(`Apify: no posts found for @${handle}`);
      return null;
    }

    return items.map((post) => ({
      post_id: post.id || post.shortCode || null,
      post_url: post.url || (post.shortCode ? `https://www.instagram.com/p/${post.shortCode}/` : null),
      image_urls: post.images || (post.displayUrl ? [post.displayUrl] : []),
      caption: post.caption || '',
      posted_at: post.timestamp || post.takenAtTimestamp
        ? new Date((post.timestamp || post.takenAtTimestamp) * 1000).toISOString()
        : null,
      likes_count: post.likesCount || post.likes || 0,
      comments_count: post.commentsCount || post.comments || 0,
      raw_data: post,
    }));
  } catch (error) {
    logger.error(`Apify fetch error for @${handle}:`, error.message);
    return null;
  }
};

/**
 * Fetch the latest post from an Instagram profile via RapidAPI.
 *
 * Falls back to this when Apify is unavailable.
 * Uses the instagram-scraper-api endpoint on RapidAPI.
 *
 * @param {string} handle - Instagram handle (without @)
 * @returns {object|null} Post data or null on failure
 */
/**
 * Fetch Instagram profile data (bio, followers, profile pic, etc.)
 * Supports multiple RapidAPI hosts: instagram28, instagram-scraper-api2, instagram120.
 */
const fetchProfileViaRapidAPI = async (handle) => {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST || 'instagram28.p.rapidapi.com';
  if (!apiKey) return null;

  try {
    let response;
    const headers = { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': apiHost };

    if (apiHost.includes('instagram28')) {
      // instagram28: GET /user_info?user_name=xxx
      response = await axios.get(`https://${apiHost}/user_info`, {
        params: { user_name: handle },
        headers,
        timeout: 15000,
      });
    } else if (apiHost.includes('instagram-scraper-api2')) {
      // instagram-scraper-api2: GET /v1/info
      response = await axios.get(`https://${apiHost}/v1/info`, {
        params: { username_or_id_or_url: handle },
        headers,
        timeout: 15000,
      });
    } else {
      // instagram120 fallback: POST /api/instagram/profile
      response = await axios.post(
        `https://${apiHost}/api/instagram/profile`,
        { username: handle },
        {
          headers: { ...headers, 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );
    }

    const data = response.data?.data || response.data;
    const profile = data?.result || data?.user || data;
    if (!profile || (!profile.username && !profile.full_name)) return null;

    return {
      user_id: profile.pk || profile.id || null,
      full_name: profile.full_name || null,
      bio: profile.biography || profile.bio || null,
      follower_count: profile.edge_followed_by?.count || profile.follower_count || 0,
      following_count: profile.edge_follow?.count || profile.following_count || 0,
      media_count: profile.edge_owner_to_timeline_media?.count || profile.media_count || 0,
      profile_pic_url: profile.profile_pic_url_hd || profile.profile_pic_url || null,
      is_private: profile.is_private || false,
    };
  } catch (error) {
    if (error.response?.status === 429) {
      logger.warn(`RapidAPI rate limit hit for @${handle}`);
    } else {
      logger.error(`RapidAPI profile fetch error for @${handle}:`, error.message);
    }
    return null;
  }
};

const fetchPostViaRapidAPI = async (handle) => {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST || 'instagram28.p.rapidapi.com';
  if (!apiKey) return null;

  try {
    let response;
    const headers = { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': apiHost };

    if (apiHost.includes('instagram28')) {
      // instagram28: GET /medias_v2?user_id=xxx (requires user_id, not username)
      // First resolve username → user_id via user_info or DB
      let userId = null;

      // Check if we have user_id cached in DB
      try {
        const dbResult = await query(
          "SELECT raw_data->>'pk' as pk FROM clubs WHERE instagram_handle = $1 AND raw_data->>'pk' IS NOT NULL LIMIT 1",
          [handle]
        );
        if (dbResult.rows.length > 0 && dbResult.rows[0].pk) {
          userId = dbResult.rows[0].pk;
        }
      } catch (_) { /* no raw_data column or no match, continue */ }

      // If no cached user_id, fetch profile first
      if (!userId) {
        const profile = await fetchProfileViaRapidAPI(handle);
        if (profile?.user_id) {
          userId = profile.user_id;
        } else {
          logger.info(`instagram28: could not resolve user_id for @${handle}`);
          return null;
        }
      }

      response = await axios.get(`https://${apiHost}/medias_v2`, {
        params: { user_id: userId },
        headers,
        timeout: 30000,
      });
    } else if (apiHost.includes('instagram-scraper-api2')) {
      // instagram-scraper-api2: GET /v1/posts
      response = await axios.get(`https://${apiHost}/v1/posts`, {
        params: { username_or_id_or_url: handle },
        headers,
        timeout: 30000,
      });
    } else {
      // instagram120 fallback: POST /api/instagram/posts
      response = await axios.post(
        `https://${apiHost}/api/instagram/posts`,
        { username: handle, maxId: '' },
        {
          headers: { ...headers, 'Content-Type': 'application/json' },
          timeout: 30000,
        }
      );
    }

    const topLevel = response.data?.data || response.data;

    // Try multiple response formats
    // Format 1: { data: { items: [...] } } (instagram-scraper-api2)
    const items = topLevel?.items || topLevel?.result?.items || [];
    if (items.length > 0) {
      return items.map(normalizePost);
    }

    // Format 2: { result: { edges: [{ node: {...} }] } } (instagram120)
    const edges = topLevel?.result?.edges || topLevel?.edges || [];
    if (edges.length > 0) {
      return edges.map((edge) => {
        const node = edge.node;
        let imageUrls = [];
        if (node.carousel_media) {
          imageUrls = node.carousel_media
            .filter((m) => m.image_versions2)
            .map((m) => m.image_versions2.candidates?.[0]?.url)
            .filter(Boolean);
        } else if (node.image_versions2) {
          const url = node.image_versions2.candidates?.[0]?.url;
          if (url) imageUrls = [url];
        } else if (node.display_url) {
          imageUrls = [node.display_url];
        } else if (node.thumbnail_src) {
          imageUrls = [node.thumbnail_src];
        }
        return {
          post_id: node.code || node.shortcode || node.pk || String(node.id || ''),
          post_url: node.code
            ? `https://www.instagram.com/p/${node.code}/`
            : null,
          image_urls: imageUrls,
          caption: node.caption?.text || '',
          posted_at: node.taken_at
            ? new Date(node.taken_at * 1000).toISOString()
            : null,
          likes_count: node.like_count || 0,
          comments_count: node.comment_count || 0,
          raw_data: node,
        };
      });
    }

    logger.info(`RapidAPI: no posts found for @${handle}`);
    return null;
  } catch (error) {
    logger.error(`RapidAPI fetch error for @${handle}:`, error.message);
    return null;
  }
};

/** Normalize a post object from alternate API response formats */
const normalizePost = (post) => {
  let imageUrls = [];
  if (post.carousel_media) {
    imageUrls = post.carousel_media
      .filter((m) => m.image_versions2)
      .map((m) => m.image_versions2.candidates?.[0]?.url)
      .filter(Boolean);
  } else if (post.image_versions2) {
    const url = post.image_versions2.candidates?.[0]?.url;
    if (url) imageUrls = [url];
  }

  return {
    post_id: post.code || post.shortcode || post.pk || String(post.id || ''),
    post_url: (post.code || post.shortcode)
      ? `https://www.instagram.com/p/${post.code || post.shortcode}/`
      : null,
    image_urls: imageUrls,
    caption: post.caption?.text || '',
    posted_at: post.taken_at
      ? new Date(post.taken_at * 1000).toISOString()
      : null,
    likes_count: post.like_count || 0,
    comments_count: post.comment_count || 0,
    raw_data: post,
  };
};

/**
 * Fetch recent posts from an Instagram account.
 *
 * Tries RapidAPI first, then falls back to Apify.
 *
 * @param {string} instagramHandle - Instagram handle (without @)
 * @returns {Array|null} Array of normalized post data or null if both sources fail
 */
const fetchLatestPosts = async (instagramHandle) => {
  const handle = instagramHandle.replace('@', '').toLowerCase();

  // Try RapidAPI first (faster, direct call), fall back to Apify
  let posts = await fetchPostViaRapidAPI(handle);

  if (!posts || posts.length === 0) {
    logger.info(`RapidAPI failed for @${handle}, trying Apify fallback`);
    posts = await fetchPostViaApify(handle);
  }

  if (!posts || posts.length === 0) {
    logger.warn(`All fetch methods failed for @${handle}`);
    return null;
  }

  return posts;
};

// Backwards-compatible alias
const fetchLatestPost = async (handle) => {
  const posts = await fetchLatestPosts(handle);
  return posts ? posts[0] : null;
};

/**
 * Fetch latest posts for ALL clubs with an Instagram handle.
 *
 * For each club:
 *   1. Fetch the latest post
 *   2. Check if the post already exists in the DB (by instagram_post_id)
 *   3. If new, insert with ai_analysis_status='pending'
 *   4. Update the club's last_post_at timestamp
 *
 * @returns {{ fetched: number, new_posts: number, skipped: number, errors: number }}
 */
const fetchAllClubPosts = async () => {
  const fetchLimit = parseInt(process.env.POST_FETCH_LIMIT, 10) || 20;
  logger.info(`Starting daily Instagram post fetch (limit: ${fetchLimit} clubs)`);

  let fetched = 0;
  let new_posts = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const clubsResult = await query(
      'SELECT id, instagram_handle, name FROM clubs WHERE instagram_handle IS NOT NULL ORDER BY ranking_score DESC NULLS LAST LIMIT $1',
      [fetchLimit]
    );

    const clubs = clubsResult.rows;
    logger.info(`Fetching profiles + posts for ${clubs.length} clubs in parallel`);

    // Step 1: Fetch all profiles in parallel
    const profileResults = await Promise.allSettled(
      clubs.map(async (club) => {
        const profile = await fetchProfileViaRapidAPI(club.instagram_handle);
        return { club, profile };
      })
    );

    // Update club profiles from results
    for (const result of profileResults) {
      if (result.status === 'fulfilled' && result.value.profile) {
        const { club, profile } = result.value;
        try {
          await query(
            `UPDATE clubs SET
              bio = COALESCE($1, bio),
              profile_image_url = COALESCE($2, profile_image_url),
              follower_count = $3,
              following_count = $4,
              media_count = $5,
              name = CASE WHEN name = instagram_handle THEN COALESCE($6, name) ELSE name END,
              updated_at = NOW()
            WHERE id = $7`,
            [profile.bio, profile.profile_pic_url, profile.follower_count, profile.following_count, profile.media_count, profile.full_name, club.id]
          );
          logger.debug(`Updated profile for @${club.instagram_handle}: ${profile.follower_count} followers, ${profile.media_count} posts`);
        } catch (e) {
          logger.error(`Error updating profile for @${club.instagram_handle}:`, e.message);
        }
      }
    }

    // Step 2: Fetch all posts in parallel
    const postResults = await Promise.allSettled(
      clubs.map(async (club) => {
        const posts = await fetchLatestPosts(club.instagram_handle);
        return { club, posts };
      })
    );

    // Step 3: Process results — dedup & insert (sequential DB writes)
    for (const result of postResults) {
      if (result.status !== 'fulfilled') {
        errors++;
        continue;
      }

      const { club, posts } = result.value;

      if (!posts || posts.length === 0) {
        skipped++;
        continue;
      }

      fetched++;

      for (const post of posts) {
        if (!post || !post.post_id) {
          skipped++;
          continue;
        }

        try {
          const existingPost = await query(
            'SELECT id FROM posts WHERE instagram_post_id = $1',
            [post.post_id]
          );

          if (existingPost.rows.length > 0) {
            skipped++;
            logger.debug(`Post ${post.post_id} from @${club.instagram_handle} already exists, skipping`);
            continue;
          }

          await query(
            `INSERT INTO posts (club_id, instagram_post_id, post_url, image_urls, caption, posted_at, likes_count, comments_count, raw_data, ai_analysis_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
            [
              club.id,
              post.post_id,
              post.post_url,
              post.image_urls,
              post.caption,
              post.posted_at,
              post.likes_count,
              post.comments_count,
              JSON.stringify(post.raw_data),
            ]
          );

          new_posts++;
          logger.debug(`New post stored for @${club.instagram_handle}: ${post.post_id}`);
        } catch (error) {
          logger.error(`Error saving post for club ${club.name} (@${club.instagram_handle}):`, error.message);
          errors++;
        }
      }

      // Update club's last_post_at with the most recent post
      const latestPost = posts[0];
      if (latestPost?.posted_at) {
        await query(
          'UPDATE clubs SET last_post_at = COALESCE($1, NOW()), updated_at = NOW() WHERE id = $2',
          [latestPost.posted_at, club.id]
        ).catch(() => {});
      }
    }
  } catch (error) {
    logger.error('Error fetching clubs for post fetch:', error.message);
    return { fetched: 0, new_posts: 0, skipped: 0, errors: 1 };
  }

  logger.info(`Post fetch complete: ${fetched} fetched, ${new_posts} new, ${skipped} skipped, ${errors} errors`);
  return { fetched, new_posts, skipped, errors };
};

module.exports = {
  fetchLatestPost,
  fetchLatestPosts,
  fetchAllClubPosts,
  fetchPostViaApify,
  fetchPostViaRapidAPI,
  fetchProfileViaRapidAPI,
};

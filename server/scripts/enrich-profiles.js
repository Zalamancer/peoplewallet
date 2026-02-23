#!/usr/bin/env node
/**
 * Gradually enrich club profiles with Instagram data (bio, followers, profile pic).
 *
 * Usage:
 *   node scripts/enrich-profiles.js [--limit N] [--delay MS]
 *
 * Default: 10 profiles per run, 2s delay between requests.
 * On instagram28 free tier (10 req/day), run once per day.
 * On instagram28 PRO ($5/mo, 200 req/day), use --limit 200.
 *
 * What it does:
 *   1. Finds clubs with Instagram handles but no follower_count data
 *   2. Fetches profile via RapidAPI (bio, followers, profile pic, user_id)
 *   3. Updates the clubs table
 *   4. Tracks progress so you can resume the next day
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../src/config/database');
const axios = require('axios');

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const delayIdx = args.indexOf('--delay');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 10;
const DELAY = delayIdx >= 0 ? parseInt(args[delayIdx + 1], 10) : 2000;

const apiKey = process.env.RAPIDAPI_KEY;
const apiHost = process.env.RAPIDAPI_HOST || 'instagram28.p.rapidapi.com';

async function fetchProfile(handle) {
  const headers = { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': apiHost };

  if (apiHost.includes('instagram28')) {
    const resp = await axios.get(`https://${apiHost}/user_info`, {
      params: { user_name: handle },
      headers,
      timeout: 15000,
    });
    const data = resp.data?.data || resp.data;
    const profile = data?.user || data?.result || data;
    if (!profile) return null;
    return {
      user_id: profile.pk || profile.id || null,
      full_name: profile.full_name || null,
      bio: profile.biography || profile.bio || null,
      follower_count: profile.follower_count || profile.edge_followed_by?.count || 0,
      following_count: profile.following_count || profile.edge_follow?.count || 0,
      media_count: profile.media_count || 0,
      profile_pic_url: profile.profile_pic_url_hd || profile.profile_pic_url || null,
      is_private: profile.is_private || false,
    };
  } else if (apiHost.includes('instagram-scraper-api2')) {
    const resp = await axios.get(`https://${apiHost}/v1/info`, {
      params: { username_or_id_or_url: handle },
      headers,
      timeout: 15000,
    });
    const data = resp.data?.data || resp.data;
    const profile = data?.result || data;
    if (!profile || !profile.username) return null;
    return {
      user_id: profile.pk || profile.id || null,
      full_name: profile.full_name || null,
      bio: profile.biography || null,
      follower_count: profile.edge_followed_by?.count || profile.follower_count || 0,
      following_count: profile.edge_follow?.count || profile.following_count || 0,
      media_count: profile.edge_owner_to_timeline_media?.count || profile.media_count || 0,
      profile_pic_url: profile.profile_pic_url_hd || profile.profile_pic_url || null,
      is_private: profile.is_private || false,
    };
  }
  return null;
}

async function main() {
  if (!apiKey) {
    console.error('RAPIDAPI_KEY not set in .env');
    process.exit(1);
  }

  console.log(`Enrichment config: limit=${LIMIT}, delay=${DELAY}ms, host=${apiHost}`);

  // Find clubs needing enrichment (no follower data yet)
  const result = await pool.query(
    `SELECT id, instagram_handle, name FROM clubs
     WHERE instagram_handle IS NOT NULL
       AND (follower_count IS NULL OR follower_count = 0)
     ORDER BY in_official_directory DESC NULLS LAST, created_at ASC
     LIMIT $1`,
    [LIMIT]
  );

  const clubs = result.rows;
  console.log(`Found ${clubs.length} clubs needing enrichment`);

  if (clubs.length === 0) {
    console.log('All clubs are enriched!');
    await pool.end();
    process.exit(0);
  }

  let enriched = 0;
  let skipped = 0;
  let rateLimited = 0;
  let errors = 0;

  for (const club of clubs) {
    try {
      const profile = await fetchProfile(club.instagram_handle);

      if (!profile) {
        console.log(`  SKIP @${club.instagram_handle} - no profile data returned`);
        skipped++;
        // Mark as checked so we don't retry endlessly (set follower_count to -1)
        await pool.query('UPDATE clubs SET follower_count = -1, updated_at = NOW() WHERE id = $1', [club.id]);
        continue;
      }

      await pool.query(
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

      console.log(`  OK  @${club.instagram_handle} - ${profile.follower_count} followers, "${(profile.bio || '').slice(0, 50)}..."`);
      enriched++;
    } catch (error) {
      if (error.response?.status === 429) {
        console.log(`  RATE LIMIT hit after ${enriched} profiles. Daily quota exceeded.`);
        rateLimited = clubs.length - enriched - skipped - errors;
        break;
      }
      console.error(`  ERR @${club.instagram_handle}: ${error.response?.status || ''} ${error.message}`);
      errors++;
    }

    // Delay between requests to respect rate limits
    if (DELAY > 0) {
      await new Promise((r) => setTimeout(r, DELAY));
    }
  }

  // Show remaining
  const remaining = await pool.query(
    'SELECT COUNT(*) FROM clubs WHERE instagram_handle IS NOT NULL AND (follower_count IS NULL OR follower_count = 0)'
  );

  console.log('\n=== Enrichment Summary ===');
  console.log(`Enriched: ${enriched}`);
  console.log(`Skipped (no data): ${skipped}`);
  console.log(`Rate limited (remaining in batch): ${rateLimited}`);
  console.log(`Errors: ${errors}`);
  console.log(`Still need enrichment: ${remaining.rows[0].count}`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

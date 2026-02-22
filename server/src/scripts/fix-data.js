require('dotenv').config();
const { query } = require('../config/database');
const { fetchProfileViaRapidAPI } = require('../services/instagram-fetcher');

(async () => {
  // Step 1: Re-fetch all club profiles to fix follower_count
  console.log('=== Step 1: Re-fetching club profiles ===');
  const clubs = await query('SELECT id, instagram_handle FROM clubs WHERE instagram_handle IS NOT NULL');

  const profileResults = await Promise.allSettled(
    clubs.rows.map(async (club) => {
      const profile = await fetchProfileViaRapidAPI(club.instagram_handle);
      return { club, profile };
    })
  );

  for (const result of profileResults) {
    if (result.status === 'fulfilled' && result.value.profile) {
      const { club, profile } = result.value;
      await query(
        `UPDATE clubs SET
          bio = COALESCE($1, bio),
          profile_image_url = COALESCE($2, profile_image_url),
          follower_count = $3,
          name = CASE WHEN name = instagram_handle THEN COALESCE($4, name) ELSE name END,
          updated_at = NOW()
        WHERE id = $5`,
        [profile.bio, profile.profile_pic_url, profile.follower_count, profile.full_name, club.id]
      );
      console.log(`  @${club.instagram_handle}: ${profile.follower_count} followers`);
    } else {
      const handle = result.value?.club?.instagram_handle || 'unknown';
      console.log(`  @${handle}: FAILED`);
    }
  }

  // Step 2: Reset all not_event posts to pending for re-analysis
  console.log('\n=== Step 2: Resetting not_event posts for re-analysis ===');
  const resetResult = await query(
    "UPDATE posts SET ai_analysis_status = 'pending' WHERE ai_analysis_status = 'not_event' RETURNING instagram_post_id"
  );
  console.log(`  Reset ${resetResult.rows.length} posts from not_event -> pending`);

  // Step 3: Verify
  console.log('\n=== Verification ===');
  const clubCheck = await query('SELECT instagram_handle, follower_count FROM clubs WHERE instagram_handle IS NOT NULL ORDER BY follower_count DESC');
  clubCheck.rows.forEach(c => console.log(`  @${c.instagram_handle}: ${c.follower_count} followers`));

  const postCheck = await query("SELECT ai_analysis_status, COUNT(*)::int as cnt FROM posts GROUP BY ai_analysis_status");
  console.log('\nPost statuses:', postCheck.rows);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

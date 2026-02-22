require('dotenv').config();
const { query } = require('../config/database');
const { fetchProfileViaRapidAPI } = require('../services/instagram-fetcher');

(async () => {
  // Step 1: Re-fetch profiles with following_count + media_count
  console.log('=== Re-fetching profiles (followers, following, posts) ===');
  const clubs = await query('SELECT id, instagram_handle FROM clubs WHERE instagram_handle IS NOT NULL');

  const results = await Promise.allSettled(
    clubs.rows.map(async (club) => {
      const profile = await fetchProfileViaRapidAPI(club.instagram_handle);
      return { club, profile };
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.profile) {
      const { club, profile } = r.value;
      await query(
        `UPDATE clubs SET
          bio = COALESCE($1, bio),
          profile_image_url = COALESCE($2, profile_image_url),
          follower_count = $3,
          following_count = $4,
          media_count = $5,
          updated_at = NOW()
        WHERE id = $6`,
        [profile.bio, profile.profile_pic_url, profile.follower_count, profile.following_count, profile.media_count, club.id]
      );
      console.log(`  @${club.instagram_handle}: ${profile.follower_count} followers, ${profile.following_count} following, ${profile.media_count} posts`);
    }
  }

  // Step 2: Reset all posts to pending for re-analysis with new prompt
  const resetResult = await query("UPDATE posts SET ai_analysis_status = 'pending' WHERE ai_analysis_status IN ('not_event', 'analyzed') RETURNING id");
  console.log(`\nReset ${resetResult.rows.length} posts to pending for re-analysis`);

  // Verify
  const verify = await query('SELECT instagram_handle, follower_count, following_count, media_count FROM clubs WHERE instagram_handle IS NOT NULL ORDER BY follower_count DESC');
  console.log('\n=== Final club stats ===');
  verify.rows.forEach(c => console.log(`  @${c.instagram_handle}: ${c.follower_count} followers | ${c.following_count} following | ${c.media_count} posts`));

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

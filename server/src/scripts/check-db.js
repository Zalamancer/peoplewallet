require('dotenv').config();
const { query } = require('../config/database');

(async () => {
  // Check clubs with their profile data
  const clubs = await query('SELECT id, name, instagram_handle, bio, profile_image_url, follower_count, ranking_score FROM clubs WHERE instagram_handle IS NOT NULL');
  console.log('=== CLUBS ===');
  clubs.rows.forEach(c => {
    console.log(`@${c.instagram_handle} | name: ${c.name} | bio: ${c.bio ? 'YES' : 'NO'} | pic: ${c.profile_image_url ? 'YES' : 'NO'} | followers: ${c.follower_count} | rank: ${c.ranking_score}`);
  });

  // Check posts
  const posts = await query('SELECT p.id, p.club_id, p.instagram_post_id, p.caption, p.ai_analysis_status, p.posted_at, c.instagram_handle FROM posts p LEFT JOIN clubs c ON c.id = p.club_id ORDER BY p.created_at DESC LIMIT 20');
  console.log('\n=== POSTS (' + posts.rows.length + ' total) ===');
  posts.rows.forEach(p => {
    console.log(`@${p.instagram_handle} | post_id: ${(p.instagram_post_id || 'null').substring(0, 25)} | status: ${p.ai_analysis_status} | caption: ${(p.caption || '').substring(0, 80)}`);
  });

  // Check events
  const events = await query('SELECT e.id, e.club_id, e.event_name, e.event_type, e.event_date, e.ai_confidence, e.feed_score, e.source, c.instagram_handle FROM events e LEFT JOIN clubs c ON c.id = e.club_id ORDER BY e.created_at DESC LIMIT 20');
  console.log('\n=== EVENTS (' + events.rows.length + ' total) ===');
  events.rows.forEach(e => {
    console.log(`@${e.instagram_handle} | "${e.event_name}" | type: ${e.event_type} | date: ${e.event_date} | confidence: ${e.ai_confidence} | score: ${e.feed_score} | source: ${e.source}`);
  });

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });

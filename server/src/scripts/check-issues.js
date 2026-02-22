require('dotenv').config();
const { query } = require('../config/database');

(async () => {
  // Check post analysis statuses
  const posts = await query(`SELECT p.instagram_post_id, p.ai_analysis_status, p.caption, c.instagram_handle
    FROM posts p LEFT JOIN clubs c ON c.id = p.club_id`);
  console.log('=== POST STATUSES ===');
  posts.rows.forEach(p => console.log(p.ai_analysis_status + ' | @' + p.instagram_handle + ' | ' + (p.caption || '').substring(0, 80)));

  // Check events and their club_ids
  const events = await query('SELECT id, club_id, event_name, source FROM events');
  console.log('\n=== ALL EVENTS ===');
  events.rows.forEach(e => console.log('club_id: ' + (e.club_id || 'NULL') + ' | ' + (e.event_name || 'null') + ' | source: ' + e.source));

  // Check clubs table columns
  const cols = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'clubs' ORDER BY ordinal_position`);
  console.log('\n=== CLUBS COLUMNS ===');
  console.log(cols.rows.map(c => c.column_name).join(', '));

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });

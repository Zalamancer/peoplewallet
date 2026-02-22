require('dotenv').config();
const { query } = require('../config/database');
const { analyzePost } = require('../services/event-analyzer');

(async () => {
  // Grab one pending post to test
  const result = await query("SELECT p.id, p.caption, c.instagram_handle FROM posts p LEFT JOIN clubs c ON c.id = p.club_id WHERE p.ai_analysis_status = 'pending' LIMIT 1");
  if (result.rows.length === 0) {
    console.log('No pending posts');
    process.exit(0);
  }

  const post = result.rows[0];
  console.log('Testing analysis for @' + post.instagram_handle);
  console.log('Caption:', (post.caption || '').substring(0, 100));
  console.log('');

  try {
    const analysisResult = await analyzePost(post.id);
    console.log('Analysis result:', JSON.stringify(analysisResult, null, 2));
  } catch (error) {
    console.error('Analysis ERROR:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data));
    }
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

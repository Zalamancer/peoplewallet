require('dotenv').config();
const { query } = require('../config/database');
const { buildClaudeMessages } = require('../services/event-analyzer');
const axios = require('axios');

(async () => {
  // Reset the SWE post first
  await query("UPDATE posts SET ai_analysis_status = 'pending' WHERE ai_analysis_status = 'not_event'");

  const result = await query(`SELECT p.*, c.name AS club_name FROM posts p LEFT JOIN clubs c ON c.id = p.club_id WHERE p.ai_analysis_status = 'pending' LIMIT 3`);

  for (const post of result.rows) {
    console.log('\n=== @' + post.club_name + ' ===');
    console.log('Caption:', (post.caption || '').substring(0, 120));

    const messages = buildClaudeMessages(post.image_urls || [], post.caption || '', post.posted_at ? new Date(post.posted_at).toISOString() : 'unknown');

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages,
        },
        {
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      const textBlock = response.data.content.find(b => b.type === 'text');
      console.log('Raw AI response:', textBlock?.text?.substring(0, 500));

      try {
        const parsed = JSON.parse(textBlock.text);
        console.log('Parsed - is_event:', parsed.is_event, '| event_name:', parsed.event_name || 'N/A');
      } catch (e) {
        console.log('JSON PARSE FAILED:', e.message);
      }
    } catch (err) {
      console.log('API ERROR:', err.response?.status, err.response?.data?.error?.message || err.message);
    }
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

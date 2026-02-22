require('dotenv').config();
const { query } = require('../config/database');

(async () => {
  try {
    // 1. Allow NULL event_date (caption-only events often lack dates)
    await query('ALTER TABLE events ALTER COLUMN event_date DROP NOT NULL');
    console.log('Dropped NOT NULL on event_date');

    // 2. Drop the restrictive event_type CHECK constraint
    await query('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check');
    console.log('Dropped events_event_type_check constraint');

    // 3. Reset posts that were marked not_event due to insert failures back to pending
    const resetResult = await query(
      "UPDATE posts SET ai_analysis_status = 'pending' WHERE ai_analysis_status = 'not_event' RETURNING id"
    );
    console.log('Reset ' + resetResult.rows.length + ' posts back to pending');

    // Check what we have now
    const stats = await query("SELECT ai_analysis_status, COUNT(*) as cnt FROM posts GROUP BY ai_analysis_status");
    console.log('\nPost statuses:', stats.rows);

    const eventCount = await query("SELECT COUNT(*) as cnt FROM events WHERE source = 'instagram_ai'");
    console.log('Existing AI events:', eventCount.rows[0].cnt);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();

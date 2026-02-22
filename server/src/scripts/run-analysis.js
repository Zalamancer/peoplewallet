require('dotenv').config();
const { analyzePendingPosts } = require('../services/event-analyzer');

(async () => {
  try {
    console.log('Running AI event analysis on pending posts...');
    const result = await analyzePendingPosts();
    console.log('\nResults:', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();

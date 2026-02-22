require('dotenv').config();
const axios = require('axios');

const apiKey = process.env.RAPIDAPI_KEY;
const apiHost = process.env.RAPIDAPI_HOST || 'instagram120.p.rapidapi.com';

(async () => {
  const response = await axios.post(
    `https://${apiHost}/api/instagram/profile`,
    { username: 'utdnsbe' },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': apiHost,
      },
      timeout: 15000,
    }
  );

  const raw = response.data;
  console.log('=== RAW KEYS ===', Object.keys(raw));
  const profile = raw?.result || raw;
  console.log('=== PROFILE KEYS ===', Object.keys(profile));
  console.log('follower_count:', profile.follower_count);
  console.log('followers:', profile.followers);
  console.log('edge_followed_by:', profile.edge_followed_by);
  console.log('full_name:', profile.full_name);
  console.log('biography:', profile.biography);
  console.log('media_count:', profile.media_count);
  console.log('\nFull profile (first 2000 chars):', JSON.stringify(profile).substring(0, 2000));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });

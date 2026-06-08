/**
 * Quick test script to verify RapidAPI + Google CSE endpoints.
 * Run: node test-api-endpoints.js
 *
 * Tests:
 * 1. Profile info (user_info / v1/info)
 * 2. User search (search / v1/search_users)
 * 3. Following list (following / v1/following)
 * 4. Posts/medias (medias_v2 / v1/posts)
 * 5. Google CSE search
 *
 * Supports: instagram28, instagram-scraper-api2, instagram120
 */
require('dotenv').config();
const axios = require('axios');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'instagram28.p.rapidapi.com';
const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

const headers = {
  'x-rapidapi-key': RAPIDAPI_KEY,
  'x-rapidapi-host': RAPIDAPI_HOST,
};

const isIG28 = RAPIDAPI_HOST.includes('instagram28');
const isAPI2 = RAPIDAPI_HOST.includes('instagram-scraper-api2');

async function testProfile() {
  const endpoint = isIG28 ? '/user_info' : isAPI2 ? '/v1/info' : '/api/instagram/profile';
  console.log(`\n=== 1. Profile Info (${endpoint}) ===`);
  if (!RAPIDAPI_KEY) { console.log('SKIP: RAPIDAPI_KEY not set'); return; }
  try {
    let resp;
    if (isIG28) {
      resp = await axios.get(`https://${RAPIDAPI_HOST}/user_info`, {
        params: { user_name: 'utdallas' }, headers, timeout: 15000,
      });
    } else if (isAPI2) {
      resp = await axios.get(`https://${RAPIDAPI_HOST}/v1/info`, {
        params: { username_or_id_or_url: 'utdallas' }, headers, timeout: 15000,
      });
    } else {
      resp = await axios.post(`https://${RAPIDAPI_HOST}/api/instagram/profile`,
        { username: 'utdallas' },
        { headers: { ...headers, 'Content-Type': 'application/json' }, timeout: 15000 });
    }
    const data = resp.data?.data || resp.data;
    const profile = data?.user || data?.result || data;
    console.log('OK  username:', profile?.username);
    console.log('    full_name:', profile?.full_name);
    console.log('    pk/user_id:', profile?.pk || profile?.id);
    console.log('    bio:', (profile?.biography || profile?.bio || '').slice(0, 80) + '...');
    console.log('    followers:', profile?.follower_count || profile?.edge_followed_by?.count);
    return profile?.pk || profile?.id; // return user_id for medias test
  } catch (err) {
    console.log('FAIL', err.response?.status, err.response?.data?.message || err.message);
    return null;
  }
}

async function testSearch() {
  const endpoint = isIG28 ? '/search' : isAPI2 ? '/v1/search_users' : '/api/instagram/search';
  console.log(`\n=== 2. User Search (${endpoint}) ===`);
  if (!RAPIDAPI_KEY) { console.log('SKIP: RAPIDAPI_KEY not set'); return; }
  try {
    let resp;
    if (isIG28) {
      resp = await axios.get(`https://${RAPIDAPI_HOST}/search`, {
        params: { query: 'UTD club' }, headers, timeout: 15000,
      });
    } else if (isAPI2) {
      resp = await axios.get(`https://${RAPIDAPI_HOST}/v1/search_users`, {
        params: { search_query: 'UTD club' }, headers, timeout: 15000,
      });
    } else {
      resp = await axios.post(`https://${RAPIDAPI_HOST}/api/instagram/search`,
        { query: 'UTD club' },
        { headers: { ...headers, 'Content-Type': 'application/json' }, timeout: 15000 });
    }
    const data = resp.data?.data || resp.data;
    const users = data?.items || data?.users || data?.result?.users || [];
    console.log('OK  Users found:', users.length);
    for (const u of (Array.isArray(users) ? users : []).slice(0, 5)) {
      console.log('   ', u.username, '-', (u.full_name || ''));
    }
  } catch (err) {
    console.log('FAIL', err.response?.status, err.response?.data?.message || err.message);
  }
}

async function testFollowing(userId) {
  const endpoint = isIG28 ? '/following' : isAPI2 ? '/v1/following' : '/api/instagram/following';
  console.log(`\n=== 3. Following List (${endpoint}) ===`);
  if (!RAPIDAPI_KEY) { console.log('SKIP: RAPIDAPI_KEY not set'); return; }
  try {
    let resp;
    if (isIG28) {
      if (!userId) { console.log('SKIP: need user_id from profile test'); return; }
      resp = await axios.get(`https://${RAPIDAPI_HOST}/following`, {
        params: { user_id: userId }, headers, timeout: 20000,
      });
    } else if (isAPI2) {
      resp = await axios.get(`https://${RAPIDAPI_HOST}/v1/following`, {
        params: { username_or_id_or_url: 'utdallas' }, headers, timeout: 20000,
      });
    } else {
      resp = await axios.post(`https://${RAPIDAPI_HOST}/api/instagram/following`,
        { username: 'utdallas', maxId: '' },
        { headers: { ...headers, 'Content-Type': 'application/json' }, timeout: 20000 });
    }
    const data = resp.data?.data || resp.data;
    const users = data?.items || data?.users || data?.result?.users || [];
    const nextToken = data?.pagination_token || data?.next_max_id;
    console.log('OK  Following count (page 1):', Array.isArray(users) ? users.length : 'N/A');
    console.log('    Has next page:', nextToken ? 'yes' : 'no');
    for (const u of (Array.isArray(users) ? users : []).slice(0, 5)) {
      console.log('   ', u.username, '-', (u.full_name || ''));
    }
  } catch (err) {
    console.log('FAIL', err.response?.status, err.response?.data?.message || err.message);
  }
}

async function testPosts(userId) {
  const endpoint = isIG28 ? '/medias_v2' : isAPI2 ? '/v1/posts' : '/api/instagram/posts';
  console.log(`\n=== 4. Posts/Medias (${endpoint}) ===`);
  if (!RAPIDAPI_KEY) { console.log('SKIP: RAPIDAPI_KEY not set'); return; }
  try {
    let resp;
    if (isIG28) {
      if (!userId) { console.log('SKIP: need user_id from profile test'); return; }
      resp = await axios.get(`https://${RAPIDAPI_HOST}/medias_v2`, {
        params: { user_id: userId }, headers, timeout: 30000,
      });
    } else if (isAPI2) {
      resp = await axios.get(`https://${RAPIDAPI_HOST}/v1/posts`, {
        params: { username_or_id_or_url: 'utdallas' }, headers, timeout: 30000,
      });
    } else {
      resp = await axios.post(`https://${RAPIDAPI_HOST}/api/instagram/posts`,
        { username: 'utdallas', maxId: '' },
        { headers: { ...headers, 'Content-Type': 'application/json' }, timeout: 30000 });
    }
    const data = resp.data?.data || resp.data;
    const items = data?.items || data?.result?.items || data?.edges || [];
    console.log('OK  Posts found:', Array.isArray(items) ? items.length : 'N/A');
    for (const p of (Array.isArray(items) ? items : []).slice(0, 3)) {
      const node = p.node || p;
      const caption = (node.caption?.text || node.caption || '').slice(0, 60);
      console.log('   ', node.code || node.shortcode || node.pk || '', '-', caption + '...');
    }
  } catch (err) {
    console.log('FAIL', err.response?.status, err.response?.data?.message || err.message);
  }
}

async function testGoogleCSE() {
  console.log('\n=== 5. Google CSE ===');
  if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_ID) { console.log('SKIP: GOOGLE_CSE_API_KEY or GOOGLE_CSE_ID not set'); return; }
  try {
    const resp = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        q: '"UTD" site:instagram.com',
        key: GOOGLE_CSE_KEY,
        cx: GOOGLE_CSE_ID,
        start: 1,
        num: 10,
      },
      timeout: 15000,
    });
    const items = resp.data.items || [];
    console.log('OK  Results:', items.length);
    for (const item of items.slice(0, 3)) {
      console.log('   ', item.link);
    }
  } catch (err) {
    console.log('FAIL', err.response?.status, JSON.stringify(err.response?.data?.error?.message || err.message).slice(0, 200));
  }
}

(async () => {
  console.log('Testing with RAPIDAPI_HOST:', RAPIDAPI_HOST);
  const userId = await testProfile();
  await testSearch();
  await testFollowing(userId);
  await testPosts(userId);
  await testGoogleCSE();
  console.log('\n=== Done ===');
  process.exit(0);
})();

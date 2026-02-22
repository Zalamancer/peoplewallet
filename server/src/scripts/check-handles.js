require('dotenv').config();
const axios = require('axios');
const apiKey = process.env.RAPIDAPI_KEY;
const apiHost = process.env.RAPIDAPI_HOST || 'instagram120.p.rapidapi.com';

const handles = [
  'acmutd', 'aisutd', 'utdais', 'utdsg', 'ieeeutd', 'ieee_utd',
  'saseutd', 'utdsase', 'wicys.utd', 'utdwics',
  'utdcricket', 'utd_isa', 'isautd', 'utdmsa', 'msa.utd',
  'utdnsbe', 'nsbeutd', 'cometmarketing', 'utdgdc', 'gdcutd',
  'utd.swe', 'sweutd', 'utdshpe', 'gdscutd', 'utd_dsc',
  'utdcssg', 'utdcomet', 'utd_esports', 'utdbsa', 'utdpbl',
  'utdhha', 'utdosa', 'utdvsa', 'ksamutd', 'utd_abs',
  'utdfso', 'utdpaksa', 'utdcssa', 'utdjsom', 'utdfencing',
];

(async () => {
  console.log('Checking', handles.length, 'handles in parallel...\n');

  const results = await Promise.allSettled(
    handles.map(async (h) => {
      try {
        const res = await axios.post(
          `https://${apiHost}/api/instagram/profile`,
          { username: h },
          {
            headers: { 'Content-Type': 'application/json', 'x-rapidapi-key': apiKey, 'x-rapidapi-host': apiHost },
            timeout: 10000,
          }
        );
        const p = res.data?.result || res.data;
        if (p && p.username && p.is_private === false) {
          return { handle: p.username, name: p.full_name, bio: p.biography, followers: p.follower_count, pic: p.profile_pic_url_hd || p.profile_pic_url, posts: p.media_count };
        }
        return null;
      } catch (e) { return null; }
    })
  );

  const valid = [];
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value) {
      valid.push(r.value);
    }
  });

  valid.sort((a, b) => b.followers - a.followers);
  valid.forEach(v => {
    console.log(`@${v.handle} | ${v.name} | ${v.followers} followers | ${v.posts} posts | ${(v.bio || '').substring(0, 60)}`);
  });

  console.log('\nFound', valid.length, 'valid public accounts out of', handles.length, 'checked');
  console.log('\nJSON:');
  console.log(JSON.stringify(valid.map(v => ({ handle: v.handle, name: v.name, followers: v.followers, bio: v.bio, pic: v.pic })), null, 2));

  process.exit(0);
})();

const { query } = require('../config/database');
const logger = require('../utils/logger');
const axios = require('axios');

/**
 * Club Discovery Service — V2 Multi-Source Pipeline
 *
 * Discovers student organization Instagram accounts for any university via:
 *   1. Google CSE (paginated, 190+ queries)
 *   2. Instagram user search (RapidAPI)
 *   3. Following-list crawl (university's official IG account)
 *   4. SerpAPI fallback
 *   5. Official directory import
 *
 * Then classifies with Claude LLM and promotes confirmed accounts.
 */

// ─── Category keywords for search query generation ───────────────────────────

const CATEGORY_KEYWORDS = [
  // Academic / Professional
  'engineering', 'computer science', 'biology', 'chemistry', 'physics', 'math',
  'business', 'finance', 'accounting', 'marketing', 'economics', 'pre-med',
  'pre-law', 'nursing', 'psychology', 'neuroscience', 'data science',
  'cybersecurity', 'mechanical engineering', 'electrical engineering',
  // Cultural / Identity
  'indian', 'chinese', 'korean', 'vietnamese', 'hispanic', 'latino', 'african',
  'arab', 'muslim', 'jewish', 'christian', 'buddhist', 'hindu', 'asian',
  'pacific islander', 'caribbean', 'european', 'persian', 'turkish', 'pakistani',
  'filipino', 'japanese', 'bangladeshi', 'nigerian',
  // Greek Life
  'fraternity', 'sorority', 'greek', 'alpha', 'beta', 'gamma', 'delta',
  'sigma', 'kappa', 'theta', 'phi', 'omega', 'panhellenic',
  // Sports / Recreation
  'soccer', 'basketball', 'volleyball', 'tennis', 'badminton', 'cricket',
  'esports', 'gaming', 'chess', 'running', 'swimming', 'martial arts',
  'dance', 'yoga', 'fitness', 'intramural', 'quidditch', 'ultimate frisbee',
  // Arts / Creative
  'music', 'a cappella', 'theater', 'film', 'photography', 'art', 'design',
  'fashion', 'poetry', 'writing', 'literary', 'comedy', 'improv', 'anime',
  // Service / Advocacy
  'volunteer', 'service', 'habitat', 'charity', 'community', 'sustainability',
  'environment', 'political', 'debate', 'model UN', 'amnesty', 'red cross',
  // Tech / Innovation
  'robotics', 'AI', 'machine learning', 'blockchain', 'hackathon', 'coding',
  'programming', 'web development', 'app development', 'startup', 'entrepreneur',
  // General campus life
  'student government', 'student council', 'honor society', 'freshmen',
  'graduate', 'international', 'women in', 'men in', 'LGBTQ', 'diversity',
];

// ─── Utility: Extract Instagram handle from URL ──────────────────────────────

const extractInstagramHandle = (url) => {
  if (!url) return null;
  const match = url.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  if (match && match[1]) {
    const handle = match[1].toLowerCase();
    const ignore = ['p', 'explore', 'reels', 'stories', 'accounts', 'directory', 'about', 'tags', 'locations'];
    if (ignore.includes(handle)) return null;
    return handle;
  }
  return null;
};

// ─── 2a. Load university config from DB ──────────────────────────────────────

const loadUniversityConfig = async (schoolId) => {
  const result = await query(
    'SELECT id, name, full_name, abbreviation, alt_names, instagram_handle, domain FROM schools WHERE id = $1',
    [schoolId]
  );

  if (result.rows.length === 0) {
    throw new Error(`School ${schoolId} not found`);
  }

  const school = result.rows[0];
  return {
    schoolId: school.id,
    name: school.name,
    fullName: school.full_name || school.name,
    abbreviation: school.abbreviation || '',
    altNames: school.alt_names || [],
    instagramHandle: school.instagram_handle || '',
    domain: school.domain || '',
  };
};

// ─── 2b. Generate 100+ search queries ───────────────────────────────────────

const generateSearchQueries = (config) => {
  const queries = [];
  const nameVariants = [config.name, config.abbreviation, config.fullName, ...config.altNames]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe

  // Tier 1: bare name variants + site:instagram.com (~4 queries)
  for (const name of nameVariants) {
    queries.push(`"${name}" site:instagram.com`);
  }

  // Tier 2: top 3 name variants x category keywords (~180 queries)
  const topNames = nameVariants.slice(0, 3);
  for (const name of topNames) {
    for (const keyword of CATEGORY_KEYWORDS) {
      queries.push(`"${name}" "${keyword}" site:instagram.com`);
    }
  }

  // Tier 3: generic discovery queries (~6 queries)
  const genericTerms = ['student organization instagram', 'student club instagram', 'campus organization instagram'];
  for (const name of nameVariants.slice(0, 2)) {
    for (const term of genericTerms) {
      queries.push(`"${name}" ${term}`);
    }
  }

  return queries;
};

// ─── 2c. Paginated Google CSE search ─────────────────────────────────────────

const searchViaGoogleCSEPaginated = async (searchQuery, maxPages = 3) => {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) return null;

  const handles = [];

  for (let page = 0; page < maxPages; page++) {
    const start = page * 10 + 1;

    try {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          q: searchQuery,
          key: apiKey,
          cx: cseId,
          start,
          num: 10,
        },
        timeout: 15000,
      });

      const items = response.data.items || [];
      if (items.length === 0) break; // no more results

      for (const item of items) {
        const handle = extractInstagramHandle(item.link);
        if (handle) {
          handles.push({ handle, url: item.link });
        }
      }

      // If fewer than 10 results, no next page
      if (items.length < 10) break;
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('Google CSE rate limit hit, stopping pagination');
        break;
      }
      if (error.response?.status === 400 && error.response?.data?.error?.message?.includes('Invalid Value')) {
        // start value out of range — no more results
        break;
      }
      logger.error(`Google CSE page ${page + 1} error for "${searchQuery}": ${error.message || error} | status=${error.response?.status} | data=${JSON.stringify(error.response?.data)} | code=${error.code}`);
      break;
    }
  }

  return handles;
};

// ─── Search via SerpAPI (unchanged) ──────────────────────────────────────────

const searchViaSerpAPI = async (searchQuery) => {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return null;

  try {
    const response = await axios.get('https://serpapi.com/search.json', {
      params: {
        q: searchQuery,
        api_key: apiKey,
        engine: 'google',
        num: 100,
      },
      timeout: 30000,
    });

    const results = response.data.organic_results || [];
    const handles = [];

    for (const result of results) {
      const handle = extractInstagramHandle(result.link);
      if (handle) {
        handles.push({ handle, url: result.link });
      }
    }

    return handles;
  } catch (error) {
    logger.error('SerpAPI search error:', error.message);
    return null;
  }
};

// ─── 2d. Instagram user search via RapidAPI ──────────────────────────────────

let igSearchAvailable = null; // null = untested, true/false = tested

const searchInstagramViaRapidAPI = async (keyword) => {
  if (igSearchAvailable === false) return [];

  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST || 'instagram28.p.rapidapi.com';
  if (!apiKey) return [];

  try {
    let response;
    const headers = { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': apiHost };

    if (apiHost.includes('instagram28')) {
      // instagram28: GET /search?query=xxx
      response = await axios.get(`https://${apiHost}/search`, {
        params: { query: keyword },
        headers,
        timeout: 15000,
      });
    } else if (apiHost.includes('instagram-scraper-api2')) {
      // instagram-scraper-api2: GET /v1/search_users
      response = await axios.get(`https://${apiHost}/v1/search_users`, {
        params: { search_query: keyword },
        headers,
        timeout: 15000,
      });
    } else {
      // instagram120 fallback: POST /api/instagram/search
      response = await axios.post(
        `https://${apiHost}/api/instagram/search`,
        { query: keyword },
        {
          headers: { ...headers, 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );
    }

    igSearchAvailable = true;

    const data = response.data?.data || response.data;
    const users = data?.items || data?.users || data?.result?.users || [];
    return users
      .filter((u) => u.username)
      .map((u) => ({
        handle: u.username.toLowerCase(),
        url: `https://www.instagram.com/${u.username}/`,
        bio: u.biography || u.bio || null,
        fullName: u.full_name || null,
      }));
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 400) {
      if (igSearchAvailable === null) {
        logger.info('Instagram search endpoint not available on this RapidAPI plan, skipping');
        igSearchAvailable = false;
      }
      return [];
    }
    logger.error(`Instagram search error for "${keyword}":`, error.message);
    return [];
  }
};

// ─── 2e. Following-list crawl via RapidAPI ───────────────────────────────────

const fetchFollowingList = async (handle) => {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST || 'instagram28.p.rapidapi.com';
  if (!apiKey || !handle) return [];

  const allFollowing = [];
  let paginationToken = '';
  let page = 0;
  const maxPages = 20; // safety limit

  while (page < maxPages) {
    try {
      let response;
      const headers = { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': apiHost };

      if (apiHost.includes('instagram28')) {
        // instagram28: GET /following?user_id=xxx
        // Need to resolve username → user_id first
        if (page === 0 && !paginationToken) {
          const { fetchProfileViaRapidAPI } = require('./instagram-fetcher');
          const profile = await fetchProfileViaRapidAPI(handle);
          if (!profile?.user_id) {
            logger.info(`instagram28: could not resolve user_id for @${handle}, skipping following crawl`);
            break;
          }
          // Store user_id in a closure variable for pagination
          handle = String(profile.user_id);
        }
        const params = { user_id: handle };
        if (paginationToken) params.max_id = paginationToken;
        response = await axios.get(`https://${apiHost}/following`, {
          params,
          headers,
          timeout: 20000,
        });
      } else if (apiHost.includes('instagram-scraper-api2')) {
        // instagram-scraper-api2: GET /v1/following
        const params = { username_or_id_or_url: handle };
        if (paginationToken) params.pagination_token = paginationToken;
        response = await axios.get(`https://${apiHost}/v1/following`, {
          params,
          headers,
          timeout: 20000,
        });
      } else {
        // instagram120 fallback: POST /api/instagram/following
        response = await axios.post(
          `https://${apiHost}/api/instagram/following`,
          { username: handle, maxId: paginationToken },
          {
            headers: { ...headers, 'Content-Type': 'application/json' },
            timeout: 20000,
          }
        );
      }

      const data = response.data?.data || response.data;
      const users = data?.items || data?.users || data?.result?.users || [];
      if (users.length === 0) break;

      for (const u of users) {
        if (u.username) {
          allFollowing.push({
            handle: u.username.toLowerCase(),
            url: `https://www.instagram.com/${u.username}/`,
            bio: u.biography || u.bio || null,
            fullName: u.full_name || null,
          });
        }
      }

      // Check for pagination cursor (try multiple response patterns)
      const nextToken = data?.pagination_token || data?.next_max_id ||
        response.data?.result?.next_max_id || response.data?.next_max_id;
      if (!nextToken) break;
      paginationToken = nextToken;
      page++;
    } catch (error) {
      if (error.response?.status === 404 || error.response?.status === 400) {
        logger.info(`Following endpoint not available or invalid for @${handle}`);
        break;
      }
      logger.error(`Following-list fetch error for @${handle} (page ${page}):`, error.message);
      break;
    }
  }

  logger.info(`Fetched ${allFollowing.length} following from @${handle} (${page + 1} pages)`);
  return allFollowing;
};

// ─── 2f. Main orchestrator — discover clubs for a school ─────────────────────

const discoverClubsForSchool = async (schoolId, options = {}) => {
  const {
    googleQueryBudget = 190,
    googlePagesPerQuery = 3,
    enableFollowingCrawl = true,
    enableInstagramSearch = true,
  } = options;

  const config = await loadUniversityConfig(schoolId);
  logger.info(`[Discovery] Starting multi-source discovery for ${config.name} (${config.schoolId})`);

  // Update school status
  await query(
    "UPDATE schools SET discovery_status = 'running', discovery_last_run = NOW() WHERE id = $1",
    [schoolId]
  );

  const stats = { google: 0, instagram_search: 0, following_crawl: 0, total_raw: 0, unique_inserted: 0, duplicates: 0, errors: 0 };

  // Collect all handles from all sources
  const allHandles = new Map(); // handle -> { url, bio, fullName, source }

  const addHandles = (handles, source) => {
    for (const h of handles) {
      if (!allHandles.has(h.handle)) {
        allHandles.set(h.handle, { url: h.url, bio: h.bio || null, fullName: h.fullName || null, source });
      }
    }
  };

  // ─── Source 1: Google CSE (paginated, many queries) ──────────────────────
  const allQueries = generateSearchQueries(config);
  const queries_to_run = allQueries.slice(0, googleQueryBudget);
  logger.info(`[Discovery] Running ${queries_to_run.length} Google CSE queries (budget: ${googleQueryBudget})`);

  let googleApiCalls = 0;
  for (const searchQuery of queries_to_run) {
    // Try SerpAPI first, then Google CSE paginated
    let results = await searchViaSerpAPI(searchQuery);
    if (results === null) {
      results = await searchViaGoogleCSEPaginated(searchQuery, googlePagesPerQuery);
      if (results) {
        googleApiCalls += Math.min(googlePagesPerQuery, Math.ceil(results.length / 10) || 1);
      }
    }

    if (results && results.length > 0) {
      addHandles(results, 'google_dork');
      stats.google += results.length;
    }

    // Small delay between queries to be respectful of rate limits
    await new Promise((r) => setTimeout(r, 200));
  }
  logger.info(`[Discovery] Google CSE: ${stats.google} raw handles from ${queries_to_run.length} queries (~${googleApiCalls} API calls)`);

  // ─── Source 2: Instagram user search ─────────────────────────────────────
  if (enableInstagramSearch) {
    const nameVariants = [config.abbreviation, config.name].filter(Boolean);
    const searchTerms = [];

    // Generate search terms: name + category subset
    const igSearchKeywords = [
      'club', 'dance', 'sports', 'music', 'engineering', 'business', 'cultural',
      'fraternity', 'sorority', 'volunteer', 'esports', 'art', 'film', 'robotics',
      'student org', 'hackathon', 'pre-med', 'finance', 'debate', 'comedy',
      'indian', 'korean', 'chinese', 'hispanic', 'african', 'muslim', 'christian',
      'soccer', 'basketball', 'volleyball', 'tennis', 'coding', 'AI', 'chess',
      'anime', 'photography', 'fashion', 'theater', 'a cappella', 'yoga',
    ];

    for (const name of nameVariants) {
      for (const kw of igSearchKeywords) {
        searchTerms.push(`${name} ${kw}`);
      }
    }

    logger.info(`[Discovery] Running ${searchTerms.length} Instagram searches`);

    for (const term of searchTerms) {
      const results = await searchInstagramViaRapidAPI(term);
      if (results.length > 0) {
        addHandles(results, 'instagram_search');
        stats.instagram_search += results.length;
      }
      // Break early if endpoint is unavailable
      if (igSearchAvailable === false) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    logger.info(`[Discovery] Instagram search: ${stats.instagram_search} raw handles`);
  }

  // ─── Source 3: Following-list crawl ──────────────────────────────────────
  if (enableFollowingCrawl && config.instagramHandle) {
    logger.info(`[Discovery] Crawling following list of @${config.instagramHandle}`);
    const following = await fetchFollowingList(config.instagramHandle);
    if (following.length > 0) {
      addHandles(following, 'following_crawl');
      stats.following_crawl += following.length;
    }
    logger.info(`[Discovery] Following crawl: ${stats.following_crawl} raw handles`);
  }

  // ─── Insert all unique handles into discovered_accounts ──────────────────
  stats.total_raw = allHandles.size;
  logger.info(`[Discovery] Total unique handles to insert: ${stats.total_raw}`);

  for (const [handle, data] of allHandles) {
    try {
      const result = await query(
        `INSERT INTO discovered_accounts (handle, url, bio, status, school_id, discovery_source)
         VALUES ($1, $2, $3, 'pending', $4, $5)
         ON CONFLICT (handle) DO NOTHING`,
        [handle, data.url, data.bio, schoolId, data.source]
      );
      if (result.rowCount > 0) {
        stats.unique_inserted++;
      } else {
        stats.duplicates++;
      }
    } catch (error) {
      logger.error(`Error inserting discovered account @${handle}:`, error.message);
      stats.errors++;
    }
  }

  // Update school status
  await query(
    "UPDATE schools SET discovery_status = 'completed' WHERE id = $1",
    [schoolId]
  );

  logger.info(`[Discovery] Complete for ${config.name}: ${stats.unique_inserted} new, ${stats.duplicates} dupes, ${stats.errors} errors`);
  return stats;
};

// ─── 2g. Parameterized LLM classification ────────────────────────────────────

const classifyAccount = async (handle, bio, universityConfig = null) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('ANTHROPIC_API_KEY not configured, skipping LLM classification');
    return { is_university_org: false, category: 'other', confidence: 0 };
  }

  const uniName = universityConfig
    ? `${universityConfig.name} (${universityConfig.abbreviation || universityConfig.fullName})`
    : 'the university';

  try {
    const prompt = `Given this Instagram bio and username, determine:
(1) Is this a ${uniName} student organization, club, or campus group?
(2) What category? (academic, social, cultural, sports, arts, professional, tech, greek_life, religious, service, other)
(3) Confidence score 0-1.
Respond in JSON with keys: is_university_org (boolean), category (string), confidence (number).

Username: @${handle}
Bio: ${bio || '(no bio available)'}

Respond with ONLY valid JSON, no markdown formatting or backticks.`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const textBlock = response.data.content.find((b) => b.type === 'text');
    if (!textBlock) {
      logger.error(`No text block in Claude response for @${handle}`);
      return { is_university_org: false, category: 'other', confidence: 0 };
    }

    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const parsed = JSON.parse(jsonText);
    return {
      is_university_org: Boolean(parsed.is_university_org),
      // Backwards compatibility: also check old key
      is_utd_org: Boolean(parsed.is_university_org || parsed.is_utd_org),
      category: parsed.category || 'other',
      confidence: Number(parsed.confidence) || 0,
    };
  } catch (error) {
    logger.error(`LLM classification error for @${handle}:`, error.message);
    return { is_university_org: false, category: 'other', confidence: 0 };
  }
};

// ─── 2h. Classify pending accounts — no batch limit by default ───────────────

const classifyPendingAccounts = async (schoolId = null, options = {}) => {
  const { batchLimit = 0, concurrency = 10 } = options;
  const { fetchProfileViaRapidAPI } = require('./instagram-fetcher');

  // Load university config if schoolId provided
  let universityConfig = null;
  if (schoolId) {
    try {
      universityConfig = await loadUniversityConfig(schoolId);
    } catch (e) {
      logger.warn(`Could not load university config for school ${schoolId}: ${e.message}`);
    }
  }

  const limitClause = batchLimit > 0 ? `LIMIT ${parseInt(batchLimit, 10)}` : '';
  const schoolClause = schoolId ? `AND school_id = $1` : '';
  const params = schoolId ? [schoolId] : [];

  logger.info(`[Classification] Starting (school: ${schoolId || 'all'}, batch: ${batchLimit || 'unlimited'}, concurrency: ${concurrency})`);

  let classified = 0;
  let promoted = 0;
  let rejected = 0;
  let errors = 0;
  let biosFetched = 0;

  try {
    const result = await query(
      `SELECT * FROM discovered_accounts WHERE status = 'pending' ${schoolClause} ORDER BY created_at ASC ${limitClause}`,
      params
    );

    const accounts = result.rows;
    logger.info(`[Classification] ${accounts.length} accounts to classify`);

    // Process in chunks of `concurrency`
    for (let i = 0; i < accounts.length; i += concurrency) {
      const chunk = accounts.slice(i, i + concurrency);

      // Fetch bios for accounts that don't have one
      const bioResults = await Promise.allSettled(
        chunk.map(async (account) => {
          if (!account.bio) {
            const profile = await fetchProfileViaRapidAPI(account.handle);
            if (profile?.bio) {
              await query('UPDATE discovered_accounts SET bio = $1 WHERE id = $2', [profile.bio, account.id]);
              biosFetched++;
              return { ...account, bio: profile.bio };
            }
          }
          return account;
        })
      );

      // Classify chunk in parallel
      const classifyResults = await Promise.allSettled(
        bioResults.map(async (bioRes) => {
          const account = bioRes.status === 'fulfilled' ? bioRes.value : bioRes.reason;
          if (!account || !account.handle) return null;
          const classification = await classifyAccount(account.handle, account.bio, universityConfig);
          return { account, classification };
        })
      );

      // Process results sequentially (DB writes)
      for (const res of classifyResults) {
        if (res.status !== 'fulfilled' || !res.value) {
          errors++;
          continue;
        }

        const { account, classification } = res.value;

        try {
          await query(
            'UPDATE discovered_accounts SET llm_classification = $1 WHERE id = $2',
            [JSON.stringify(classification), account.id]
          );
          classified++;

          if ((classification.is_university_org || classification.is_utd_org) && classification.confidence > 0.5) {
            await promoteAccount(account.id, schoolId);
            promoted++;
          } else {
            rejected++;
          }
        } catch (error) {
          logger.error(`Error saving classification for @${account.handle}:`, error.message);
          errors++;
        }
      }

      logger.info(`[Classification] Progress: ${Math.min(i + concurrency, accounts.length)}/${accounts.length} (promoted: ${promoted})`);
    }
  } catch (error) {
    logger.error('Error fetching pending accounts for classification:', error.message);
    return { classified: 0, promoted: 0, rejected: 0, errors: 1, bios_fetched: 0 };
  }

  logger.info(`[Classification] Complete: ${classified} classified, ${promoted} promoted, ${rejected} rejected, ${errors} errors, ${biosFetched} bios fetched`);
  return { classified, promoted, rejected, errors, bios_fetched: biosFetched };
};

// ─── 2i. Promote account — with schoolId ─────────────────────────────────────

const promoteAccount = async (accountId, schoolId = null) => {
  try {
    const accountResult = await query(
      'SELECT * FROM discovered_accounts WHERE id = $1',
      [accountId]
    );

    if (accountResult.rows.length === 0) {
      logger.warn(`Discovered account ${accountId} not found`);
      return null;
    }

    const account = accountResult.rows[0];
    const classification = account.llm_classification || {};
    const effectiveSchoolId = schoolId || account.school_id;

    // Check if a club with this handle already exists
    const existingClub = await query(
      'SELECT id FROM clubs WHERE instagram_handle = $1',
      [account.handle]
    );

    if (existingClub.rows.length > 0) {
      logger.info(`Club with handle @${account.handle} already exists, skipping promotion`);
      await query(
        "UPDATE discovered_accounts SET status = 'promoted' WHERE id = $1",
        [accountId]
      );
      return existingClub.rows[0];
    }

    // Determine discovery source from the account
    const discoverySource = account.discovery_source || 'google_dork';

    // Insert into clubs table (created_by is now nullable)
    const clubResult = await query(
      `INSERT INTO clubs (name, category, instagram_handle, bio, llm_confidence, discovery_source, school_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        account.handle,
        classification.category || 'other',
        account.handle,
        account.bio,
        classification.confidence || 0,
        discoverySource,
        effectiveSchoolId,
      ]
    );

    // Mark the discovered account as promoted
    await query(
      "UPDATE discovered_accounts SET status = 'promoted' WHERE id = $1",
      [accountId]
    );

    logger.info(`Promoted @${account.handle} to clubs (source: ${discoverySource})`);
    return clubResult.rows[0];
  } catch (error) {
    logger.error(`Error promoting account ${accountId}:`, error.message);
    return null;
  }
};

// ─── Import from directory (updated for schoolId) ────────────────────────────

const importFromDirectory = async (accounts, schoolId = null) => {
  logger.info(`Importing ${accounts.length} accounts from official directory`);

  let imported = 0;
  let updated = 0;
  let errors = 0;

  for (const account of accounts) {
    try {
      const handle = account.instagram_handle
        ? account.instagram_handle.replace('@', '').toLowerCase()
        : null;

      if (handle) {
        const existingResult = await query(
          'SELECT id FROM clubs WHERE instagram_handle = $1',
          [handle]
        );

        if (existingResult.rows.length > 0) {
          await query(
            `UPDATE clubs SET
              name = COALESCE($1, name),
              in_official_directory = true,
              school_id = COALESCE($2, school_id),
              updated_at = NOW()
            WHERE instagram_handle = $3`,
            [account.name, schoolId, handle]
          );
          updated++;
          continue;
        }
      }

      await query(
        `INSERT INTO clubs (name, instagram_handle, in_official_directory, discovery_source, school_id)
         VALUES ($1, $2, true, 'official_directory', $3)
         ON CONFLICT (instagram_handle) DO UPDATE SET
           name = COALESCE(EXCLUDED.name, clubs.name),
           in_official_directory = true,
           school_id = COALESCE(EXCLUDED.school_id, clubs.school_id),
           updated_at = NOW()`,
        [account.name, handle, schoolId]
      );

      imported++;
    } catch (error) {
      logger.error(`Error importing directory account ${account.name}:`, error.message);
      errors++;
    }
  }

  logger.info(`Directory import complete: ${imported} imported, ${updated} updated, ${errors} errors`);
  return { imported, updated, errors };
};

// ─── 2j. Backward-compatible wrapper ─────────────────────────────────────────

const discoverClubsViaGoogle = async () => {
  // Find the first school in the DB
  const schoolResult = await query('SELECT id FROM schools ORDER BY created_at ASC LIMIT 1');
  if (schoolResult.rows.length === 0) {
    logger.warn('No schools in DB, cannot run discovery');
    return { discovered: 0, duplicates: 0, errors: 0 };
  }

  const schoolId = schoolResult.rows[0].id;
  const stats = await discoverClubsForSchool(schoolId, {
    // Conservative budget for backward-compat cron runs
    googleQueryBudget: 10,
    googlePagesPerQuery: 1,
    enableFollowingCrawl: false,
    enableInstagramSearch: false,
  });

  return {
    discovered: stats.unique_inserted,
    duplicates: stats.duplicates,
    errors: stats.errors,
  };
};

module.exports = {
  // V2 API
  loadUniversityConfig,
  generateSearchQueries,
  searchViaGoogleCSEPaginated,
  searchInstagramViaRapidAPI,
  fetchFollowingList,
  discoverClubsForSchool,
  classifyAccount,
  classifyPendingAccounts,
  promoteAccount,
  importFromDirectory,
  // Backward-compatible
  discoverClubsViaGoogle,
  // Utility (kept for external use)
  extractInstagramHandle,
  searchViaSerpAPI,
};

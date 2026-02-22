const { query } = require('../config/database');
const logger = require('../utils/logger');
const axios = require('axios');

/**
 * Club Discovery Service — Pipeline 1
 *
 * Discovers UTD student organization Instagram accounts via Google
 * dorking (SerpAPI or Google Custom Search), classifies them with
 * Claude LLM, and promotes confirmed accounts into the clubs table.
 *
 * Discovery sources:
 *   1. Google Dorking — "UTD" / "UT Dallas" / "utdallas" site:instagram.com
 *   2. UTD Official Student Org Directory — manual or scraped import
 *   3. LLM Classification — Claude determines confidence & category
 */

const SEARCH_QUERIES = [
  '"UTD" site:instagram.com',
  '"UT Dallas" site:instagram.com',
  '"utdallas" site:instagram.com',
];

/**
 * Extract an Instagram handle from a URL or search result snippet.
 * Accepts URLs like https://www.instagram.com/utd_club_name/...
 * Returns the handle without the @ prefix.
 */
const extractInstagramHandle = (url) => {
  if (!url) return null;
  const match = url.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  if (match && match[1]) {
    const handle = match[1].toLowerCase();
    // Skip generic Instagram pages
    const ignore = ['p', 'explore', 'reels', 'stories', 'accounts', 'directory', 'about'];
    if (ignore.includes(handle)) return null;
    return handle;
  }
  return null;
};

/**
 * Search via SerpAPI Google Search.
 * Requires env: SERPAPI_KEY
 * Returns array of { handle, url }.
 */
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

/**
 * Search via Google Custom Search Engine API.
 * Requires env: GOOGLE_CSE_API_KEY, GOOGLE_CSE_ID
 * Returns array of { handle, url }.
 */
const searchViaGoogleCSE = async (searchQuery) => {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) return null;

  try {
    const handles = [];
    // Only fetch 1 page (10 results) per query to conserve free tier (100 requests/day)
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        q: searchQuery,
        key: apiKey,
        cx: cseId,
        start: 1,
        num: 10,
      },
      timeout: 15000,
    });

    const items = response.data.items || [];
    for (const item of items) {
      const handle = extractInstagramHandle(item.link);
      if (handle) {
        handles.push({ handle, url: item.link });
      }
    }

    return handles;
  } catch (error) {
    logger.error('Google CSE search error:', error.message);
    return null;
  }
};

/**
 * Discover Instagram accounts of UTD student orgs via Google dorking.
 *
 * Tries SerpAPI first, then falls back to Google Custom Search.
 * Inserts newly discovered handles into discovered_accounts with status='pending'.
 * Handles deduplication via the UNIQUE constraint on discovered_accounts.handle.
 *
 * @returns {{ discovered: number, duplicates: number, errors: number }}
 */
const discoverClubsViaGoogle = async () => {
  logger.info('Starting club discovery via Google dorking');

  let discovered = 0;
  let duplicates = 0;
  let errors = 0;

  for (const searchQuery of SEARCH_QUERIES) {
    let results = await searchViaSerpAPI(searchQuery);

    if (results === null) {
      logger.info('SerpAPI not available, falling back to Google CSE');
      results = await searchViaGoogleCSE(searchQuery);
    }

    if (results === null) {
      logger.warn('No search API configured for club discovery. Set SERPAPI_KEY or GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID.');
      continue;
    }

    for (const { handle, url } of results) {
      try {
        await query(
          `INSERT INTO discovered_accounts (handle, url, status)
           VALUES ($1, $2, 'pending')
           ON CONFLICT (handle) DO NOTHING`,
          [handle, url]
        );

        // Check if the insert actually happened (rowCount = 1 means new row)
        const checkResult = await query(
          'SELECT id FROM discovered_accounts WHERE handle = $1',
          [handle]
        );
        if (checkResult.rows.length > 0) {
          discovered++;
        }
      } catch (error) {
        if (error.code === '23505') {
          // Unique violation — already exists
          duplicates++;
        } else {
          logger.error(`Error inserting discovered account ${handle}:`, error.message);
          errors++;
        }
      }
    }
  }

  logger.info(`Club discovery complete: ${discovered} discovered, ${duplicates} duplicates, ${errors} errors`);
  return { discovered, duplicates, errors };
};

/**
 * Classify an Instagram account using Claude LLM.
 *
 * Sends the handle + bio to Claude and asks whether it is a UTD student org,
 * its category, and a confidence score.
 *
 * @param {string} handle - Instagram handle
 * @param {string} bio - Instagram bio text (may be null)
 * @returns {{ is_utd_org: boolean, category: string, confidence: number }}
 */
const classifyAccount = async (handle, bio) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('ANTHROPIC_API_KEY not configured, skipping LLM classification');
    return { is_utd_org: false, category: 'other', confidence: 0 };
  }

  try {
    const prompt = `Given this Instagram bio and username, determine:
(1) Is this a UT Dallas student organization?
(2) What category? (academic, social, cultural, sports, professional, religious, arts, greek_life, other)
(3) Confidence score 0-1.
Respond in JSON with keys: is_utd_org (boolean), category (string), confidence (number).

Username: @${handle}
Bio: ${bio || '(no bio available)'}

Respond with ONLY valid JSON, no markdown formatting or backticks.`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [
          { role: 'user', content: prompt },
        ],
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
      return { is_utd_org: false, category: 'other', confidence: 0 };
    }

    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const parsed = JSON.parse(jsonText);
    return {
      is_utd_org: Boolean(parsed.is_utd_org),
      category: parsed.category || 'other',
      confidence: Number(parsed.confidence) || 0,
    };
  } catch (error) {
    logger.error(`LLM classification error for @${handle}:`, error.message);
    return { is_utd_org: false, category: 'other', confidence: 0 };
  }
};

/**
 * Promote a discovered_account to the clubs table.
 *
 * Sets the discovered account's status to 'promoted' and creates a new
 * club entry with discovery_source='google_dork'.
 *
 * @param {string} accountId - UUID of the discovered_account row
 * @returns {object|null} The newly created club row, or null on failure
 */
const promoteAccount = async (accountId) => {
  try {
    // Fetch the discovered account
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

    // Check if a club with this handle already exists
    const existingClub = await query(
      'SELECT id FROM clubs WHERE instagram_handle = $1',
      [account.handle]
    );

    if (existingClub.rows.length > 0) {
      logger.info(`Club with handle @${account.handle} already exists, skipping promotion`);
      // Still mark as promoted
      await query(
        "UPDATE discovered_accounts SET status = 'promoted' WHERE id = $1",
        [accountId]
      );
      return existingClub.rows[0];
    }

    // Insert into clubs table
    const clubResult = await query(
      `INSERT INTO clubs (name, category, instagram_handle, bio, llm_confidence, discovery_source)
       VALUES ($1, $2, $3, $4, $5, 'google_dork')
       RETURNING *`,
      [
        account.handle, // Use handle as name initially
        classification.category || 'other',
        account.handle,
        account.bio,
        classification.confidence || 0,
      ]
    );

    // Mark the discovered account as promoted
    await query(
      "UPDATE discovered_accounts SET status = 'promoted' WHERE id = $1",
      [accountId]
    );

    logger.info(`Promoted discovered account @${account.handle} to clubs table`);
    return clubResult.rows[0];
  } catch (error) {
    logger.error(`Error promoting account ${accountId}:`, error.message);
    return null;
  }
};

/**
 * Classify all pending discovered accounts with Claude LLM.
 *
 * Gets all discovered_accounts with status='pending', classifies each one,
 * updates llm_classification, and auto-promotes accounts that Claude
 * identifies as UTD orgs with confidence > 0.5.
 *
 * @returns {{ classified: number, promoted: number, rejected: number, errors: number }}
 */
const classifyPendingAccounts = async () => {
  const batchLimit = parseInt(process.env.CLASSIFY_BATCH_LIMIT, 10) || 20;
  logger.info(`Starting classification of pending discovered accounts (batch limit: ${batchLimit})`);

  let classified = 0;
  let promoted = 0;
  let rejected = 0;
  let errors = 0;

  try {
    const result = await query(
      "SELECT * FROM discovered_accounts WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1",
      [batchLimit]
    );

    logger.info(`Classifying ${result.rows.length} accounts in parallel`);

    // Classify all accounts in parallel
    const classifyResults = await Promise.allSettled(
      result.rows.map(async (account) => {
        const classification = await classifyAccount(account.handle, account.bio);
        return { account, classification };
      })
    );

    // Process results sequentially (DB writes)
    for (const res of classifyResults) {
      if (res.status !== 'fulfilled') {
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

        if (classification.is_utd_org && classification.confidence > 0.5) {
          await promoteAccount(account.id);
          promoted++;
        } else {
          rejected++;
        }
      } catch (error) {
        logger.error(`Error saving classification for @${account.handle}:`, error.message);
        errors++;
      }
    }
  } catch (error) {
    logger.error('Error fetching pending accounts for classification:', error.message);
    return { classified: 0, promoted: 0, rejected: 0, errors: 1 };
  }

  logger.info(`Classification complete: ${classified} classified, ${promoted} promoted, ${rejected} rejected, ${errors} errors`);
  return { classified, promoted, rejected, errors };
};

/**
 * Import clubs from UTD's official student org directory.
 *
 * Takes an array of { name, instagram_handle } and inserts or updates
 * clubs with in_official_directory=true.
 *
 * @param {Array<{ name: string, instagram_handle: string }>} accounts
 * @returns {{ imported: number, updated: number, errors: number }}
 */
const importFromDirectory = async (accounts) => {
  logger.info(`Importing ${accounts.length} accounts from UTD official directory`);

  let imported = 0;
  let updated = 0;
  let errors = 0;

  for (const account of accounts) {
    try {
      const handle = account.instagram_handle
        ? account.instagram_handle.replace('@', '').toLowerCase()
        : null;

      // Try to update existing club first (match by instagram_handle)
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
              updated_at = NOW()
            WHERE instagram_handle = $2`,
            [account.name, handle]
          );
          updated++;
          continue;
        }
      }

      // Insert new club from directory
      await query(
        `INSERT INTO clubs (name, instagram_handle, in_official_directory, discovery_source)
         VALUES ($1, $2, true, 'official_directory')
         ON CONFLICT (instagram_handle) DO UPDATE SET
           name = COALESCE(EXCLUDED.name, clubs.name),
           in_official_directory = true,
           updated_at = NOW()`,
        [account.name, handle]
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

module.exports = {
  discoverClubsViaGoogle,
  classifyAccount,
  promoteAccount,
  classifyPendingAccounts,
  importFromDirectory,
};

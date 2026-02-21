const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk').default;
const logger = require('../utils/logger');

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_API_URL = 'https://api.linkedin.com/v2';

let anthropicClient;
const getAnthropicClient = () => {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
};

/**
 * Generate LinkedIn OAuth authorization URL
 */
const getAuthUrl = (state) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    state,
    scope: 'openid profile email',
  });

  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
};

/**
 * Exchange authorization code for access token
 */
const exchangeCodeForToken = async (code) => {
  try {
    const response = await axios.post(
      LINKEDIN_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    return {
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in,
    };
  } catch (error) {
    logger.error('LinkedIn token exchange failed:', error.response?.data || error.message);
    throw new Error('Failed to exchange LinkedIn authorization code');
  }
};

/**
 * Fetch LinkedIn profile using access token
 */
const getProfile = async (accessToken) => {
  try {
    const response = await axios.get(`${LINKEDIN_API_URL}/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = response.data;

    return {
      linkedinId: data.sub,
      firstName: data.given_name,
      lastName: data.family_name,
      fullName: data.name,
      email: data.email,
      avatarUrl: data.picture,
    };
  } catch (error) {
    logger.error('LinkedIn profile fetch failed:', error.response?.data || error.message);
    throw new Error('Failed to fetch LinkedIn profile');
  }
};

/**
 * Extract meta and Open Graph tags from HTML using regex.
 * LinkedIn public profiles embed useful data in these tags.
 */
const parseMetaTags = (html) => {
  const tags = {};

  // Extract <title> content
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) tags.title = titleMatch[1].trim();

  // Extract meta tags (name, property, content)
  const metaRegex = /<meta\s+(?:[^>]*?\s+)?(?:name|property)\s*=\s*["']([^"']+)["'][^>]*?\s+content\s*=\s*["']([^"']*)["'][^>]*\/?>/gi;
  const metaRegex2 = /<meta\s+(?:[^>]*?\s+)?content\s*=\s*["']([^"']*)["'][^>]*?\s+(?:name|property)\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;

  let match;
  while ((match = metaRegex.exec(html)) !== null) {
    tags[match[1]] = match[2];
  }
  while ((match = metaRegex2.exec(html)) !== null) {
    tags[match[2]] = match[1];
  }

  return tags;
};

/**
 * LinkedIn profile extraction prompt for Claude
 */
const LINKEDIN_EXTRACTION_PROMPT = `You are a contact information extractor. Given metadata scraped from a LinkedIn public profile page, extract structured contact information.

Return ONLY valid JSON with these fields:
{
  "full_name": string | null,
  "headline": string | null,
  "company": string | null,
  "job_title": string | null,
  "school": string | null,
  "location": string | null,
  "summary": string | null
}

RULES:
1. Parse the title format "First Last - Title at Company | LinkedIn" to extract name, title, and company.
2. Parse the description for education, experience, and other details.
3. If the headline contains "Student at [School]", extract the school name.
4. Normalize school names (e.g., "UT Dallas" -> "University of Texas at Dallas").
5. Separate job_title from company if combined in the headline (e.g., "Software Engineer at Google" -> job_title: "Software Engineer", company: "Google").
6. If the person appears to be a student, set job_title to "Student" and company to null.
7. Return ONLY the JSON object, no markdown fences, no explanation.`;

/**
 * Attempt to fetch a LinkedIn profile page.
 * Tries multiple strategies because LinkedIn aggressively blocks server-side
 * fetches (returning 999 status with an auth wall for most profiles).
 *
 * Strategy order:
 *   1. Direct fetch with browser-like headers
 *   2. If 999/authwall, try with `validateStatus` to still capture any HTML
 *   3. Extract whatever meta tags are available (even auth-wall pages
 *      sometimes include og:title/og:description for SEO crawlers)
 */
const fetchLinkedInHtml = async (normalizedUrl, vanityName) => {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
  };

  // Strategy 1: Direct fetch (works for high-profile/influencer pages)
  try {
    const response = await axios.get(normalizedUrl, {
      headers,
      timeout: 12000,
      maxRedirects: 5,
      validateStatus: () => true, // Accept ALL status codes so we can inspect 999 responses
    });

    const isAuthWall = response.status === 999 || response.data?.includes('authwall');
    const html = response.data || '';

    if (!isAuthWall && response.status >= 200 && response.status < 400) {
      logger.info(`LinkedIn direct fetch succeeded for ${vanityName} (status ${response.status})`);
      return { html, blocked: false };
    }

    // Even auth-wall pages sometimes contain og: tags in the HTML
    if (html.length > 500) {
      const tags = parseMetaTags(html);
      if (tags.title || tags['og:title'] || tags['og:description']) {
        logger.info(`LinkedIn auth-walled but found meta tags for ${vanityName}`);
        return { html, blocked: true, partialMeta: true };
      }
    }

    logger.warn(`LinkedIn auth-walled with no useful meta for ${vanityName} (status ${response.status})`);
    return { html: '', blocked: true, partialMeta: false };
  } catch (fetchError) {
    logger.warn(`LinkedIn fetch error for ${vanityName}: ${fetchError.message}`);
    return { html: '', blocked: true, partialMeta: false };
  }
};

/**
 * Parse the vanity name itself to guess a likely name.
 * LinkedIn vanity URLs are often first-last or firstlast format.
 * Examples: "john-doe" -> "John Doe", "sarahchen99" -> "Sarahchen99" (uncertain)
 */
const guessNameFromVanity = (vanityName) => {
  // Strip trailing digits (e.g., "john-doe-123" -> "john-doe")
  const cleaned = vanityName.replace(/-?\d+$/, '');

  if (cleaned.includes('-')) {
    // "john-doe" -> "John Doe"
    return cleaned
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  // Can't reliably split "johndoe" without dictionary, return null
  return null;
};

/**
 * Fetch and extract contact data from a LinkedIn profile URL.
 * Fetches the public profile page, parses meta/OG tags, and uses
 * Claude to structure the available data into contact fields.
 *
 * For profiles behind LinkedIn's auth wall (status 999), we:
 *   - Try to extract og: meta tags (sometimes present even on blocked pages)
 *   - Fall back to parsing the vanity name for a name guess
 *   - Always save the LinkedIn URL for manual reference
 */
const fetchProfileByUrl = async (linkedinUrl) => {
  const startTime = Date.now();

  // Validate URL format
  const urlMatch = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!urlMatch) {
    throw new Error('Invalid LinkedIn profile URL. Expected format: linkedin.com/in/username');
  }

  const vanityName = urlMatch[1];
  const normalizedUrl = `https://www.linkedin.com/in/${vanityName}`;
  logger.info(`LinkedIn lookup: starting profile fetch for ${vanityName}`);

  // Step 1: Fetch the page
  const { html, blocked, partialMeta } = await fetchLinkedInHtml(normalizedUrl, vanityName);

  // Step 2: Parse whatever meta tags we have
  const metaTags = html ? parseMetaTags(html) : {};

  // Build a text summary from available meta tags
  const availableText = [
    metaTags.title && `Title: ${metaTags.title}`,
    metaTags['og:title'] && `OG Title: ${metaTags['og:title']}`,
    metaTags.description && `Description: ${metaTags.description}`,
    metaTags['og:description'] && `OG Description: ${metaTags['og:description']}`,
    metaTags['og:image'] && `Profile Image URL: ${metaTags['og:image']}`,
  ]
    .filter(Boolean)
    .join('\n');

  // Step 3: If we have any text, use Claude to extract structured data
  if (availableText) {
    try {
      const client = getAnthropicClient();

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: `Extract contact information from this LinkedIn profile metadata:\n\n${availableText}`,
          },
        ],
        system: LINKEDIN_EXTRACTION_PROMPT,
        temperature: 0.1,
      });

      const content = response.content[0]?.text;
      if (!content) throw new Error('No content from Claude');

      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const extracted = JSON.parse(jsonStr);
      const processingTime = Date.now() - startTime;

      // Count how many non-null fields were extracted
      const extractedFields = [
        extracted.full_name,
        extracted.company,
        extracted.job_title,
        extracted.school,
        extracted.location,
      ].filter(Boolean).length;

      // If we got the name + at least 1 other field, consider it a success
      const isPartial = !extracted.full_name || extractedFields < 2;

      logger.info(
        `LinkedIn profile extracted in ${processingTime}ms for ${vanityName} (${extractedFields} fields, ${isPartial ? 'partial' : 'full'}, blocked: ${blocked})`,
      );

      return {
        linkedinUrl: normalizedUrl,
        vanityName,
        avatarUrl: metaTags['og:image'] || null,
        contactData: {
          full_name: extracted.full_name,
          professional: {
            company: extracted.company,
            job_title: extracted.job_title,
            school: extracted.school,
          },
          location: extracted.location,
          headline: extracted.headline,
          summary: extracted.summary,
        },
        partial: isPartial,
        processingTimeMs: processingTime,
        ...(blocked && { note: 'Profile data extracted from limited public metadata.' }),
      };
    } catch (extractError) {
      logger.error(`LinkedIn Claude extraction failed for ${vanityName}:`, extractError.message);
      // Fall through to fallback below
    }
  }

  // Step 4: Fallback — try to get name from title tag or vanity name
  const processingTime = Date.now() - startTime;

  // Try title-based extraction: "First Last - Title at Company | LinkedIn"
  const titleParts = metaTags.title?.replace(/\s*\|\s*LinkedIn\s*$/, '').split(' - ');
  const titleName = titleParts?.[0]?.trim() || null;
  const titleHeadline = titleParts?.[1]?.trim() || null;

  // Try vanity name guess
  const guessedName = guessNameFromVanity(vanityName);

  const fallbackName = titleName || guessedName;

  // Parse headline into company/title if possible
  let fallbackCompany = null;
  let fallbackJobTitle = null;
  if (titleHeadline) {
    const atMatch = titleHeadline.match(/^(.+?)\s+at\s+(.+)$/i);
    if (atMatch) {
      fallbackJobTitle = atMatch[1].trim();
      fallbackCompany = atMatch[2].trim();
    }
  }

  if (fallbackName) {
    return {
      linkedinUrl: normalizedUrl,
      vanityName,
      avatarUrl: metaTags['og:image'] || null,
      contactData: {
        full_name: fallbackName,
        professional: {
          company: fallbackCompany,
          job_title: fallbackJobTitle,
        },
        headline: titleHeadline,
      },
      partial: true,
      processingTimeMs: processingTime,
      note: blocked
        ? 'LinkedIn restricted access to this profile. Basic info extracted from available data.'
        : 'Limited profile data available. You can fill in remaining fields manually.',
    };
  }

  // Step 5: Absolute fallback — no data at all, just save the URL
  return {
    linkedinUrl: normalizedUrl,
    vanityName,
    contactData: null,
    partial: true,
    processingTimeMs: processingTime,
    note: 'LinkedIn restricted access to this profile. The URL has been saved — tap the LinkedIn field to open it in your browser and fill in details manually.',
  };
};

module.exports = { getAuthUrl, exchangeCodeForToken, getProfile, fetchProfileByUrl };

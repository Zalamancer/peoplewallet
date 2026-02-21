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
 * Fetch and extract contact data from a LinkedIn profile URL.
 * Fetches the public profile page, parses meta/OG tags, and uses
 * Claude to structure the available data into contact fields.
 */
const fetchProfileByUrl = async (linkedinUrl) => {
  const startTime = Date.now();

  // Validate URL format
  const urlMatch = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!urlMatch) {
    throw new Error('Invalid LinkedIn profile URL. Expected format: linkedin.com/in/username');
  }

  const vanityName = urlMatch[1];

  // Normalize the URL
  const normalizedUrl = `https://www.linkedin.com/in/${vanityName}`;
  logger.info(`LinkedIn lookup: fetching public profile for ${vanityName}`);

  let metaTags;
  try {
    const response = await axios.get(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
      maxRedirects: 3,
    });

    metaTags = parseMetaTags(response.data);
  } catch (fetchError) {
    logger.warn(`LinkedIn page fetch failed for ${vanityName}: ${fetchError.message}`);
    // Return minimal data if fetch fails (e.g., LinkedIn blocks the request)
    return {
      linkedinUrl: normalizedUrl,
      vanityName,
      contactData: null,
      partial: true,
      note: 'Could not fetch LinkedIn profile page. The URL has been saved — you can fill in details manually.',
    };
  }

  // Build a text summary from the available meta tags for Claude to parse
  const availableText = [
    metaTags.title && `Title: ${metaTags.title}`,
    metaTags['og:title'] && `OG Title: ${metaTags['og:title']}`,
    metaTags.description && `Description: ${metaTags.description}`,
    metaTags['og:description'] && `OG Description: ${metaTags['og:description']}`,
    metaTags['og:image'] && `Profile Image URL: ${metaTags['og:image']}`,
  ]
    .filter(Boolean)
    .join('\n');

  if (!availableText) {
    logger.warn(`No useful meta tags found for ${vanityName}`);
    return {
      linkedinUrl: normalizedUrl,
      vanityName,
      contactData: null,
      partial: true,
      note: 'LinkedIn profile page did not contain extractable data. The URL has been saved.',
    };
  }

  // Use Claude to extract structured data from the meta text
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

    logger.info(`LinkedIn profile extracted in ${processingTime}ms for ${vanityName}`, {
      hasName: !!extracted.full_name,
      hasCompany: !!extracted.company,
      hasSchool: !!extracted.school,
    });

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
      partial: false,
      processingTimeMs: processingTime,
    };
  } catch (extractError) {
    logger.error(`LinkedIn Claude extraction failed for ${vanityName}:`, extractError.message);

    // Fall back to basic regex parsing of the title tag
    const titleParts = metaTags.title?.replace(/\s*\|\s*LinkedIn\s*$/, '').split(' - ');
    const fallbackName = titleParts?.[0]?.trim() || null;
    const fallbackHeadline = titleParts?.[1]?.trim() || null;

    return {
      linkedinUrl: normalizedUrl,
      vanityName,
      avatarUrl: metaTags['og:image'] || null,
      contactData: fallbackName
        ? {
            full_name: fallbackName,
            professional: {},
            headline: fallbackHeadline,
          }
        : null,
      partial: true,
      note: 'AI extraction unavailable — basic profile data extracted from page title.',
    };
  }
};

module.exports = { getAuthUrl, exchangeCodeForToken, getProfile, fetchProfileByUrl };

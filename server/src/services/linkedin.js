const axios = require('axios');
const logger = require('../utils/logger');

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_API_URL = 'https://api.linkedin.com/v2';

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
 * Fetch public profile data from LinkedIn URL
 * Note: This uses the authorized user's access token to look up profile data
 * Only works with LinkedIn's official API - no scraping
 */
const fetchProfileByUrl = async (linkedinUrl, accessToken) => {
  try {
    // Extract the vanity name from the LinkedIn URL
    const urlMatch = linkedinUrl.match(/linkedin\.com\/in\/([^/?]+)/);
    if (!urlMatch) {
      throw new Error('Invalid LinkedIn profile URL');
    }

    // LinkedIn's API doesn't support direct vanity URL lookup for other profiles
    // This would require the Contact Search API which needs special partnership access
    // For MVP, we return the URL and let the user manually verify
    logger.info(`LinkedIn URL parsed: ${urlMatch[1]}`);

    return {
      linkedinUrl: linkedinUrl,
      vanityName: urlMatch[1],
      note: 'Full auto-fill requires LinkedIn Marketing API partnership. URL stored for reference.',
    };
  } catch (error) {
    logger.error('LinkedIn URL profile fetch failed:', error.message);
    throw new Error(`Failed to fetch LinkedIn profile: ${error.message}`);
  }
};

module.exports = { getAuthUrl, exchangeCodeForToken, getProfile, fetchProfileByUrl };

const express = require('express');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const linkedinService = require('../services/linkedin');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user with email (Firebase handles the actual auth)
 */
router.post('/register', async (req, res) => {
  try {
    const { email, name, firebase_uid } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingQuery = firebase_uid
      ? 'SELECT id FROM users WHERE LOWER(email) = $1 OR firebase_uid = $2'
      : 'SELECT id FROM users WHERE LOWER(email) = $1';
    const existingParams = firebase_uid
      ? [normalizedEmail, firebase_uid]
      : [normalizedEmail];
    const existing = await query(existingQuery, existingParams);

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const result = await query(
      'INSERT INTO users (email, name, firebase_uid) VALUES ($1, $2, $3) RETURNING id, email, name, subscription_tier, created_at',
      [normalizedEmail, name || normalizedEmail.split('@')[0], firebase_uid]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    logger.info(`New user registered: ${user.id}`);

    res.status(201).json({
      user,
      token,
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Login with Firebase token and get a JWT
 */
router.post('/login', async (req, res) => {
  try {
    const { firebase_uid, email, name } = req.body;

    if (!firebase_uid && !email) {
      return res.status(400).json({ error: 'Firebase UID or email is required' });
    }

    let user;

    if (firebase_uid) {
      const result = await query(
        'SELECT id, email, name, subscription_tier, created_at FROM users WHERE firebase_uid = $1',
        [firebase_uid]
      );
      user = result.rows[0];

      // Auto-create user if not found
      if (!user) {
        const newUser = await query(
          'INSERT INTO users (email, name, firebase_uid) VALUES ($1, $2, $3) RETURNING id, email, name, subscription_tier, created_at',
          [email, name || email?.split('@')[0], firebase_uid]
        );
        user = newUser.rows[0];
        logger.info(`Auto-created user from Firebase login: ${user.id}`);
      }
    } else {
      // Look up by email (case-insensitive)
      const result = await query(
        'SELECT id, email, name, subscription_tier, created_at FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );
      user = result.rows[0];
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found. Please sign up first.' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.json({ user, token });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, name, avatar_url, subscription_tier, linkedin_id, created_at, updated_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get contact count
    const countResult = await query('SELECT COUNT(*) as count FROM contacts WHERE user_id = $1', [
      req.user.id,
    ]);

    res.json({
      ...result.rows[0],
      contactCount: parseInt(countResult.rows[0].count, 10),
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * PUT /api/auth/me
 * Update user profile
 */
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name, avatar_url } = req.body;

    const result = await query(
      'UPDATE users SET name = COALESCE($1, name), avatar_url = COALESCE($2, avatar_url) WHERE id = $3 RETURNING id, email, name, avatar_url, subscription_tier',
      [name, avatar_url, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * GET /api/auth/linkedin
 * Initiate LinkedIn OAuth flow
 * Accepts optional ?returnUrl= for mobile app redirect after auth
 */
router.get('/linkedin', (req, res) => {
  const { returnUrl } = req.query;
  // Encode the returnUrl in the state so we can use it in the callback
  const state = Buffer.from(JSON.stringify({ ts: Date.now(), returnUrl: returnUrl || '' })).toString('base64');
  const authUrl = linkedinService.getAuthUrl(state);
  res.json({ authUrl, state });
});

/**
 * GET /api/auth/linkedin/callback
 * Handle LinkedIn OAuth callback
 */
router.get('/linkedin/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Exchange code for token
    const { accessToken } = await linkedinService.exchangeCodeForToken(code);

    // Fetch LinkedIn profile
    const profile = await linkedinService.getProfile(accessToken);

    // Find or create user
    let userResult = await query('SELECT id FROM users WHERE linkedin_id = $1', [
      profile.linkedinId,
    ]);

    let userId;
    if (userResult.rows.length === 0) {
      // Check by email
      userResult = await query('SELECT id FROM users WHERE email = $1', [profile.email]);

      if (userResult.rows.length > 0) {
        // Link LinkedIn to existing account
        userId = userResult.rows[0].id;
        await query(
          'UPDATE users SET linkedin_id = $1, linkedin_access_token = $2, avatar_url = COALESCE(avatar_url, $3) WHERE id = $4',
          [profile.linkedinId, accessToken, profile.avatarUrl, userId]
        );
      } else {
        // Create new user
        const newUser = await query(
          'INSERT INTO users (email, name, linkedin_id, linkedin_access_token, avatar_url) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [profile.email, profile.fullName, profile.linkedinId, accessToken, profile.avatarUrl]
        );
        userId = newUser.rows[0].id;
      }
    } else {
      userId = userResult.rows[0].id;
      await query('UPDATE users SET linkedin_access_token = $1 WHERE id = $2', [
        accessToken,
        userId,
      ]);
    }

    // Generate JWT
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    // Parse the returnUrl from state (sent by mobile app)
    let returnUrl = '';
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      returnUrl = stateData.returnUrl || '';
    } catch (e) {
      // state parse failed, no returnUrl
    }

    if (returnUrl) {
      // Mobile flow: redirect back to the returnUrl with token in query params
      // expo-web-browser's openAuthSessionAsync will catch this redirect
      const separator = returnUrl.includes('?') ? '&' : '?';
      const redirectTo = `${returnUrl}${separator}token=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}&name=${encodeURIComponent(profile.fullName || '')}&email=${encodeURIComponent(profile.email || '')}`;
      return res.redirect(redirectTo);
    }

    // Web/fallback flow: return JSON
    res.json({
      token,
      user: { id: userId, ...profile },
    });
  } catch (error) {
    logger.error('LinkedIn callback error:', error);
    res.status(500).json({ error: 'LinkedIn authentication failed' });
  }
});

module.exports = router;

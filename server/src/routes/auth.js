const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, getClient } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const linkedinService = require('../services/linkedin');
const { sendVerificationCode } = require('../services/email');
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
 * POST /api/auth/send-verification
 * Send a 6-digit verification code to a .edu email
 */
router.post('/send-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Validate .edu domain
    if (!normalizedEmail.endsWith('.edu')) {
      return res.status(400).json({ error: 'Only .edu email addresses are accepted' });
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();

    // Delete any existing codes for this email
    await query('DELETE FROM email_verifications WHERE email = $1', [normalizedEmail]);

    // Insert new code with 10-minute expiry
    await query(
      'INSERT INTO email_verifications (email, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'10 minutes\')',
      [normalizedEmail, code]
    );

    // Send email (non-fatal in dev if Resend isn't configured for external recipients)
    try {
      await sendVerificationCode(normalizedEmail, code);
    } catch (emailErr) {
      logger.warn('Email send failed, code still saved:', emailErr.message);
    }

    // In dev, return the code so the app can display it
    const response = { message: 'Code sent' };
    if (process.env.NODE_ENV !== 'production') {
      response.devCode = code;
    }
    res.json(response);
  } catch (error) {
    logger.error('Send verification error:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

/**
 * POST /api/auth/verify-email
 * Verify a .edu email code. Creates account (signup) or links school (existing user).
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code, name } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Look up latest non-expired, non-verified code
    const verResult = await query(
      `SELECT id FROM email_verifications
       WHERE email = $1 AND code = $2 AND verified = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail, code]
    );

    if (verResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // Mark as verified
    await query('UPDATE email_verifications SET verified = TRUE WHERE id = $1', [verResult.rows[0].id]);

    // Find or create school from email domain
    const domain = normalizedEmail.split('@')[1]; // e.g. "utdallas.edu"
    let schoolResult = await query('SELECT id, name FROM schools WHERE domain = $1', [domain]);

    if (schoolResult.rows.length === 0) {
      // Auto-create school
      schoolResult = await query(
        'INSERT INTO schools (name, domain) VALUES ($1, $2) RETURNING id, name',
        [domain, domain]
      );
    }
    const school = schoolResult.rows[0];

    // Check if there's an authenticated user (existing user linking their school)
    const authHeader = req.headers.authorization;
    let tokenUserId = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        tokenUserId = decoded.userId;
      } catch (e) {
        // Invalid token — treat as new signup
      }
    }

    if (tokenUserId) {
      // Existing user: link school
      const updateResult = await query(
        `UPDATE users SET school_id = $1, school_email = $2, school_email_verified = TRUE
         WHERE id = $3
         RETURNING id, email, name, school_id, school_email, school_email_verified, subscription_tier`,
        [school.id, normalizedEmail, tokenUserId]
      );

      return res.json({ user: updateResult.rows[0], school });
    }

    // New signup: check if user already exists with this email
    const existingUser = await query(
      'SELECT id FROM users WHERE LOWER(email) = $1 OR LOWER(school_email) = $1',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in and verify your school email from Settings.' });
    }

    // Create new user
    const userResult = await query(
      `INSERT INTO users (email, name, school_id, school_email, school_email_verified, subscription_tier)
       VALUES ($1, $2, $3, $4, TRUE, 'student')
       RETURNING id, email, name, school_id, school_email, school_email_verified, subscription_tier, created_at`,
      [normalizedEmail, name || normalizedEmail.split('@')[0], school.id, normalizedEmail]
    );

    const user = userResult.rows[0];

    // Generate JWT
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    logger.info(`New user registered via school email verification: ${user.id}`);

    res.status(201).json({ user, token, school });
  } catch (error) {
    logger.error('Verify email error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile with professional info, social links, bio, and profile_visibility
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const [userResult, countResult, professionalResult, socialResult, appearanceResult] = await Promise.all([
      query(
        'SELECT id, email, name, nickname, pronouns, avatar_url, bio, location, profile_visibility, subscription_tier, linkedin_id, school_id, school_email, school_email_verified, created_at, updated_at FROM users WHERE id = $1',
        [req.user.id]
      ),
      query('SELECT COUNT(*) as count FROM contacts WHERE user_id = $1', [req.user.id]),
      query('SELECT job_title, company, department, school, major, graduation_year FROM user_professional WHERE user_id = $1', [req.user.id]),
      query('SELECT platform, handle, url FROM user_social WHERE user_id = $1', [req.user.id]),
      query('SELECT height_range, hair_color, glasses, distinguishing_features FROM user_appearance WHERE user_id = $1', [req.user.id]),
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userResult.rows[0];

    // Fetch school name if linked
    let schoolData = null;
    if (userData.school_id) {
      const schoolResult = await query('SELECT id, name, domain FROM schools WHERE id = $1', [userData.school_id]);
      schoolData = schoolResult.rows[0] || null;
    }

    res.json({
      ...userData,
      contactCount: parseInt(countResult.rows[0].count, 10),
      professional: professionalResult.rows[0] || null,
      social: socialResult.rows,
      appearance: appearanceResult.rows[0] || null,
      school: schoolData,
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * PUT /api/auth/me
 * Update user profile including professional info, social links, bio, and profile_visibility
 */
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name, nickname, pronouns, avatar_url, bio, location, profile_visibility, professional, social, appearance } = req.body;

    // Update core user fields
    const result = await query(
      `UPDATE users SET
        name = COALESCE($1, name),
        nickname = COALESCE($2, nickname),
        pronouns = COALESCE($3, pronouns),
        avatar_url = COALESCE($4, avatar_url),
        bio = COALESCE($5, bio),
        location = COALESCE($6, location),
        profile_visibility = COALESCE($7, profile_visibility)
      WHERE id = $8
      RETURNING id, email, name, nickname, pronouns, avatar_url, bio, location, profile_visibility, subscription_tier`,
      [name, nickname, pronouns, avatar_url, bio, location, profile_visibility, req.user.id]
    );

    // Upsert professional info
    if (professional) {
      await query(
        `INSERT INTO user_professional (user_id, job_title, company, department, school, major, graduation_year)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET
           job_title = COALESCE(EXCLUDED.job_title, user_professional.job_title),
           company = COALESCE(EXCLUDED.company, user_professional.company),
           department = COALESCE(EXCLUDED.department, user_professional.department),
           school = COALESCE(EXCLUDED.school, user_professional.school),
           major = COALESCE(EXCLUDED.major, user_professional.major),
           graduation_year = COALESCE(EXCLUDED.graduation_year, user_professional.graduation_year)`,
        [
          req.user.id,
          professional.job_title,
          professional.company,
          professional.department,
          professional.school,
          professional.major,
          professional.graduation_year,
        ]
      );
    }

    // Replace social links (delete + insert, same pattern as contact social updates)
    if (social) {
      await query('DELETE FROM user_social WHERE user_id = $1', [req.user.id]);
      for (const s of social) {
        if (s.platform && (s.handle || s.url)) {
          await query(
            'INSERT INTO user_social (user_id, platform, handle, url) VALUES ($1, $2, $3, $4)',
            [req.user.id, s.platform, s.handle, s.url]
          );
        }
      }
    }

    // Upsert appearance
    if (appearance) {
      await query(
        `INSERT INTO user_appearance (user_id, height_range, hair_color, glasses, distinguishing_features)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           height_range = COALESCE(EXCLUDED.height_range, user_appearance.height_range),
           hair_color = COALESCE(EXCLUDED.hair_color, user_appearance.hair_color),
           glasses = COALESCE(EXCLUDED.glasses, user_appearance.glasses),
           distinguishing_features = COALESCE(EXCLUDED.distinguishing_features, user_appearance.distinguishing_features)`,
        [
          req.user.id,
          appearance.height_range || null,
          appearance.hair_color || null,
          appearance.glasses || false,
          appearance.distinguishing_features || [],
        ]
      );
    }

    // Fetch updated professional, social, and appearance to return
    const [professionalResult, socialResult, appearanceResult] = await Promise.all([
      query('SELECT job_title, company, department, school, major, graduation_year FROM user_professional WHERE user_id = $1', [req.user.id]),
      query('SELECT platform, handle, url FROM user_social WHERE user_id = $1', [req.user.id]),
      query('SELECT height_range, hair_color, glasses, distinguishing_features FROM user_appearance WHERE user_id = $1', [req.user.id]),
    ]);

    res.json({
      ...result.rows[0],
      professional: professionalResult.rows[0] || null,
      social: socialResult.rows,
      appearance: appearanceResult.rows[0] || null,
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * DELETE /api/auth/me
 * Delete current user's account and all associated data
 */
router.delete('/me', authenticate, async (req, res) => {
  const client = await getClient();
  try {
    const userId = req.user.id;

    await client.query('BEGIN');

    // Tables to delete from — order matters (child tables first)
    // Each entry: [sql, params]. Queries use IF EXISTS via a helper to skip missing tables gracefully.
    const deletions = [
      ['DELETE FROM contact_card_exchanges WHERE sender_id = $1 OR receiver_id = $1', [userId]],
      ['DELETE FROM suggestion_dismissals WHERE user_id = $1 OR suggested_user_id = $1', [userId]],
      ['DELETE FROM co_attendances WHERE user_a_id = $1 OR user_b_id = $1', [userId]],
      ['DELETE FROM user_connections WHERE user_a_id = $1 OR user_b_id = $1', [userId]],
      ['DELETE FROM relationship_scores WHERE user_id = $1', [userId]],
      ['DELETE FROM user_insights WHERE user_id = $1', [userId]],
      ['DELETE FROM messages WHERE sender_id = $1', [userId]],
      ['DELETE FROM conversation_participants WHERE user_id = $1', [userId]],
      ['DELETE FROM rsvps WHERE user_id = $1', [userId]],
      ['DELETE FROM attendances WHERE user_id = $1', [userId]],
      ['DELETE FROM user_event_interactions WHERE user_id = $1', [userId]],
      ['DELETE FROM club_memberships WHERE user_id = $1', [userId]],
      ['DELETE FROM user_club_follows WHERE user_id = $1', [userId]],
      ['DELETE FROM notification_log WHERE user_id = $1', [userId]],
      ['DELETE FROM notification_preferences WHERE user_id = $1', [userId]],
      ['DELETE FROM user_push_tokens WHERE user_id = $1', [userId]],
      ['DELETE FROM transcriptions WHERE user_id = $1', [userId]],
      ['DELETE FROM user_professional WHERE user_id = $1', [userId]],
      ['DELETE FROM user_social WHERE user_id = $1', [userId]],
      ['DELETE FROM user_appearance WHERE user_id = $1', [userId]],
      ['DELETE FROM email_verifications WHERE email = (SELECT email FROM users WHERE id = $1)', [userId]],
      ['DELETE FROM contacts WHERE user_id = $1', [userId]],
      ['DELETE FROM contact_groups WHERE user_id = $1', [userId]],
      ['DELETE FROM events WHERE user_id = $1', [userId]],
      ['DELETE FROM audit_log WHERE user_id = $1', [userId]],
      ['DELETE FROM users WHERE id = $1', [userId]],
    ];

    for (const [sql, params] of deletions) {
      try {
        await client.query(sql, params);
      } catch (err) {
        // Skip "relation does not exist" errors (table not yet created via migration)
        if (err.code === '42P01') {
          logger.warn(`Skipping missing table during account deletion: ${err.message}`);
          continue;
        }
        throw err;
      }
    }

    await client.query('COMMIT');
    logger.info(`User account deleted: ${userId}`);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Account deletion error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/auth/users
 * Search users (for messaging - finding conversation partners)
 */
router.get('/users', authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    const userId = req.user.id;

    let result;
    if (search && search.trim().length >= 1) {
      result = await query(
        `SELECT id, name, email, avatar_url FROM users
         WHERE id != $1 AND (name ILIKE $2 OR email ILIKE $2)
         ORDER BY name LIMIT 50`,
        [userId, `%${search.trim()}%`]
      );
    } else {
      result = await query(
        'SELECT id, name, email, avatar_url FROM users WHERE id != $1 ORDER BY name LIMIT 50',
        [userId]
      );
    }

    res.json({ users: result.rows });
  } catch (error) {
    logger.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

/**
 * GET /api/auth/users/:id/profile
 * Get a user's public profile, respecting profile_visibility settings
 */
router.get('/users/:id/profile', authenticate, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const requesterId = req.user.id;

    const userResult = await query(
      'SELECT id, name, nickname, pronouns, email, avatar_url, bio, location, profile_visibility FROM users WHERE id = $1',
      [targetUserId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];
    const visibility = targetUser.profile_visibility || 'public';

    // Private: only return name + avatar
    if (visibility === 'private' && targetUserId !== requesterId) {
      return res.json({
        id: targetUser.id,
        name: targetUser.name,
        avatar_url: targetUser.avatar_url,
        profile_visibility: 'private',
      });
    }

    // Mutual only: check if requester has a contact linked to this user
    if (visibility === 'mutual_only' && targetUserId !== requesterId) {
      const mutualCheck = await query(
        'SELECT id FROM contacts WHERE user_id = $1 AND linked_user_id = $2 LIMIT 1',
        [requesterId, targetUserId]
      );
      if (mutualCheck.rows.length === 0) {
        return res.json({
          id: targetUser.id,
          name: targetUser.name,
          avatar_url: targetUser.avatar_url,
          profile_visibility: 'mutual_only',
        });
      }
    }

    // Full profile
    const [professionalResult, socialResult, appearanceResult] = await Promise.all([
      query('SELECT job_title, company, department, school, major, graduation_year FROM user_professional WHERE user_id = $1', [targetUserId]),
      query('SELECT platform, handle, url FROM user_social WHERE user_id = $1', [targetUserId]),
      query('SELECT height_range, hair_color, glasses, distinguishing_features FROM user_appearance WHERE user_id = $1', [targetUserId]),
    ]);

    res.json({
      id: targetUser.id,
      name: targetUser.name,
      nickname: targetUser.nickname,
      pronouns: targetUser.pronouns,
      avatar_url: targetUser.avatar_url,
      bio: targetUser.bio,
      location: targetUser.location,
      profile_visibility: visibility,
      professional: professionalResult.rows[0] || null,
      social: socialResult.rows,
      appearance: appearanceResult.rows[0] || null,
    });
  } catch (error) {
    logger.error('Get public profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * GET /api/auth/linkedin
 * Initiate LinkedIn OAuth flow
 * Accepts optional ?returnUrl= for mobile app redirect after auth
 */
router.get('/linkedin', (req, res) => {
  try {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return res.status(500).json({
        error: 'LinkedIn OAuth not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URI in server .env',
      });
    }

    const { returnUrl } = req.query;
    const state = Buffer.from(JSON.stringify({ ts: Date.now(), returnUrl: returnUrl || '' })).toString('base64');
    const authUrl = linkedinService.getAuthUrl(state);
    res.json({ authUrl, state });
  } catch (error) {
    logger.error('LinkedIn auth initiation error:', error.message);
    res.status(500).json({ error: 'Failed to generate LinkedIn auth URL' });
  }
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

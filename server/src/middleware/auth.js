const jwt = require('jsonwebtoken');
const { verifyFirebaseToken } = require('../config/firebase');
const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Authentication middleware
 * Supports both Firebase ID tokens and JWT tokens
 * Header format: Authorization: Bearer <token>
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    const token = authHeader.split(' ')[1];
    let userId;

    // Try Firebase token first
    try {
      const decodedFirebase = await verifyFirebaseToken(token);
      const userResult = await query(
        'SELECT id FROM users WHERE firebase_uid = $1',
        [decodedFirebase.uid]
      );

      if (userResult.rows.length === 0) {
        // Auto-create user on first Firebase auth
        const newUser = await query(
          'INSERT INTO users (email, name, firebase_uid) VALUES ($1, $2, $3) RETURNING id',
          [decodedFirebase.email, decodedFirebase.name || decodedFirebase.email, decodedFirebase.uid]
        );
        userId = newUser.rows[0].id;
      } else {
        userId = userResult.rows[0].id;
      }
    } catch (firebaseError) {
      // Fallback to JWT verification
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.userId;
      } catch (jwtError) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }

    // Fetch full user
    const userResult = await query(
      'SELECT id, email, name, subscription_tier, daily_contact_count, daily_contact_reset_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Rate limit contact creation to 10/day per user
 */
const contactRateLimit = async (req, res, next) => {
  try {
    const user = req.user;
    const now = new Date();
    const resetAt = new Date(user.daily_contact_reset_at);

    // Reset counter if it's a new day
    if (now - resetAt > 24 * 60 * 60 * 1000) {
      await query(
        'UPDATE users SET daily_contact_count = 0, daily_contact_reset_at = NOW() WHERE id = $1',
        [user.id]
      );
      user.daily_contact_count = 0;
    }

    // Unlimited for admin account
    const UNLIMITED_EMAILS = ['duruihsan@gmail.com'];
    if (user.daily_contact_count >= 10 && !UNLIMITED_EMAILS.includes(user.email)) {
      return res.status(429).json({
        error: 'Daily contact creation limit reached (10/day)',
        resetAt: new Date(resetAt.getTime() + 24 * 60 * 60 * 1000),
      });
    }

    next();
  } catch (error) {
    logger.error('Rate limit check error:', error);
    next(error);
  }
};

/**
 * Check if user has pro subscription
 * NOTE: Disabled for beta — all users get AI features during the 75-day sprint.
 * Re-enable by removing the early return below when launching paid tiers.
 */
const requirePro = (req, res, next) => {
  // Beta: allow all users through
  return next();

  // eslint-disable-next-line no-unreachable
  const proTiers = ['pro', 'pro_annual', 'student'];
  if (!proTiers.includes(req.user.subscription_tier)) {
    return res.status(403).json({
      error: 'This feature requires a Pro subscription',
      currentTier: req.user.subscription_tier,
    });
  }
  next();
};

module.exports = { authenticate, contactRateLimit, requirePro };

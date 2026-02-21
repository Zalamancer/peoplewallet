const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Audit logging middleware for GDPR/CCPA compliance
 */
const auditLog = (action, targetType) => {
  return async (req, res, next) => {
    // Store the original json method to intercept response
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      // Log the action after response is sent
      const targetId = req.params.id || req.params.contactId || body?.id;

      query(
        `INSERT INTO audit_log (user_id, action, target_type, target_id, metadata, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user?.id || null,
          action,
          targetType,
          targetId || null,
          JSON.stringify({
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
          }),
          req.ip,
          req.get('User-Agent'),
        ]
      ).catch((err) => {
        logger.error('Audit log failed:', err);
      });

      return originalJson(body);
    };

    next();
  };
};

module.exports = { auditLog };

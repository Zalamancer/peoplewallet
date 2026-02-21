const logger = require('../utils/logger');

/**
 * Analytics service for ProAnimate Connect
 * Server-side event tracking via Mixpanel HTTP API
 *
 * Events tracked:
 * - user_registered, user_logged_in
 * - contact_created, contact_updated, contact_deleted
 * - ai_transcription_completed, ai_extraction_completed
 * - push_notification_sent
 * - event_created
 */

const MIXPANEL_API_URL = 'https://api.mixpanel.com/track';
const MIXPANEL_PEOPLE_URL = 'https://api.mixpanel.com/engage';

const getMixpanelToken = () => process.env.MIXPANEL_TOKEN || null;

/**
 * Track an event in Mixpanel
 */
const trackEvent = async (eventName, userId, properties = {}) => {
  const token = getMixpanelToken();
  if (!token) {
    logger.debug(`Analytics: ${eventName} (Mixpanel not configured)`);
    return;
  }

  const data = {
    event: eventName,
    properties: {
      token,
      distinct_id: userId,
      time: Math.floor(Date.now() / 1000),
      ...properties,
    },
  };

  try {
    await fetch(MIXPANEL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
      body: JSON.stringify([data]),
    });
  } catch (error) {
    logger.error('Mixpanel track error:', error.message);
  }
};

/**
 * Set user profile properties in Mixpanel
 */
const setUserProfile = async (userId, properties) => {
  const token = getMixpanelToken();
  if (!token) return;

  const data = {
    $token: token,
    $distinct_id: userId,
    $set: properties,
  };

  try {
    await fetch(MIXPANEL_PEOPLE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
      body: JSON.stringify([data]),
    });
  } catch (error) {
    logger.error('Mixpanel people error:', error.message);
  }
};

/**
 * Increment a numeric user property
 */
const incrementUserProperty = async (userId, property, amount = 1) => {
  const token = getMixpanelToken();
  if (!token) return;

  const data = {
    $token: token,
    $distinct_id: userId,
    $add: { [property]: amount },
  };

  try {
    await fetch(MIXPANEL_PEOPLE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/plain' },
      body: JSON.stringify([data]),
    });
  } catch (error) {
    logger.error('Mixpanel increment error:', error.message);
  }
};

// Pre-defined event tracking helpers
const events = {
  userRegistered: (userId, { method = 'email' } = {}) =>
    trackEvent('user_registered', userId, { method }),

  userLoggedIn: (userId, { method = 'email' } = {}) =>
    trackEvent('user_logged_in', userId, { method }),

  contactCreated: (userId, { source = 'manual', hasAI = false } = {}) =>
    trackEvent('contact_created', userId, { source, has_ai: hasAI }),

  contactUpdated: (userId) =>
    trackEvent('contact_updated', userId),

  contactDeleted: (userId) =>
    trackEvent('contact_deleted', userId),

  aiTranscriptionCompleted: (userId, { confidence, processingTimeMs, source } = {}) =>
    trackEvent('ai_transcription_completed', userId, {
      confidence,
      processing_time_ms: processingTimeMs,
      source,
    }),

  aiExtractionCompleted: (userId, { overallConfidence, fieldsExtracted } = {}) =>
    trackEvent('ai_extraction_completed', userId, {
      overall_confidence: overallConfidence,
      fields_extracted: fieldsExtracted,
    }),

  eventCreated: (userId, { eventType } = {}) =>
    trackEvent('event_created', userId, { event_type: eventType }),

  pushNotificationSent: (userId, { type } = {}) =>
    trackEvent('push_notification_sent', userId, { notification_type: type }),
};

module.exports = {
  trackEvent,
  setUserProfile,
  incrementUserProperty,
  events,
};

/**
 * Analytics service for ProAnimate Connect (Mobile)
 * Lightweight Mixpanel integration for client-side event tracking
 *
 * Key events tracked:
 * - app_opened, screen_viewed
 * - capture_mode_selected (dictation/recording/manual)
 * - contact_viewed, contact_search
 * - ai_capture_started, ai_capture_completed
 * - notification_tapped
 */

const MIXPANEL_TOKEN = 'PLACEHOLDER_MIXPANEL_TOKEN'; // Replace with actual token
const MIXPANEL_API_URL = 'https://api.mixpanel.com/track';

let userId = null;
let isEnabled = false;

/**
 * Initialize analytics with user ID
 */
export const initAnalytics = (uid) => {
  userId = uid;
  isEnabled = MIXPANEL_TOKEN !== 'PLACEHOLDER_MIXPANEL_TOKEN';
  if (isEnabled) {
    track('app_opened');
  }
};

/**
 * Reset analytics on logout
 */
export const resetAnalytics = () => {
  userId = null;
};

/**
 * Track an event
 */
export const track = async (eventName, properties = {}) => {
  if (!isEnabled || !userId) return;

  const data = {
    event: eventName,
    properties: {
      token: MIXPANEL_TOKEN,
      distinct_id: userId,
      time: Math.floor(Date.now() / 1000),
      $os: 'iOS',
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
    // Silently fail - analytics should never block the user experience
    console.debug('Analytics error:', error.message);
  }
};

// Pre-built event helpers
export const trackScreenView = (screenName) =>
  track('screen_viewed', { screen: screenName });

export const trackCaptureModeSelected = (mode) =>
  track('capture_mode_selected', { mode });

export const trackAICaptureStarted = (mode) =>
  track('ai_capture_started', { mode });

export const trackAICaptureCompleted = (mode, { confidence, processingTimeMs } = {}) =>
  track('ai_capture_completed', { mode, confidence, processing_time_ms: processingTimeMs });

export const trackContactViewed = (contactId) =>
  track('contact_viewed', { contact_id: contactId });

export const trackContactSearch = (query) =>
  track('contact_search', { query_length: query?.length || 0 });

export const trackNotificationTapped = (type) =>
  track('notification_tapped', { notification_type: type });

export const trackEventCreated = (eventType) =>
  track('event_created', { event_type: eventType });

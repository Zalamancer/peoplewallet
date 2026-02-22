/**
 * Error tracking service for PeopleWallet (Mobile)
 *
 * Setup:
 * 1. Install: npx expo install @sentry/react-native
 * 2. Set SENTRY_DSN in your app config
 * 3. Call initErrorTracking() in App.js
 *
 * For now, this provides a fallback implementation that logs errors
 * locally until @sentry/react-native is installed.
 */

let Sentry = null;

const SENTRY_DSN = 'PLACEHOLDER_SENTRY_DSN'; // Replace with actual DSN

/**
 * Initialize error tracking
 */
export const initErrorTracking = () => {
  if (SENTRY_DSN === 'PLACEHOLDER_SENTRY_DSN') {
    console.log('Sentry: DSN not configured, using console fallback');
    return;
  }

  try {
    Sentry = require('@sentry/react-native');

    Sentry.init({
      dsn: SENTRY_DSN,
      enableAutoSessionTracking: true,
      sessionTrackingIntervalMillis: 30000,
      tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    });

    console.log('Sentry: Initialized successfully');
  } catch (error) {
    console.warn('Sentry: @sentry/react-native not installed. Install with: npx expo install @sentry/react-native');
    Sentry = null;
  }
};

/**
 * Set user context for error reports
 */
export const setUser = (user) => {
  if (Sentry) {
    Sentry.setUser({ id: user.id, email: user.email });
  }
};

/**
 * Clear user context on logout
 */
export const clearUser = () => {
  if (Sentry) {
    Sentry.setUser(null);
  }
};

/**
 * Capture an exception
 */
export const captureException = (error, context = {}) => {
  if (Sentry) {
    Sentry.captureException(error, { extra: context });
  } else {
    console.warn('[Error Tracking]', error.message, context);
  }
};

/**
 * Capture a message
 */
export const captureMessage = (message, level = 'info') => {
  if (Sentry) {
    Sentry.captureMessage(message, level);
  } else {
    console.log(`[Error Tracking] [${level}]`, message);
  }
};

/**
 * Wrap a component with Sentry error boundary (React)
 */
export const withErrorBoundary = (component, fallback) => {
  if (Sentry) {
    return Sentry.wrap(component);
  }
  return component;
};

/**
 * Add breadcrumb for debugging
 */
export const addBreadcrumb = (category, message, data = {}) => {
  if (Sentry) {
    Sentry.addBreadcrumb({ category, message, data, level: 'info' });
  }
};

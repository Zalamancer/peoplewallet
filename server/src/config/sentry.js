/**
 * Sentry error tracking configuration for the server
 *
 * Setup:
 * 1. Create a Sentry project at https://sentry.io
 * 2. Set SENTRY_DSN in your .env file
 * 3. This module auto-initializes if SENTRY_DSN is present
 */

let Sentry = null;

const initSentry = (app) => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('Sentry: DSN not configured, error tracking disabled');
    return;
  }

  try {
    Sentry = require('@sentry/node');

    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: `peoplewallet-server@${process.env.npm_package_version || '1.0.0'}`,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
      integrations: [
        Sentry.httpIntegration(),
        Sentry.expressIntegration({ app }),
      ],
      // Don't send PII in error reports
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        return event;
      },
    });

    console.log('Sentry: Initialized successfully');
  } catch (error) {
    console.warn('Sentry: Failed to initialize -', error.message);
    console.warn('Sentry: Install @sentry/node to enable error tracking: npm install @sentry/node');
    Sentry = null;
  }
};

const captureException = (error, context = {}) => {
  if (Sentry) {
    Sentry.captureException(error, { extra: context });
  }
};

const captureMessage = (message, level = 'info') => {
  if (Sentry) {
    Sentry.captureMessage(message, level);
  }
};

const setUser = (user) => {
  if (Sentry) {
    Sentry.setUser({ id: user.id, email: user.email });
  }
};

const errorHandler = () => {
  if (Sentry) {
    return Sentry.setupExpressErrorHandler();
  }
  return (err, req, res, next) => next(err);
};

module.exports = {
  initSentry,
  captureException,
  captureMessage,
  setUser,
  errorHandler,
};

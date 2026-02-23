require('dotenv').config({ override: true });

const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { initializeFirebase } = require('./config/firebase');
const { initSentry, captureException } = require('./config/sentry');
const { initSocket } = require('./socket');
const logger = require('./utils/logger');

// Initialize Firebase
initializeFirebase();

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Initialize Sentry (must be before routes)
initSentry(app);

// Security middleware — relax CSP for legal pages (they use inline styles)
app.use((req, res, next) => {
  if (req.path.startsWith('/legal')) {
    return helmet({ contentSecurityPolicy: false })(req, res, next);
  }
  return helmet()(req, res, next);
});
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',')
    : '*',
  credentials: true,
}));

// Rate limiting — only in production
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 200,
    message: { error: 'Too many requests, please try again later' },
    skip: (req) => req.path.startsWith('/auth'),
  });
  app.use('/api/', limiter);
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));

// Serve static files (legal pages, etc.)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/linkedin', require('./routes/linkedin'));
app.use('/api/social', require('./routes/social'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/events', require('./routes/event-feed'));
app.use('/api/events', require('./routes/events'));
app.use('/api/connections', require('./routes/connections'));
app.use('/api/feed', require('./routes/feed'));
app.use('/api/shared', require('./routes/shared'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/insights', require('./routes/insights'));
app.use('/api/card-exchange', require('./routes/card-exchange'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/co-attendees', require('./routes/co-attendees'));
app.use('/api/clubs', require('./routes/clubs'));
app.use('/api/schools', require('./routes/schools'));
app.use('/api/rsvps', require('./routes/rsvps'));
app.use('/api/attendances', require('./routes/attendances'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/me/clubs', require('./routes/club-follows'));
app.use('/api/admin', require('./routes/admin'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload too large' });
  }

  if (err.message?.includes('Unsupported audio format')) {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Initialize Socket.IO
initSocket(server);

// Run migrations then start server
const PORT = process.env.PORT || 3000;

const { pool } = require('./config/database');

const runMigrations = async () => {
  const migrations = require('./migrations/run-list');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  const result = await pool.query('SELECT name FROM schema_migrations ORDER BY id');
  const executed = result.rows.map((r) => r.name);
  for (const migration of migrations) {
    if (!executed.includes(migration.name)) {
      logger.info(`Running migration: ${migration.name}`);
      await pool.query(migration.up);
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
      logger.info(`Migration ${migration.name} completed`);
    }
  }
  logger.info('Migrations complete');
};

runMigrations()
  .then(() => {
    server.listen(PORT, () => {
      logger.info(`PeopleWallet API running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

      if (process.env.ENABLE_SCHEDULER !== 'false') {
        const { startScheduler } = require('./jobs/scheduler');
        startScheduler();
      }
    });
  })
  .catch((err) => {
    logger.error('Failed to run migrations:', err);
    process.exit(1);
  });

module.exports = { app, server };

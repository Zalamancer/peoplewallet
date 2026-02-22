const express = require('express');
const { authenticate } = require('../middleware/auth');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Middleware: verify admin secret key via query param or header.
 * No JWT needed — just the ADMIN_SECRET env var.
 */
const requireAdminSecret = (req, res, next) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
  }
  const provided = req.query.key || req.headers['x-admin-key'];
  if (provided !== secret) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }
  next();
};

// --- Dashboard routes (secret-key auth) ---

/**
 * GET /api/admin/dashboard?key=<ADMIN_SECRET>
 * Self-contained HTML admin dashboard showing limits, usage, and service health.
 */
router.get('/dashboard', requireAdminSecret, async (req, res) => {
  try {
    const data = await gatherDashboardData();
    res.type('html').send(renderDashboardHTML(data, req.query.key));
  } catch (error) {
    logger.error('[Admin Dashboard] Error:', error.message);
    res.status(500).json({ error: 'Dashboard failed', message: error.message });
  }
});

/**
 * GET /api/admin/dashboard/data?key=<ADMIN_SECRET>
 * Raw JSON endpoint for the dashboard data.
 */
router.get('/dashboard/data', requireAdminSecret, async (req, res) => {
  try {
    const data = await gatherDashboardData();
    res.json(data);
  } catch (error) {
    logger.error('[Admin Dashboard] Data error:', error.message);
    res.status(500).json({ error: 'Failed to gather dashboard data' });
  }
});

// --- Pipeline route (JWT auth) ---

router.post('/run-pipelines', authenticate, async (req, res) => {
  const results = {
    started_at: new Date().toISOString(),
    steps: {},
    errors: [],
  };

  try {
    logger.info('[Admin] Running club discovery pipeline');
    try {
      const { discoverClubsViaGoogle } = require('../services/club-discovery');
      const discovery = await discoverClubsViaGoogle();
      results.steps.discovery = { status: 'ok', ...discovery };
    } catch (err) {
      results.steps.discovery = { status: 'error', message: err.message };
      results.errors.push(`discovery: ${err.message}`);
      logger.error('[Admin] Discovery failed:', err.message);
    }

    logger.info('[Admin] Running account classification');
    try {
      const { classifyPendingAccounts } = require('../services/club-discovery');
      const classification = await classifyPendingAccounts();
      results.steps.classification = { status: 'ok', ...classification };
    } catch (err) {
      results.steps.classification = { status: 'error', message: err.message };
      results.errors.push(`classification: ${err.message}`);
      logger.error('[Admin] Classification failed:', err.message);
    }

    logger.info('[Admin] Running Instagram post fetcher');
    try {
      const { fetchAllClubPosts } = require('../services/instagram-fetcher');
      const posts = await fetchAllClubPosts();
      results.steps.post_fetch = { status: 'ok', ...posts };
    } catch (err) {
      results.steps.post_fetch = { status: 'error', message: err.message };
      results.errors.push(`post_fetch: ${err.message}`);
      logger.error('[Admin] Post fetch failed:', err.message);
    }

    logger.info('[Admin] Running AI event analyzer');
    try {
      const { analyzePendingPosts } = require('../services/event-analyzer');
      const analysis = await analyzePendingPosts();
      results.steps.event_analysis = { status: 'ok', ...analysis };
    } catch (err) {
      results.steps.event_analysis = { status: 'error', message: err.message };
      results.errors.push(`event_analysis: ${err.message}`);
      logger.error('[Admin] Event analysis failed:', err.message);
    }

    logger.info('[Admin] Running ranking recalculator');
    try {
      const { recalculateAllRankings, markCompletedEvents } = require('../services/ranking');
      const rankings = await recalculateAllRankings();
      const completed = await markCompletedEvents();
      results.steps.ranking = { status: 'ok', ...rankings, events_completed: completed };
    } catch (err) {
      results.steps.ranking = { status: 'error', message: err.message };
      results.errors.push(`ranking: ${err.message}`);
      logger.error('[Admin] Ranking failed:', err.message);
    }

    results.completed_at = new Date().toISOString();
    results.success = results.errors.length === 0;
    logger.info('[Admin] Pipeline run complete', results);
    res.json(results);
  } catch (error) {
    logger.error('[Admin] Pipeline run failed:', error);
    res.status(500).json({ error: 'Pipeline run failed', message: error.message });
  }
});

// --- Data gathering ---

async function gatherDashboardData() {
  const results = {};

  // 1. Rate limit configuration
  results.rateLimits = {
    global: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 200,
      windowMinutes: ((parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000) / 60000).toFixed(0),
      appliesTo: 'All /api/* routes (except /api/auth/*)',
      enabledIn: 'production only',
      currentEnv: process.env.NODE_ENV || 'development',
      active: process.env.NODE_ENV === 'production',
    },
    contactCreation: {
      maxPerDay: 10,
      appliesTo: 'POST /api/contacts',
      type: 'Per-user, database-tracked',
    },
    coAttendeeSave: {
      maxPerHour: 30,
      appliesTo: 'POST /api/co-attendees/save',
      type: 'Per-user, database-tracked',
    },
  };

  // 2. Service configuration status
  results.services = {
    anthropic: {
      configured: !!process.env.ANTHROPIC_API_KEY,
      keyPrefix: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.slice(0, 10) + '...' : null,
    },
    firebase: {
      configured: !!process.env.FIREBASE_PROJECT_ID,
      projectId: process.env.FIREBASE_PROJECT_ID || null,
    },
    linkedin: {
      configured: !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
      redirectUri: process.env.LINKEDIN_REDIRECT_URI || null,
    },
    deepgram: {
      configured: !!process.env.DEEPGRAM_API_KEY,
    },
    serpapi: {
      configured: !!process.env.SERPAPI_KEY,
    },
    googleCSE: {
      configured: !!(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID),
    },
    apify: {
      configured: !!process.env.APIFY_TOKEN,
    },
    rapidapi: {
      configured: !!process.env.RAPIDAPI_KEY,
    },
    sentry: {
      configured: !!process.env.SENTRY_DSN,
    },
    mixpanel: {
      configured: !!process.env.MIXPANEL_TOKEN,
    },
  };

  // 3. Database stats
  try {
    const [
      usersCount,
      contactsCount,
      eventsCount,
      postsCount,
      clubsCount,
      postsByStatus,
      ocrStats,
      eventsBySource,
      recentUsers,
      recentEvents,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM users'),
      pool.query('SELECT COUNT(*) as count FROM contacts'),
      pool.query('SELECT COUNT(*) as count FROM events'),
      pool.query('SELECT COUNT(*) as count FROM posts'),
      pool.query('SELECT COUNT(*) as count FROM clubs'),
      pool.query("SELECT ai_analysis_status, COUNT(*) as count FROM posts GROUP BY ai_analysis_status ORDER BY count DESC"),
      pool.query("SELECT ocr_status, COUNT(*) as count FROM posts GROUP BY ocr_status ORDER BY count DESC"),
      pool.query("SELECT source, status, COUNT(*) as count FROM events GROUP BY source, status ORDER BY count DESC"),
      pool.query("SELECT id, email, name, created_at FROM users ORDER BY created_at DESC LIMIT 10"),
      pool.query("SELECT e.id, e.event_name, e.event_date, e.ai_confidence, e.feed_score, c.name as club_name FROM events e LEFT JOIN clubs c ON c.id = e.club_id ORDER BY e.created_at DESC LIMIT 10"),
    ]);

    results.database = {
      totals: {
        users: parseInt(usersCount.rows[0].count),
        contacts: parseInt(contactsCount.rows[0].count),
        events: parseInt(eventsCount.rows[0].count),
        posts: parseInt(postsCount.rows[0].count),
        clubs: parseInt(clubsCount.rows[0].count),
      },
      postsByAnalysisStatus: postsByStatus.rows.reduce((acc, r) => {
        acc[r.ai_analysis_status || 'null'] = parseInt(r.count);
        return acc;
      }, {}),
      postsByOcrStatus: ocrStats.rows.reduce((acc, r) => {
        acc[r.ocr_status || 'null'] = parseInt(r.count);
        return acc;
      }, {}),
      eventsBySourceAndStatus: eventsBySource.rows.map((r) => ({
        source: r.source,
        status: r.status,
        count: parseInt(r.count),
      })),
      recentUsers: recentUsers.rows,
      recentEvents: recentEvents.rows,
    };
  } catch (err) {
    results.database = { error: err.message };
  }

  // 4. Server info
  results.server = {
    nodeVersion: process.version,
    uptime: Math.floor(process.uptime()) + 's',
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    timestamp: new Date().toISOString(),
  };

  return results;
}

// --- HTML renderer ---

function renderDashboardHTML(data, adminKey) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const serviceRow = (name, svc) => {
    const dot = svc.configured ? '#22c55e' : '#ef4444';
    const label = svc.configured ? 'Configured' : 'Not configured';
    return `<tr><td>${esc(name)}</td><td><span style="color:${dot}; font-size:18px;">&#9679;</span> ${label}</td></tr>`;
  };

  const db = data.database || {};
  const totals = db.totals || {};
  const postStatuses = db.postsByAnalysisStatus || {};
  const ocrStatuses = db.postsByOcrStatus || {};

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PeopleWallet Admin</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0f172a; color:#e2e8f0; padding:24px; }
  h1 { font-size:24px; font-weight:700; margin-bottom:4px; }
  .subtitle { color:#94a3b8; font-size:14px; margin-bottom:32px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:20px; margin-bottom:32px; }
  .card { background:#1e293b; border-radius:12px; padding:20px; border:1px solid #334155; }
  .card h2 { font-size:16px; font-weight:600; margin-bottom:16px; color:#f8fafc; border-bottom:1px solid #334155; padding-bottom:8px; }
  .stat-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #1e293b; }
  .stat-label { color:#94a3b8; font-size:14px; }
  .stat-value { font-weight:600; font-size:14px; }
  .stat-value.green { color:#22c55e; }
  .stat-value.red { color:#ef4444; }
  .stat-value.yellow { color:#eab308; }
  .stat-value.blue { color:#3b82f6; }
  .big-number { font-size:32px; font-weight:700; color:#f8fafc; }
  .big-label { font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; }
  .totals-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(100px,1fr)); gap:16px; text-align:center; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  table th, table td { text-align:left; padding:8px 12px; border-bottom:1px solid #334155; }
  table th { color:#94a3b8; font-weight:500; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:9999px; font-size:12px; font-weight:500; }
  .badge-green { background:#052e16; color:#22c55e; }
  .badge-red { background:#450a0a; color:#ef4444; }
  .badge-yellow { background:#422006; color:#eab308; }
  .badge-blue { background:#172554; color:#3b82f6; }
  .refresh-btn { background:#3b82f6; color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:500; }
  .refresh-btn:hover { background:#2563eb; }
  .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
  .warn-box { background:#422006; border:1px solid #854d0e; border-radius:8px; padding:12px 16px; margin-bottom:20px; font-size:14px; color:#fbbf24; }
</style>
</head>
<body>
<div class="topbar">
  <div>
    <h1>PeopleWallet Admin</h1>
    <div class="subtitle">Server: ${esc(data.server?.env)} &middot; Up ${esc(data.server?.uptime)} &middot; ${esc(data.server?.memoryMB)}MB RAM &middot; Node ${esc(data.server?.nodeVersion)}</div>
  </div>
  <button class="refresh-btn" onclick="location.reload()">Refresh</button>
</div>

${!data.rateLimits.global.active ? '<div class="warn-box">Rate limiter is <strong>INACTIVE</strong> &mdash; only enabled when NODE_ENV=production (currently: ' + esc(data.rateLimits.global.currentEnv) + ')</div>' : ''}

<!-- Totals -->
<div class="card" style="margin-bottom:20px;">
  <div class="totals-grid">
    <div><div class="big-number">${totals.users ?? '?'}</div><div class="big-label">Users</div></div>
    <div><div class="big-number">${totals.contacts ?? '?'}</div><div class="big-label">Contacts</div></div>
    <div><div class="big-number">${totals.clubs ?? '?'}</div><div class="big-label">Clubs</div></div>
    <div><div class="big-number">${totals.posts ?? '?'}</div><div class="big-label">Posts</div></div>
    <div><div class="big-number">${totals.events ?? '?'}</div><div class="big-label">Events</div></div>
  </div>
</div>

<div class="grid">
  <!-- Rate Limits -->
  <div class="card">
    <h2>Rate Limits</h2>
    <div class="stat-row"><span class="stat-label">Global API</span><span class="stat-value">${esc(data.rateLimits.global.maxRequests)} req / ${esc(data.rateLimits.global.windowMinutes)} min</span></div>
    <div class="stat-row"><span class="stat-label">Global status</span><span class="stat-value ${data.rateLimits.global.active ? 'green' : 'yellow'}">${data.rateLimits.global.active ? 'Active' : 'Inactive (dev mode)'}</span></div>
    <div class="stat-row"><span class="stat-label">Auth routes</span><span class="stat-value green">Exempt (skipped)</span></div>
    <div class="stat-row"><span class="stat-label">Contact creation</span><span class="stat-value">${esc(data.rateLimits.contactCreation.maxPerDay)}/day per user</span></div>
    <div class="stat-row"><span class="stat-label">Co-attendee save</span><span class="stat-value">${esc(data.rateLimits.coAttendeeSave.maxPerHour)}/hour per user</span></div>
  </div>

  <!-- Services -->
  <div class="card">
    <h2>Service Configuration</h2>
    <table>
      <thead><tr><th>Service</th><th>Status</th></tr></thead>
      <tbody>
        ${serviceRow('Anthropic (Claude AI)', data.services.anthropic)}
        ${serviceRow('Firebase Auth', data.services.firebase)}
        ${serviceRow('LinkedIn OAuth', data.services.linkedin)}
        ${serviceRow('Deepgram (Speech)', data.services.deepgram)}
        ${serviceRow('SerpAPI (Discovery)', data.services.serpapi)}
        ${serviceRow('Google CSE', data.services.googleCSE)}
        ${serviceRow('Apify (Instagram)', data.services.apify)}
        ${serviceRow('RapidAPI', data.services.rapidapi)}
        ${serviceRow('Sentry (Errors)', data.services.sentry)}
        ${serviceRow('Mixpanel (Analytics)', data.services.mixpanel)}
      </tbody>
    </table>
  </div>

  <!-- Post Analysis Pipeline -->
  <div class="card">
    <h2>Post Analysis Pipeline</h2>
    <table>
      <thead><tr><th>AI Analysis Status</th><th>Count</th></tr></thead>
      <tbody>
        ${Object.entries(postStatuses).map(([k, v]) => {
          const cls = k === 'analyzed' ? 'badge-green' : k === 'pending' ? 'badge-yellow' : k === 'not_event' ? 'badge-red' : 'badge-blue';
          return `<tr><td><span class="badge ${cls}">${esc(k)}</span></td><td>${v}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- OCR Pipeline -->
  <div class="card">
    <h2>OCR Pipeline</h2>
    <table>
      <thead><tr><th>OCR Status</th><th>Count</th></tr></thead>
      <tbody>
        ${Object.entries(ocrStatuses).map(([k, v]) => {
          const cls = k === 'completed' ? 'badge-green' : k === 'pending' ? 'badge-yellow' : k === 'failed' ? 'badge-red' : 'badge-blue';
          return `<tr><td><span class="badge ${cls}">${esc(k)}</span></td><td>${v}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- Events by Source -->
  <div class="card">
    <h2>Events by Source</h2>
    <table>
      <thead><tr><th>Source</th><th>Status</th><th>Count</th></tr></thead>
      <tbody>
        ${(db.eventsBySourceAndStatus || []).map((r) => `<tr><td>${esc(r.source)}</td><td><span class="badge badge-blue">${esc(r.status)}</span></td><td>${r.count}</td></tr>`).join('')}
        ${(db.eventsBySourceAndStatus || []).length === 0 ? '<tr><td colspan="3" style="color:#64748b;">No events yet</td></tr>' : ''}
      </tbody>
    </table>
  </div>

  <!-- Recent Users -->
  <div class="card">
    <h2>Recent Users</h2>
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Joined</th></tr></thead>
      <tbody>
        ${(db.recentUsers || []).map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${new Date(u.created_at).toLocaleDateString()}</td></tr>`).join('')}
        ${(db.recentUsers || []).length === 0 ? '<tr><td colspan="3" style="color:#64748b;">No users yet</td></tr>' : ''}
      </tbody>
    </table>
  </div>

  <!-- Recent Events -->
  <div class="card">
    <h2>Recent Events (AI-detected)</h2>
    <table>
      <thead><tr><th>Event</th><th>Club</th><th>Date</th><th>Confidence</th><th>Score</th></tr></thead>
      <tbody>
        ${(db.recentEvents || []).map((e) => `<tr><td>${esc(e.event_name || 'Untitled')}</td><td>${esc(e.club_name || '-')}</td><td>${e.event_date ? new Date(e.event_date).toLocaleDateString() : '-'}</td><td>${e.ai_confidence != null ? (e.ai_confidence * 100).toFixed(0) + '%' : '-'}</td><td>${e.feed_score != null ? Number(e.feed_score).toFixed(1) : '-'}</td></tr>`).join('')}
        ${(db.recentEvents || []).length === 0 ? '<tr><td colspan="5" style="color:#64748b;">No events yet</td></tr>' : ''}
      </tbody>
    </table>
  </div>
</div>

<div style="text-align:center; color:#475569; font-size:12px; margin-top:32px;">
  PeopleWallet Admin Dashboard &middot; ${esc(data.server?.timestamp)}
</div>
</body>
</html>`;
}

module.exports = router;

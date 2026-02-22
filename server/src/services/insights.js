const Anthropic = require('@anthropic-ai/sdk').default;
const { query } = require('../config/database');
const logger = require('../utils/logger');

let anthropicClient;

const getClient = () => {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
};

/**
 * Relationship Insights / AI Nudges Service
 *
 * Generates AI-powered relationship insights for users:
 * - Stale connections grouped by event/context
 * - Network growth trends (contacts per week/month)
 * - Suggested reconnections based on shared interests or upcoming events
 * - Semester/monthly recaps
 * - Weekly "Did You Know?" nudges
 */

// ──────────────────────────────────────────────────────────────────────
// Data aggregation helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Get stale connections grouped by event/context for a user
 */
const getStaleConnectionsByGroup = async (userId, daysThreshold = 30) => {
  const result = await query(
    `SELECT
      c.id, c.full_name, c.nickname, c.avatar_url, c.last_interaction_at,
      EXTRACT(DAY FROM NOW() - c.last_interaction_at)::INTEGER as days_since,
      cp.company, cp.job_title, cp.school,
      cc.event_name, cc.how_met, cc.location,
      (SELECT array_agg(ct.tag_name) FROM contact_tags ct WHERE ct.contact_id = c.id) as tags
    FROM contacts c
    LEFT JOIN contact_professional cp ON cp.contact_id = c.id
    LEFT JOIN contact_context cc ON cc.contact_id = c.id
    WHERE c.user_id = $1
      AND c.last_interaction_at < NOW() - ($2 || ' days')::INTERVAL
    ORDER BY c.last_interaction_at ASC
    LIMIT 50`,
    [userId, daysThreshold]
  );

  // Group by event_name or "No event"
  const groups = {};
  for (const row of result.rows) {
    const key = row.event_name || 'Other Contacts';
    if (!groups[key]) {
      groups[key] = { event_name: key, contacts: [] };
    }
    groups[key].contacts.push(row);
  }

  return Object.values(groups);
};

/**
 * Get network growth stats for the user
 */
const getNetworkGrowthStats = async (userId) => {
  const [thisWeek, thisMonth, lastMonth, total, bySource] = await Promise.all([
    query(
      `SELECT COUNT(*) as count FROM contacts
       WHERE user_id = $1 AND created_at >= date_trunc('week', NOW())`,
      [userId]
    ),
    query(
      `SELECT COUNT(*) as count FROM contacts
       WHERE user_id = $1 AND created_at >= date_trunc('month', NOW())`,
      [userId]
    ),
    query(
      `SELECT COUNT(*) as count FROM contacts
       WHERE user_id = $1
         AND created_at >= date_trunc('month', NOW() - INTERVAL '1 month')
         AND created_at < date_trunc('month', NOW())`,
      [userId]
    ),
    query(
      'SELECT COUNT(*) as count FROM contacts WHERE user_id = $1',
      [userId]
    ),
    query(
      `SELECT source, COUNT(*) as count FROM contacts
       WHERE user_id = $1 GROUP BY source`,
      [userId]
    ),
  ]);

  return {
    thisWeek: parseInt(thisWeek.rows[0].count, 10),
    thisMonth: parseInt(thisMonth.rows[0].count, 10),
    lastMonth: parseInt(lastMonth.rows[0].count, 10),
    total: parseInt(total.rows[0].count, 10),
    bySource: bySource.rows.reduce((acc, row) => {
      acc[row.source] = parseInt(row.count, 10);
      return acc;
    }, {}),
  };
};

/**
 * Get contacts with shared interests or tags for reconnection suggestions
 */
const getSuggestedReconnections = async (userId) => {
  // Find contacts that share tags/interests with recently active contacts
  const result = await query(
    `WITH active_tags AS (
      SELECT DISTINCT ct.tag_name
      FROM contacts c
      JOIN contact_tags ct ON ct.contact_id = c.id
      WHERE c.user_id = $1
        AND c.last_interaction_at >= NOW() - INTERVAL '14 days'
    )
    SELECT
      c.id, c.full_name, c.nickname, c.avatar_url,
      c.last_interaction_at,
      EXTRACT(DAY FROM NOW() - c.last_interaction_at)::INTEGER as days_since,
      cp.company, cp.job_title, cp.school,
      cc.event_name,
      (SELECT array_agg(ct.tag_name) FROM contact_tags ct WHERE ct.contact_id = c.id) as tags,
      (SELECT COUNT(*) FROM contact_tags ct
       WHERE ct.contact_id = c.id AND ct.tag_name IN (SELECT tag_name FROM active_tags)) as shared_tag_count
    FROM contacts c
    LEFT JOIN contact_professional cp ON cp.contact_id = c.id
    LEFT JOIN contact_context cc ON cc.contact_id = c.id
    WHERE c.user_id = $1
      AND c.last_interaction_at < NOW() - INTERVAL '21 days'
      AND EXISTS (
        SELECT 1 FROM contact_tags ct
        WHERE ct.contact_id = c.id AND ct.tag_name IN (SELECT tag_name FROM active_tags)
      )
    ORDER BY shared_tag_count DESC, c.last_interaction_at ASC
    LIMIT 5`,
    [userId]
  );

  return result.rows;
};

/**
 * Get period recap stats (semester or monthly)
 */
const getRecapStats = async (userId, periodStart, periodEnd) => {
  const [
    totalContacts,
    topEvents,
    topCompanies,
    topSchools,
    sourceBreakdown,
    contactsWithNotes,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*) as count FROM contacts
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
      [userId, periodStart, periodEnd]
    ),
    query(
      `SELECT cc.event_name, COUNT(*) as count
       FROM contacts c
       JOIN contact_context cc ON cc.contact_id = c.id
       WHERE c.user_id = $1 AND c.created_at >= $2 AND c.created_at < $3
         AND cc.event_name IS NOT NULL
       GROUP BY cc.event_name ORDER BY count DESC LIMIT 5`,
      [userId, periodStart, periodEnd]
    ),
    query(
      `SELECT cp.company, COUNT(*) as count
       FROM contacts c
       JOIN contact_professional cp ON cp.contact_id = c.id
       WHERE c.user_id = $1 AND c.created_at >= $2 AND c.created_at < $3
         AND cp.company IS NOT NULL
       GROUP BY cp.company ORDER BY count DESC LIMIT 5`,
      [userId, periodStart, periodEnd]
    ),
    query(
      `SELECT cp.school, COUNT(*) as count
       FROM contacts c
       JOIN contact_professional cp ON cp.contact_id = c.id
       WHERE c.user_id = $1 AND c.created_at >= $2 AND c.created_at < $3
         AND cp.school IS NOT NULL
       GROUP BY cp.school ORDER BY count DESC LIMIT 5`,
      [userId, periodStart, periodEnd]
    ),
    query(
      `SELECT source, COUNT(*) as count
       FROM contacts
       WHERE user_id = $1 AND created_at >= $2 AND created_at < $3
       GROUP BY source`,
      [userId, periodStart, periodEnd]
    ),
    query(
      `SELECT COUNT(DISTINCT c.id) as count
       FROM contacts c
       JOIN contact_notes cn ON cn.contact_id = c.id
       WHERE c.user_id = $1 AND c.created_at >= $2 AND c.created_at < $3`,
      [userId, periodStart, periodEnd]
    ),
  ]);

  return {
    totalContacts: parseInt(totalContacts.rows[0].count, 10),
    topEvents: topEvents.rows.map((r) => ({ name: r.event_name, count: parseInt(r.count, 10) })),
    topCompanies: topCompanies.rows.map((r) => ({ name: r.company, count: parseInt(r.count, 10) })),
    topSchools: topSchools.rows.map((r) => ({ name: r.school, count: parseInt(r.count, 10) })),
    sourceBreakdown: sourceBreakdown.rows.reduce((acc, row) => {
      acc[row.source] = parseInt(row.count, 10);
      return acc;
    }, {}),
    contactsWithNotes: parseInt(contactsWithNotes.rows[0].count, 10),
    periodStart,
    periodEnd,
  };
};

// ──────────────────────────────────────────────────────────────────────
// AI insight generation
// ──────────────────────────────────────────────────────────────────────

/**
 * Generate an AI-powered insight message given structured data
 */
const generateInsightMessage = async (insightType, data) => {
  try {
    const client = getClient();

    const prompts = {
      reconnect: `You are a friendly networking coach. Given these stale contacts grouped by event, write a brief, actionable insight message (2-3 sentences max). Be specific about the event/group names and contact count. Tone: warm, encouraging, not pushy.

Data: ${JSON.stringify(data)}

Return ONLY the insight message text, no JSON or formatting.`,

      growth: `You are a networking coach. Given these network growth stats, write a brief encouraging message (2-3 sentences max) about the user's networking progress. Highlight interesting trends. Be specific with numbers.

Stats: ${JSON.stringify(data)}

Return ONLY the insight message text, no JSON or formatting.`,

      suggestion: `You are a networking coach. Given these suggested reconnections (contacts who share interests with people the user recently interacted with), write a brief message (2-3 sentences max) explaining why these contacts are worth reconnecting with. Mention shared interests/tags.

Contacts: ${JSON.stringify(data)}

Return ONLY the insight message text, no JSON or formatting.`,

      recap: `You are a networking coach. Given these period summary stats, write a brief celebratory recap message (3-4 sentences max). Highlight the user's accomplishments. Be specific and encouraging.

Stats: ${JSON.stringify(data)}

Return ONLY the insight message text, no JSON or formatting.`,

      weekly_digest: `You are a friendly networking assistant. Given these network stats and stale contacts, write a brief weekly digest message (2-3 sentences max). Mention one actionable thing the user could do this week.

Data: ${JSON.stringify(data)}

Return ONLY the insight message text, no JSON or formatting.`,
    };

    const prompt = prompts[insightType];
    if (!prompt) {
      logger.warn(`Unknown insight type: ${insightType}`);
      return null;
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a concise, friendly networking assistant for a college student networking app called PeopleWallet. Keep messages brief and actionable.',
      temperature: 0.7,
    });

    return response.content[0]?.text || null;
  } catch (error) {
    logger.error(`Insight generation failed for type ${insightType}:`, error.message);
    return null;
  }
};

// ──────────────────────────────────────────────────────────────────────
// Main API methods
// ──────────────────────────────────────────────────────────────────────

/**
 * Get all current insights for a user
 * Returns an array of insight objects ready for the mobile app
 */
const getInsightsForUser = async (userId) => {
  const insights = [];

  try {
    // 1. Reconnect insights — stale connections grouped by event
    const staleGroups = await getStaleConnectionsByGroup(userId, 30);
    if (staleGroups.length > 0) {
      const totalStale = staleGroups.reduce((sum, g) => sum + g.contacts.length, 0);
      const aiMessage = await generateInsightMessage('reconnect', {
        groups: staleGroups.map((g) => ({
          event: g.event_name,
          count: g.contacts.length,
          names: g.contacts.slice(0, 3).map((c) => c.full_name),
        })),
        totalStale,
      });

      insights.push({
        id: 'reconnect',
        type: 'reconnect',
        title: 'Time to Reconnect',
        message: aiMessage || `You haven't connected with ${totalStale} people recently. Tap to see who might need a check-in.`,
        data: {
          groups: staleGroups.map((g) => ({
            event_name: g.event_name,
            contacts: g.contacts.slice(0, 5).map((c) => ({
              id: c.id,
              full_name: c.full_name,
              avatar_url: c.avatar_url,
              days_since: c.days_since,
              company: c.company,
              job_title: c.job_title,
              school: c.school,
            })),
            total: g.contacts.length,
          })),
          totalStale,
        },
        priority: 1,
        icon: 'people-outline',
        color: '#FF9500',
      });
    }

    // 2. Network growth insight
    const growth = await getNetworkGrowthStats(userId);
    if (growth.total > 0) {
      const aiMessage = await generateInsightMessage('growth', growth);

      insights.push({
        id: 'growth',
        type: 'growth',
        title: 'Network Growth',
        message: aiMessage || `You've added ${growth.thisMonth} contacts this month. Your network has ${growth.total} people total.`,
        data: growth,
        priority: 3,
        icon: 'trending-up-outline',
        color: '#34C759',
      });
    }

    // 3. Suggested reconnections based on shared interests
    const suggestions = await getSuggestedReconnections(userId);
    if (suggestions.length > 0) {
      const aiMessage = await generateInsightMessage('suggestion', {
        contacts: suggestions.map((c) => ({
          name: c.full_name,
          tags: c.tags,
          days_since: c.days_since,
          company: c.company,
          event: c.event_name,
        })),
      });

      insights.push({
        id: 'suggestions',
        type: 'suggestions',
        title: 'People You Might Want to Reach Out To',
        message: aiMessage || `${suggestions.length} contacts share interests with people you've recently connected with.`,
        data: {
          contacts: suggestions.map((c) => ({
            id: c.id,
            full_name: c.full_name,
            avatar_url: c.avatar_url,
            days_since: c.days_since,
            company: c.company,
            job_title: c.job_title,
            tags: c.tags,
            event_name: c.event_name,
          })),
        },
        priority: 2,
        icon: 'bulb-outline',
        color: '#007AFF',
      });
    }

    // 4. Weekly digest — check if we have a cached one from this week
    const cachedDigest = await query(
      `SELECT * FROM user_insights
       WHERE user_id = $1
         AND insight_type = 'weekly_digest'
         AND created_at >= date_trunc('week', NOW())
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (cachedDigest.rows.length > 0) {
      const digest = cachedDigest.rows[0];
      insights.push({
        id: `digest-${digest.id}`,
        type: 'weekly_digest',
        title: 'Weekly Digest',
        message: digest.message,
        data: digest.metadata || {},
        priority: 4,
        icon: 'newspaper-outline',
        color: '#32ADE6',
      });
    }

    // Sort by priority
    insights.sort((a, b) => a.priority - b.priority);

    return insights;
  } catch (error) {
    logger.error('Failed to generate insights for user:', error);
    return [];
  }
};

/**
 * Get recap stats for a user (semester or month)
 * @param {string} period - 'month' or 'semester'
 */
const getRecapForUser = async (userId, period = 'month') => {
  let periodStart, periodEnd;
  const now = new Date();

  if (period === 'semester') {
    // Current semester: Jan-May = Spring, Jun-Aug = Summer, Sep-Dec = Fall
    const month = now.getMonth();
    const year = now.getFullYear();
    if (month <= 4) {
      periodStart = new Date(year, 0, 1); // Jan 1
      periodEnd = new Date(year, 5, 1);   // Jun 1
    } else if (month <= 7) {
      periodStart = new Date(year, 5, 1); // Jun 1
      periodEnd = new Date(year, 8, 1);   // Sep 1
    } else {
      periodStart = new Date(year, 8, 1); // Sep 1
      periodEnd = new Date(year + 1, 0, 1); // Jan 1
    }
  } else {
    // Current month
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const stats = await getRecapStats(userId, periodStart.toISOString(), periodEnd.toISOString());
  const aiMessage = await generateInsightMessage('recap', stats);

  return {
    period,
    periodLabel: period === 'semester' ? getSemesterLabel(periodStart) : getMonthLabel(periodStart),
    message: aiMessage || `You met ${stats.totalContacts} people this ${period}.`,
    stats,
  };
};

/**
 * Generate and store weekly digest for a user
 * Called by the scheduler job
 */
const generateWeeklyDigest = async (userId) => {
  try {
    const growth = await getNetworkGrowthStats(userId);
    const staleGroups = await getStaleConnectionsByGroup(userId, 30);
    const totalStale = staleGroups.reduce((sum, g) => sum + g.contacts.length, 0);

    const aiMessage = await generateInsightMessage('weekly_digest', {
      growth,
      staleContactsCount: totalStale,
      topStaleNames: staleGroups
        .flatMap((g) => g.contacts)
        .slice(0, 3)
        .map((c) => c.full_name),
    });

    if (aiMessage) {
      await query(
        `INSERT INTO user_insights (user_id, insight_type, title, message, metadata)
         VALUES ($1, 'weekly_digest', 'Weekly Digest', $2, $3)`,
        [
          userId,
          aiMessage,
          JSON.stringify({ growth, staleContactsCount: totalStale }),
        ]
      );
    }

    return aiMessage;
  } catch (error) {
    logger.error(`Weekly digest generation failed for user ${userId}:`, error);
    return null;
  }
};

/**
 * Process weekly digests for all users
 * Designed to run as a scheduled job (weekly)
 */
const processWeeklyDigests = async () => {
  logger.info('Starting weekly digest job');

  try {
    const result = await query(`
      SELECT u.id as user_id
      FROM users u
      LEFT JOIN notification_preferences np ON np.user_id = u.id
      WHERE (np.weekly_digest IS NULL OR np.weekly_digest = TRUE)
        AND NOT EXISTS (
          SELECT 1 FROM user_insights ui
          WHERE ui.user_id = u.id
            AND ui.insight_type = 'weekly_digest'
            AND ui.created_at >= date_trunc('week', NOW())
        )
    `);

    let generated = 0;
    for (const row of result.rows) {
      const message = await generateWeeklyDigest(row.user_id);
      if (message) generated++;
    }

    logger.info(`Weekly digest job complete: ${generated} digests generated for ${result.rows.length} users`);
    return { generated, users: result.rows.length };
  } catch (error) {
    logger.error('Weekly digest job error:', error);
    throw error;
  }
};

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

const getSemesterLabel = (date) => {
  const month = date.getMonth();
  const year = date.getFullYear();
  if (month <= 4) return `Spring ${year}`;
  if (month <= 7) return `Summer ${year}`;
  return `Fall ${year}`;
};

const getMonthLabel = (date) => {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

module.exports = {
  getInsightsForUser,
  getRecapForUser,
  generateWeeklyDigest,
  processWeeklyDigests,
};

/**
 * Weekly Nudge Notification Generator
 *
 * Generates weekly digest notifications for users who have opted in.
 * Includes:
 *   - Contacts with upcoming events (saved contacts who are also platform users with RSVPs)
 *   - Contacts who RSVP'd to upcoming events the user hasn't RSVP'd to
 *   - Co-attendees from past events not yet saved as contacts
 *   - Contacts with significant score drops
 *   - A summary digest notification
 *
 * Designed to run Sundays at 10am via the scheduler.
 */

const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Generate weekly nudge digest for all eligible users.
 *
 * @returns {Promise<{ processed: number, nudges_sent: number }>}
 */
const generateWeeklyNudges = async () => {
  logger.info('[WeeklyNudges] Starting weekly nudge generation');

  try {
    // Find users with weekly_digest enabled (default: enabled)
    const usersResult = await query(`
      SELECT u.id as user_id, u.name as user_name
      FROM users u
      LEFT JOIN notification_preferences np ON np.user_id = u.id
      WHERE (np.weekly_digest IS NULL OR np.weekly_digest = TRUE)
    `);

    let processed = 0;
    let nudgesSent = 0;

    for (const user of usersResult.rows) {
      try {
        const nudgeData = await generateNudgeForUser(user.user_id, user.user_name);

        if (nudgeData) {
          // Insert digest notification into notification_log
          await query(
            `INSERT INTO notification_log (user_id, type, title, body, metadata)
             VALUES ($1, 'weekly_digest', $2, $3, $4)`,
            [
              user.user_id,
              'Your Weekly Network Digest',
              nudgeData.body,
              JSON.stringify(nudgeData.metadata),
            ]
          );
          nudgesSent++;
        }

        processed++;
      } catch (userError) {
        logger.error(`[WeeklyNudges] Failed for user ${user.user_id}:`, userError.message);
      }
    }

    logger.info(`[WeeklyNudges] Complete: ${processed} users processed, ${nudgesSent} nudges sent`);
    return { processed, nudges_sent: nudgesSent };
  } catch (error) {
    logger.error('[WeeklyNudges] Weekly nudge generation failed:', error);
    throw error;
  }
};

/**
 * Generate a weekly nudge for a single user.
 *
 * @param {string} userId
 * @param {string} userName
 * @returns {Promise<{ body: string, metadata: object } | null>}
 */
const generateNudgeForUser = async (userId, userName) => {
  // 1. Find contacts with upcoming events
  //    These are saved contacts who are also platform users with event RSVPs in the next 7 days
  const upcomingContactsResult = await query(
    `SELECT DISTINCT
      c.id as contact_id,
      c.full_name as contact_name,
      c.avatar_url,
      e.name as event_name,
      e.event_date
     FROM contacts c
     JOIN users u ON u.email = c.email OR u.name = c.full_name
     JOIN events e ON e.user_id = u.id
     WHERE c.user_id = $1
       AND e.event_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
     ORDER BY e.event_date ASC
     LIMIT 5`,
    [userId]
  );

  // 2. Find contacts with score drops (>20% from peak in last 7 days)
  const scoreDropsResult = await query(
    `SELECT
      rs.contact_id,
      c.full_name as contact_name,
      c.avatar_url,
      rs.score,
      rs.peak_score,
      ROUND(((rs.peak_score - rs.score) / NULLIF(rs.peak_score, 0) * 100)::numeric, 1) as drop_pct,
      EXTRACT(DAY FROM NOW() - rs.last_signal_at)::INTEGER as days_since_last_signal
     FROM relationship_scores rs
     JOIN contacts c ON c.id = rs.contact_id
     WHERE rs.user_id = $1
       AND rs.peak_score > 0
       AND rs.score < rs.peak_score * 0.8
       AND rs.updated_at > NOW() - INTERVAL '7 days'
     ORDER BY rs.score ASC
     LIMIT 5`,
    [userId]
  );

  // 3. Find contacts who RSVP'd to upcoming events the user hasn't RSVP'd to
  //    Nudge: "[Contact] RSVP'd to [Event] -- you should go too!"
  const contactRsvpsResult = await query(
    `SELECT DISTINCT
      c.id as contact_id,
      c.full_name as contact_name,
      c.avatar_url,
      e.id as event_id,
      e.name as event_name,
      e.event_date,
      e.location
     FROM contacts c
     JOIN users cu ON cu.email = c.email OR cu.name = c.full_name
     JOIN rsvps r ON r.user_id = cu.id AND r.status = 'going'
     JOIN events e ON e.id = r.event_id
     WHERE c.user_id = $1
       AND e.event_date > NOW()
       AND e.event_date <= NOW() + INTERVAL '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM rsvps ur
         WHERE ur.user_id = $1 AND ur.event_id = e.id
       )
     ORDER BY e.event_date ASC
     LIMIT 5`,
    [userId]
  );

  // 4. Find co-attendees from past events not yet saved as contacts
  //    Nudge: "You and [Contact] were both at [Event] but haven't connected yet"
  const unconnectedCoAttendeesResult = await query(
    `SELECT DISTINCT
      u2.id as user_id,
      u2.name as user_name,
      u2.avatar_url,
      e.id as event_id,
      e.name as event_name,
      e.event_date
     FROM co_attendances ca
     JOIN users u2 ON u2.id = CASE
       WHEN ca.user_a_id = $1 THEN ca.user_b_id
       ELSE ca.user_a_id
     END
     JOIN events e ON e.id = ca.event_id
     WHERE (ca.user_a_id = $1 OR ca.user_b_id = $1)
       AND e.event_date >= NOW() - INTERVAL '14 days'
       AND NOT EXISTS (
         SELECT 1 FROM contacts c
         WHERE c.user_id = $1
           AND (c.email = u2.email OR c.full_name = u2.name)
       )
     ORDER BY e.event_date DESC
     LIMIT 5`,
    [userId]
  );

  // 5. Get basic stats for the week
  const weekStatsResult = await query(
    `SELECT
      (SELECT COUNT(*) FROM contacts WHERE user_id = $1 AND created_at >= date_trunc('week', NOW()))::int as contacts_added,
      (SELECT COUNT(*) FROM contacts WHERE user_id = $1)::int as total_contacts`,
    [userId]
  );

  const weekStats = weekStatsResult.rows[0] || { contacts_added: 0, total_contacts: 0 };
  const upcomingContacts = upcomingContactsResult.rows;
  const scoreDrops = scoreDropsResult.rows;
  const contactRsvps = contactRsvpsResult.rows;
  const unconnectedCoAttendees = unconnectedCoAttendeesResult.rows;

  // Only generate a nudge if there is something to report
  if (
    upcomingContacts.length === 0 &&
    scoreDrops.length === 0 &&
    contactRsvps.length === 0 &&
    unconnectedCoAttendees.length === 0 &&
    weekStats.contacts_added === 0
  ) {
    return null;
  }

  // Build the digest body
  const bodyParts = [];

  if (weekStats.contacts_added > 0) {
    bodyParts.push(`You added ${weekStats.contacts_added} new contact${weekStats.contacts_added !== 1 ? 's' : ''} this week.`);
  }

  if (upcomingContacts.length > 0) {
    const names = upcomingContacts.slice(0, 3).map((c) => c.contact_name).join(', ');
    const eventNames = [...new Set(upcomingContacts.map((c) => c.event_name))].slice(0, 2).join(', ');
    bodyParts.push(`${names}${upcomingContacts.length > 3 ? ` and ${upcomingContacts.length - 3} more` : ''} ${upcomingContacts.length === 1 ? 'has' : 'have'} upcoming events (${eventNames}). Good time to reconnect!`);
  }

  if (scoreDrops.length > 0) {
    const fadingNames = scoreDrops.slice(0, 3).map((c) => c.contact_name).join(', ');
    bodyParts.push(`Connections fading with ${fadingNames}${scoreDrops.length > 3 ? ` and ${scoreDrops.length - 3} more` : ''}. A quick message could go a long way.`);
  }

  if (contactRsvps.length > 0) {
    for (const cr of contactRsvps.slice(0, 2)) {
      bodyParts.push(`${cr.contact_name} RSVP'd to ${cr.event_name} \u2014 you should go too!`);
    }
  }

  if (unconnectedCoAttendees.length > 0) {
    for (const ca of unconnectedCoAttendees.slice(0, 2)) {
      bodyParts.push(`You and ${ca.user_name} were both at ${ca.event_name} but haven't connected yet.`);
    }
  }

  const body = bodyParts.join(' ');

  return {
    body,
    metadata: {
      week_of: new Date().toISOString(),
      contacts_added: weekStats.contacts_added,
      total_contacts: weekStats.total_contacts,
      upcoming_contacts: upcomingContacts.map((c) => ({
        contact_id: c.contact_id,
        contact_name: c.contact_name,
        event_name: c.event_name,
        event_date: c.event_date,
      })),
      score_drops: scoreDrops.map((c) => ({
        contact_id: c.contact_id,
        contact_name: c.contact_name,
        drop_pct: parseFloat(c.drop_pct),
        days_since_last_signal: c.days_since_last_signal,
      })),
      contact_rsvps: contactRsvps.map((cr) => ({
        contact_id: cr.contact_id,
        contact_name: cr.contact_name,
        event_id: cr.event_id,
        event_name: cr.event_name,
        event_date: cr.event_date,
      })),
      unconnected_co_attendees: unconnectedCoAttendees.map((ca) => ({
        user_id: ca.user_id,
        user_name: ca.user_name,
        event_id: ca.event_id,
        event_name: ca.event_name,
        event_date: ca.event_date,
      })),
    },
  };
};

module.exports = { generateWeeklyNudges };

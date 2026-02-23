const express = require('express');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/clubs
 * Create a new club and assign the creator as president
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, category, school_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Club name is required' });
    }

    // Insert the club
    const clubResult = await query(
      `INSERT INTO clubs (name, description, category, school_id, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name.trim(), description?.trim() || null, category || null, school_id || null, req.user.id]
    );

    const club = clubResult.rows[0];

    // Add the creator as president
    await query(
      `INSERT INTO club_memberships (club_id, user_id, role)
       VALUES ($1, $2, 'president')`,
      [club.id, req.user.id]
    );

    logger.info(`Club created: ${club.id} by user ${req.user.id}`);
    res.status(201).json(club);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A club with this name already exists' });
    }
    logger.error('Create club error:', error);
    res.status(500).json({ error: 'Failed to create club' });
  }
});

/**
 * GET /api/clubs
 * List clubs with optional filters: school_id, category, search
 * Includes member_count. Paginated via limit/offset.
 */
router.get('/', async (req, res) => {
  try {
    const {
      school_id,
      category,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const params = [];
    let paramIndex = 1;
    let whereClause = 'WHERE 1=1';

    if (school_id) {
      whereClause += ` AND c.school_id = $${paramIndex}`;
      params.push(school_id);
      paramIndex++;
    }

    if (category) {
      whereClause += ` AND c.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (c.name ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Count total
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM clubs c ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    params.push(parsedLimit);
    params.push(offset);

    const clubsResult = await query(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM club_memberships cm WHERE cm.club_id = c.id) AS member_count
      FROM clubs c
      ${whereClause}
      ORDER BY c.ranking_score DESC NULLS LAST, c.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    res.json({
      clubs: clubsResult.rows,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error('List clubs error:', error);
    res.status(500).json({ error: 'Failed to list clubs' });
  }
});

/**
 * GET /api/clubs/:id
 * Club detail with members, upcoming events count, and user's membership role
 */
router.get('/:id', async (req, res) => {
  try {
    const clubResult = await query(
      'SELECT * FROM clubs WHERE id = $1',
      [req.params.id]
    );

    if (clubResult.rows.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const club = clubResult.rows[0];

    // Fetch members, upcoming events (sorted by feed_score), user's role, and follow status in parallel
    const [membersResult, upcomingEventsResult, userRoleResult, followResult] = await Promise.all([
      query(
        `SELECT cm.user_id, cm.role, cm.joined_at, u.name AS display_name, u.avatar_url
         FROM club_memberships cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.club_id = $1
         ORDER BY cm.joined_at ASC`,
        [req.params.id]
      ),
      query(
        `SELECT * FROM events
         WHERE club_id = $1 AND event_date > NOW()
         ORDER BY feed_score DESC NULLS LAST, event_date ASC`,
        [req.params.id]
      ),
      query(
        'SELECT role FROM club_memberships WHERE club_id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      ),
      query(
        'SELECT 1 FROM user_club_follows WHERE user_id = $1 AND club_id = $2',
        [req.user.id, req.params.id]
      ),
    ]);

    res.json({
      ...club,
      members: membersResult.rows,
      member_count: membersResult.rows.length,
      upcoming_events: upcomingEventsResult.rows,
      upcoming_events_count: upcomingEventsResult.rows.length,
      user_role: userRoleResult.rows.length > 0 ? userRoleResult.rows[0].role : null,
      is_following: followResult.rows.length > 0,
    });
  } catch (error) {
    logger.error('Get club error:', error);
    res.status(500).json({ error: 'Failed to fetch club' });
  }
});

/**
 * POST /api/clubs/:id/join
 * Join a club as a regular member
 */
router.post('/:id/join', async (req, res) => {
  try {
    // Verify club exists
    const clubResult = await query(
      'SELECT id, name FROM clubs WHERE id = $1',
      [req.params.id]
    );

    if (clubResult.rows.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const result = await query(
      `INSERT INTO club_memberships (club_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (club_id, user_id) DO NOTHING
       RETURNING *`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'Already a member of this club' });
    }

    logger.info(`User ${req.user.id} joined club ${req.params.id}`);
    res.status(201).json({ message: 'Joined club successfully', membership: result.rows[0] });
  } catch (error) {
    logger.error('Join club error:', error);
    res.status(500).json({ error: 'Failed to join club' });
  }
});

/**
 * DELETE /api/clubs/:id/leave
 * Leave a club. Presidents cannot leave (must transfer role first).
 */
router.delete('/:id/leave', async (req, res) => {
  try {
    // Check current membership and role
    const membershipResult = await query(
      'SELECT role FROM club_memberships WHERE club_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (membershipResult.rows.length === 0) {
      return res.status(404).json({ error: 'You are not a member of this club' });
    }

    if (membershipResult.rows[0].role === 'president') {
      return res.status(403).json({ error: 'Presidents cannot leave. Transfer the president role first.' });
    }

    await query(
      'DELETE FROM club_memberships WHERE club_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    logger.info(`User ${req.user.id} left club ${req.params.id}`);
    res.json({ message: 'Left club successfully' });
  } catch (error) {
    logger.error('Leave club error:', error);
    res.status(500).json({ error: 'Failed to leave club' });
  }
});

/**
 * PATCH /api/clubs/:id/members/:userId/role
 * Change a member's role. Only the club president can do this.
 * Body: { role: 'member' | 'officer' | 'president' }
 */
router.patch('/:id/members/:userId/role', async (req, res) => {
  try {
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'role is required' });
    }

    // Verify the requesting user is the president
    const presidentCheck = await query(
      'SELECT role FROM club_memberships WHERE club_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (presidentCheck.rows.length === 0 || presidentCheck.rows[0].role !== 'president') {
      return res.status(403).json({ error: 'Only the club president can change member roles' });
    }

    // Verify target user is a member
    const targetMember = await query(
      'SELECT role FROM club_memberships WHERE club_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );

    if (targetMember.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found in this club' });
    }

    // If transferring president role, demote the current president
    if (role === 'president') {
      await query(
        `UPDATE club_memberships SET role = 'member' WHERE club_id = $1 AND user_id = $2`,
        [req.params.id, req.user.id]
      );
    }

    const result = await query(
      `UPDATE club_memberships SET role = $1 WHERE club_id = $2 AND user_id = $3 RETURNING *`,
      [role, req.params.id, req.params.userId]
    );

    logger.info(`Role updated for user ${req.params.userId} in club ${req.params.id} to ${role}`);
    res.json({ message: 'Role updated successfully', membership: result.rows[0] });
  } catch (error) {
    logger.error('Change member role error:', error);
    res.status(500).json({ error: 'Failed to change member role' });
  }
});

/**
 * GET /api/clubs/:id/members
 * Paginated member list with roles
 */
router.get('/:id/members', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    // Count total members
    const countResult = await query(
      'SELECT COUNT(*)::int AS total FROM club_memberships WHERE club_id = $1',
      [req.params.id]
    );
    const total = countResult.rows[0].total;

    const membersResult = await query(
      `SELECT cm.user_id, cm.role, cm.joined_at, u.name AS display_name, u.avatar_url
       FROM club_memberships cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.club_id = $1
       ORDER BY cm.joined_at ASC
       LIMIT $2 OFFSET $3`,
      [req.params.id, parsedLimit, offset]
    );

    res.json({
      members: membersResult.rows,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error('List club members error:', error);
    res.status(500).json({ error: 'Failed to list club members' });
  }
});

/**
 * POST /api/clubs/suggest
 * User submits a missing club for discovery.
 * Body: { instagram_handle, name? }
 */
router.post('/suggest', async (req, res) => {
  try {
    const { instagram_handle, name } = req.body;

    if (!instagram_handle || !instagram_handle.trim()) {
      return res.status(400).json({ error: 'instagram_handle is required' });
    }

    const result = await query(
      `INSERT INTO discovered_accounts (instagram_handle, name, status, submitted_by)
       VALUES ($1, $2, 'pending', $3)
       RETURNING *`,
      [instagram_handle.trim(), name?.trim() || null, req.user.id]
    );

    logger.info(`Club suggestion submitted: ${instagram_handle} by user ${req.user.id}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This club has already been suggested' });
    }
    logger.error('Suggest club error:', error);
    res.status(500).json({ error: 'Failed to submit club suggestion' });
  }
});

/**
 * POST /api/clubs/register
 * Club admin claims/registers their club.
 * Body: { club_id }
 * Requires user to be a president or officer of the club.
 */
router.post('/register', async (req, res) => {
  try {
    const { club_id } = req.body;

    if (!club_id) {
      return res.status(400).json({ error: 'club_id is required' });
    }

    // Verify club exists
    const clubResult = await query(
      'SELECT id, name FROM clubs WHERE id = $1',
      [club_id]
    );

    if (clubResult.rows.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }

    // Verify user is a president or officer of this club
    const membershipResult = await query(
      `SELECT role FROM club_memberships
       WHERE club_id = $1 AND user_id = $2 AND role IN ('president', 'officer')`,
      [club_id, req.user.id]
    );

    if (membershipResult.rows.length === 0) {
      return res.status(403).json({ error: 'Only club presidents or officers can register a club' });
    }

    // Set registration fields
    const updateResult = await query(
      `UPDATE clubs
       SET is_registered = TRUE,
           registered_user_id = $1,
           discovery_source = 'self_registered'
       WHERE id = $2
       RETURNING *`,
      [req.user.id, club_id]
    );

    // Recalculate ranking_score after registration
    // Registered clubs get a boost: base score + follower factor + registration bonus
    await query(
      `UPDATE clubs
       SET ranking_score = COALESCE(ranking_score, 0) + 10
       WHERE id = $1`,
      [club_id]
    );

    // Fetch the final updated club
    const finalResult = await query(
      'SELECT * FROM clubs WHERE id = $1',
      [club_id]
    );

    logger.info(`Club registered: ${club_id} by user ${req.user.id}`);
    res.json(finalResult.rows[0]);
  } catch (error) {
    logger.error('Register club error:', error);
    res.status(500).json({ error: 'Failed to register club' });
  }
});

/**
 * GET /api/clubs/:id/posts
 * List Instagram posts for a club, newest first.
 */
router.get('/:id/posts', async (req, res) => {
  try {
    const clubId = req.params.id;
    const { limit = 20, offset = 0 } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 50);
    const parsedOffset = parseInt(offset, 10) || 0;

    const postsResult = await query(
      `SELECT p.id, p.post_url, p.image_urls, p.caption, p.posted_at,
        p.likes_count, p.comments_count, p.ai_analysis_status
      FROM posts p
      WHERE p.club_id = $1
      ORDER BY p.posted_at DESC NULLS LAST, p.created_at DESC
      LIMIT $2 OFFSET $3`,
      [clubId, parsedLimit, parsedOffset]
    );

    const countResult = await query(
      'SELECT COUNT(*) AS total FROM posts WHERE club_id = $1',
      [clubId]
    );

    res.json({
      posts: postsResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
    });
  } catch (error) {
    logger.error('Club posts error:', error);
    res.status(500).json({ error: 'Failed to fetch club posts' });
  }
});

module.exports = router;

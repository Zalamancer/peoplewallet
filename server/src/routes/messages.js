const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { getIO } = require('../socket');
const logger = require('../utils/logger');

// All routes require authentication
router.use(authenticate);

/**
 * GET /conversations
 * List user's conversations with last message preview and unread count
 */
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT
        c.id, c.type, c.name, c.avatar_url, c.last_message_at, c.created_at,
        cp.last_read_at, cp.muted, cp.role,
        -- Last message preview
        (SELECT row_to_json(lm) FROM (
          SELECT m.id, m.content, m.message_type, m.sender_id, m.created_at,
            (SELECT u.name FROM users u WHERE u.id = m.sender_id) AS sender_name
          FROM messages m
          WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
          ORDER BY m.created_at DESC LIMIT 1
        ) lm) AS last_message,
        -- Unread count
        (SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = c.id
           AND m.created_at > cp.last_read_at
           AND m.sender_id != $1
           AND m.deleted_at IS NULL
        )::int AS unread_count,
        -- For direct chats: get the other user's info
        CASE WHEN c.type = 'direct' THEN (
          SELECT row_to_json(ou) FROM (
            SELECT u.id, u.name, u.email, u.avatar_url
            FROM conversation_participants op
            JOIN users u ON u.id = op.user_id
            WHERE op.conversation_id = c.id AND op.user_id != $1
            LIMIT 1
          ) ou
        ) END AS other_user
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
      WHERE cp.left_at IS NULL
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
      [userId]
    );

    res.json({ conversations: result.rows });
  } catch (error) {
    logger.error('GET /conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * POST /conversations
 * Create a direct or group conversation
 */
router.post('/conversations', async (req, res) => {
  try {
    const userId = req.user.id;
    const { type = 'direct', name, participantIds = [] } = req.body;

    if (!participantIds.length) {
      return res.status(400).json({ error: 'At least one participant is required' });
    }

    // For direct chats, check if one already exists between these two users
    if (type === 'direct') {
      if (participantIds.length !== 1) {
        return res.status(400).json({ error: 'Direct conversations require exactly one other participant' });
      }

      const otherUserId = participantIds[0];
      const existing = await query(
        `SELECT c.id FROM conversations c
         JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1 AND cp1.left_at IS NULL
         JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2 AND cp2.left_at IS NULL
         WHERE c.type = 'direct'
         LIMIT 1`,
        [userId, otherUserId]
      );

      if (existing.rows.length > 0) {
        return res.json({ conversation: { id: existing.rows[0].id }, existing: true });
      }
    }

    // Create conversation
    const convResult = await query(
      `INSERT INTO conversations (type, name, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, type, name, avatar_url, created_by, last_message_at, created_at`,
      [type, type === 'group' ? (name || 'Group Chat') : null, userId]
    );

    const conversation = convResult.rows[0];

    // Add creator as admin
    await query(
      `INSERT INTO conversation_participants (conversation_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [conversation.id, userId]
    );

    // Add other participants
    for (const pId of participantIds) {
      await query(
        `INSERT INTO conversation_participants (conversation_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
        [conversation.id, pId, type === 'direct' ? 'admin' : 'member']
      );
    }

    // If group, insert a system message
    if (type === 'group') {
      await query(
        `INSERT INTO messages (conversation_id, sender_id, content, message_type)
         VALUES ($1, $2, $3, 'system')`,
        [conversation.id, userId, `${req.user.name} created the group`]
      );
      await query(
        'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
        [conversation.id]
      );
    }

    // Notify participants via socket
    const io = getIO();
    if (io) {
      const allParticipants = [userId, ...participantIds];
      for (const pId of allParticipants) {
        io.to(`user:${pId}`).emit('conversation_created', { conversation });
      }
    }

    res.status(201).json({ conversation });
  } catch (error) {
    logger.error('POST /conversations error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * GET /conversations/:id/messages
 * Cursor-paginated message history
 */
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { before, limit = 50 } = req.query;
    const msgLimit = Math.min(parseInt(limit, 10) || 50, 100);

    // Verify participant
    const pCheck = await query(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    if (pCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    let messagesResult;
    if (before) {
      messagesResult = await query(
        `SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar,
          (SELECT row_to_json(rm) FROM (
            SELECT r.id, r.content, r.sender_id, ru.name AS sender_name
            FROM messages r JOIN users ru ON ru.id = r.sender_id
            WHERE r.id = m.reply_to
          ) rm) AS reply_message
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $1 AND m.created_at < $2 AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC
        LIMIT $3`,
        [conversationId, before, msgLimit]
      );
    } else {
      messagesResult = await query(
        `SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar,
          (SELECT row_to_json(rm) FROM (
            SELECT r.id, r.content, r.sender_id, ru.name AS sender_name
            FROM messages r JOIN users ru ON ru.id = r.sender_id
            WHERE r.id = m.reply_to
          ) rm) AS reply_message
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC
        LIMIT $2`,
        [conversationId, msgLimit]
      );
    }

    res.json({
      messages: messagesResult.rows,
      hasMore: messagesResult.rows.length === msgLimit,
    });
  } catch (error) {
    logger.error('GET /conversations/:id/messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * PUT /conversations/:id
 * Update group name/avatar (admin only)
 */
router.put('/conversations/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { name, avatar_url } = req.body;

    // Verify admin
    const adminCheck = await query(
      "SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2 AND role = 'admin' AND left_at IS NULL",
      [conversationId, userId]
    );
    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only admins can update this conversation' });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(name);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${idx++}`);
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(conversationId);

    const result = await query(
      `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    // Broadcast update
    const io = getIO();
    if (io) {
      io.to(`conv:${conversationId}`).emit('conversation_updated', result.rows[0]);
    }

    res.json({ conversation: result.rows[0] });
  } catch (error) {
    logger.error('PUT /conversations/:id error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

/**
 * POST /conversations/:id/participants
 * Add members to a group conversation
 */
router.post('/conversations/:id/participants', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { userIds } = req.body;

    if (!userIds?.length) {
      return res.status(400).json({ error: 'userIds array is required' });
    }

    // Verify admin
    const adminCheck = await query(
      "SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2 AND role = 'admin' AND left_at IS NULL",
      [conversationId, userId]
    );
    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only admins can add participants' });
    }

    const added = [];
    for (const uid of userIds) {
      const result = await query(
        `INSERT INTO conversation_participants (conversation_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL, joined_at = NOW()
         RETURNING user_id`,
        [conversationId, uid]
      );
      if (result.rows.length > 0) added.push(uid);
    }

    // System message
    if (added.length > 0) {
      const names = await query(
        'SELECT name FROM users WHERE id = ANY($1)',
        [added]
      );
      const nameList = names.rows.map((r) => r.name).join(', ');
      await query(
        `INSERT INTO messages (conversation_id, sender_id, content, message_type)
         VALUES ($1, $2, $3, 'system')`,
        [conversationId, userId, `${req.user.name} added ${nameList}`]
      );
    }

    // Notify new participants via socket
    const io = getIO();
    if (io) {
      const conv = await query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
      for (const uid of added) {
        io.to(`user:${uid}`).emit('conversation_created', { conversation: conv.rows[0] });
      }
    }

    res.json({ added });
  } catch (error) {
    logger.error('POST /conversations/:id/participants error:', error);
    res.status(500).json({ error: 'Failed to add participants' });
  }
});

/**
 * DELETE /conversations/:id/leave
 * Leave a group conversation (soft-leave)
 */
router.delete('/conversations/:id/leave', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    await query(
      'UPDATE conversation_participants SET left_at = NOW() WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    // System message
    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type)
       VALUES ($1, $2, $3, 'system')`,
      [conversationId, userId, `${req.user.name} left the group`]
    );

    const io = getIO();
    if (io) {
      io.to(`conv:${conversationId}`).emit('participant_left', { userId, conversationId });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('DELETE /conversations/:id/leave error:', error);
    res.status(500).json({ error: 'Failed to leave conversation' });
  }
});

/**
 * PUT /conversations/:id/mute
 * Toggle mute for a conversation
 */
router.put('/conversations/:id/mute', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { muted } = req.body;

    await query(
      'UPDATE conversation_participants SET muted = $1 WHERE conversation_id = $2 AND user_id = $3',
      [muted !== false, conversationId, userId]
    );

    res.json({ muted: muted !== false });
  } catch (error) {
    logger.error('PUT /conversations/:id/mute error:', error);
    res.status(500).json({ error: 'Failed to update mute setting' });
  }
});

/**
 * DELETE /:messageId
 * Soft-delete a message (sender only)
 */
router.delete('/:messageId', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;

    const result = await query(
      'UPDATE messages SET deleted_at = NOW(), content = NULL WHERE id = $1 AND sender_id = $2 RETURNING conversation_id',
      [messageId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found or not authorized' });
    }

    const io = getIO();
    if (io) {
      io.to(`conv:${result.rows[0].conversation_id}`).emit('message_deleted', {
        messageId,
        conversationId: result.rows[0].conversation_id,
      });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('DELETE /:messageId error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

/**
 * GET /search?q=
 * Full-text search across user's messages
 */
router.get('/search', async (req, res) => {
  try {
    const userId = req.user.id;
    const { q, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const searchLimit = Math.min(parseInt(limit, 10) || 20, 50);

    const result = await query(
      `SELECT m.id, m.conversation_id, m.content, m.created_at, m.sender_id,
        u.name AS sender_name, c.name AS conversation_name, c.type AS conversation_type
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      JOIN conversations c ON c.id = m.conversation_id
      JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = $1
      WHERE m.deleted_at IS NULL
        AND to_tsvector('english', COALESCE(m.content, '')) @@ plainto_tsquery('english', $2)
      ORDER BY m.created_at DESC
      LIMIT $3`,
      [userId, q, searchLimit]
    );

    res.json({ results: result.rows });
  } catch (error) {
    logger.error('GET /search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /unread-count
 * Total unread messages count for badge display
 */
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT COALESCE(SUM(
        (SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = cp.conversation_id
           AND m.created_at > cp.last_read_at
           AND m.sender_id != $1
           AND m.deleted_at IS NULL)
      ), 0)::int AS total_unread
      FROM conversation_participants cp
      WHERE cp.user_id = $1 AND cp.left_at IS NULL`,
      [userId]
    );

    res.json({ totalUnread: result.rows[0]?.total_unread || 0 });
  } catch (error) {
    logger.error('GET /unread-count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

/**
 * GET /conversations/:id/participants
 * Get participants of a conversation
 */
router.get('/conversations/:id/participants', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    // Verify participant
    const pCheck = await query(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    if (pCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    const result = await query(
      `SELECT cp.user_id, cp.role, cp.joined_at, cp.muted,
        u.name, u.email, u.avatar_url
      FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = $1 AND cp.left_at IS NULL
      ORDER BY cp.joined_at`,
      [conversationId]
    );

    res.json({ participants: result.rows });
  } catch (error) {
    logger.error('GET /conversations/:id/participants error:', error);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

module.exports = router;

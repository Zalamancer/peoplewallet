const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { sendToUser } = require('../services/notifications');
const logger = require('../utils/logger');

// Track connected users: Map<userId, Set<socketId>>
const connectedUsers = new Map();

let io;

/**
 * Initialize Socket.IO on an existing HTTP server
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Auth middleware — verify JWT from handshake
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userResult = await query('SELECT id, name, email FROM users WHERE id = $1', [decoded.userId]);

      if (userResult.rows.length === 0) {
        return next(new Error('User not found'));
      }

      socket.userId = decoded.userId;
      socket.userName = userResult.rows[0].name;
      next();
    } catch (err) {
      logger.error('Socket auth error:', err.message);
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    logger.info(`Socket connected: user=${userId} socket=${socket.id}`);

    // Track connection
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId).add(socket.id);

    // Join personal room
    socket.join(`user:${userId}`);

    // Join all conversation rooms
    try {
      const convResult = await query(
        'SELECT conversation_id FROM conversation_participants WHERE user_id = $1 AND left_at IS NULL',
        [userId]
      );
      for (const row of convResult.rows) {
        socket.join(`conv:${row.conversation_id}`);
      }
    } catch (err) {
      logger.error('Failed to join conversation rooms:', err.message);
    }

    // Broadcast presence to all conversations
    broadcastPresence(userId, true);

    // --- Event handlers ---

    socket.on('send_message', async (data, callback) => {
      try {
        const { conversationId, content, messageType = 'text', metadata = {}, replyTo } = data;

        // Verify user is a participant
        const participantCheck = await query(
          'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
          [conversationId, userId]
        );
        if (participantCheck.rows.length === 0) {
          return callback?.({ error: 'Not a participant in this conversation' });
        }

        // Insert message
        const msgResult = await query(
          `INSERT INTO messages (conversation_id, sender_id, content, message_type, metadata, reply_to)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, conversation_id, sender_id, content, message_type, metadata, reply_to, created_at`,
          [conversationId, userId, content, messageType, JSON.stringify(metadata), replyTo || null]
        );

        const message = msgResult.rows[0];

        // Update conversation last_message_at
        await query(
          'UPDATE conversations SET last_message_at = $1, updated_at = $1 WHERE id = $2',
          [message.created_at, conversationId]
        );

        // Attach sender info
        message.sender_name = socket.userName;

        // Broadcast to conversation room
        io.to(`conv:${conversationId}`).emit('new_message', message);

        // Send push notifications to offline participants
        const participants = await query(
          'SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2 AND left_at IS NULL AND muted = FALSE',
          [conversationId, userId]
        );

        for (const p of participants.rows) {
          if (!isUserOnline(p.user_id)) {
            sendToUser(p.user_id, {
              title: socket.userName,
              body: messageType === 'text' ? content?.substring(0, 100) : `Sent a ${messageType}`,
              data: { type: 'new_message', conversationId, messageId: message.id },
            }).catch((err) => logger.error('Push notification error:', err.message));
          }
        }

        callback?.({ success: true, message });
      } catch (err) {
        logger.error('send_message error:', err.message);
        callback?.({ error: 'Failed to send message' });
      }
    });

    socket.on('typing_start', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing_start', {
        conversationId,
        userId,
        userName: socket.userName,
      });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing_stop', {
        conversationId,
        userId,
      });
    });

    socket.on('mark_read', async ({ conversationId }) => {
      try {
        await query(
          'UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2',
          [conversationId, userId]
        );

        io.to(`conv:${conversationId}`).emit('messages_read', {
          conversationId,
          userId,
          readAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.error('mark_read error:', err.message);
      }
    });

    socket.on('join_conversation', ({ conversationId }) => {
      socket.join(`conv:${conversationId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: user=${userId} socket=${socket.id}`);

      const userSockets = connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedUsers.delete(userId);
          broadcastPresence(userId, false);
        }
      }
    });
  });

  logger.info('Socket.IO initialized');
  return io;
};

/**
 * Check if a user has any active socket connections
 */
const isUserOnline = (userId) => {
  const sockets = connectedUsers.get(userId);
  return sockets && sockets.size > 0;
};

/**
 * Broadcast presence change to all conversations a user is in
 */
const broadcastPresence = async (userId, online) => {
  if (!io) return;
  try {
    const convResult = await query(
      'SELECT conversation_id FROM conversation_participants WHERE user_id = $1 AND left_at IS NULL',
      [userId]
    );
    for (const row of convResult.rows) {
      io.to(`conv:${row.conversation_id}`).emit('presence', {
        userId,
        online,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error('broadcastPresence error:', err.message);
  }
};

/**
 * Get the Socket.IO instance (for use in REST routes)
 */
const getIO = () => io;

module.exports = { initSocket, getIO, isUserOnline, connectedUsers };

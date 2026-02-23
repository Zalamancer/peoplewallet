import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

let socket = null;

/**
 * Get the server base URL (same pattern as api.js)
 */
const getServerUrl = () => {
  if (!__DEV__) return 'https://peoplewallet-production.up.railway.app';

  const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:3000`;
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
};

/**
 * Connect to Socket.IO server
 */
export const connectSocket = async () => {
  if (socket?.connected) return socket;

  const token = await AsyncStorage.getItem('auth_token');
  if (!token) return null;

  const serverUrl = getServerUrl();

  socket = io(serverUrl, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  return socket;
};

/**
 * Disconnect from Socket.IO server
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/**
 * Get the current socket instance
 */
export const getSocket = () => socket;

/**
 * Send a message via socket
 */
export const sendMessage = (data) => {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      return reject(new Error('Socket not connected'));
    }
    socket.emit('send_message', data, (response) => {
      if (response.error) reject(new Error(response.error));
      else resolve(response);
    });
  });
};

/**
 * Mark conversation as read
 */
export const markRead = (conversationId) => {
  if (socket?.connected) {
    socket.emit('mark_read', { conversationId });
  }
};

/**
 * Start typing indicator
 */
export const startTyping = (conversationId) => {
  if (socket?.connected) {
    socket.emit('typing_start', { conversationId });
  }
};

/**
 * Stop typing indicator
 */
export const stopTyping = (conversationId) => {
  if (socket?.connected) {
    socket.emit('typing_stop', { conversationId });
  }
};

/**
 * Join a conversation room (for newly created convos)
 */
export const joinConversation = (conversationId) => {
  if (socket?.connected) {
    socket.emit('join_conversation', { conversationId });
  }
};

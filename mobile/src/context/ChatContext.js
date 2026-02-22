import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { connectSocket, disconnectSocket, getSocket, joinConversation } from '../services/socket';
import { messagesAPI } from '../services/api';

const ChatContext = createContext(null);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export const ChatProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [totalUnread, setTotalUnread] = useState(0);
  const [connected, setConnected] = useState(false);
  const appState = useRef(AppState.currentState);

  // Connect/disconnect based on auth state
  useEffect(() => {
    if (isAuthenticated) {
      initConnection();
    } else {
      disconnectSocket();
      setConnected(false);
      setTotalUnread(0);
    }

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated]);

  // Reconnect on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (isAuthenticated) {
          initConnection();
        }
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [isAuthenticated]);

  const initConnection = async () => {
    try {
      const socket = await connectSocket();
      if (!socket) return;

      setConnected(true);

      // Fetch initial unread count
      try {
        const response = await messagesAPI.getUnreadCount();
        setTotalUnread(response.data.totalUnread);
      } catch (err) {
        console.warn('Failed to fetch unread count:', err?.message);
      }

      // Listen for new messages to update unread count
      socket.off('new_message');
      socket.on('new_message', () => {
        setTotalUnread((prev) => prev + 1);
      });

      // Listen for conversation creation to join room
      socket.off('conversation_created');
      socket.on('conversation_created', ({ conversation }) => {
        joinConversation(conversation.id);
      });

      socket.off('connect');
      socket.on('connect', () => setConnected(true));

      socket.off('disconnect');
      socket.on('disconnect', () => setConnected(false));
    } catch (err) {
      console.warn('Socket connection error:', err?.message);
      setConnected(false);
    }
  };

  const refreshUnread = useCallback(async () => {
    try {
      const response = await messagesAPI.getUnreadCount();
      setTotalUnread(response.data.totalUnread);
    } catch (err) {
      console.warn('Failed to refresh unread count:', err?.message);
    }
  }, []);

  const decrementUnread = useCallback((count = 1) => {
    setTotalUnread((prev) => Math.max(0, prev - count));
  }, []);

  const value = {
    totalUnread,
    connected,
    refreshUnread,
    decrementUnread,
    getSocket,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export default ChatContext;

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { messagesAPI } from '../services/api';
import { sendMessage, markRead, startTyping, stopTyping, getSocket } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import MessageBubble from '../components/MessageBubble';
import GifPicker from '../components/GifPicker';

const ChatScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { conversationId, title, isGroup } = route.params;
  const { user } = useAuth();
  const { decrementUnread } = useChat();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const typingTimeout = useRef(null);
  const isTypingRef = useRef(false);
  const flatListRef = useRef(null);

  // Fetch initial messages
  useEffect(() => {
    fetchMessages();
    markRead(conversationId);
    decrementUnread();
  }, [conversationId]);

  // Socket listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewMessage = (msg) => {
      if (msg.conversation_id !== conversationId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [msg, ...prev];
      });
      markRead(conversationId);
    };

    const handleTypingStart = ({ conversationId: cId, userId, userName }) => {
      if (cId !== conversationId || userId === user?.id) return;
      setTypingUsers((prev) => {
        if (prev.find((t) => t.userId === userId)) return prev;
        return [...prev, { userId, userName }];
      });
    };

    const handleTypingStop = ({ conversationId: cId, userId }) => {
      if (cId !== conversationId) return;
      setTypingUsers((prev) => prev.filter((t) => t.userId !== userId));
    };

    const handleMessageDeleted = ({ messageId, conversationId: cId }) => {
      if (cId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, deleted_at: new Date().toISOString(), content: null } : m))
      );
    };

    socket.on('new_message', handleNewMessage);
    socket.on('typing_start', handleTypingStart);
    socket.on('typing_stop', handleTypingStop);
    socket.on('message_deleted', handleMessageDeleted);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('typing_start', handleTypingStart);
      socket.off('typing_stop', handleTypingStop);
      socket.off('message_deleted', handleMessageDeleted);
    };
  }, [conversationId, user?.id]);

  const fetchMessages = async () => {
    try {
      const response = await messagesAPI.getMessages(conversationId, { limit: 50 });
      setMessages(response.data.messages || []);
      setHasMore(response.data.hasMore);
    } catch (err) {
      console.warn('Failed to fetch messages:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[messages.length - 1];
      const response = await messagesAPI.getMessages(conversationId, {
        before: oldest.created_at,
        limit: 50,
      });
      const newMsgs = response.data.messages || [];
      setMessages((prev) => [...prev, ...newMsgs]);
      setHasMore(response.data.hasMore);
    } catch (err) {
      console.warn('Failed to load more messages:', err?.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setInputText('');
    setReplyTo(null);

    // Stop typing
    if (isTypingRef.current) {
      stopTyping(conversationId);
      isTypingRef.current = false;
    }

    try {
      await sendMessage({
        conversationId,
        content: text,
        messageType: 'text',
        replyTo: replyTo?.id,
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to send message');
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const handleTyping = (text) => {
    setInputText(text);

    if (!isTypingRef.current && text.length > 0) {
      startTyping(conversationId);
      isTypingRef.current = true;
    }

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      if (isTypingRef.current) {
        stopTyping(conversationId);
        isTypingRef.current = false;
      }
    }, 2000);
  };

  const handleLongPress = (message) => {
    if (message.sender_id !== user?.id) {
      // Can only reply
      Alert.alert('Message', null, [
        { text: 'Reply', onPress: () => setReplyTo(message) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      Alert.alert('Message', null, [
        { text: 'Reply', onPress: () => setReplyTo(message) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await messagesAPI.deleteMessage(message.id);
            } catch (err) {
              Alert.alert('Error', 'Failed to delete message');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleSendGif = async (gif) => {
    try {
      const preview = gif.images?.fixed_width;
      const still = gif.images?.fixed_width_still;
      await sendMessage({
        conversationId,
        content: gif.title || 'GIF',
        messageType: 'gif',
        metadata: {
          gif_url: gif.images?.original?.url,
          gif_preview_url: preview?.url,
          gif_still_url: still?.url,
          gif_width: Number(preview?.width) || 200,
          gif_height: Number(preview?.height) || 200,
          giphy_id: gif.id,
        },
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to send GIF');
    }
  };

  const renderMessage = useCallback(
    ({ item, index }) => {
      const nextMsg = messages[index + 1];
      const showSender = isGroup && (!nextMsg || nextMsg.sender_id !== item.sender_id);

      return (
        <MessageBubble
          message={item}
          isOwn={item.sender_id === user?.id}
          showSenderName={showSender}
          onLongPress={handleLongPress}
          onReplyPress={(reply) => {
            // Could scroll to the replied message
          }}
          navigation={navigation}
        />
      );
    },
    [messages, user?.id, isGroup]
  );

  const typingText = typingUsers.length > 0
    ? typingUsers.length === 1
      ? `${typingUsers[0].userName} is typing...`
      : `${typingUsers.length} people typing...`
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => {
            if (isGroup) {
              navigation.navigate('GroupChatInfo', { conversationId });
            }
          }}
          disabled={!isGroup}
        >
          <Text style={styles.headerTitle} numberOfLines={1}>{title || 'Chat'}</Text>
          {typingText && <Text style={styles.typingIndicator}>{typingText}</Text>}
        </TouchableOpacity>
        {isGroup && (
          <TouchableOpacity
            onPress={() => navigation.navigate('GroupChatInfo', { conversationId })}
            style={styles.headerButton}
          >
            <Ionicons name="information-circle-outline" size={24} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            inverted
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 10 }} color={colors.primary} /> : null}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubble-outline" size={48} color={colors.textTertiary} />
                <Text style={styles.emptyChatText}>Send the first message!</Text>
              </View>
            }
            contentContainerStyle={messages.length === 0 ? styles.emptyContent : { paddingVertical: spacing.sm }}
          />
        )}

        {/* Reply preview */}
        {replyTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarContent}>
              <Text style={styles.replyBarName}>{replyTo.sender_name}</Text>
              <Text style={styles.replyBarText} numberOfLines={1}>{replyTo.content}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(spacing.sm, insets.bottom) }]}>
          <TouchableOpacity
            style={styles.gifButton}
            onPress={() => setGifPickerVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.gifButtonText}>GIF</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            placeholder="Message..."
            placeholderTextColor={colors.placeholder}
            value={inputText}
            onChangeText={handleTyping}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <Ionicons name="send" size={20} color={inputText.trim() && !sending ? colors.white : colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <GifPicker
        visible={gifPickerVisible}
        onClose={() => setGifPickerVisible(false)}
        onSelect={handleSendGif}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.sm,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  typingIndicator: {
    fontSize: 12,
    color: colors.primary,
    fontStyle: 'italic',
  },
  headerButton: {
    padding: spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChat: {
    alignItems: 'center',
    gap: spacing.sm,
    transform: [{ scaleY: -1 }],
  },
  emptyChatText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },

  // Reply bar
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  replyBarContent: {
    flex: 1,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  replyBarName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  replyBarText: {
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  gifButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  gifButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    color: colors.textPrimary,
    minHeight: 44,
    maxHeight: 120,
    marginRight: spacing.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.background,
  },
});

export default ChatScreen;

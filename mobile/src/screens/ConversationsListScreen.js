import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { messagesAPI } from '../services/api';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
};

const getAvatarColor = (name) => {
  const palette = ['#4F46E5', '#7C3AED', '#EC4899', '#EF4444', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6'];
  if (!name) return palette[0];
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % palette.length;
  return palette[idx];
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const ConversationItem = ({ item, userId, onPress }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isGroup = item.type === 'group';
  const displayName = isGroup ? item.name : (item.other_user?.name || 'Unknown');
  const lastMsg = item.last_message;
  const unread = item.unread_count || 0;

  let preview = 'No messages yet';
  if (lastMsg) {
    const isMine = lastMsg.sender_id === userId;
    const prefix = isMine ? 'You: ' : (isGroup ? `${lastMsg.sender_name}: ` : '');
    if (lastMsg.message_type === 'system') {
      preview = lastMsg.content;
    } else if (lastMsg.message_type === 'image') {
      preview = `${prefix}Sent a photo`;
    } else if (lastMsg.message_type === 'contact_card') {
      preview = `${prefix}Shared a contact`;
    } else if (lastMsg.message_type === 'gif') {
      preview = `${prefix}Sent a GIF`;
    } else {
      preview = `${prefix}${lastMsg.content || ''}`;
    }
  }

  return (
    <TouchableOpacity style={styles.convItem} onPress={() => onPress(item)} activeOpacity={0.7}>
      <View style={[styles.avatar, { backgroundColor: getAvatarColor(displayName) }]}>
        {isGroup ? (
          <Ionicons name="people" size={22} color={colors.textInverse} />
        ) : (
          <Text style={styles.initials}>{getInitials(displayName)}</Text>
        )}
      </View>

      <View style={styles.convContent}>
        <View style={styles.convTopRow}>
          <Text style={[styles.convName, unread > 0 && styles.convNameUnread]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.convTime, unread > 0 && styles.convTimeUnread]}>
            {formatTime(item.last_message_at)}
          </Text>
        </View>
        <View style={styles.convBottomRow}>
          <Text
            style={[styles.convPreview, unread > 0 && styles.convPreviewUnread]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </View>
      </View>

      {item.muted && (
        <Ionicons name="volume-mute" size={14} color={colors.textTertiary} style={{ marginLeft: 4 }} />
      )}
    </TouchableOpacity>
  );
};

const ConversationsListScreen = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const { user } = useAuth();
  const { refreshUnread } = useChat();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await messagesAPI.getConversations();
      setConversations(response.data.conversations || []);
    } catch (err) {
      console.warn('Failed to fetch conversations:', err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchConversations();
      refreshUnread();
    }, [fetchConversations, refreshUnread])
  );

  const handlePress = (conv) => {
    const isGroup = conv.type === 'group';
    navigation.navigate('Chat', {
      conversationId: conv.id,
      title: isGroup ? conv.name : conv.other_user?.name,
      isGroup,
    });
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.navigate('NewConversation')}
        >
          <Ionicons name="create-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySubtitle}>Start a conversation with someone</Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => navigation.navigate('NewConversation')}
          >
            <Ionicons name="add" size={20} color={colors.textInverse} />
            <Text style={styles.emptyButtonText}>New Message</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationItem item={item} userId={user?.id} onPress={handlePress} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  headerButton: {
    padding: spacing.xs,
  },

  // Conversation item
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  initials: {
    color: colors.textInverse,
    fontSize: 18,
    fontWeight: '700',
  },
  convContent: {
    flex: 1,
  },
  convTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  convName: {
    ...typography.body,
    fontWeight: '500',
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  convNameUnread: {
    fontWeight: '700',
  },
  convTime: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  convTimeUnread: {
    color: colors.primary,
    fontWeight: '600',
  },
  convBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  convPreview: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    flex: 1,
    marginRight: spacing.sm,
  },
  convPreviewUnread: {
    color: colors.textPrimary,
    fontWeight: '500',
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '700',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  emptyButtonText: {
    color: colors.textInverse,
    fontWeight: '600',
    fontSize: 15,
  },
});

export default ConversationsListScreen;

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { messagesAPI } from '../services/api';
import { sendMessage } from '../services/socket';

const ShareEventModal = ({ visible, onClose, event, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState(null);

  useEffect(() => {
    if (visible) {
      fetchConversations();
    }
  }, [visible]);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const res = await messagesAPI.getConversations();
      setConversations((res.data.conversations || []).slice(0, 8));
    } catch {
      // Silently fail - conversations section just won't show
    } finally {
      setLoading(false);
    }
  };

  const eventName = event?.name || event?.title || 'Event';
  const clubName = event?.club_name || '';
  const postUrl = event?.post_url || '';
  const thumbnail = event?.post_image_urls?.[0] || event?.image_url || null;

  const handleCopyLink = async () => {
    if (!postUrl) {
      Alert.alert('No Link', 'No link available for this event.');
      return;
    }
    await Clipboard.setStringAsync(postUrl);
    Alert.alert('Copied!', 'Event link copied to clipboard.');
    onClose();
  };

  const handleNativeShare = async () => {
    try {
      await Share.share({
        title: eventName,
        message: `Check out "${eventName}"${clubName ? ` by ${clubName}` : ''} on PeopleWallet!${
          postUrl ? `\n${postUrl}` : ''
        }`,
      });
      onClose();
    } catch {
      // User cancelled
    }
  };

  const handleSendToConversation = async (conversation) => {
    try {
      setSendingTo(conversation.id);
      await sendMessage({
        conversationId: conversation.id,
        content: `Shared an event: ${eventName}`,
        messageType: 'event_card',
        metadata: {
          event_id: event?.id,
          event_name: eventName,
          club_name: clubName,
          image_url: thumbnail,
          event_date: event?.event_date,
          location: event?.location,
          post_url: postUrl,
        },
      });
      Alert.alert('Sent!', `Event shared to ${getConversationName(conversation)}.`);
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to send. Please try again.');
    } finally {
      setSendingTo(null);
    }
  };

  const getConversationName = (conv) => {
    if (conv.name) return conv.name;
    if (conv.other_user?.name) return conv.other_user.name;
    return 'Chat';
  };

  const getConversationInitial = (conv) => {
    const name = getConversationName(conv);
    return (name || '?').charAt(0).toUpperCase();
  };

  const renderConversationItem = ({ item }) => {
    const isSending = sendingTo === item.id;
    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => handleSendToConversation(item)}
        disabled={isSending}
        activeOpacity={0.7}
      >
        {item.other_user?.avatar_url || item.avatar_url ? (
          <Image
            source={{ uri: item.other_user?.avatar_url || item.avatar_url }}
            style={styles.conversationAvatar}
          />
        ) : (
          <View style={styles.conversationAvatarPlaceholder}>
            <Text style={styles.conversationInitial}>{getConversationInitial(item)}</Text>
          </View>
        )}
        <Text style={styles.conversationName} numberOfLines={1}>
          {getConversationName(item)}
        </Text>
        {isSending && <ActivityIndicator size="small" color={colors.primary} />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Event Preview */}
          <View style={styles.previewCard}>
            {thumbnail ? (
              <Image source={{ uri: thumbnail }} style={styles.previewImage} />
            ) : (
              <View style={styles.previewImagePlaceholder}>
                <Ionicons name="calendar" size={20} color={colors.textTertiary} />
              </View>
            )}
            <View style={styles.previewInfo}>
              <Text style={styles.previewName} numberOfLines={2}>{eventName}</Text>
              {clubName ? (
                <Text style={styles.previewClub} numberOfLines={1}>{clubName}</Text>
              ) : null}
            </View>
          </View>

          {/* Send to recent conversations */}
          {conversations.length > 0 && (
            <View style={styles.sendToSection}>
              <Text style={styles.sectionLabel}>Send to</Text>
              <FlatList
                data={conversations}
                keyExtractor={(item) => item.id}
                renderItem={renderConversationItem}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.conversationsList}
              />
            </View>
          )}
          {loading && (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.md }} />
          )}

          {/* Quick Actions */}
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionButton} onPress={handleCopyLink} activeOpacity={0.7}>
              <View style={[styles.actionIconCircle, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="link-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.actionLabel}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                handleNativeShare();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: colors.success + '20' }]}>
                <Ionicons name="chatbubble-outline" size={22} color={colors.success} />
              </View>
              <Text style={styles.actionLabel}>Messages</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                const igUrl = `instagram-stories://share?url=${encodeURIComponent(postUrl || '')}`;
                import('react-native').then(({ Linking }) => {
                  Linking.openURL(igUrl).catch(() => {
                    handleNativeShare();
                  });
                });
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: '#E4405F20' }]}>
                <Ionicons name="logo-instagram" size={22} color="#E4405F" />
              </View>
              <Text style={styles.actionLabel}>Instagram</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleNativeShare} activeOpacity={0.7}>
              <View style={[styles.actionIconCircle, { backgroundColor: colors.textTertiary + '20' }]}>
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.textTertiary} />
              </View>
              <Text style={styles.actionLabel}>More</Text>
            </TouchableOpacity>
          </View>

          {/* Cancel Button */}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const createStyles = (colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34, // safe area bottom
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },

  // Event preview
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  previewImage: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.borderLight,
  },
  previewImagePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  previewName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  previewClub: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Send to section
  sendToSection: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  conversationsList: {
    paddingRight: spacing.md,
  },
  conversationItem: {
    alignItems: 'center',
    marginRight: spacing.lg,
    width: 64,
  },
  conversationAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: spacing.xs,
  },
  conversationAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  conversationInitial: {
    ...typography.h3,
    fontSize: 18,
    color: colors.primary,
  },
  conversationName: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
  },

  // Actions grid
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
  },
  actionButton: {
    alignItems: 'center',
    width: 72,
  },
  actionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  actionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
  },

  // Cancel
  cancelButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
  },
  cancelText: {
    ...typography.button,
    color: colors.error,
  },
});

export default ShareEventModal;

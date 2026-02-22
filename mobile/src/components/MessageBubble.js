import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, spacing, typography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

const CARD_WIDTH = 240;

const formatTime = (dateStr) => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

const formatCardDate = (dateStr) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return dateStr || '';
  }
};

const PLATFORM_ICONS = {
  instagram: 'logo-instagram',
  linkedin: 'logo-linkedin',
  twitter: 'logo-twitter',
  facebook: 'logo-facebook',
  github: 'logo-github',
  discord: 'logo-discord',
  tiktok: 'musical-notes',
};

const MessageBubble = ({ message, isOwn, showSenderName, onLongPress, onReplyPress, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isSystem = message.message_type === 'system';
  const isDeleted = !!message.deleted_at;

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  if (isDeleted) {
    return (
      <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, styles.deletedBubble]}>
          <Ionicons name="ban-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.deletedText}>Message deleted</Text>
        </View>
      </View>
    );
  }

  const renderReply = () => {
    if (!message.reply_message) return null;
    return (
      <TouchableOpacity
        style={[styles.replyPreview, isOwn ? styles.replyPreviewOwn : styles.replyPreviewOther]}
        onPress={() => onReplyPress?.(message.reply_message)}
        activeOpacity={0.7}
      >
        <Text style={styles.replyName} numberOfLines={1}>
          {message.reply_message.sender_name}
        </Text>
        <Text style={styles.replyContent} numberOfLines={1}>
          {message.reply_message.content}
        </Text>
      </TouchableOpacity>
    );
  };

  const isCardType = ['event_card', 'club_card', 'post_card', 'contact_card'].includes(message.message_type);

  const renderContent = () => {
    const meta = message.metadata || {};

    switch (message.message_type) {
      case 'image':
        return (
          <View>
            {meta.image_url && (
              <Image
                source={{ uri: meta.image_url }}
                style={styles.imageMessage}
                resizeMode="cover"
              />
            )}
            {message.content ? <Text style={[styles.text, isOwn && styles.textOwn]}>{message.content}</Text> : null}
          </View>
        );

      case 'event_card':
        return (
          <TouchableOpacity
            style={styles.richCard}
            activeOpacity={0.7}
            onPress={() => {
              if (meta.event_id && navigation) {
                navigation.navigate('EventDetail', { eventId: meta.event_id, source: 'chat' });
              }
            }}
          >
            {meta.image_url ? (
              <Image source={{ uri: meta.image_url }} style={styles.richCardImage} resizeMode="cover" />
            ) : (
              <View style={styles.richCardImagePlaceholder}>
                <Ionicons name="calendar" size={24} color={colors.textTertiary} />
              </View>
            )}
            <View style={styles.richCardBody}>
              <Text style={styles.richCardTitle} numberOfLines={2}>{meta.event_name || 'Event'}</Text>
              {meta.event_date ? (
                <View style={styles.richCardRow}>
                  <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
                  <Text style={styles.richCardDetail} numberOfLines={1}>{formatCardDate(meta.event_date)}</Text>
                </View>
              ) : null}
              {meta.location ? (
                <View style={styles.richCardRow}>
                  <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
                  <Text style={styles.richCardDetail} numberOfLines={1}>{meta.location}</Text>
                </View>
              ) : null}
              {meta.club_name ? (
                <View style={styles.richCardRow}>
                  <Ionicons name="people-outline" size={12} color={colors.textTertiary} />
                  <Text style={styles.richCardDetail} numberOfLines={1}>{meta.club_name}</Text>
                </View>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={styles.richCardChevron} />
          </TouchableOpacity>
        );

      case 'club_card':
        return (
          <TouchableOpacity
            style={styles.richCard}
            activeOpacity={0.7}
            onPress={() => {
              if (meta.club_id && navigation) {
                navigation.navigate('ClubDetail', { clubId: meta.club_id });
              }
            }}
          >
            {meta.image_url ? (
              <Image source={{ uri: meta.image_url }} style={styles.richCardAvatarImage} resizeMode="cover" />
            ) : (
              <View style={styles.richCardAvatarPlaceholder}>
                <Text style={styles.richCardAvatarText}>
                  {(meta.club_name || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.richCardBody}>
              <Text style={styles.richCardTitle} numberOfLines={1}>{meta.club_name || 'Club'}</Text>
              {meta.category ? (
                <View style={styles.richCardBadge}>
                  <Text style={styles.richCardBadgeText}>{meta.category}</Text>
                </View>
              ) : null}
              {meta.instagram_handle ? (
                <View style={styles.richCardRow}>
                  <Ionicons name="logo-instagram" size={12} color={colors.textTertiary} />
                  <Text style={styles.richCardDetail} numberOfLines={1}>@{meta.instagram_handle}</Text>
                </View>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={styles.richCardChevron} />
          </TouchableOpacity>
        );

      case 'post_card':
        return (
          <TouchableOpacity
            style={styles.richCard}
            activeOpacity={0.7}
            onPress={() => {
              if (meta.content_url) {
                Linking.openURL(meta.content_url).catch(() => {});
              }
            }}
          >
            {meta.thumbnail_url ? (
              <Image source={{ uri: meta.thumbnail_url }} style={styles.richCardImage} resizeMode="cover" />
            ) : (
              <View style={styles.richCardImagePlaceholder}>
                <Ionicons name="document-text-outline" size={24} color={colors.textTertiary} />
              </View>
            )}
            <View style={styles.richCardBody}>
              <Text style={styles.richCardTitle} numberOfLines={2}>{meta.title || 'Post'}</Text>
              {meta.author ? (
                <Text style={styles.richCardDetail} numberOfLines={1}>{meta.author}</Text>
              ) : null}
              {meta.platform ? (
                <View style={styles.richCardBadge}>
                  <Ionicons
                    name={PLATFORM_ICONS[meta.platform] || 'globe-outline'}
                    size={10}
                    color={colors.primary}
                  />
                  <Text style={styles.richCardBadgeText}>{meta.platform}</Text>
                </View>
              ) : null}
            </View>
            <Ionicons name="open-outline" size={14} color={colors.textTertiary} style={styles.richCardChevron} />
          </TouchableOpacity>
        );

      case 'contact_card':
        return (
          <TouchableOpacity
            style={styles.richCard}
            activeOpacity={0.7}
            onPress={() => {
              if (meta.contact_id && navigation) {
                navigation.navigate('ContactDetail', { contactId: meta.contact_id });
              }
            }}
          >
            {meta.avatar_url ? (
              <Image source={{ uri: meta.avatar_url }} style={styles.richCardAvatarImage} resizeMode="cover" />
            ) : (
              <View style={styles.richCardAvatarPlaceholder}>
                <Text style={styles.richCardAvatarText}>
                  {(meta.contact_name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </Text>
              </View>
            )}
            <View style={styles.richCardBody}>
              <Text style={styles.richCardTitle} numberOfLines={1}>{meta.contact_name || 'Contact'}</Text>
              {(meta.job_title || meta.company) ? (
                <Text style={styles.richCardDetail} numberOfLines={1}>
                  {[meta.job_title, meta.company].filter(Boolean).join(' at ')}
                </Text>
              ) : null}
              <Text style={styles.richCardAction}>View Contact</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={styles.richCardChevron} />
          </TouchableOpacity>
        );

      default:
        return <Text style={[styles.text, isOwn && styles.textOwn]}>{message.content}</Text>;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}
      onLongPress={() => onLongPress?.(message)}
      activeOpacity={0.8}
      delayLongPress={300}
    >
      <View style={[
        styles.bubble,
        isCardType ? styles.bubbleCard : (isOwn ? styles.bubbleOwn : styles.bubbleOther),
      ]}>
        {showSenderName && !isOwn && (
          <Text style={styles.senderName}>{message.sender_name}</Text>
        )}
        {renderReply()}
        {renderContent()}
        <View style={styles.meta}>
          <Text style={[styles.time, isOwn && !isCardType && styles.timeOwn]}>
            {formatTime(message.created_at)}
          </Text>
          {message.edited_at && (
            <Text style={[styles.edited, isOwn && !isCardType && styles.timeOwn]}>edited</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const createStyles = (colors) => StyleSheet.create({
  bubbleRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginVertical: 2,
    justifyContent: 'flex-start',
  },
  bubbleRowOwn: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.xl,
  },
  bubbleOwn: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#E9ECEF',
    borderBottomLeftRadius: 4,
  },
  deletedBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.6,
  },
  deletedText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
  },
  text: {
    ...typography.body,
    color: colors.textPrimary,
  },
  textOwn: {
    color: colors.textInverse,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
    gap: 4,
  },
  time: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  timeOwn: {
    color: 'rgba(255,255,255,0.6)',
  },
  edited: {
    fontSize: 10,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },

  // Reply preview
  replyPreview: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
    borderLeftWidth: 3,
  },
  replyPreviewOwn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderLeftColor: 'rgba(255,255,255,0.5)',
  },
  replyPreviewOther: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderLeftColor: colors.primary,
  },
  replyName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 1,
  },
  replyContent: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Image message
  imageMessage: {
    width: 200,
    height: 200,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },

  // Card bubble (neutral, no primary color)
  bubbleCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderBottomRightRadius: borderRadius.xl,
    borderBottomLeftRadius: borderRadius.xl,
  },

  // Rich card shared styles
  richCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: CARD_WIDTH,
    gap: spacing.sm,
  },
  richCardImage: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.borderLight,
  },
  richCardImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  richCardAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.borderLight,
  },
  richCardAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  richCardAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  richCardBody: {
    flex: 1,
  },
  richCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  richCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  richCardDetail: {
    fontSize: 12,
    color: colors.textTertiary,
    flex: 1,
  },
  richCardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    gap: 3,
    marginTop: 2,
  },
  richCardBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'capitalize',
  },
  richCardAction: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 2,
  },
  richCardChevron: {
    marginLeft: 2,
  },

  // System message
  systemContainer: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  systemText: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default MessageBubble;

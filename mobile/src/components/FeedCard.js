import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Dimensions, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SocialIcon } from './SocialIcon';
import { borderRadius, typography, spacing, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Platform brand colors and icons (static platforms)
 */
const STATIC_PLATFORM_CONFIG = {
  linkedin: {
    color: '#0A66C2',
    bgColor: '#E8F4FD',
    label: 'LinkedIn',
  },
  instagram: {
    color: '#E1306C',
    bgColor: '#FCEEF3',
    label: 'Instagram',
  },
  twitter: {
    color: '#000000',
    bgColor: '#F0F0F0',
    label: 'X',
  },
  github: {
    color: '#333333',
    bgColor: '#F0F0F0',
    label: 'GitHub',
  },
  discord: {
    color: '#5865F2',
    bgColor: '#EDEEFF',
    label: 'Discord',
  },
  groupme: {
    color: '#00AFF0',
    bgColor: '#E5F7FE',
    label: 'GroupMe',
  },
  event: {
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    ionicon: 'calendar-outline',
    label: 'Event',
  },
};

/**
 * Build full platform config with theme-dependent colors
 */
const getPlatformConfig = (colors) => ({
  ...STATIC_PLATFORM_CONFIG,
  profile: {
    color: colors.primary,
    bgColor: colors.primaryBg,
    ionicon: 'person-circle-outline',
    label: 'Profile',
  },
});

/**
 * Content type labels
 */
const CONTENT_TYPE_LABELS = {
  post: 'Recent Post',
  article: 'Article',
  profile_update: 'Profile Update',
  job_change: 'Job Change',
  summary: 'Contact Summary',
  rsvp: 'RSVP',
  checkin: 'Check-in',
  co_attendance: 'Co-Attendance',
};

/**
 * Get initials from a name string
 */
const getInitials = (name) => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

/**
 * Get a deterministic color for an avatar based on name
 */
const getAvatarColor = (name) => {
  const palette = [
    '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
    '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
  ];
  if (!name) return palette[0];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % palette.length;
  return palette[index];
};

/**
 * Format a timestamp into a relative or short date string
 */
const formatTimestamp = (dateStr) => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

/**
 * FeedCard - A single item in the activity feed
 * Displays contact info, platform badge, content preview, and action buttons.
 * Designed for full-width snap-to-item scrolling (FYP-style).
 */
/**
 * Event content type icon mapping
 */
const EVENT_CONTENT_ICONS = {
  rsvp: 'hand-right-outline',
  checkin: 'location-outline',
  co_attendance: 'people-outline',
};

const FeedCard = ({ item, onViewProfile, onOpenPost }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const PLATFORM_CONFIG = useMemo(() => getPlatformConfig(colors), [colors]);
  const platform = PLATFORM_CONFIG[item.platform] || PLATFORM_CONFIG.profile;
  const contentLabel = CONTENT_TYPE_LABELS[item.content_type] || 'Activity';
  const isSummaryCard = item.content_type === 'summary';
  const isEventCard = item.platform === 'event';

  const handleOpenPost = () => {
    if (onOpenPost) {
      onOpenPost(item);
    } else if (item.content_url) {
      Linking.openURL(item.content_url).catch(() => {});
    }
  };

  const handleViewProfile = () => {
    if (onViewProfile) {
      onViewProfile(item);
    }
  };

  return (
    <View style={styles.card}>
      {/* Header: Contact info + platform badge */}
      <View style={styles.header}>
        <View style={styles.contactRow}>
          <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.contact_name) }]}>
            <Text style={styles.initials}>{getInitials(item.contact_name)}</Text>
          </View>
          <View style={styles.contactInfo}>
            <Text style={styles.contactName} numberOfLines={1}>
              {item.contact_name}
            </Text>
            {item.contact_job_title || item.contact_company ? (
              <Text style={styles.contactSubtitle} numberOfLines={1}>
                {[item.contact_job_title, item.contact_company].filter(Boolean).join(' at ')}
              </Text>
            ) : null}
          </View>
          <View style={[styles.platformBadge, { backgroundColor: platform.bgColor }]}>
            {platform.ionicon ? (
              <Ionicons name={platform.ionicon} size={16} color={platform.color} />
            ) : (
              <SocialIcon platform={item.platform} size={16} color={platform.color} />
            )}
            <Text style={[styles.platformLabel, { color: platform.color }]}>{platform.label}</Text>
          </View>
        </View>
      </View>

      {/* Content area */}
      <View style={[styles.contentArea, isSummaryCard && styles.summaryContentArea]}>
        {isSummaryCard ? (
          // Summary card style - gradient-like card
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrapper, { backgroundColor: platform.bgColor }]}>
              <Ionicons name="person" size={32} color={platform.color} />
            </View>
            <Text style={styles.summaryTitle}>{item.title}</Text>
            <Text style={styles.summaryText}>{item.summary}</Text>
          </View>
        ) : isEventCard ? (
          // Event activity card
          <View style={styles.postCard}>
            <View style={styles.postHeader}>
              <View style={[styles.contentTypeBadge, { backgroundColor: platform.bgColor }]}>
                <Ionicons
                  name={EVENT_CONTENT_ICONS[item.content_type] || 'calendar-outline'}
                  size={12}
                  color={platform.color}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.contentTypeLabel, { color: platform.color }]}>
                  {contentLabel}
                </Text>
              </View>
              <Text style={styles.timestamp}>{formatTimestamp(item.fetched_at)}</Text>
            </View>

            <Text style={styles.postTitle} numberOfLines={2}>
              {item.title}
            </Text>

            <Text style={styles.postSummary} numberOfLines={3}>
              {item.summary}
            </Text>

            {/* Event info area */}
            <View style={styles.eventInfoArea}>
              <Ionicons name={EVENT_CONTENT_ICONS[item.content_type] || 'calendar-outline'} size={28} color={platform.color} style={{ opacity: 0.7 }} />
              {item.event_name && (
                <Text style={styles.eventInfoText} numberOfLines={1}>
                  {item.event_name}
                </Text>
              )}
            </View>
          </View>
        ) : (
          // Social post preview card
          <View style={styles.postCard}>
            <View style={styles.postHeader}>
              <View style={[styles.contentTypeBadge, { backgroundColor: platform.bgColor }]}>
                <Text style={[styles.contentTypeLabel, { color: platform.color }]}>
                  {contentLabel}
                </Text>
              </View>
              <Text style={styles.timestamp}>{formatTimestamp(item.fetched_at)}</Text>
            </View>

            <Text style={styles.postTitle} numberOfLines={2}>
              {item.embed_title || item.title}
            </Text>

            <Text style={styles.postSummary} numberOfLines={3}>
              {item.embed_description || item.summary}
            </Text>

            {/* Thumbnail image if available from oEmbed */}
            {item.thumbnail_url ? (
              <TouchableOpacity onPress={handleOpenPost} activeOpacity={0.8}>
                <Image
                  source={{ uri: item.thumbnail_url }}
                  style={styles.thumbnailImage}
                  resizeMode="cover"
                />
                {item.embed_author && (
                  <Text style={styles.embedAuthor}>{item.embed_author}</Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.embedPreview}>
                {platform.ionicon ? (
                  <Ionicons name={platform.ionicon} size={28} color={platform.color} style={{ opacity: 0.6 }} />
                ) : (
                  <SocialIcon platform={item.platform} size={28} color={platform.color} />
                )}
                <Text style={styles.embedHint}>
                  Tap to view on {platform.label}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        {item.contact_id && (
          <TouchableOpacity style={styles.actionButton} onPress={handleViewProfile} activeOpacity={0.7}>
            <Ionicons name="person-outline" size={18} color={colors.primary} />
            <Text style={styles.actionLabel}>View Profile</Text>
          </TouchableOpacity>
        )}

        {!isSummaryCard && !isEventCard && item.content_url && (
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonPrimary]}
            onPress={handleOpenPost}
            activeOpacity={0.7}
          >
            <Ionicons name={item.html_embed || item.thumbnail_url ? 'eye-outline' : 'open-outline'} size={18} color={colors.textInverse} />
            <Text style={[styles.actionLabel, styles.actionLabelPrimary]}>
              {item.html_embed || item.thumbnail_url ? 'View Post' : 'Open Post'}
            </Text>
          </TouchableOpacity>
        )}

        {isSummaryCard && (
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonPrimary]}
            onPress={handleViewProfile}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.textInverse} />
            <Text style={[styles.actionLabel, styles.actionLabelPrimary]}>Reach Out</Text>
          </TouchableOpacity>
        )}

        {isEventCard && item.contact_id && (
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonPrimary]}
            onPress={handleViewProfile}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.textInverse} />
            <Text style={[styles.actionLabel, styles.actionLabelPrimary]}>Reach Out</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },

  // Header
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.sm,
  },
  initials: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  contactInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  contactName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  contactSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 1,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  platformLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Content area
  contentArea: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  summaryContentArea: {
    paddingBottom: spacing.md,
  },

  // Summary card (fallback)
  summaryCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
  },
  summaryIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  summaryTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  summaryText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Post card
  postCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  contentTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  contentTypeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  timestamp: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 12,
  },
  postTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  postSummary: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  embedPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    gap: spacing.sm,
  },
  embedHint: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  thumbnailImage: {
    width: '100%',
    height: 180,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  embedAuthor: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '500',
    marginTop: 2,
  },

  // Event info area
  eventInfoArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    backgroundColor: '#EDE9FE',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    gap: spacing.sm,
  },
  eventInfoText: {
    ...typography.caption,
    color: '#7C3AED',
    fontWeight: '600',
  },

  // Actions
  actions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryBg,
    gap: 6,
  },
  actionButtonPrimary: {
    backgroundColor: colors.primary,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  actionLabelPrimary: {
    color: colors.textInverse,
  },
});

export default FeedCard;

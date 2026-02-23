import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Dimensions, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SocialIcon } from './SocialIcon';
import { typography, spacing } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PLATFORM_CONFIG = {
  linkedin: { color: '#0A66C2', label: 'LinkedIn' },
  instagram: { color: '#E1306C', label: 'Instagram' },
  twitter: { color: '#000000', label: 'X' },
  github: { color: '#333333', label: 'GitHub' },
  discord: { color: '#5865F2', label: 'Discord' },
  groupme: { color: '#00AFF0', label: 'GroupMe' },
  event: { color: '#7C3AED', label: 'Event', ionicon: 'calendar-outline' },
  club: { color: '#E1306C', label: 'Club', ionicon: 'people-outline' },
  profile: { color: '#4F46E5', label: 'Profile', ionicon: 'person-circle-outline' },
};

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
};

const getAvatarColor = (name) => {
  const palette = ['#4F46E5', '#7C3AED', '#EC4899', '#EF4444', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6'];
  if (!name) return palette[0];
  return palette[name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % palette.length];
};

const formatTimestamp = (dateStr) => {
  try {
    const diff = Date.now() - new Date(dateStr);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(diff / 86400000);
    if (days < 7) return `${days}d`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
};

const FeedCard = ({ item, navigation, onViewProfile, onOpenPost }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const platform = PLATFORM_CONFIG[item.platform] || PLATFORM_CONFIG.profile;
  const isClubCard = item.platform === 'club';
  const isEventCard = item.platform === 'event';
  const isSummaryCard = item.content_type === 'summary';

  const handleTapContent = () => {
    if (onOpenPost) {
      onOpenPost(item);
    } else if (item.content_url) {
      Linking.openURL(item.content_url).catch(() => {});
    }
  };

  const handleTapHeader = () => {
    if (isClubCard && navigation && item.club_id) {
      navigation.navigate('ClubDetail', { clubId: item.club_id });
    } else if (onViewProfile) {
      onViewProfile(item);
    }
  };

  // Subtitle text under the name
  const subtitle = isClubCard
    ? [item.instagram_handle ? `@${item.instagram_handle}` : item.category, formatTimestamp(item.fetched_at)].filter(Boolean).join(' · ')
    : isEventCard
      ? [item.event_name, formatTimestamp(item.fetched_at)].filter(Boolean).join(' · ')
      : [item.contact_job_title, item.contact_company].filter(Boolean).join(' at ') || formatTimestamp(item.fetched_at);

  // Description text
  const description = item.embed_description || item.summary || '';

  // Whether we have a visual image
  const imageUrl = item.thumbnail_url || null;

  // Has avatar image
  const avatarUrl = item.contact_avatar || item.image_url || null;

  return (
    <View style={styles.container}>
      {/* Header — tap goes to profile/club */}
      <TouchableOpacity style={styles.header} onPress={handleTapHeader} activeOpacity={0.7}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: getAvatarColor(item.contact_name) }]}>
            <Text style={styles.avatarInitials}>{getInitials(item.contact_name)}</Text>
          </View>
        )}
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.contact_name || item.title}</Text>
            {platform.ionicon ? (
              <Ionicons name={platform.ionicon} size={14} color={platform.color} style={{ marginLeft: 4 }} />
            ) : (
              <SocialIcon platform={item.platform} size={14} color={platform.color} style={{ marginLeft: 4 }} />
            )}
          </View>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </TouchableOpacity>

      {/* Content — tap opens post/link */}
      <TouchableOpacity onPress={handleTapContent} activeOpacity={0.85} disabled={isSummaryCard && !item.content_url}>
        {/* Image */}
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        ) : null}

        {/* Text content */}
        {(item.title || description) ? (
          <View style={styles.body}>
            {!imageUrl && item.title && !isSummaryCard ? (
              <Text style={styles.title} numberOfLines={2}>{item.embed_title || item.title}</Text>
            ) : null}
            {description ? (
              <Text style={styles.description} numberOfLines={3}>
                {imageUrl ? <Text style={styles.descriptionBold}>{item.contact_name || ''} </Text> : null}
                {description}
              </Text>
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>

      {/* Footer stats */}
      {(item.likes_count > 0 || item.comments_count > 0) ? (
        <View style={styles.stats}>
          {item.likes_count > 0 && (
            <View style={styles.stat}>
              <Ionicons name="heart" size={14} color={colors.textTertiary} />
              <Text style={styles.statText}>{item.likes_count}</Text>
            </View>
          )}
          {item.comments_count > 0 && (
            <View style={styles.stat}>
              <Ionicons name="chatbubble" size={14} color={colors.textTertiary} />
              <Text style={styles.statText}>{item.comments_count}</Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.divider} />
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 1,
  },
  // Image
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  // Body text
  body: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  descriptionBold: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  // Stats
  stats: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
});

export default FeedCard;

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { borderRadius, typography, spacing, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import Button from './Button';

/**
 * SuggestionCard
 * Displays a social connection suggestion for quick-add.
 * Shows name, profile picture, headline, platform source, and an "Add" button.
 */
const SuggestionCard = ({ suggestion, onAdd }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { full_name, headline, avatar_url, platform, connected_at } = suggestion;

  const initials = (full_name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const platformConfig = {
    linkedin: {
      icon: 'logo-linkedin',
      color: '#0A66C2',
      label: 'LinkedIn',
    },
    instagram: {
      icon: 'logo-instagram',
      color: '#E4405F',
      label: 'Instagram',
    },
  };

  const pConfig = platformConfig[platform] || {
    icon: 'globe-outline',
    color: colors.textTertiary,
    label: platform,
  };

  const timeAgo = connected_at ? formatTimeAgo(connected_at) : null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {/* Avatar */}
        {avatar_url ? (
          <Image source={{ uri: avatar_url }} style={styles.avatar} />
        ) : (
          <View
            style={[
              styles.avatar,
              styles.avatarPlaceholder,
              { backgroundColor: getAvatarColor(full_name) },
            ]}
          >
            <Text style={styles.initials}>{initials}</Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {full_name}
            </Text>
          </View>
          {headline ? (
            <Text style={styles.headline} numberOfLines={2}>
              {headline}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <View style={styles.platformBadge}>
              <Ionicons name={pConfig.icon} size={14} color={pConfig.color} />
              <Text style={[styles.platformText, { color: pConfig.color }]}>
                {pConfig.label}
              </Text>
            </View>
            {timeAgo && (
              <Text style={styles.timeAgo}>Connected {timeAgo}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Add button */}
      <View style={styles.actionRow}>
        <Button
          title="Add to Contacts"
          onPress={onAdd}
          variant="primary"
          size="sm"
          fullWidth
          icon={<Ionicons name="person-add-outline" size={16} color={colors.textInverse} />}
        />
      </View>
    </View>
  );
};

function getAvatarColor(name) {
  const colorPalette = [
    '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
    '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
  ];
  if (!name) return colorPalette[0];
  const index =
    name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    colorPalette.length;
  return colorPalette[index];
}

function formatTimeAgo(dateStr) {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: spacing.md,
    ...shadows.sm,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.textInverse,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  headline: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  platformText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 11,
  },
  timeAgo: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 11,
  },
  actionRow: {
    marginTop: spacing.md,
  },
});

export default SuggestionCard;

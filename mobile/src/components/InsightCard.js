import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, typography, spacing, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

/**
 * InsightCard — visually distinct card for different insight types
 *
 * Types:
 * - reconnect: orange accent, people icon, shows stale contacts grouped by event
 * - growth: green accent, trending-up icon, network growth stats
 * - suggestions: blue accent, bulb icon, AI-suggested reconnections
 * - weekly_digest: info-blue accent, newspaper icon, weekly digest
 * - recap: purple accent, trophy icon, period summary
 */
const InsightCard = ({ insight, onPress, onContactPress }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { type, title, message, data, icon, color } = insight;

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: color || colors.primary }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: `${color}15` }]}>
          <Ionicons name={icon || 'bulb-outline'} size={20} color={color || colors.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </View>

      {/* Message */}
      <Text style={styles.message}>{message}</Text>

      {/* Type-specific content */}
      {type === 'reconnect' && data?.groups && (
        <ReconnectPreview groups={data.groups} onContactPress={onContactPress} colors={colors} styles={styles} />
      )}

      {type === 'growth' && data && (
        <GrowthPreview data={data} styles={styles} />
      )}

      {type === 'suggestions' && data?.contacts && (
        <SuggestionsPreview contacts={data.contacts} onContactPress={onContactPress} colors={colors} styles={styles} />
      )}

      {type === 'recap' && data && (
        <RecapPreview data={data} styles={styles} />
      )}
    </TouchableOpacity>
  );
};

// ──────────────────────────────────────────────────────────────────────
// Sub-components for each insight type
// ──────────────────────────────────────────────────────────────────────

const ReconnectPreview = ({ groups, onContactPress, colors, styles }) => {
  const topGroups = groups.slice(0, 2);

  return (
    <View style={styles.previewSection}>
      {topGroups.map((group, idx) => (
        <View key={idx} style={styles.groupRow}>
          <View style={styles.groupLabel}>
            <Ionicons name="calendar-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.groupName} numberOfLines={1}>
              {group.event_name}
            </Text>
            <Text style={styles.groupCount}>{group.total}</Text>
          </View>
          <View style={styles.avatarRow}>
            {group.contacts.slice(0, 4).map((contact) => (
              <TouchableOpacity
                key={contact.id}
                style={styles.miniAvatar}
                onPress={() => onContactPress && onContactPress(contact.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.miniAvatarText}>
                  {getInitials(contact.full_name)}
                </Text>
              </TouchableOpacity>
            ))}
            {group.total > 4 && (
              <View style={[styles.miniAvatar, styles.moreAvatar]}>
                <Text style={styles.moreAvatarText}>+{group.total - 4}</Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
};

const GrowthPreview = ({ data, styles }) => (
  <View style={styles.previewSection}>
    <View style={styles.statsRow}>
      <StatBubble label="This Week" value={data.thisWeek} color="#34C759" styles={styles} />
      <StatBubble label="This Month" value={data.thisMonth} color="#007AFF" styles={styles} />
      <StatBubble label="Total" value={data.total} color="#334155" styles={styles} />
    </View>
  </View>
);

const SuggestionsPreview = ({ contacts, onContactPress, colors, styles }) => (
  <View style={styles.previewSection}>
    {contacts.slice(0, 3).map((contact) => (
      <TouchableOpacity
        key={contact.id}
        style={styles.suggestionRow}
        onPress={() => onContactPress && onContactPress(contact.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.miniAvatar, { marginRight: spacing.sm }]}>
          <Text style={styles.miniAvatarText}>
            {getInitials(contact.full_name)}
          </Text>
        </View>
        <View style={styles.suggestionInfo}>
          <Text style={styles.suggestionName} numberOfLines={1}>
            {contact.full_name}
          </Text>
          <Text style={styles.suggestionDetail} numberOfLines={1}>
            {[contact.job_title, contact.company].filter(Boolean).join(' at ') || `${contact.days_since}d ago`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </TouchableOpacity>
    ))}
  </View>
);

const RecapPreview = ({ data, styles }) => {
  if (!data.stats) return null;

  return (
    <View style={styles.previewSection}>
      <View style={styles.statsRow}>
        <StatBubble label="Contacts" value={data.stats.totalContacts} color="#007AFF" styles={styles} />
        <StatBubble label="Events" value={data.stats.topEvents?.length || 0} color="#FF9500" styles={styles} />
        <StatBubble label="With Notes" value={data.stats.contactsWithNotes} color="#34C759" styles={styles} />
      </View>
    </View>
  );
};

const StatBubble = ({ label, value, color, styles }) => (
  <View style={styles.statBubble}>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name) {
  const palette = [
    '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
    '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
  ];
  if (!name) return palette[0];
  const index = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % palette.length;
  return palette[index];
}

// ──────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  message: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },

  // Preview sections
  previewSection: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },

  // Reconnect
  groupRow: {
    marginBottom: spacing.sm,
  },
  groupLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  groupName: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    flex: 1,
    fontWeight: '500',
  },
  groupCount: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: -4,
  },
  miniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  miniAvatarText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '700',
  },
  moreAvatar: {
    backgroundColor: colors.textTertiary,
  },
  moreAvatarText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '700',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statBubble: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
    fontSize: 11,
  },

  // Suggestions
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionName: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  suggestionDetail: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 12,
  },
});

export default InsightCard;

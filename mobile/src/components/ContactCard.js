import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { borderRadius, typography, spacing, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import Tag from './Tag';

const ContactCard = ({ contact, onPress, mutualCount = 0 }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initials = (contact.full_name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const subtitle = [
    contact.job_title,
    contact.company,
    contact.school,
    contact.major,
  ]
    .filter(Boolean)
    .join(' at ');

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.row}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: getAvatarColor(contact.full_name) },
          ]}
        >
          <Text style={styles.initials}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {contact.full_name}
            </Text>
            {contact.is_favorite && <Ionicons name="star" size={16} color={colors.warning} style={{ marginLeft: 6 }} />}
            {contact.source && contact.source !== 'manual' && (
              <View style={styles.sourceBadge}>
                <Text style={styles.sourceText}>
                  {contact.source === 'dictation' ? 'AI' : contact.source}
                </Text>
              </View>
            )}
          </View>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {contact.event_name ? (
            <Text style={styles.event} numberOfLines={1}>
              Met at {contact.event_name}
              {contact.met_date ? ` on ${formatDate(contact.met_date)}` : ''}
            </Text>
          ) : null}
          {contact.tags && contact.tags.length > 0 && (
            <View style={styles.tags}>
              {contact.tags.slice(0, 3).map((tag) => (
                <Tag key={tag} label={tag} size="sm" />
              ))}
              {contact.tags.length > 3 && (
                <Text style={styles.moreTags}>+{contact.tags.length - 3}</Text>
              )}
            </View>
          )}
          {(mutualCount > 0 || contact.mutual_count > 0) && (
            <View style={styles.mutualRow}>
              <Ionicons name="people" size={12} color={colors.accent} />
              <Text style={styles.mutualText}>
                {mutualCount || contact.mutual_count} mutual
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
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

function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg, // Use the new pill-like rounded corner
    padding: spacing.lg, // increased padding for an airy feel
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md, // slightly larger shadow for floating effect
    borderWidth: 1,
    borderColor: colors.borderLight, // subtle border 
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center', // Center align
  },
  avatar: {
    width: 56, // Slightly larger avatar
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.sm, // Give avatar a small pop
  },
  initials: {
    color: colors.textInverse,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1, // Add tracking
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4, // Spacing between name and subtitle
  },
  name: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  star: {
    fontSize: 18, // slightly larger star
    color: '#F59E0B',
    marginLeft: 6,
  },
  sourceBadge: {
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full, // pill shaped
    marginLeft: 8,
  },
  sourceText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  event: {
    ...typography.caption,
    color: colors.primaryLight, // use theme color
    marginTop: 2,
    fontWeight: '500',
  },
  tags: {
    flexDirection: 'row',
    marginTop: spacing.sm, // better separation
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  moreTags: {
    ...typography.caption,
    color: colors.textTertiary,
    marginLeft: 4,
    fontWeight: '600',
  },
  mutualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: 4,
  },
  mutualText: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '600',
  },
});

export default ContactCard;

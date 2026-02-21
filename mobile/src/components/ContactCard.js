import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, borderRadius, typography, spacing, shadows } from '../theme/colors';
import Tag from './Tag';

const ContactCard = ({ contact, onPress }) => {
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
            {contact.is_favorite && <Text style={styles.star}>&#9733;</Text>}
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  initials: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  star: {
    fontSize: 16,
    color: '#F59E0B',
    marginLeft: 4,
  },
  sourceBadge: {
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginLeft: 6,
  },
  sourceText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  event: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  tags: {
    flexDirection: 'row',
    marginTop: spacing.xs,
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  moreTags: {
    ...typography.caption,
    color: colors.textTertiary,
    marginLeft: 4,
  },
});

export default ContactCard;

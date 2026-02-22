import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

const AVATAR_COLORS = [
  '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  const index =
    name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const MAX_VISIBLE_AVATARS = 5;

const PreEventPrepCard = ({ event, knownAttendees = [], onViewAll }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const visibleAttendees = knownAttendees.slice(0, MAX_VISIBLE_AVATARS);
  const remainingCount = knownAttendees.length - MAX_VISIBLE_AVATARS;

  // Find attendees with fading relationships
  const fadingAttendee = knownAttendees.find(
    (a) => a.relationship_fading || a.days_since_contact > 60
  );

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconContainer}>
          <Ionicons name="calendar" size={20} color={colors.primary} />
        </View>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title} numberOfLines={1}>
            Upcoming: {event.name || event.title}
          </Text>
          <Text style={styles.subtitle}>
            {knownAttendees.length} {knownAttendees.length === 1 ? 'person' : 'people'} you know {knownAttendees.length === 1 ? 'is' : 'are'} going
          </Text>
        </View>
      </View>

      {/* Avatar row - horizontal scroll */}
      {knownAttendees.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.avatarScrollContent}
          style={styles.avatarScroll}
        >
          {visibleAttendees.map((attendee) => (
            <View key={attendee.id} style={styles.avatarWrapper}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: getAvatarColor(attendee.full_name) },
                ]}
              >
                <Text style={styles.avatarInitials}>
                  {getInitials(attendee.full_name)}
                </Text>
              </View>
              <Text style={styles.avatarName} numberOfLines={1}>
                {attendee.full_name?.split(' ')[0] || '?'}
              </Text>
            </View>
          ))}
          {remainingCount > 0 && (
            <View style={styles.avatarWrapper}>
              <View style={[styles.avatar, styles.moreAvatar]}>
                <Text style={styles.moreAvatarText}>+{remainingCount}</Text>
              </View>
              <Text style={styles.avatarName}>more</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Fading relationship badge */}
      {fadingAttendee && (
        <View style={styles.fadingBadge}>
          <Ionicons name="time-outline" size={14} color={colors.warning} />
          <Text style={styles.fadingText}>
            Reconnect with {fadingAttendee.full_name?.split(' ')[0]}
          </Text>
        </View>
      )}

      {/* Review button */}
      <TouchableOpacity
        style={styles.reviewButton}
        onPress={() => onViewAll(event)}
        activeOpacity={0.7}
      >
        <Ionicons name="people-outline" size={18} color={colors.primary} style={{ marginRight: spacing.sm }} />
        <Text style={styles.reviewButtonText}>Review Contacts</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.lg,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  avatarScroll: {
    marginBottom: spacing.md,
  },
  avatarScrollContent: {
    paddingRight: spacing.md,
    gap: spacing.md,
  },
  avatarWrapper: {
    alignItems: 'center',
    width: 56,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  avatarInitials: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  avatarName: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  moreAvatar: {
    backgroundColor: colors.tagBg,
  },
  moreAvatarText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  fadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  fadingText: {
    ...typography.bodySmall,
    color: '#D97706',
    fontWeight: '500',
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  reviewButtonText: {
    ...typography.button,
    color: colors.primary,
  },
});

export default PreEventPrepCard;

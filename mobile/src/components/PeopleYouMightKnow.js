import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

/**
 * PeopleYouMightKnow
 * Horizontal scroll section suggesting co-attendees the user hasn't saved yet.
 *
 * Props:
 *   suggestions - Array of { id, name, school, events, avatar_url? }
 *     events = [{ name: 'Event 1' }, { name: 'Event 2' }]
 *   onSave - (suggestion) => void
 *   onDismiss - (suggestion) => void
 */
const PeopleYouMightKnow = ({ suggestions, onSave, onDismiss }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="people-outline" size={20} color={colors.primary} />
          <Text style={styles.headerTitle}>People You Might Know</Text>
        </View>
        <Text style={styles.headerCount}>{suggestions.length}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + spacing.sm}
      >
        {suggestions.map((suggestion) => (
          <SuggestionItem
            key={suggestion.id}
            suggestion={suggestion}
            onSave={() => onSave(suggestion)}
            onDismiss={() => onDismiss(suggestion)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const CARD_WIDTH = 200;

const SuggestionItem = ({ suggestion, onSave, onDismiss }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { name, school, events } = suggestion;

  const initials = (name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const eventLabel = getEventLabel(events);

  return (
    <View style={styles.card}>
      {/* Dismiss button */}
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={onDismiss}
        activeOpacity={0.7}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <Ionicons name="close" size={16} color={colors.textTertiary} />
      </TouchableOpacity>

      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: getAvatarColor(name) }]}>
        <Text style={styles.initials}>{initials}</Text>
      </View>

      {/* Name */}
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>

      {/* School */}
      {school ? (
        <Text style={styles.school} numberOfLines={1}>
          {school}
        </Text>
      ) : null}

      {/* Event context */}
      {eventLabel ? (
        <View style={styles.eventBadge}>
          <Ionicons name="calendar-outline" size={12} color={colors.primary} />
          <Text style={styles.eventText} numberOfLines={2}>
            {eventLabel}
          </Text>
        </View>
      ) : null}

      {/* Save button */}
      <TouchableOpacity
        style={styles.saveButton}
        onPress={onSave}
        activeOpacity={0.7}
      >
        <Ionicons name="person-add-outline" size={14} color={colors.textInverse} />
        <Text style={styles.saveButtonText}>Save</Text>
      </TouchableOpacity>
    </View>
  );
};

function getEventLabel(events) {
  if (!events || events.length === 0) return null;
  if (events.length === 1) {
    return `You were both at ${events[0].name}`;
  }
  return `${events.length} events in common`;
}

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

const createStyles = (colors) => StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerCount: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
    backgroundColor: colors.borderLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  dismissButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  initials: {
    color: colors.textInverse,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
  },
  name: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    fontSize: 15,
  },
  school: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    fontSize: 12,
  },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
    gap: 4,
  },
  eventText: {
    ...typography.caption,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    gap: 6,
    width: '100%',
    ...shadows.sm,
  },
  saveButtonText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 13,
  },
});

export default PeopleYouMightKnow;

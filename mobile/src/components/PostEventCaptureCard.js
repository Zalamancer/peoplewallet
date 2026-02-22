import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

const PostEventCaptureCard = ({ event, onDictate, onBrowseAttendees, onDismiss }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      {/* Color accent bar */}
      <View style={styles.accentBar} />

      <View style={styles.content}>
        {/* Event icon */}
        <View style={styles.eventIconContainer}>
          <Ionicons name="checkmark-circle" size={28} color={colors.success} />
        </View>

        <Text style={styles.title}>
          You just attended {event.name || event.title}
        </Text>
        <Text style={styles.subtitle}>Who did you meet?</Text>

        {/* Action buttons row */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onDictate(event)}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: colors.primaryBg }]}>
              <Ionicons name="mic" size={22} color={colors.primary} />
            </View>
            <Text style={styles.actionLabel}>Dictate</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onBrowseAttendees(event)}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: colors.primaryBg }]}>
              <Ionicons name="people" size={22} color={colors.primary} />
            </View>
            <Text style={styles.actionLabel}>Browse{'\n'}Attendees</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onDismiss(event.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: colors.tagBg }]}>
              <Ionicons name="close" size={22} color={colors.textTertiary} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textTertiary }]}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  accentBar: {
    height: 4,
    backgroundColor: colors.primary,
  },
  content: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  eventIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  actionButton: {
    alignItems: 'center',
    flex: 1,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  actionLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default PostEventCaptureCard;

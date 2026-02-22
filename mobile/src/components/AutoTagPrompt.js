import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import Button from './Button';

/**
 * AutoTagPrompt
 * Modal/bottom-sheet that appears during contact creation when user recently
 * attended an event. Prompts the user to tag the contact with event context.
 *
 * Props:
 *   event - { id, name, date, location }
 *   visible - boolean
 *   onConfirm - (event) => void  -- returns event data to be added to contact context
 *   onDismiss - () => void
 */
const AutoTagPrompt = ({ event, visible, onConfirm, onDismiss }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!event) return null;

  const formattedDate = formatEventDate(event.date);

  const handleConfirm = () => {
    onConfirm(event);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              {/* Handle bar */}
              <View style={styles.handleBar} />

              {/* Icon header */}
              <View style={styles.iconWrapper}>
                <Ionicons name="calendar" size={28} color={colors.primary} />
              </View>

              {/* Question */}
              <Text style={styles.title}>Were you at {event.name}?</Text>
              <Text style={styles.subtitle}>Tag this contact with event context</Text>

              {/* Event details card */}
              <View style={styles.eventCard}>
                <View style={styles.eventRow}>
                  <Ionicons name="flag-outline" size={16} color={colors.primary} />
                  <Text style={styles.eventName} numberOfLines={2}>
                    {event.name}
                  </Text>
                </View>

                {formattedDate ? (
                  <View style={styles.eventRow}>
                    <Ionicons name="time-outline" size={16} color={colors.textTertiary} />
                    <Text style={styles.eventDetail}>{formattedDate}</Text>
                  </View>
                ) : null}

                {event.location ? (
                  <View style={styles.eventRow}>
                    <Ionicons name="location-outline" size={16} color={colors.textTertiary} />
                    <Text style={styles.eventDetail} numberOfLines={1}>
                      {event.location}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Actions */}
              <View style={styles.actions}>
                <Button
                  title="Yes, tag it"
                  onPress={handleConfirm}
                  variant="primary"
                  size="md"
                  fullWidth
                  icon={<Ionicons name="checkmark-outline" size={18} color={colors.textInverse} />}
                />
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={onDismiss}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryButtonText}>No thanks</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

function formatEventDate(dateStr) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const createStyles = (colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
    ...shadows.xl,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  eventCard: {
    backgroundColor: colors.primaryBg,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    width: '100%',
    marginBottom: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eventName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
  },
  eventDetail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  secondaryButton: {
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.textTertiary,
  },
});

export default AutoTagPrompt;

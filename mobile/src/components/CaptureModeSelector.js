import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from '../theme/colors';

/**
 * Capture Mode Selector
 * Shown when user taps "+" to add a new contact
 * Three modes: Manual, Dictation (AI), Live Recording
 */
const CaptureModeSelector = ({ navigation, onClose }) => {
  const modes = [
    {
      key: 'manual',
      icon: '\u{270F}',
      title: 'Manual Entry',
      description: 'Type in contact details',
      screen: 'NewContact',
      params: { source: 'manual' },
    },
    {
      key: 'dictation',
      icon: '\u{1F3A4}',
      title: 'AI Dictation',
      description: 'Speak a summary, AI fills the card',
      screen: 'Dictation',
      highlight: true,
      badge: 'Recommended',
    },
    {
      key: 'recording',
      icon: '\u{1F534}',
      title: 'Live Recording',
      description: 'Record a conversation (with consent)',
      screen: 'Recording',
    },
    {
      key: 'linkedin',
      icon: 'in',
      title: 'From LinkedIn',
      description: 'Auto-fill from a LinkedIn URL',
      screen: 'NewContact',
      params: { source: 'linkedin' },
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add New Contact</Text>
      <Text style={styles.subtitle}>Choose how to capture this contact</Text>

      <View style={styles.modes}>
        {modes.map((mode) => (
          <TouchableOpacity
            key={mode.key}
            style={[styles.modeCard, mode.highlight && styles.modeCardHighlight]}
            onPress={() => {
              if (onClose) onClose();
              navigation.navigate(mode.screen, mode.params);
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, mode.highlight && styles.iconContainerHighlight]}>
              <Text style={[styles.modeIcon, mode.key === 'linkedin' && styles.linkedinIcon]}>
                {mode.icon}
              </Text>
            </View>
            <View style={styles.modeInfo}>
              <View style={styles.modeTitleRow}>
                <Text style={[styles.modeTitle, mode.highlight && styles.modeTitleHighlight]}>
                  {mode.title}
                </Text>
                {mode.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{mode.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.modeDescription}>{mode.description}</Text>
            </View>
            <Text style={styles.chevron}>&#8250;</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
  },
  modes: {
    gap: spacing.sm,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeCardHighlight: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  iconContainerHighlight: {
    backgroundColor: colors.primary,
  },
  modeIcon: {
    fontSize: 22,
  },
  linkedinIcon: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  modeInfo: {
    flex: 1,
  },
  modeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modeTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 16,
  },
  modeTitleHighlight: {
    color: colors.primary,
  },
  modeDescription: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
    fontSize: 10,
  },
  chevron: {
    fontSize: 24,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
});

export default CaptureModeSelector;

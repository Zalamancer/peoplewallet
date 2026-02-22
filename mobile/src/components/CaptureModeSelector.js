import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

/**
 * Capture Mode Selector
 * Shown when user taps "+" to add a new contact
 * Three modes: Manual, Dictation (AI), Live Recording
 */
const CaptureModeSelector = ({ navigation, onClose }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const modes = [
    {
      key: 'manual',
      icon: 'create-outline',
      title: 'Manual Entry',
      description: 'Type in contact details',
      screen: 'NewContact',
      params: { source: 'manual' },
    },
    {
      key: 'dictation',
      icon: 'mic-outline',
      title: 'AI Dictation',
      description: 'Speak a summary, AI fills the card',
      screen: 'Dictation',
      highlight: true,
      badge: 'Recommended',
    },
    {
      key: 'recording',
      icon: 'radio-outline',
      title: 'Live Recording',
      description: 'Record a conversation (with consent)',
      screen: 'Recording',
    },
    {
      key: 'linkedin',
      icon: 'logo-linkedin',
      title: 'From LinkedIn',
      description: 'Auto-fill from a LinkedIn URL',
      screen: 'NewContact',
      params: { source: 'linkedin' },
    },
    {
      key: 'quick-add',
      icon: 'flash-outline',
      title: 'Quick Add',
      description: 'Add from recent Instagram/LinkedIn connections',
      screen: 'QuickAdd',
      badge: 'New',
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
              <Ionicons
                name={mode.icon}
                size={26}
                color={mode.highlight ? colors.white : (mode.key === 'linkedin' ? '#0A66C2' : colors.textPrimary)}
              />
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
            <Ionicons name="chevron-forward" size={24} color={colors.placeholder} style={styles.chevron} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    paddingBottom: spacing.xxl * 2, // Push it slightly up from true center
  },
  title: {
    ...typography.h1, // Larger header
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary, // softer
    marginBottom: spacing.xxl, // more breathing room
  },
  modes: {
    gap: spacing.md, // more space between items
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl, // pill-like
    padding: spacing.lg,
    ...shadows.md, // slight pop
    borderWidth: 2, // slightly thicker
    borderColor: 'transparent',
  },
  modeCardHighlight: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
    ...shadows.lg, // Give the recommended one a noticeable pop
  },
  iconContainer: {
    width: 56, // larger
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  iconContainerHighlight: {
    backgroundColor: colors.primary,
    ...shadows.md,
  },

  modeInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  modeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modeTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  modeTitleHighlight: {
    color: colors.textPrimary, // slightly deeper for contrast
    fontWeight: '700',
  },
  modeDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  badge: {
    backgroundColor: colors.primary, // use theme color
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  chevron: {
    marginLeft: spacing.sm,
  },
});

export default CaptureModeSelector;

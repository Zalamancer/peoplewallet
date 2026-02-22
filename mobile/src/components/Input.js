import React, { useState, useMemo } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { borderRadius, typography, spacing, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

const Input = ({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  multiline = false,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  maxLength,
  editable = true,
  style,
  inputStyle,
  leftIcon,
  rightIcon,
  onRightIconPress,
  confidenceStatus, // 'auto' | 'suggest' | null
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isFocused, setIsFocused] = useState(false);

  const containerStyle = [
    styles.container,
    isFocused && styles.containerFocused,
    error && styles.containerError,
    confidenceStatus === 'auto' && styles.containerConfidenceHigh,
    confidenceStatus === 'suggest' && styles.containerConfidenceMedium,
    !editable && styles.containerDisabled,
    style,
  ];

  return (
    <View style={styles.wrapper}>
      {label && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {confidenceStatus === 'suggest' && (
            <Text style={styles.confirmBadge}>Confirm?</Text>
          )}
          {confidenceStatus === 'auto' && (
            <Text style={styles.autoBadge}>AI Filled</Text>
          )}
        </View>
      )}
      <View style={containerStyle}>
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        <TextInput
          style={[
            styles.input,
            multiline && styles.multiline,
            leftIcon && styles.inputWithLeftIcon,
            rightIcon && styles.inputWithRightIcon,
            inputStyle,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          multiline={multiline}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          editable={editable}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          numberOfLines={multiline ? 4 : 1}
        />
        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress} style={styles.rightIcon}>
            {rightIcon}
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  confirmBadge: {
    ...typography.caption,
    color: colors.confidenceMedium,
    fontWeight: '600',
    backgroundColor: 'rgba(255, 159, 10, 0.15)', // Darker version for dark theme
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  autoBadge: {
    ...typography.caption,
    color: colors.confidenceHigh,
    fontWeight: '600',
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.borderLight, // Use borderLight or secondary so it fits
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  containerFocused: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  containerError: {
    borderColor: colors.error,
  },
  containerConfidenceHigh: {
    borderColor: colors.confidenceHigh,
    backgroundColor: 'rgba(48, 209, 88, 0.05)',
  },
  containerConfidenceMedium: {
    borderColor: colors.confidenceMedium,
    backgroundColor: 'rgba(255, 159, 10, 0.05)',
  },
  containerDisabled: {
    backgroundColor: colors.borderLight,
    opacity: 0.7,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10, // Better touch target
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputWithLeftIcon: {
    paddingLeft: spacing.sm,
  },
  inputWithRightIcon: {
    paddingRight: spacing.sm,
  },
  leftIcon: {
    marginRight: spacing.xs,
  },
  rightIcon: {
    padding: spacing.xs,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
});

export default Input;

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

const HEIGHT_OPTIONS = ['Short', 'Average', 'Tall'];

const HAIR_COLORS = [
  { label: 'Black', color: '#1C1C1E' },
  { label: 'Brown', color: '#8B4513' },
  { label: 'Blonde', color: '#DAA520' },
  { label: 'Red', color: '#CC3300' },
  { label: 'Gray', color: '#9CA3AF' },
  { label: 'Other', color: '#8E8E93' },
];

const DISTINGUISHING_FEATURES = [
  'Beard',
  'Mustache',
  'Tattoos',
  'Piercings',
  'Curly Hair',
  'Straight Hair',
  'Bald',
  'Braces',
];

const MAX_CUSTOM_TAGS = 3;
const MAX_CUSTOM_TAG_LENGTH = 20;

// Content filter: reject tags containing inappropriate terms
const BLOCKED_TERMS = [
  'fat', 'ugly', 'obese', 'skinny', 'dark skin', 'light skin',
  'black person', 'white person', 'asian', 'latino', 'hispanic',
  'indian', 'arab', 'african', 'oriental', 'colored',
  'retard', 'cripple', 'midget', 'dwarf', 'handicap',
  'ghetto', 'thug', 'redneck', 'trashy', 'gross',
];

function isTagAllowed(tag) {
  const lower = tag.toLowerCase().trim();
  return !BLOCKED_TERMS.some((term) => lower.includes(term));
}

const AppearanceTagSelector = ({ value = {}, onChange }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [customTagInput, setCustomTagInput] = useState('');

  const {
    heightRange = null,
    hairColor = null,
    glasses = false,
    distinguishingFeatures = [],
  } = value;

  // Separate predefined from custom features
  const selectedPredefined = distinguishingFeatures.filter((f) =>
    DISTINGUISHING_FEATURES.includes(f)
  );
  const customTags = distinguishingFeatures.filter(
    (f) => !DISTINGUISHING_FEATURES.includes(f)
  );

  const updateValue = (updates) => {
    onChange({ ...value, ...updates });
  };

  const toggleFeature = (feature) => {
    const current = [...distinguishingFeatures];
    const index = current.indexOf(feature);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(feature);
    }
    updateValue({ distinguishingFeatures: current });
  };

  const addCustomTag = () => {
    const tag = customTagInput.trim();
    if (!tag) return;

    if (tag.length > MAX_CUSTOM_TAG_LENGTH) {
      Alert.alert('Too long', `Custom tags must be ${MAX_CUSTOM_TAG_LENGTH} characters or fewer.`);
      return;
    }

    if (customTags.length >= MAX_CUSTOM_TAGS) {
      Alert.alert('Limit reached', `You can add up to ${MAX_CUSTOM_TAGS} custom tags.`);
      return;
    }

    if (!isTagAllowed(tag)) {
      Alert.alert(
        'Tag not allowed',
        'Please use respectful, non-discriminatory descriptions.'
      );
      return;
    }

    if (distinguishingFeatures.includes(tag)) {
      setCustomTagInput('');
      return;
    }

    updateValue({ distinguishingFeatures: [...distinguishingFeatures, tag] });
    setCustomTagInput('');
  };

  const removeCustomTag = (tag) => {
    updateValue({
      distinguishingFeatures: distinguishingFeatures.filter((f) => f !== tag),
    });
  };

  return (
    <View style={styles.container}>
      {/* Height Range */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Height</Text>
        <View style={styles.chipRow}>
          {HEIGHT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.chip,
                heightRange === option && styles.chipSelected,
              ]}
              onPress={() =>
                updateValue({ heightRange: heightRange === option ? null : option })
              }
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  heightRange === option && styles.chipTextSelected,
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Hair Color */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Hair Color</Text>
        <View style={styles.chipRow}>
          {HAIR_COLORS.map((option) => (
            <TouchableOpacity
              key={option.label}
              style={[
                styles.hairChip,
                hairColor === option.label && styles.hairChipSelected,
              ]}
              onPress={() =>
                updateValue({
                  hairColor: hairColor === option.label ? null : option.label,
                })
              }
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.colorDot,
                  { backgroundColor: option.color },
                  hairColor === option.label && styles.colorDotSelected,
                ]}
              />
              <Text
                style={[
                  styles.hairChipText,
                  hairColor === option.label && styles.chipTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Glasses Toggle */}
      <View style={styles.section}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelRow}>
            <Ionicons name="glasses-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.toggleLabel}>Glasses</Text>
          </View>
          <Switch
            value={glasses}
            onValueChange={(val) => updateValue({ glasses: val })}
            trackColor={{ false: colors.border, true: colors.primaryLight }}
            thumbColor={glasses ? colors.primary : colors.white}
          />
        </View>
      </View>

      {/* Distinguishing Features */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Distinguishing Features</Text>
        <View style={styles.featureGrid}>
          {DISTINGUISHING_FEATURES.map((feature) => {
            const isSelected = selectedPredefined.includes(feature);
            return (
              <TouchableOpacity
                key={feature}
                style={[
                  styles.featureChip,
                  isSelected && styles.featureChipSelected,
                ]}
                onPress={() => toggleFeature(feature)}
                activeOpacity={0.7}
              >
                {isSelected && (
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color={colors.textInverse}
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text
                  style={[
                    styles.featureChipText,
                    isSelected && styles.featureChipTextSelected,
                  ]}
                >
                  {feature}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom tags */}
        {customTags.length > 0 && (
          <View style={styles.customTagsRow}>
            {customTags.map((tag) => (
              <View key={tag} style={styles.customTag}>
                <Text style={styles.customTagText}>{tag}</Text>
                <TouchableOpacity
                  onPress={() => removeCustomTag(tag)}
                  style={styles.customTagRemove}
                >
                  <Ionicons name="close" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Custom tag input */}
        {customTags.length < MAX_CUSTOM_TAGS && (
          <View style={styles.customInputRow}>
            <TextInput
              style={styles.customInput}
              placeholder="Add custom tag..."
              placeholderTextColor={colors.placeholder}
              value={customTagInput}
              onChangeText={setCustomTagInput}
              maxLength={MAX_CUSTOM_TAG_LENGTH}
              returnKeyType="done"
              onSubmitEditing={addCustomTag}
            />
            <TouchableOpacity
              style={[
                styles.addButton,
                !customTagInput.trim() && styles.addButtonDisabled,
              ]}
              onPress={addCustomTag}
              activeOpacity={0.7}
              disabled={!customTagInput.trim()}
            >
              <Ionicons
                name="add"
                size={20}
                color={customTagInput.trim() ? colors.white : colors.textTertiary}
              />
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.helperText}>
          {MAX_CUSTOM_TAGS - customTags.length} custom tag{MAX_CUSTOM_TAGS - customTags.length !== 1 ? 's' : ''} remaining
        </Text>
      </View>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },

  // Height chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.tagBg,
    borderWidth: 1,
    borderColor: colors.tagBorder,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.tagText,
  },
  chipTextSelected: {
    color: colors.textInverse,
  },

  // Hair color chips
  hairChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.tagBg,
    borderWidth: 1,
    borderColor: colors.tagBorder,
    gap: 6,
  },
  hairChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  hairChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.tagText,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  colorDotSelected: {
    borderColor: colors.white,
  },

  // Glasses toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  toggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },

  // Distinguishing features
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.tagBg,
    borderWidth: 1,
    borderColor: colors.tagBorder,
  },
  featureChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  featureChipText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.tagText,
  },
  featureChipTextSelected: {
    color: colors.textInverse,
  },

  // Custom tags
  customTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  customTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    gap: 4,
  },
  customTagText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '500',
  },
  customTagRemove: {
    padding: 2,
  },

  // Custom tag input
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  customInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    backgroundColor: colors.tagBg,
  },
  helperText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 11,
  },
});

export default AppearanceTagSelector;

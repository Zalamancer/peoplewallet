import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { borderRadius, typography, spacing } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

const Tag = ({
  label,
  selected = false,
  onPress,
  removable = false,
  onRemove,
  variant = 'default', // default, primary, success, warning
  size = 'md',
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const tagStyle = [
    styles.tag,
    styles[`tag_${variant}`],
    styles[`tag_${size}`],
    selected && styles.tagSelected,
  ];

  const labelStyle = [
    styles.label,
    styles[`label_${variant}`],
    styles[`label_${size}`],
    selected && styles.labelSelected,
  ];

  return (
    <TouchableOpacity
      style={tagStyle}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <Text style={labelStyle}>{label}</Text>
      {removable && (
        <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
          <Text style={styles.removeIcon}>x</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

export const TagGroup = ({ tags, selectedTags = [], onToggle, wrap = true }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.tagGroup, wrap && styles.tagGroupWrap]}>
      {tags.map((tag) => (
        <Tag
          key={tag}
          label={tag}
          selected={selectedTags.includes(tag)}
          onPress={() => onToggle(tag)}
          style={styles.tagInGroup}
        />
      ))}
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  tag_default: {
    backgroundColor: colors.tagBg,
    borderColor: colors.tagBorder,
  },
  tag_primary: {
    backgroundColor: colors.primaryBg,
    borderColor: colors.primaryLight,
  },
  tag_success: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  tag_warning: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  tag_sm: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tag_md: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tag_lg: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tagSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    ...typography.caption,
    fontWeight: '500',
  },
  label_default: {
    color: colors.tagText,
  },
  label_primary: {
    color: colors.primary,
  },
  label_success: {
    color: '#16A34A',
  },
  label_warning: {
    color: '#D97706',
  },
  label_sm: {
    fontSize: 11,
  },
  label_md: {
    fontSize: 12,
  },
  label_lg: {
    fontSize: 14,
  },
  labelSelected: {
    color: colors.textInverse,
  },
  removeButton: {
    marginLeft: 4,
    padding: 2,
  },
  removeIcon: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '700',
  },
  tagGroup: {
    flexDirection: 'row',
  },
  tagGroupWrap: {
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagInGroup: {
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
});

export default Tag;

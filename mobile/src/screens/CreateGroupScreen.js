import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { groupsAPI } from '../services/api';
import Button from '../components/Button';
import Input from '../components/Input';

const GROUP_COLORS = [
  '#007AFF', '#4F46E5', '#7C3AED', '#EC4899',
  '#EF4444', '#F59E0B', '#10B981', '#06B6D4',
  '#3B82F6', '#8B5CF6', '#F97316', '#14B8A6',
];

const GROUP_ICONS = [
  'people', 'business', 'school', 'calendar',
  'location', 'briefcase', 'heart', 'star',
  'flag', 'ribbon', 'trophy', 'megaphone',
];

const CreateGroupScreen = ({ navigation, route }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const existingGroup = route.params?.group;
  const isEditing = !!existingGroup;

  const [name, setName] = useState(existingGroup?.name || '');
  const [description, setDescription] = useState(existingGroup?.description || '');
  const [selectedColor, setSelectedColor] = useState(existingGroup?.color || '#007AFF');
  const [selectedIcon, setSelectedIcon] = useState(existingGroup?.icon || 'people');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a group name');
      return;
    }

    setSaving(true);
    try {
      const groupData = {
        name: name.trim(),
        description: description.trim() || undefined,
        color: selectedColor,
        icon: selectedIcon,
      };

      if (isEditing) {
        await groupsAPI.update(existingGroup.id, groupData);
      } else {
        await groupsAPI.create(groupData);
      }

      navigation.goBack();
    } catch (error) {
      const msg = error.response?.data?.error || `Failed to ${isEditing ? 'update' : 'create'} group`;
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{isEditing ? 'Edit Group' : 'New Group'}</Text>
        <Button
          title="Save"
          onPress={handleSave}
          loading={saving}
          size="sm"
          disabled={!name.trim()}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.form}
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Preview */}
          <View style={styles.preview}>
            <View style={[styles.previewIcon, { backgroundColor: selectedColor + '20' }]}>
              <Ionicons name={selectedIcon} size={32} color={selectedColor} />
            </View>
            <Text style={styles.previewName}>{name || 'Group Name'}</Text>
          </View>

          {/* Name */}
          <Input
            label="Group Name *"
            value={name}
            onChangeText={setName}
            placeholder="e.g., UTD Career Fair, Google Team"
            autoCapitalize="words"
          />

          {/* Description */}
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="What is this group for?"
            multiline
          />

          {/* Color Picker */}
          <Text style={styles.fieldLabel}>Color</Text>
          <View style={styles.colorGrid}>
            {GROUP_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorSwatchSelected,
                ]}
                onPress={() => setSelectedColor(color)}
              >
                {selectedColor === color && (
                  <Ionicons name="checkmark" size={20} color={colors.textInverse} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Icon Picker */}
          <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Icon</Text>
          <View style={styles.iconGrid}>
            {GROUP_ICONS.map((icon) => (
              <TouchableOpacity
                key={icon}
                style={[
                  styles.iconOption,
                  selectedIcon === icon && styles.iconOptionSelected,
                  selectedIcon === icon && { borderColor: selectedColor },
                ]}
                onPress={() => setSelectedIcon(icon)}
              >
                <Ionicons
                  name={icon}
                  size={24}
                  color={selectedIcon === icon ? selectedColor : colors.textTertiary}
                />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  backButton: {
    padding: spacing.sm,
  },
  backText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  form: {
    flex: 1,
  },
  formContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  preview: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  previewIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  previewName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    ...shadows.md,
    transform: [{ scale: 1.1 }],
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  iconOption: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    ...shadows.sm,
  },
  iconOptionSelected: {
    backgroundColor: colors.primaryBg,
    borderWidth: 2,
  },
});

export default CreateGroupScreen;

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { clubsAPI, schoolsAPI } from '../services/api';
import Button from '../components/Button';
import Input from '../components/Input';

const CATEGORIES = [
  { key: 'tech', label: 'Technology', icon: 'hardware-chip' },
  { key: 'academic', label: 'Academic', icon: 'school' },
  { key: 'social', label: 'Social', icon: 'people' },
  { key: 'sports', label: 'Sports', icon: 'football' },
  { key: 'arts', label: 'Arts', icon: 'color-palette' },
  { key: 'professional', label: 'Professional', icon: 'briefcase' },
  { key: 'cultural', label: 'Cultural', icon: 'globe' },
  { key: 'general', label: 'General', icon: 'apps' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

function getClubColor(name) {
  const palette = [
    '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
    '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
  ];
  if (!name) return palette[0];
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % palette.length;
  return palette[idx];
}

const CreateClubScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [showSchoolPicker, setShowSchoolPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      setSchoolsLoading(true);
      const response = await schoolsAPI.list();
      setSchools(response.data.schools || []);
    } catch (error) {
      console.warn('Failed to fetch schools:', error?.message);
    } finally {
      setSchoolsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a club name');
      return;
    }

    setSaving(true);
    try {
      const clubData = {
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        school_id: selectedSchool?.id || undefined,
      };

      await clubsAPI.create(clubData);
      Alert.alert('Success', 'Club created successfully! You are now the president.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      const msg = error.response?.data?.error || 'Failed to create club';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const isValid = name.trim().length > 0;
  const initial = name.trim() ? name.trim()[0].toUpperCase() : '?';
  const previewColor = getClubColor(name.trim() || 'New Club');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Club</Text>
        <Button
          title="Save"
          onPress={handleSave}
          loading={saving}
          size="sm"
          disabled={!isValid}
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
            <View style={[styles.previewAvatar, { backgroundColor: previewColor }]}>
              <Text style={styles.previewAvatarText}>{initial}</Text>
            </View>
            <Text style={styles.previewName}>{name || 'Club Name'}</Text>
            {category && (
              <View style={styles.previewCategory}>
                <Ionicons
                  name={CATEGORIES.find((c) => c.key === category)?.icon || 'apps'}
                  size={14}
                  color={colors.primary}
                />
                <Text style={styles.previewCategoryText}>
                  {CATEGORIES.find((c) => c.key === category)?.label || category}
                </Text>
              </View>
            )}
          </View>

          {/* Club Name */}
          <Input
            label="Club Name *"
            value={name}
            onChangeText={setName}
            placeholder="e.g., Computer Science Society"
            autoCapitalize="words"
          />

          {/* Description */}
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="What is this club about?"
            multiline
          />

          {/* Category Chips */}
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.categoryChip,
                  category === cat.key && styles.categoryChipActive,
                ]}
                onPress={() => setCategory(cat.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={cat.icon}
                  size={16}
                  color={category === cat.key ? colors.white : colors.textTertiary}
                  style={{ marginRight: spacing.xs }}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat.key && styles.categoryChipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* School Picker */}
          <Text style={styles.fieldLabel}>School (optional)</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowSchoolPicker(!showSchoolPicker)}
            activeOpacity={0.7}
          >
            <Ionicons name="school-outline" size={18} color={colors.primary} />
            <Text
              style={[
                styles.pickerButtonText,
                !selectedSchool && styles.pickerButtonPlaceholder,
              ]}
            >
              {selectedSchool ? selectedSchool.name : 'Select a school'}
            </Text>
            <Ionicons
              name={showSchoolPicker ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textTertiary}
            />
          </TouchableOpacity>

          {showSchoolPicker && (
            <View style={styles.schoolList}>
              {schoolsLoading ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={{ paddingVertical: spacing.md }}
                />
              ) : schools.length > 0 ? (
                <>
                  {/* Clear option */}
                  <TouchableOpacity
                    style={[
                      styles.schoolItem,
                      !selectedSchool && styles.schoolItemActive,
                    ]}
                    onPress={() => {
                      setSelectedSchool(null);
                      setShowSchoolPicker(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.schoolItemText,
                        !selectedSchool && styles.schoolItemTextActive,
                      ]}
                    >
                      No school
                    </Text>
                  </TouchableOpacity>
                  {schools.map((school) => (
                    <TouchableOpacity
                      key={school.id}
                      style={[
                        styles.schoolItem,
                        selectedSchool?.id === school.id && styles.schoolItemActive,
                      ]}
                      onPress={() => {
                        setSelectedSchool(school);
                        setShowSchoolPicker(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.schoolItemText,
                          selectedSchool?.id === school.id && styles.schoolItemTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {school.name}
                      </Text>
                      {selectedSchool?.id === school.id && (
                        <Ionicons name="checkmark" size={18} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </>
              ) : (
                <Text style={styles.noSchoolsText}>No schools available</Text>
              )}
            </View>
          )}

          <View style={styles.bottomSpacer} />
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

  // Preview
  preview: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  previewAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  previewAvatarText: {
    color: colors.textInverse,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 2,
  },
  previewName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  previewCategory: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  previewCategoryText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },

  // Fields
  fieldLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },

  // Category chips
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: colors.textInverse,
  },

  // School picker
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  pickerButtonText: {
    ...typography.body,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
    flex: 1,
  },
  pickerButtonPlaceholder: {
    color: colors.placeholder,
  },
  schoolList: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    maxHeight: 250,
    ...shadows.sm,
    overflow: 'hidden',
  },
  schoolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  schoolItemActive: {
    backgroundColor: colors.primaryBg,
  },
  schoolItemText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  schoolItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  noSchoolsText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  bottomSpacer: {
    height: spacing.xxl,
  },
});

export default CreateClubScreen;

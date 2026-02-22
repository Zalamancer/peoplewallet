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
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import Input from '../components/Input';
import LocationInput from '../components/LocationInput';
import AppearanceTagSelector from '../components/AppearanceTagSelector';
import { SocialIcon, getSocialLabel, SOCIAL_PLATFORMS } from '../components/SocialIcon';
import { Ionicons } from '@expo/vector-icons';

const GENDER_OPTIONS = ['Male', 'Female'];

const SECTIONS = [
  { key: 'identity', label: 'Identity', icon: 'person-outline' },
  { key: 'professional', label: 'Professional', icon: 'briefcase-outline' },
  { key: 'context', label: 'Context', icon: 'map-outline' },
  { key: 'appearance', label: 'Appearance', icon: 'body-outline' },
  { key: 'social', label: 'Social', icon: 'globe-outline' },
];

const EditProfileScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('identity');

  // Identity
  const [name, setName] = useState(user?.name || '');
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [pronouns, setPronouns] = useState(user?.pronouns || '');
  const [bio, setBio] = useState(user?.bio || '');

  // Professional
  const [jobTitle, setJobTitle] = useState(user?.professional?.job_title || '');
  const [company, setCompany] = useState(user?.professional?.company || '');
  const [department, setDepartment] = useState(user?.professional?.department || '');
  const [school, setSchool] = useState(user?.professional?.school || '');
  const [major, setMajor] = useState(user?.professional?.major || '');
  const [graduationYear, setGraduationYear] = useState(user?.professional?.graduation_year || '');

  // Context
  const [location, setLocation] = useState(user?.location || '');

  // Appearance
  const [appearanceData, setAppearanceData] = useState({
    heightRange: user?.appearance?.height_range || null,
    hairColor: user?.appearance?.hair_color || null,
    glasses: user?.appearance?.glasses || false,
    distinguishingFeatures: user?.appearance?.distinguishing_features || [],
  });

  // Social
  const [socialLinks, setSocialLinks] = useState(() => {
    const defaults = SOCIAL_PLATFORMS.reduce((acc, p) => ({ ...acc, [p]: '' }), {});
    if (user?.social && Array.isArray(user.social)) {
      user.social.forEach((s) => {
        if (s.platform && SOCIAL_PLATFORMS.includes(s.platform)) {
          defaults[s.platform] = s.handle || s.url || '';
        }
      });
    }
    return defaults;
  });

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Name is required');
      return;
    }

    setSaving(true);
    try {
      const socialArray = SOCIAL_PLATFORMS
        .filter((p) => socialLinks[p]?.trim())
        .map((p) => ({
          platform: p,
          handle: socialLinks[p].trim(),
          url: p === 'website' ? socialLinks[p].trim() : null,
        }));

      const professional = {};
      if (jobTitle.trim()) professional.job_title = jobTitle.trim();
      if (company.trim()) professional.company = company.trim();
      if (department.trim()) professional.department = department.trim();
      if (school.trim()) professional.school = school.trim();
      if (major.trim()) professional.major = major.trim();
      if (graduationYear.trim()) professional.graduation_year = graduationYear.trim();

      const appearancePayload = {};
      if (appearanceData.heightRange) appearancePayload.height_range = appearanceData.heightRange;
      if (appearanceData.hairColor) appearancePayload.hair_color = appearanceData.hairColor;
      appearancePayload.glasses = appearanceData.glasses;
      if (appearanceData.distinguishingFeatures.length > 0) appearancePayload.distinguishing_features = appearanceData.distinguishingFeatures;

      await updateUser({
        name: name.trim(),
        nickname: nickname.trim() || null,
        pronouns: pronouns.trim() || null,
        bio: bio.trim() || null,
        location: location.trim() || null,
        professional: Object.keys(professional).length > 0 ? professional : undefined,
        social: socialArray.length > 0 ? socialArray : undefined,
        appearance: Object.keys(appearancePayload).length > 1 || appearancePayload.glasses ? appearancePayload : undefined,
      });

      Alert.alert('Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const updateSocial = (platform, value) => {
    setSocialLinks((prev) => ({ ...prev, [platform]: value }));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <Button title="Save" onPress={handleSave} loading={saving} size="sm" disabled={!name.trim()} />
        </View>

        {/* Section Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabs}
          contentContainerStyle={styles.tabsContent}
        >
          {SECTIONS.map((section) => (
            <TouchableOpacity
              key={section.key}
              style={[styles.tab, activeSection === section.key && styles.tabActive]}
              onPress={() => setActiveSection(section.key)}
            >
              <Ionicons
                name={section.icon}
                size={18}
                color={activeSection === section.key ? colors.primary : colors.textTertiary}
              />
              <Text
                style={[
                  styles.tabText,
                  activeSection === section.key && styles.tabTextActive,
                ]}
              >
                {section.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Identity Section */}
          {activeSection === 'identity' && (
            <View style={styles.section}>
              <Input label="Name" value={name} onChangeText={setName} placeholder="Your full name" />
              <Input label="Nickname" value={nickname} onChangeText={setNickname} placeholder="e.g. Johnny" />
              <View>
                <Text style={styles.fieldLabel}>Gender</Text>
                <View style={styles.genderRow}>
                  {GENDER_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[styles.genderPill, pronouns === option && styles.genderPillActive]}
                      onPress={() => setPronouns(pronouns === option ? '' : option)}
                    >
                      <Text style={[styles.genderPillText, pronouns === option && styles.genderPillTextActive]}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <Input
                label="Bio"
                value={bio}
                onChangeText={setBio}
                placeholder="A short bio about yourself"
                multiline
                numberOfLines={3}
                style={styles.textArea}
              />
            </View>
          )}

          {/* Professional Section */}
          {activeSection === 'professional' && (
            <View style={styles.section}>
              <Input label="Job Title" value={jobTitle} onChangeText={setJobTitle} placeholder="e.g. Software Engineer" />
              <Input label="Company" value={company} onChangeText={setCompany} placeholder="e.g. Acme Corp" />
              <Input label="Department" value={department} onChangeText={setDepartment} placeholder="e.g. Engineering" />
              <Input label="School" value={school} onChangeText={setSchool} placeholder="e.g. Stanford University" />
              <Input label="Major" value={major} onChangeText={setMajor} placeholder="e.g. Computer Science" />
              <Input label="Graduation Year" value={graduationYear} onChangeText={setGraduationYear} placeholder="e.g. 2024" keyboardType="numeric" />
            </View>
          )}

          {/* Context Section */}
          {activeSection === 'context' && (
            <View style={styles.section}>
              <LocationInput value={location} onChangeText={setLocation} />
            </View>
          )}

          {/* Appearance Section */}
          {activeSection === 'appearance' && (
            <View style={styles.section}>
              <AppearanceTagSelector
                value={appearanceData}
                onChange={setAppearanceData}
              />
            </View>
          )}

          {/* Social Section */}
          {activeSection === 'social' && (
            <View style={styles.section}>
              {SOCIAL_PLATFORMS.map((platform) => (
                <View key={platform} style={styles.socialRow}>
                  <View style={styles.socialIconWrapper}>
                    <SocialIcon platform={platform} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.socialInputWrapper}>
                    <Input
                      label={getSocialLabel(platform)}
                      value={socialLinks[platform]}
                      onChangeText={(v) => updateSocial(platform, v)}
                      placeholder={platform === 'website' ? 'https://...' : platform === 'discord' ? 'username' : platform === 'groupme' ? 'username or group name' : `@username or profile URL`}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: spacing.xxl }} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  backButton: {
    padding: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  tabs: {
    backgroundColor: colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    maxHeight: 56,
  },
  tabsContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.primaryBg,
  },
  tabText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  section: {
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  socialIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  socialInputWrapper: {
    flex: 1,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  genderRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  genderPill: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  genderPillActive: {
    backgroundColor: colors.primaryBg,
    borderColor: colors.primary,
  },
  genderPillText: {
    ...typography.body,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  genderPillTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});

export default EditProfileScreen;

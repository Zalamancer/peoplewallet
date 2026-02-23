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
import { spacing, typography, borderRadius } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { contactsAPI } from '../services/api';
import Button from '../components/Button';
import Input from '../components/Input';
import LocationInput from '../components/LocationInput';
import Tag from '../components/Tag';
import AppearanceTagSelector from '../components/AppearanceTagSelector';
import { SocialIcon, getSocialLabel, SOCIAL_PLATFORMS } from '../components/SocialIcon';
import { Ionicons } from '@expo/vector-icons';

const GENDER_OPTIONS = ['Male', 'Female'];

const SECTIONS = [
  { key: 'identity', label: 'Identity', icon: 'person-outline' },
  { key: 'professional', label: 'Professional', icon: 'briefcase-outline' },
  { key: 'social', label: 'Social', icon: 'globe-outline' },
  { key: 'appearance', label: 'Appearance', icon: 'body-outline' },
  { key: 'context', label: 'Context', icon: 'map-outline' },
  { key: 'tags', label: 'Tags', icon: 'pricetag-outline' },
];

const EditContactScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { contact } = route.params;
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('identity');

  // Identity
  const [fullName, setFullName] = useState(contact.full_name || '');
  const [nickname, setNickname] = useState(contact.nickname || '');
  const [pronouns, setPronouns] = useState(contact.pronouns || '');
  const [phoneNumber, setPhoneNumber] = useState(contact.phone_number || '');

  // Professional
  const [school, setSchool] = useState(contact.professional?.school || '');
  const [graduationYear, setGraduationYear] = useState(contact.professional?.graduation_year || '');
  const [major, setMajor] = useState(contact.professional?.major || '');
  const [company, setCompany] = useState(contact.professional?.company || '');
  const [jobTitle, setJobTitle] = useState(contact.professional?.job_title || '');

  // Social
  const [socialLinks, setSocialLinks] = useState(() => {
    const defaults = SOCIAL_PLATFORMS.reduce((acc, p) => ({ ...acc, [p]: '' }), {});
    if (contact.social && Array.isArray(contact.social)) {
      contact.social.forEach((s) => {
        if (s.platform && SOCIAL_PLATFORMS.includes(s.platform)) {
          defaults[s.platform] = s.handle || s.url || '';
        }
      });
    }
    return defaults;
  });

  // Appearance
  const [appearance, setAppearance] = useState({
    heightRange: contact.appearance?.height_range || null,
    hairColor: contact.appearance?.hair_color || null,
    glasses: contact.appearance?.glasses || false,
    distinguishingFeatures: contact.appearance?.distinguishing_features || [],
  });

  // Context
  const [howMet, setHowMet] = useState(contact.context?.how_met || '');
  const [eventName, setEventName] = useState(contact.context?.event_name || '');
  const [location, setLocation] = useState(contact.context?.location || '');

  // Tags
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState(contact.tags || []);

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter a full name');
      return;
    }

    setSaving(true);
    try {
      await contactsAPI.update(contact.id, {
        full_name: fullName.trim(),
        nickname: nickname.trim() || null,
        pronouns: pronouns.trim() || null,
        phone_number: phoneNumber.trim() || null,
        professional: {
          school: school.trim() || null,
          graduation_year: graduationYear.trim() || null,
          major: major.trim() || null,
          company: company.trim() || null,
          job_title: jobTitle.trim() || null,
        },
        social: Object.entries(socialLinks)
          .filter(([, value]) => value.trim())
          .map(([platform, handle]) => ({
            platform,
            handle: handle.trim(),
            url:
              platform === 'website'
                ? handle.trim()
                : platform === 'discord' || platform === 'groupme'
                  ? ''
                  : `https://${platform}.com/${handle.trim().replace('@', '')}`,
          })),
        appearance:
          appearance.heightRange || appearance.hairColor || appearance.glasses || appearance.distinguishingFeatures.length > 0
            ? {
                height_range: appearance.heightRange || null,
                hair_color: appearance.hairColor || null,
                glasses: appearance.glasses,
                distinguishing_features: appearance.distinguishingFeatures.length > 0
                  ? appearance.distinguishingFeatures
                  : undefined,
              }
            : {
                height_range: null,
                hair_color: null,
                glasses: false,
              },
        context: {
          how_met: howMet.trim() || null,
          event_name: eventName.trim() || null,
          location: location.trim() || null,
        },
        tags,
      });

      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Edit Contact</Text>
          <Button title="Save" onPress={handleSave} loading={saving} size="sm" disabled={!fullName.trim()} />
        </View>

        {/* Section Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
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
              <Input label="Full Name *" value={fullName} onChangeText={setFullName} placeholder="e.g., Sarah Chen" />
              <Input label="Phone Number" value={phoneNumber} onChangeText={setPhoneNumber} placeholder="e.g., +1 (555) 123-4567" keyboardType="phone-pad" />
              <Input label="Nickname" value={nickname} onChangeText={setNickname} placeholder="e.g., Sar" />
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
            </View>
          )}

          {/* Professional Section */}
          {activeSection === 'professional' && (
            <View style={styles.section}>
              <Input label="School" value={school} onChangeText={setSchool} placeholder="e.g., University of Texas at Dallas" />
              <Input label="Graduation Year" value={graduationYear} onChangeText={setGraduationYear} placeholder="e.g., 2026" keyboardType="numeric" />
              <Input label="Major" value={major} onChangeText={setMajor} placeholder="e.g., Computer Science" />
              <Input label="Company" value={company} onChangeText={setCompany} placeholder="e.g., DataFlow" />
              <Input label="Job Title" value={jobTitle} onChangeText={setJobTitle} placeholder="e.g., Software Engineer" />
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
                      onChangeText={(text) => setSocialLinks({ ...socialLinks, [platform]: text })}
                      placeholder={platform === 'website' ? 'https://...' : platform === 'discord' ? 'username' : platform === 'groupme' ? 'username or group name' : '@username or profile URL'}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Appearance Section */}
          {activeSection === 'appearance' && (
            <View style={styles.section}>
              <AppearanceTagSelector value={appearance} onChange={setAppearance} />
            </View>
          )}

          {/* Context Section */}
          {activeSection === 'context' && (
            <View style={styles.section}>
              <Input label="How Met" value={howMet} onChangeText={setHowMet} placeholder="e.g., Introduced by mutual friend" />
              <Input label="Event" value={eventName} onChangeText={setEventName} placeholder="e.g., UTD Career Fair" />
              <LocationInput value={location} onChangeText={setLocation} />
            </View>
          )}

          {/* Tags Section */}
          {activeSection === 'tags' && (
            <View style={styles.section}>
              <View style={styles.tagInputRow}>
                <View style={{ flex: 1 }}>
                  <Input value={tagInput} onChangeText={setTagInput} placeholder="Add tag..." style={{ marginBottom: 0 }} />
                </View>
                <Button title="Add" onPress={addTag} size="sm" disabled={!tagInput.trim()} />
              </View>
              <View style={styles.tagRow}>
                {tags.map((tag) => (
                  <Tag key={tag} label={tag} variant="primary" removable
                    onRemove={() => setTags(tags.filter((t) => t !== tag))} />
                ))}
              </View>
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
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  tabsScroll: {
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
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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

export default EditContactScreen;

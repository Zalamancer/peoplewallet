import React, { useState } from 'react';
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
import { colors, spacing, typography, borderRadius, shadows } from '../theme/colors';
import { contactsAPI } from '../services/api';
import Button from '../components/Button';
import Input from '../components/Input';
import Tag from '../components/Tag';

const APPEARANCE_HEIGHT = ['short', 'average', 'tall', 'very_tall'];
const APPEARANCE_HAIR = ['black', 'brown', 'blonde', 'red', 'gray', 'white', 'other', 'none'];
const SOCIAL_PLATFORMS = ['linkedin', 'instagram', 'twitter', 'github', 'website'];

const NewContactScreen = ({ navigation, route }) => {
  // Pre-filled data from AI extraction
  const prefilled = route.params?.contactData || {};
  const confidenceFields = route.params?.fields || {};

  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('identity');

  // Identity — AI extraction nests under prefilled.name.*, manual entry uses prefilled.full_name
  const [fullName, setFullName] = useState(prefilled.name?.full_name || prefilled.full_name || '');
  const [nickname, setNickname] = useState(prefilled.name?.nickname || prefilled.nickname || '');
  const [pronouns, setPronouns] = useState(prefilled.name?.pronouns || prefilled.pronouns || '');

  // Professional
  const [school, setSchool] = useState(prefilled.professional?.school || '');
  const [graduationYear, setGraduationYear] = useState(prefilled.professional?.graduation_year || '');
  const [major, setMajor] = useState(prefilled.professional?.major || '');
  const [company, setCompany] = useState(prefilled.professional?.company || '');
  const [jobTitle, setJobTitle] = useState(prefilled.professional?.job_title || '');

  // Social - merge AI extraction format ({linkedin: "url", ...}) with empty defaults
  const [socialLinks, setSocialLinks] = useState(() => {
    const defaults = SOCIAL_PLATFORMS.reduce((acc, p) => ({ ...acc, [p]: '' }), {});
    if (prefilled.social) {
      SOCIAL_PLATFORMS.forEach((p) => {
        if (prefilled.social[p]) defaults[p] = prefilled.social[p];
      });
    }
    return defaults;
  });

  // Appearance
  const [heightRange, setHeightRange] = useState(prefilled.appearance?.height_range || '');
  const [hairColor, setHairColor] = useState(prefilled.appearance?.hair_color || '');
  const [glasses, setGlasses] = useState(prefilled.appearance?.glasses || false);

  // Context
  const [howMet, setHowMet] = useState(prefilled.context?.how_met || '');
  const [eventName, setEventName] = useState(prefilled.context?.event_name || '');
  const [metDate, setMetDate] = useState(prefilled.context?.met_date || '');
  const [location, setLocation] = useState(prefilled.context?.location || '');

  // Notes & Tags
  const [notes, setNotes] = useState(
    prefilled.notes?.map((n) => n.content).join('\n') || ''
  );
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState(prefilled.tags || []);

  const source = route.params?.source || 'manual';

  const getConfidence = (section, field) => {
    const cat = confidenceFields?.[section]?.[field];
    return cat?.status || null;
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter a full name');
      return;
    }

    setSaving(true);
    try {
      const contactData = {
        full_name: fullName.trim(),
        nickname: nickname.trim() || undefined,
        pronouns: pronouns.trim() || undefined,
        source,
        professional: {
          school: school.trim() || undefined,
          graduation_year: graduationYear.trim() || undefined,
          major: major.trim() || undefined,
          company: company.trim() || undefined,
          job_title: jobTitle.trim() || undefined,
        },
        social: Object.entries(socialLinks)
          .filter(([, value]) => value.trim())
          .map(([platform, handle]) => ({
            platform,
            handle: handle.trim(),
            url:
              platform === 'website'
                ? handle.trim()
                : `https://${platform}.com/${handle.trim().replace('@', '')}`,
          })),
        appearance:
          heightRange || hairColor || glasses
            ? {
                height_range: heightRange || undefined,
                hair_color: hairColor || undefined,
                glasses,
              }
            : undefined,
        context:
          howMet || eventName || metDate || location
            ? {
                how_met: howMet.trim() || undefined,
                event_name: eventName.trim() || undefined,
                met_date: metDate.trim() || undefined,
                location: location.trim() || undefined,
              }
            : undefined,
        notes: notes.trim()
          ? [{ content: notes.trim(), source: source === 'manual' ? 'manual' : 'ai_generated' }]
          : [],
        tags,
      };

      const response = await contactsAPI.create(contactData);
      const newContact = response.data;

      // Navigate back to contact list (pop all the way past dictation/recording)
      // and then to the new contact detail
      if (newContact?.id) {
        navigation.popToTop();
        navigation.navigate('ContactDetail', { contactId: newContact.id });
      } else {
        navigation.popToTop();
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || 'Failed to save contact';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { key: 'identity', label: 'Identity', icon: '&#128100;' },
    { key: 'professional', label: 'Professional', icon: '&#127891;' },
    { key: 'social', label: 'Social', icon: '&#128279;' },
    { key: 'appearance', label: 'Appearance', icon: '&#128065;' },
    { key: 'context', label: 'Context', icon: '&#128205;' },
    { key: 'notes', label: 'Notes & Tags', icon: '&#128221;' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Contact</Text>
        <Button
          title="Save"
          onPress={handleSave}
          loading={saving}
          size="sm"
          disabled={!fullName.trim()}
        />
      </View>

      {/* Section tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.sectionTabs}
        contentContainerStyle={styles.sectionTabsContent}
      >
        {sections.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[
              styles.sectionTab,
              activeSection === s.key && styles.sectionTabActive,
            ]}
            onPress={() => setActiveSection(s.key)}
          >
            <Text
              style={[
                styles.sectionTabText,
                activeSection === s.key && styles.sectionTabTextActive,
              ]}
            >
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.form}
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Identity Section */}
          {activeSection === 'identity' && (
            <View>
              <Input
                label="Full Name *"
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g., Sarah Chen"
                autoCapitalize="words"
                confidenceStatus={getConfidence('name', 'full_name')}
              />
              <Input
                label="Nickname"
                value={nickname}
                onChangeText={setNickname}
                placeholder="e.g., Sar"
                confidenceStatus={getConfidence('name', 'nickname')}
              />
              <Input
                label="Pronouns"
                value={pronouns}
                onChangeText={setPronouns}
                placeholder="e.g., she/her"
                autoCapitalize="none"
                confidenceStatus={getConfidence('name', 'pronouns')}
              />
            </View>
          )}

          {/* Professional Section */}
          {activeSection === 'professional' && (
            <View>
              <Input
                label="School"
                value={school}
                onChangeText={setSchool}
                placeholder="e.g., University of Texas at Dallas"
                confidenceStatus={getConfidence('professional', 'school')}
              />
              <Input
                label="Graduation Year"
                value={graduationYear}
                onChangeText={setGraduationYear}
                placeholder="e.g., 2026"
                keyboardType="numeric"
                confidenceStatus={getConfidence('professional', 'graduation_year')}
              />
              <Input
                label="Major"
                value={major}
                onChangeText={setMajor}
                placeholder="e.g., Computer Science"
                confidenceStatus={getConfidence('professional', 'major')}
              />
              <Input
                label="Company"
                value={company}
                onChangeText={setCompany}
                placeholder="e.g., DataFlow"
                confidenceStatus={getConfidence('professional', 'company')}
              />
              <Input
                label="Job Title"
                value={jobTitle}
                onChangeText={setJobTitle}
                placeholder="e.g., Software Engineer"
                confidenceStatus={getConfidence('professional', 'job_title')}
              />
            </View>
          )}

          {/* Social Section */}
          {activeSection === 'social' && (
            <View>
              {SOCIAL_PLATFORMS.map((platform) => (
                <Input
                  key={platform}
                  label={platform.charAt(0).toUpperCase() + platform.slice(1)}
                  value={socialLinks[platform]}
                  onChangeText={(text) =>
                    setSocialLinks({ ...socialLinks, [platform]: text })
                  }
                  placeholder={
                    platform === 'website'
                      ? 'https://example.com'
                      : `@username`
                  }
                  autoCapitalize="none"
                  keyboardType={platform === 'website' ? 'url' : 'default'}
                />
              ))}
            </View>
          )}

          {/* Appearance Section */}
          {activeSection === 'appearance' && (
            <View>
              <Text style={styles.fieldLabel}>Height Range</Text>
              <View style={styles.tagRow}>
                {APPEARANCE_HEIGHT.map((h) => (
                  <Tag
                    key={h}
                    label={h.replace('_', ' ')}
                    selected={heightRange === h}
                    onPress={() => setHeightRange(heightRange === h ? '' : h)}
                    variant={heightRange === h ? 'primary' : 'default'}
                    size="lg"
                  />
                ))}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Hair Color</Text>
              <View style={styles.tagRow}>
                {APPEARANCE_HAIR.map((h) => (
                  <Tag
                    key={h}
                    label={h}
                    selected={hairColor === h}
                    onPress={() => setHairColor(hairColor === h ? '' : h)}
                    variant={hairColor === h ? 'primary' : 'default'}
                    size="lg"
                  />
                ))}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Glasses</Text>
              <View style={styles.tagRow}>
                <Tag
                  label="Yes"
                  selected={glasses === true}
                  onPress={() => setGlasses(!glasses)}
                  variant={glasses ? 'primary' : 'default'}
                  size="lg"
                />
                <Tag
                  label="No"
                  selected={glasses === false}
                  onPress={() => setGlasses(false)}
                  variant={!glasses ? 'default' : 'default'}
                  size="lg"
                />
              </View>
            </View>
          )}

          {/* Context Section */}
          {activeSection === 'context' && (
            <View>
              <Input
                label="How We Met"
                value={howMet}
                onChangeText={setHowMet}
                placeholder="e.g., Introduced by mutual friend at career fair"
                confidenceStatus={getConfidence('context', 'how_met')}
              />
              <Input
                label="Event Name"
                value={eventName}
                onChangeText={setEventName}
                placeholder="e.g., UTD Engineering Career Fair"
                confidenceStatus={getConfidence('context', 'event_name')}
              />
              <Input
                label="Date Met"
                value={metDate}
                onChangeText={setMetDate}
                placeholder="e.g., 2026-02-15"
              />
              <Input
                label="Location"
                value={location}
                onChangeText={setLocation}
                placeholder="e.g., UTD Student Union"
                confidenceStatus={getConfidence('context', 'location')}
              />
            </View>
          )}

          {/* Notes & Tags Section */}
          {activeSection === 'notes' && (
            <View>
              <Input
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Conversation summary, interests, follow-up items..."
                multiline
              />

              <Text style={styles.fieldLabel}>Tags</Text>
              <View style={styles.tagInputRow}>
                <View style={styles.tagInputWrapper}>
                  <Input
                    value={tagInput}
                    onChangeText={setTagInput}
                    placeholder='e.g., "potential co-founder"'
                    style={{ marginBottom: 0 }}
                  />
                </View>
                <Button
                  title="Add"
                  onPress={addTag}
                  size="sm"
                  disabled={!tagInput.trim()}
                  style={styles.addTagButton}
                />
              </View>

              {tags.length > 0 && (
                <View style={styles.tagRow}>
                  {tags.map((tag) => (
                    <Tag
                      key={tag}
                      label={tag}
                      variant="primary"
                      removable
                      onRemove={() => removeTag(tag)}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  backButton: {
    padding: spacing.xs,
  },
  backText: {
    ...typography.body,
    color: colors.primary,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  sectionTabs: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    maxHeight: 48,
  },
  sectionTabsContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    alignItems: 'center',
  },
  sectionTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginRight: spacing.xs,
  },
  sectionTabActive: {
    backgroundColor: colors.primaryBg,
  },
  sectionTabText: {
    ...typography.label,
    color: colors.textTertiary,
  },
  sectionTabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  form: {
    flex: 1,
  },
  formContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  tagInputWrapper: {
    flex: 1,
  },
  addTagButton: {
    marginTop: 2,
  },
});

export default NewContactScreen;

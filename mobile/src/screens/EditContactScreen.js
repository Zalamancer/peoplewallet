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
import { colors, spacing, typography, borderRadius } from '../theme/colors';
import { contactsAPI } from '../services/api';
import Button from '../components/Button';
import Input from '../components/Input';
import Tag from '../components/Tag';

const APPEARANCE_HEIGHT = ['short', 'average', 'tall', 'very_tall'];
const APPEARANCE_HAIR = ['black', 'brown', 'blonde', 'red', 'gray', 'white', 'other', 'none'];

const EditContactScreen = ({ route, navigation }) => {
  const { contact } = route.params;
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState(contact.full_name || '');
  const [nickname, setNickname] = useState(contact.nickname || '');
  const [pronouns, setPronouns] = useState(contact.pronouns || '');

  const [school, setSchool] = useState(contact.professional?.school || '');
  const [graduationYear, setGraduationYear] = useState(contact.professional?.graduation_year || '');
  const [major, setMajor] = useState(contact.professional?.major || '');
  const [company, setCompany] = useState(contact.professional?.company || '');
  const [jobTitle, setJobTitle] = useState(contact.professional?.job_title || '');

  const [heightRange, setHeightRange] = useState(contact.appearance?.height_range || '');
  const [hairColor, setHairColor] = useState(contact.appearance?.hair_color || '');
  const [glasses, setGlasses] = useState(contact.appearance?.glasses || false);

  const [howMet, setHowMet] = useState(contact.context?.how_met || '');
  const [eventName, setEventName] = useState(contact.context?.event_name || '');
  const [location, setLocation] = useState(contact.context?.location || '');

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
        professional: {
          school: school.trim() || null,
          graduation_year: graduationYear.trim() || null,
          major: major.trim() || null,
          company: company.trim() || null,
          job_title: jobTitle.trim() || null,
        },
        appearance: {
          height_range: heightRange || null,
          hair_color: hairColor || null,
          glasses,
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Contact</Text>
        <Button title="Save" onPress={handleSave} loading={saving} size="sm" />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
          <Text style={styles.sectionTitle}>Identity</Text>
          <Input label="Full Name *" value={fullName} onChangeText={setFullName} />
          <Input label="Nickname" value={nickname} onChangeText={setNickname} />
          <Input label="Pronouns" value={pronouns} onChangeText={setPronouns} />

          <Text style={styles.sectionTitle}>Professional</Text>
          <Input label="School" value={school} onChangeText={setSchool} />
          <Input label="Year" value={graduationYear} onChangeText={setGraduationYear} />
          <Input label="Major" value={major} onChangeText={setMajor} />
          <Input label="Company" value={company} onChangeText={setCompany} />
          <Input label="Job Title" value={jobTitle} onChangeText={setJobTitle} />

          <Text style={styles.sectionTitle}>Appearance</Text>
          <Text style={styles.fieldLabel}>Height</Text>
          <View style={styles.tagRow}>
            {APPEARANCE_HEIGHT.map((h) => (
              <Tag key={h} label={h.replace('_', ' ')} selected={heightRange === h}
                onPress={() => setHeightRange(heightRange === h ? '' : h)}
                variant={heightRange === h ? 'primary' : 'default'} />
            ))}
          </View>
          <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Hair Color</Text>
          <View style={styles.tagRow}>
            {APPEARANCE_HAIR.map((h) => (
              <Tag key={h} label={h} selected={hairColor === h}
                onPress={() => setHairColor(hairColor === h ? '' : h)}
                variant={hairColor === h ? 'primary' : 'default'} />
            ))}
          </View>

          <Text style={styles.sectionTitle}>Context</Text>
          <Input label="How Met" value={howMet} onChangeText={setHowMet} />
          <Input label="Event" value={eventName} onChangeText={setEventName} />
          <Input label="Location" value={location} onChangeText={setLocation} />

          <Text style={styles.sectionTitle}>Tags</Text>
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

          <View style={{ height: spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white,
  },
  cancelText: { ...typography.body, color: colors.primary },
  title: { ...typography.h3, color: colors.textPrimary },
  form: { flex: 1 },
  formContent: { padding: spacing.md },
  sectionTitle: {
    ...typography.label, color: colors.textTertiary, textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  tagInputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
});

export default EditContactScreen;

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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { eventsAPI } from '../services/api';
import Button from '../components/Button';
import Input from '../components/Input';

const EVENT_TYPES = [
  { key: 'networking', label: 'Networking', icon: 'people' },
  { key: 'career_fair', label: 'Career Fair', icon: 'briefcase' },
  { key: 'conference', label: 'Conference', icon: 'megaphone' },
  { key: 'meetup', label: 'Meetup', icon: 'cafe' },
  { key: 'social', label: 'Social', icon: 'heart' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const DRESS_CODES = [
  { key: 'casual', label: 'Casual' },
  { key: 'business_casual', label: 'Business Casual' },
  { key: 'smart_casual', label: 'Smart Casual' },
  { key: 'business_formal', label: 'Business Formal' },
  { key: 'other', label: 'Other' },
];

const formatDate = (date) => {
  if (!date) return null;
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (date) => {
  if (!date) return null;
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const NewEventScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [eventType, setEventType] = useState('networking');
  const [description, setDescription] = useState('');
  const [hasFreeFood, setHasFreeFood] = useState(false);
  const [dressCode, setDressCode] = useState(null);
  const [prerequisites, setPrerequisites] = useState('');
  const [saving, setSaving] = useState(false);

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      const updated = eventDate ? new Date(eventDate) : new Date();
      updated.setFullYear(selectedDate.getFullYear());
      updated.setMonth(selectedDate.getMonth());
      updated.setDate(selectedDate.getDate());
      setEventDate(updated);
    }
  };

  const handleTimeChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (event.type === 'dismissed') return;
    if (selectedDate) {
      const updated = eventDate ? new Date(eventDate) : new Date();
      updated.setHours(selectedDate.getHours());
      updated.setMinutes(selectedDate.getMinutes());
      updated.setSeconds(0);
      updated.setMilliseconds(0);
      setEventDate(updated);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter an event name');
      return;
    }
    if (!eventDate) {
      Alert.alert('Required', 'Please select a date and time');
      return;
    }

    setSaving(true);
    try {
      const eventData = {
        name: name.trim(),
        event_date: eventDate.toISOString(),
        location: location.trim() || undefined,
        event_type: eventType,
        description: description.trim() || undefined,
        has_free_food: hasFreeFood,
        dress_code: dressCode || undefined,
        prerequisites: prerequisites.trim() || undefined,
      };

      await eventsAPI.create(eventData);
      Alert.alert('Success', 'Event created successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      const msg = error.response?.data?.error || 'Failed to create event';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const isValid = name.trim() && eventDate;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Event</Text>
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
            <View style={styles.previewIcon}>
              <Ionicons
                name={EVENT_TYPES.find((t) => t.key === eventType)?.icon || 'calendar'}
                size={32}
                color={colors.primary}
              />
            </View>
            <Text style={styles.previewName}>{name || 'Event Name'}</Text>
          </View>

          {/* Event Name */}
          <Input
            label="Event Name *"
            value={name}
            onChangeText={setName}
            placeholder="e.g., UTD Career Fair, Tech Meetup"
            autoCapitalize="words"
          />

          {/* Date & Time */}
          <Text style={styles.fieldLabel}>Date & Time *</Text>
          <View style={styles.dateTimeRow}>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => {
                setShowTimePicker(false);
                setShowDatePicker((prev) => !prev);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text
                style={[
                  styles.dateTimeButtonText,
                  !eventDate && styles.dateTimeButtonPlaceholder,
                ]}
              >
                {formatDate(eventDate) || 'Select date'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => {
                setShowDatePicker(false);
                setShowTimePicker((prev) => !prev);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              <Text
                style={[
                  styles.dateTimeButtonText,
                  !eventDate && styles.dateTimeButtonPlaceholder,
                ]}
              >
                {formatTime(eventDate) || 'Select time'}
              </Text>
            </TouchableOpacity>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={eventDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleDateChange}
              style={Platform.OS === 'ios' ? styles.iosPicker : undefined}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={eventDate || new Date()}
              mode="time"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleTimeChange}
              style={Platform.OS === 'ios' ? styles.iosPicker : undefined}
            />
          )}

          {/* Location */}
          <Input
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="e.g., Convention Center, Room 201"
            autoCapitalize="words"
          />

          {/* Event Type */}
          <Text style={styles.fieldLabel}>Event Type</Text>
          <View style={styles.typeGrid}>
            {EVENT_TYPES.map((type) => (
              <TouchableOpacity
                key={type.key}
                style={[
                  styles.typeChip,
                  eventType === type.key && styles.typeChipActive,
                ]}
                onPress={() => setEventType(type.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={type.icon}
                  size={18}
                  color={eventType === type.key ? colors.white : colors.textTertiary}
                  style={{ marginRight: spacing.xs }}
                />
                <Text
                  style={[
                    styles.typeChipText,
                    eventType === type.key && styles.typeChipTextActive,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Free Food */}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Free Food?</Text>
            <Switch
              value={hasFreeFood}
              onValueChange={setHasFreeFood}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={hasFreeFood ? colors.primary : colors.white}
              ios_backgroundColor={colors.border}
            />
          </View>

          {/* Dress Code */}
          <Text style={styles.fieldLabel}>Dress Code</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dressCodeScroll}
            contentContainerStyle={styles.dressCodeContent}
          >
            {DRESS_CODES.map((code) => (
              <TouchableOpacity
                key={code.key}
                style={[
                  styles.dressCodeChip,
                  dressCode === code.key && styles.dressCodeChipActive,
                ]}
                onPress={() =>
                  setDressCode((prev) => (prev === code.key ? null : code.key))
                }
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dressCodeChipText,
                    dressCode === code.key && styles.dressCodeChipTextActive,
                  ]}
                >
                  {code.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Prerequisites */}
          <Input
            label="Prerequisites"
            value={prerequisites}
            onChangeText={setPrerequisites}
            placeholder="e.g., Bring resume, RSVP required"
            multiline
          />

          {/* Description */}
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="What is this event about?"
            multiline
          />
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
    backgroundColor: colors.primaryBg,
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
  dateTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  dateTimeButtonText: {
    ...typography.body,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
  },
  dateTimeButtonPlaceholder: {
    color: colors.placeholder,
  },
  iosPicker: {
    marginBottom: spacing.md,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  typeChip: {
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
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  typeChipTextActive: {
    color: colors.textInverse,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  switchLabel: {
    ...typography.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  dressCodeScroll: {
    marginBottom: spacing.md,
  },
  dressCodeContent: {
    gap: spacing.sm,
  },
  dressCodeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  dressCodeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dressCodeChipText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  dressCodeChipTextActive: {
    color: colors.textInverse,
  },
});

export default NewEventScreen;

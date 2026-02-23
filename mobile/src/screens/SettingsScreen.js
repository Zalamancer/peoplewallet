import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { authAPI, attendancesAPI, adminAPI, notificationsAPI } from '../services/api';
import Button from '../components/Button';
import { Ionicons } from '@expo/vector-icons';
import TabHeaderBar from '../components/TabHeaderBar';

const VISIBILITY_OPTIONS = [
  {
    value: 'PUBLIC',
    label: 'Public',
    description: 'Anyone at the same event can see your profile',
    icon: 'globe-outline',
  },
  {
    value: 'MUTUAL_ONLY',
    label: 'Mutual Only',
    description: 'Only people you\'ve also saved',
    icon: 'people-outline',
  },
  {
    value: 'PRIVATE',
    label: 'Private',
    description: 'Never appear in co-attendee lists',
    icon: 'lock-closed-outline',
  },
];

const PROFILE_VISIBILITY_OPTIONS = [
  {
    value: 'public',
    label: 'Public',
    description: 'Anyone who has you as a contact can see your full profile',
    icon: 'globe-outline',
  },
  {
    value: 'mutual_only',
    label: 'Mutual Only',
    description: 'Only people who also have you linked as a contact',
    icon: 'people-outline',
  },
  {
    value: 'private',
    label: 'Private',
    description: 'Only your name and photo are visible',
    icon: 'lock-closed-outline',
  },
];

const SettingsScreen = ({ navigation }) => {
  const { colors, isDark, themeMode, changeTheme } = useTheme();
  const { user, logout, updateUser } = useAuth();
  const [attendanceVisibility, setAttendanceVisibility] = useState(
    user?.attendance_visibility || 'PUBLIC'
  );
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [profileVisibility, setProfileVisibility] = useState(
    user?.profile_visibility || 'public'
  );
  const [savingProfileVisibility, setSavingProfileVisibility] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState(null);
  const [notifPrefs, setNotifPrefs] = useState({
    club_new_events: true,
    event_reminders: true,
    event_prep_reminders: true,
    decay_reminders: true,
    weekly_digest: true,
  });
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(true);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const sStyles = useMemo(() => createSettingStyles(colors), [colors]);

  useEffect(() => {
    if (user?.attendance_visibility) {
      setAttendanceVisibility(user.attendance_visibility);
    }
  }, [user?.attendance_visibility]);

  useEffect(() => {
    if (user?.profile_visibility) {
      setProfileVisibility(user.profile_visibility);
    }
  }, [user?.profile_visibility]);

  useEffect(() => {
    fetchAttendanceHistory();
    fetchNotifPrefs();
  }, []);

  const fetchAttendanceHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await attendancesAPI.history();
      setAttendanceHistory(response.data?.attendances || response.data || []);
    } catch (error) {
      console.warn('Failed to fetch attendance history:', error?.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchNotifPrefs = async () => {
    try {
      setNotifPrefsLoading(true);
      const response = await notificationsAPI.getPreferences();
      const data = response.data;
      setNotifPrefs({
        club_new_events: data.club_new_events !== false,
        event_reminders: data.event_reminders !== false,
        event_prep_reminders: data.event_prep_reminders !== false,
        decay_reminders: data.decay_reminders !== false,
        weekly_digest: data.weekly_digest !== false,
      });
    } catch (error) {
      console.warn('Failed to fetch notification preferences:', error?.message);
    } finally {
      setNotifPrefsLoading(false);
    }
  };

  const handleNotifToggle = async (key) => {
    const previousValue = notifPrefs[key];
    setNotifPrefs((prev) => ({ ...prev, [key]: !previousValue }));
    try {
      await notificationsAPI.updatePreferences({ [key]: !previousValue });
    } catch (error) {
      setNotifPrefs((prev) => ({ ...prev, [key]: previousValue }));
      Alert.alert('Error', 'Failed to update notification preference.');
    }
  };

  const handleVisibilityChange = async (value) => {
    const previousValue = attendanceVisibility;
    setAttendanceVisibility(value);
    setSavingVisibility(true);

    try {
      await updateUser({ attendance_visibility: value });
    } catch (error) {
      console.warn('Failed to update attendance visibility:', error?.message);
      setAttendanceVisibility(previousValue);
      Alert.alert('Error', 'Failed to update visibility setting. Please try again.');
    } finally {
      setSavingVisibility(false);
    }
  };

  const handleProfileVisibilityChange = async (value) => {
    const previousValue = profileVisibility;
    setProfileVisibility(value);
    setSavingProfileVisibility(true);

    try {
      await updateUser({ profile_visibility: value });
    } catch (error) {
      console.warn('Failed to update profile visibility:', error?.message);
      setProfileVisibility(previousValue);
      Alert.alert('Error', 'Failed to update profile visibility. Please try again.');
    } finally {
      setSavingProfileVisibility(false);
    }
  };

  const handleRunPipelines = async () => {
    Alert.alert(
      'Run Event Aggregator',
      'This will run all pipelines: Discovery, Classification, Post Fetch, Event Analysis, and Ranking. This may take a few minutes and use API credits.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run All',
          onPress: async () => {
            setPipelineRunning(true);
            setPipelineResult(null);
            try {
              const response = await adminAPI.runPipelines();
              const result = response.data;
              setPipelineResult(result);

              const summary = Object.entries(result.steps || {})
                .map(([step, data]) => `${step}: ${data.status}`)
                .join('\n');

              Alert.alert(
                result.success ? 'Pipelines Complete' : 'Completed with Errors',
                summary + (result.errors?.length ? `\n\nErrors:\n${result.errors.join('\n')}` : ''),
              );
            } catch (error) {
              const msg = error.response?.data?.error || error.message || 'Unknown error';
              Alert.alert('Pipeline Failed', msg);
              setPipelineResult({ success: false, error: msg });
            } finally {
              setPipelineRunning(false);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const initials = (user?.name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const SectionHeader = ({ title }) => (
    <Text style={sStyles.sectionHeader}>{title}</Text>
  );

  const SettingsItem = ({ label, value, onPress, danger, rightElement }) => (
    <TouchableOpacity
      style={sStyles.item}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <Text style={[sStyles.itemLabel, danger && sStyles.itemDanger]}>{label}</Text>
      <View style={sStyles.itemRight}>
        {value && <Text style={sStyles.itemValue}>{value}</Text>}
        {rightElement}
        {onPress && <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TabHeaderBar
        title="Settings"
        navigation={navigation}
        showSearch={false}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'User'}</Text>
            {user?.professional?.job_title || user?.professional?.company ? (
              <Text style={styles.profileRole}>
                {[user.professional.job_title, user.professional.company].filter(Boolean).join(' at ')}
              </Text>
            ) : null}
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={styles.tierBadge}>
              <Text style={styles.tierText}>
                {(user?.subscription_tier || 'free').toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Appearance */}
        <SectionHeader title="Appearance" />
        <View style={[sStyles.item, { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.md }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons
              name={themeMode === 'dark' ? 'moon' : themeMode === 'light' ? 'sunny' : 'book'}
              size={20}
              color={colors.primary}
            />
            <Text style={sStyles.itemLabel}>Theme</Text>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: colors.borderLight, borderRadius: borderRadius.md, padding: 4, width: '100%' }}>
            <TouchableOpacity
              style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.sm - 2, backgroundColor: themeMode === 'light' ? colors.surface : 'transparent', ...shadows[themeMode === 'light' ? 'sm' : 'none'] }}
              onPress={() => changeTheme('light')}>
              <Text style={{ ...typography.bodySmall, color: themeMode === 'light' ? colors.textPrimary : colors.textTertiary, fontWeight: themeMode === 'light' ? '600' : '400' }}>Light</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.sm - 2, backgroundColor: themeMode === 'dark' ? colors.surface : 'transparent', ...shadows[themeMode === 'dark' ? 'sm' : 'none'] }}
              onPress={() => changeTheme('dark')}>
              <Text style={{ ...typography.bodySmall, color: themeMode === 'dark' ? colors.textPrimary : colors.textTertiary, fontWeight: themeMode === 'dark' ? '600' : '400' }}>Dark</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.sm - 2, backgroundColor: themeMode === 'sepia' ? colors.surface : 'transparent', ...shadows[themeMode === 'sepia' ? 'sm' : 'none'] }}
              onPress={() => changeTheme('sepia')}>
              <Text style={{ ...typography.bodySmall, color: themeMode === 'sepia' ? colors.textPrimary : colors.textTertiary, fontWeight: themeMode === 'sepia' ? '600' : '400' }}>Sepia</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications */}
        <SectionHeader title="Notifications" />
        <View style={styles.notifSection}>
          {[
            { key: 'club_new_events', label: 'New events from followed clubs', desc: 'Get notified when clubs you follow post new events' },
            { key: 'event_reminders', label: 'Event reminders', desc: 'Reminders before events you\'re attending' },
            { key: 'event_prep_reminders', label: 'Event prep suggestions', desc: 'Suggestions for contacts to reconnect with before events' },
            { key: 'decay_reminders', label: 'Reconnect reminders', desc: 'Reminders when you haven\'t contacted someone in a while' },
            { key: 'weekly_digest', label: 'Weekly digest', desc: 'Weekly summary of your networking activity' },
          ].map((item, index, arr) => (
            <View
              key={item.key}
              style={[
                styles.notifRow,
                index < arr.length - 1 && styles.notifRowBorder,
              ]}
            >
              <View style={styles.notifInfo}>
                <Text style={styles.notifLabel}>{item.label}</Text>
                <Text style={styles.notifDesc}>{item.desc}</Text>
              </View>
              <Switch
                value={notifPrefs[item.key]}
                onValueChange={() => handleNotifToggle(item.key)}
                trackColor={{ false: colors.borderLight, true: colors.primary }}
                thumbColor={colors.white}
                disabled={notifPrefsLoading}
              />
            </View>
          ))}
        </View>

        {/* My Event History */}
        <SectionHeader title="My Event History" />
        <View style={styles.eventHistorySection}>
          {/* Stats */}
          <View style={styles.eventStatsRow}>
            <View style={styles.eventStatBox}>
              <Ionicons name="calendar" size={20} color={colors.primary} />
              <Text style={styles.eventStatNumber}>
                {Array.isArray(attendanceHistory) ? attendanceHistory.length : 0}
              </Text>
              <Text style={styles.eventStatLabel}>Events Attended</Text>
            </View>
          </View>

          {/* Event List */}
          {loadingHistory ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: spacing.md }} />
          ) : Array.isArray(attendanceHistory) && attendanceHistory.length > 0 ? (
            attendanceHistory.map((attendance, index) => (
              <View
                key={attendance.id || index}
                style={[
                  styles.eventHistoryItem,
                  index < attendanceHistory.length - 1 && styles.eventHistoryItemBorder,
                ]}
              >
                <View style={styles.eventHistoryInfo}>
                  <Text style={styles.eventHistoryName}>
                    {attendance.event_name || attendance.name || 'Unnamed Event'}
                  </Text>
                  {(attendance.event_date || attendance.checked_in_at) && (
                    <Text style={styles.eventHistoryDate}>
                      {formatSettingsDate(attendance.event_date || attendance.checked_in_at)}
                    </Text>
                  )}
                </View>
                <View
                  style={[
                    styles.checkinBadge,
                    attendance.checkin_method === 'qr'
                      ? styles.checkinBadgeQR
                      : styles.checkinBadgeManual,
                  ]}
                >
                  <Ionicons
                    name={attendance.checkin_method === 'qr' ? 'qr-code-outline' : 'hand-left-outline'}
                    size={12}
                    color={attendance.checkin_method === 'qr' ? colors.primary : colors.textTertiary}
                  />
                  <Text
                    style={[
                      styles.checkinBadgeText,
                      attendance.checkin_method === 'qr'
                        ? styles.checkinBadgeTextQR
                        : styles.checkinBadgeTextManual,
                    ]}
                  >
                    {attendance.checkin_method === 'qr' ? 'QR' : 'Manual'}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.eventHistoryEmpty}>No events attended yet.</Text>
          )}
        </View>

        {/* Dev Tools */}
        <SectionHeader title="Dev Tools" />
        <View style={styles.pipelineSection}>
          <TouchableOpacity
            style={[styles.pipelineButton, pipelineRunning && styles.pipelineButtonDisabled]}
            onPress={handleRunPipelines}
            activeOpacity={0.7}
            disabled={pipelineRunning}
          >
            {pipelineRunning ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="rocket-outline" size={20} color={colors.white} />
            )}
            <Text style={styles.pipelineButtonText}>
              {pipelineRunning ? 'Running Pipelines...' : 'Run Event Aggregator'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.pipelineHint}>
            Runs: Discovery → Classification → Post Fetch → AI Analysis → Ranking
          </Text>
          {pipelineResult && (
            <View style={[styles.pipelineResultBox, pipelineResult.success ? styles.pipelineResultSuccess : styles.pipelineResultError]}>
              {Object.entries(pipelineResult.steps || {}).map(([step, data]) => (
                <View key={step} style={styles.pipelineResultRow}>
                  <Ionicons
                    name={data.status === 'ok' ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={data.status === 'ok' ? colors.success : colors.error}
                  />
                  <Text style={styles.pipelineResultStep}>{step}</Text>
                  <Text style={styles.pipelineResultStatus}>
                    {data.status === 'ok'
                      ? JSON.stringify(
                        Object.fromEntries(
                          Object.entries(data).filter(([k]) => k !== 'status')
                        )
                      )
                      : data.message}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Quick Links */}
        <SectionHeader title="More" />
        <SettingsItem
          label="Insights & Analytics"
          onPress={() => navigation.navigate('Insights')}
        />
        <SettingsItem
          label="Groups"
          onPress={() => navigation.navigate('Groups')}
        />
        <SettingsItem
          label="Calendar"
          onPress={() => navigation.navigate('Calendar')}
        />

        {/* School Verification */}
        <SectionHeader title="School" />
        {user?.school_email_verified ? (
          <SettingsItem
            label="School Email"
            value={user.school?.name || user.school_email}
            rightElement={<Ionicons name="checkmark-circle" size={20} color={colors.success} />}
          />
        ) : (
          <SettingsItem
            label="Verify School Email"
            onPress={() => navigation.navigate('SchoolVerify', { mode: 'link' })}
            rightElement={<Ionicons name="school-outline" size={20} color={colors.primary} />}
          />
        )}

        {/* Account Section */}
        <SectionHeader title="Account" />
        <SettingsItem
          label="Edit Profile"
          onPress={() => navigation.navigate('EditProfile')}
        />
        <SettingsItem
          label="Subscription"
          value={user?.subscription_tier === 'free' ? 'Free' : 'Pro'}
          onPress={() => Alert.alert('Subscription', 'Subscription management coming soon.\n\nFree: Manual contact creation, 50 contacts\nPro: $4.99/mo - AI capture, unlimited contacts')}
        />
        <SettingsItem
          label="Connect LinkedIn"
          value={user?.linkedin_id ? 'Connected' : 'Not connected'}
          onPress={() => {
            if (!user?.linkedin_id) {
              Linking.openURL('http://localhost:3000/api/auth/linkedin');
            }
          }}
        />

        {/* Privacy Section */}
        <SectionHeader title="Privacy & Data" />

        {/* Attendance Visibility */}
        <View style={styles.visibilitySection}>
          <View style={styles.visibilityHeader}>
            <Ionicons name="eye-outline" size={20} color={colors.primary} />
            <View style={styles.visibilityHeaderText}>
              <Text style={styles.visibilityTitle}>Who can see you at events</Text>
              <Text style={styles.visibilitySubtitle}>
                Control your visibility in co-attendee lists
              </Text>
            </View>
            {savingVisibility && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>

          {VISIBILITY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.visibilityOption,
                attendanceVisibility === option.value && styles.visibilityOptionActive,
              ]}
              onPress={() => handleVisibilityChange(option.value)}
              activeOpacity={0.7}
              disabled={savingVisibility}
            >
              <View style={[
                styles.visibilityIconWrapper,
                attendanceVisibility === option.value && styles.visibilityIconWrapperActive,
              ]}>
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={attendanceVisibility === option.value ? colors.primary : colors.textTertiary}
                />
              </View>
              <View style={styles.visibilityOptionText}>
                <Text style={[
                  styles.visibilityOptionLabel,
                  attendanceVisibility === option.value && styles.visibilityOptionLabelActive,
                ]}>
                  {option.label}
                </Text>
                <Text style={styles.visibilityOptionDesc}>{option.description}</Text>
              </View>
              <View style={[
                styles.radioOuter,
                attendanceVisibility === option.value && styles.radioOuterActive,
              ]}>
                {attendanceVisibility === option.value && (
                  <View style={styles.radioInner} />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Profile Visibility */}
        <View style={styles.visibilitySection}>
          <View style={styles.visibilityHeader}>
            <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
            <View style={styles.visibilityHeaderText}>
              <Text style={styles.visibilityTitle}>Profile Visibility</Text>
              <Text style={styles.visibilitySubtitle}>
                Control who can see your full profile when linked
              </Text>
            </View>
            {savingProfileVisibility && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>

          {PROFILE_VISIBILITY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.visibilityOption,
                profileVisibility === option.value && styles.visibilityOptionActive,
              ]}
              onPress={() => handleProfileVisibilityChange(option.value)}
              activeOpacity={0.7}
              disabled={savingProfileVisibility}
            >
              <View style={[
                styles.visibilityIconWrapper,
                profileVisibility === option.value && styles.visibilityIconWrapperActive,
              ]}>
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={profileVisibility === option.value ? colors.primary : colors.textTertiary}
                />
              </View>
              <View style={styles.visibilityOptionText}>
                <Text style={[
                  styles.visibilityOptionLabel,
                  profileVisibility === option.value && styles.visibilityOptionLabelActive,
                ]}>
                  {option.label}
                </Text>
                <Text style={styles.visibilityOptionDesc}>{option.description}</Text>
              </View>
              <View style={[
                styles.radioOuter,
                profileVisibility === option.value && styles.radioOuterActive,
              ]}>
                {profileVisibility === option.value && (
                  <View style={styles.radioInner} />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <SettingsItem
          label="Data Export"
          onPress={() => Alert.alert('Data Export', 'You can export all your contacts as a JSON or CSV file. This feature is coming soon.')}
        />
        <SettingsItem
          label="Delete Account"
          onPress={() => Alert.alert(
            'Delete Account',
            'This will permanently delete your account and all your data, including contacts, messages, and event history. This action cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete My Account',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await authAPI.deleteAccount();
                    Alert.alert('Account Deleted', 'Your account has been permanently deleted.');
                    logout();
                  } catch (err) {
                    Alert.alert('Error', err.response?.data?.error || 'Failed to delete account. Please try again or email support@peoplewallet.app.');
                  }
                },
              },
            ]
          )}
          danger
        />

        {/* About Section */}
        <SectionHeader title="About" />
        <SettingsItem label="Version" value="1.0.0 (MVP)" />
        <SettingsItem
          label="Privacy Policy"
          onPress={() => Linking.openURL('https://peoplewallet.app/legal/privacy-policy.html')}
        />
        <SettingsItem
          label="Terms of Service"
          onPress={() => Linking.openURL('https://peoplewallet.app/legal/terms-of-service.html')}
        />



        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

function formatSettingsDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const createSettingStyles = (colors) => StyleSheet.create({
  sectionHeader: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  itemLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  itemDanger: {
    color: colors.error,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  itemValue: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
});

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    color: colors.textInverse,
    fontSize: 22,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  profileRole: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  profileEmail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tierBadge: {
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  tierText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },

  // Attendance Visibility
  visibilitySection: {
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  visibilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  visibilityHeaderText: {
    flex: 1,
  },
  visibilityTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  visibilitySubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  visibilityOptionActive: {
    backgroundColor: colors.primaryBg,
  },
  visibilityIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityIconWrapperActive: {
    backgroundColor: `${colors.primary}20`,
  },
  visibilityOptionText: {
    flex: 1,
  },
  visibilityOptionLabel: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  visibilityOptionLabelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  visibilityOptionDesc: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 1,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },

  logoutButton: {
    backgroundColor: colors.surface,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: colors.borderLight,
    alignItems: 'center',
  },
  logoutButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.error,
  },

  // Notifications
  notifSection: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
    overflow: 'hidden',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  notifRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  notifInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  notifLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  notifDesc: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Event History
  eventHistorySection: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
    overflow: 'hidden',
  },
  eventStatsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  eventStatBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  eventStatNumber: {
    ...typography.h3,
    color: colors.primary,
    fontWeight: '700',
  },
  eventStatLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  eventHistoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  eventHistoryItemBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
  },
  eventHistoryInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  eventHistoryName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  eventHistoryDate: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  checkinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  checkinBadgeQR: {
    backgroundColor: `${colors.primary}15`,
  },
  checkinBadgeManual: {
    backgroundColor: colors.borderLight,
  },
  checkinBadgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  checkinBadgeTextQR: {
    color: colors.primary,
  },
  checkinBadgeTextManual: {
    color: colors.textTertiary,
  },
  eventHistoryEmpty: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },

  // Pipeline runner
  pipelineSection: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  pipelineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  pipelineButtonDisabled: {
    backgroundColor: colors.textTertiary,
  },
  pipelineButtonText: {
    ...typography.button,
    color: colors.white,
  },
  pipelineHint: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: 11,
  },
  pipelineResultBox: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  pipelineResultSuccess: {
    backgroundColor: `${colors.success}10`,
    borderColor: `${colors.success}30`,
  },
  pipelineResultError: {
    backgroundColor: `${colors.error}10`,
    borderColor: `${colors.error}30`,
  },
  pipelineResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 3,
  },
  pipelineResultStep: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
    width: 90,
  },
  pipelineResultStatus: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    fontSize: 11,
  },
});

export default SettingsScreen;

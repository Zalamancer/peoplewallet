import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';

const SettingsScreen = ({ navigation }) => {
  const { user, logout } = useAuth();

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.screenTitle}>Settings</Text>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'User'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={styles.tierBadge}>
              <Text style={styles.tierText}>
                {(user?.subscription_tier || 'free').toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Account Section */}
        <SectionHeader title="Account" />
        <SettingsItem
          label="Edit Profile"
          onPress={() => Alert.alert('Coming Soon', 'Profile editing will be available in the next update.')}
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
        <SettingsItem
          label="Data Export"
          onPress={() => Alert.alert('Data Export', 'You can export all your contacts as a JSON or CSV file. This feature is coming soon.')}
        />
        <SettingsItem
          label="Delete Account"
          onPress={() => Alert.alert('Delete Account', 'This will permanently delete your account and all data. This action cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Contact Support', 'Please email support@proanimate.com to request account deletion.') },
          ])}
          danger
        />

        {/* About Section */}
        <SectionHeader title="About" />
        <SettingsItem label="Version" value="1.0.0 (MVP)" />
        <SettingsItem
          label="Privacy Policy"
          onPress={() => Alert.alert('Privacy Policy', 'Privacy policy will be available at launch.')}
        />
        <SettingsItem
          label="Terms of Service"
          onPress={() => Alert.alert('Terms of Service', 'Terms of service will be available at launch.')}
        />

        {/* AI Info */}
        <View style={styles.aiInfo}>
          <Text style={styles.aiInfoTitle}>AI-Powered Features</Text>
          <Text style={styles.aiInfoText}>
            ProAnimate Connect uses Deepgram for speech-to-text{'\n'}
            and GPT-4o-mini for entity extraction.{'\n\n'}
            Audio recordings are discarded after transcription.{'\n'}
            Only text is retained. Your data is encrypted at rest.
          </Text>
        </View>

        {/* Logout */}
        <Button
          title="Sign Out"
          onPress={handleLogout}
          variant="outline"
          fullWidth
          style={styles.logoutButton}
          textStyle={{ color: colors.error }}
        />

        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const SectionHeader = ({ title }) => (
  <Text style={settingStyles.sectionHeader}>{title}</Text>
);

const SettingsItem = ({ label, value, onPress, danger }) => (
  <TouchableOpacity
    style={settingStyles.item}
    onPress={onPress}
    disabled={!onPress}
    activeOpacity={0.7}
  >
    <Text style={[settingStyles.itemLabel, danger && settingStyles.itemDanger]}>{label}</Text>
    <View style={settingStyles.itemRight}>
      {value && <Text style={settingStyles.itemValue}>{value}</Text>}
      {onPress && <Text style={settingStyles.chevron}>&#8250;</Text>}
    </View>
  </TouchableOpacity>
);

const settingStyles = StyleSheet.create({
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
    backgroundColor: colors.white,
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
  chevron: {
    fontSize: 20,
    color: colors.textTertiary,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  content: {
    flex: 1,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
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
    color: colors.white,
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
  aiInfo: {
    backgroundColor: colors.primaryBg,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  aiInfoTitle: {
    ...typography.label,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  aiInfoText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  logoutButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    borderColor: colors.error,
  },
});

export default SettingsScreen;

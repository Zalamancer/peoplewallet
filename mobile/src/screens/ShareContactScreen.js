import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { contactsAPI } from '../services/api';
import Button from '../components/Button';
import Tag from '../components/Tag';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

const ShareContactScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { contactId } = route.params;
  const [contact, setContact] = useState(null);
  const [shareData, setShareData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [contactId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [contactRes, shareRes] = await Promise.all([
        contactsAPI.get(contactId),
        contactsAPI.getShareLink(contactId),
      ]);
      setContact(contactRes.data);
      setShareData(shareRes.data);
    } catch (error) {
      console.warn('Failed to load share data:', error?.message);
      Alert.alert('Error', 'Failed to load contact sharing data');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!shareData?.share_url) return;

    try {
      setShareLoading(true);
      const message = `Check out ${contact.full_name}'s contact card on PeopleWallet!`;
      await Share.share({
        message: Platform.OS === 'ios'
          ? message
          : `${message}\n${shareData.share_url}`,
        url: Platform.OS === 'ios' ? shareData.share_url : undefined,
        title: `${contact.full_name} - PeopleWallet`,
      });
    } catch (error) {
      if (error.message !== 'User did not share') {
        Alert.alert('Error', 'Failed to share contact card');
      }
    } finally {
      setShareLoading(false);
    }
  };

  const handleShareViaText = async () => {
    if (!shareData?.share_url) return;

    try {
      await Share.share({
        message: `Hey! Here's my contact card: ${shareData.share_url}`,
        title: `${contact.full_name} - PeopleWallet`,
      });
    } catch (error) {
      if (error.message !== 'User did not share') {
        Alert.alert('Error', 'Failed to share via text');
      }
    }
  };

  const handleToggleShare = async () => {
    try {
      const newEnabled = !shareData.share_enabled;
      await contactsAPI.toggleShare(contactId, newEnabled);
      setShareData((prev) => ({ ...prev, share_enabled: newEnabled }));
    } catch (error) {
      Alert.alert('Error', 'Failed to update sharing settings');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!contact || !shareData) return null;

  const initials = (contact.full_name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const linkedInLink = contact.social?.find((s) => s.platform === 'linkedin');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Share Card</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Visual Contact Card */}
        <View style={styles.cardOuter}>
          <View style={styles.card}>
            {/* Card Header Accent */}
            <View style={styles.cardAccent} />

            {/* Avatar */}
            <View style={styles.cardBody}>
              <View style={[styles.avatar, { backgroundColor: getAvatarColor(contact.full_name) }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>

              {/* Name & Pronouns */}
              <Text style={styles.cardName}>{contact.full_name}</Text>
              {contact.nickname && (
                <Text style={styles.cardNickname}>"{contact.nickname}"</Text>
              )}
              {contact.pronouns && (
                <Text style={styles.cardPronouns}>{contact.pronouns}</Text>
              )}

              {/* Professional Info */}
              {contact.professional && (
                <View style={styles.cardSection}>
                  {contact.professional.job_title && contact.professional.company && (
                    <Text style={styles.cardProfessional}>
                      {contact.professional.job_title} at {contact.professional.company}
                    </Text>
                  )}
                  {contact.professional.job_title && !contact.professional.company && (
                    <Text style={styles.cardProfessional}>
                      {contact.professional.job_title}
                    </Text>
                  )}
                  {!contact.professional.job_title && contact.professional.company && (
                    <Text style={styles.cardProfessional}>
                      {contact.professional.company}
                    </Text>
                  )}
                  {contact.professional.school && (
                    <Text style={styles.cardSchool}>
                      {contact.professional.major
                        ? `${contact.professional.major} @ ${contact.professional.school}`
                        : contact.professional.school}
                      {contact.professional.graduation_year
                        ? ` '${contact.professional.graduation_year.slice(-2)}`
                        : ''}
                    </Text>
                  )}
                </View>
              )}

              {/* LinkedIn Link */}
              {linkedInLink && (
                <View style={styles.socialRow}>
                  <Ionicons name="logo-linkedin" size={16} color={colors.primary} />
                  <Text style={styles.socialText} numberOfLines={1}>
                    {linkedInLink.handle || linkedInLink.url}
                  </Text>
                </View>
              )}

              {/* Tags */}
              {contact.tags && contact.tags.length > 0 && (
                <View style={styles.cardTags}>
                  {contact.tags.slice(0, 5).map((tag) => (
                    <Tag key={tag} label={tag} variant="primary" size="sm" />
                  ))}
                </View>
              )}

              {/* Branding */}
              <View style={styles.branding}>
                <Text style={styles.brandingText}>PeopleWallet</Text>
              </View>
            </View>
          </View>
        </View>

        {/* QR Code Section */}
        <View style={styles.qrSection}>
          <Text style={styles.sectionTitle}>QR CODE</Text>
          <Text style={styles.sectionSubtitle}>
            Others can scan this to view your contact card
          </Text>
          <View style={styles.qrContainer}>
            <QRCode
              value={shareData.share_url}
              size={200}
              color={colors.textPrimary}
              backgroundColor={colors.surface}
            />
          </View>
        </View>

        {/* Share Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>SHARE VIA</Text>

          <View style={styles.shareButtons}>
            <TouchableOpacity style={styles.shareOption} onPress={handleShareViaText}>
              <View style={[styles.shareIcon, { backgroundColor: colors.accent }]}>
                <Ionicons name="chatbubble" size={22} color={colors.textInverse} />
              </View>
              <Text style={styles.shareOptionLabel}>Text</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareOption} onPress={handleShare}>
              <View style={[styles.shareIcon, { backgroundColor: colors.primary }]}>
                <Ionicons name="share-outline" size={22} color={colors.textInverse} />
              </View>
              <Text style={styles.shareOptionLabel}>More</Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <TouchableOpacity style={styles.shareOption} onPress={handleShare}>
                <View style={[styles.shareIcon, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="radio-outline" size={22} color={colors.textInverse} />
                </View>
                <Text style={styles.shareOptionLabel}>AirDrop</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.shareOption}
              onPress={() => {
                if (shareData?.share_url) {
                  Share.share({ message: shareData.share_url });
                }
              }}
            >
              <View style={[styles.shareIcon, { backgroundColor: colors.info }]}>
                <Ionicons name="link-outline" size={22} color={colors.textInverse} />
              </View>
              <Text style={styles.shareOptionLabel}>Copy Link</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Share Toggle */}
        <View style={styles.toggleSection}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleTitle}>Sharing Enabled</Text>
              <Text style={styles.toggleSubtitle}>
                {shareData.share_enabled
                  ? 'Anyone with the link can view this card'
                  : 'This card is currently private'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.toggle,
                shareData.share_enabled && styles.toggleActive,
              ]}
              onPress={handleToggleShare}
            >
              <View
                style={[
                  styles.toggleKnob,
                  shareData.share_enabled && styles.toggleKnobActive,
                ]}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
};

function getAvatarColor(name) {
  const palette = [
    '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
    '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
  ];
  if (!name) return palette[0];
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % palette.length;
  return palette[idx];
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    padding: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  // Visual Card
  cardOuter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardAccent: {
    height: 6,
    backgroundColor: colors.primary,
  },
  cardBody: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  avatarText: {
    color: colors.textInverse,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 2,
  },
  cardName: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  cardNickname: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  cardPronouns: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: 2,
  },
  cardSection: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  cardProfessional: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  cardSchool: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 4,
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  socialText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '500',
  },
  cardTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  branding: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  brandingText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // QR Code
  qrSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  qrContainer: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },

  // Share Actions
  actionsSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  shareButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
  },
  shareOption: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  shareIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  shareOptionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // Toggle Section
  toggleSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  toggleTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  toggleSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: colors.accent,
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },

  bottomSpacer: {
    height: spacing.xxl,
  },
});

export default ShareContactScreen;

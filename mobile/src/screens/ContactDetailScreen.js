import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { contactsAPI, groupsAPI, eventsAPI, authAPI } from '../services/api';
import Tag from '../components/Tag';
import Button from '../components/Button';
import MutualConnectionsBadge from '../components/MutualConnectionsBadge';
import AddToGroupModal from '../components/AddToGroupModal';
import ShareToChatModal from '../components/ShareToChatModal';
import { Ionicons } from '@expo/vector-icons';
import { SocialIcon, getSocialLabel } from '../components/SocialIcon';

const ContactDetailScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sectionStyles = useMemo(() => createSectionStyles(colors), [colors]);

  const { contactId } = route.params || {};
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showShareChat, setShowShareChat] = useState(false);
  const [contactGroups, setContactGroups] = useState([]);
  const [eventHistory, setEventHistory] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const SectionCard = ({ title, children }) => (
    <View style={sectionStyles.card}>
      <Text style={sectionStyles.title}>{title}</Text>
      {children}
    </View>
  );

  const InfoRow = ({ label, value }) => (
    <View style={sectionStyles.row}>
      <Text style={sectionStyles.label}>{label}</Text>
      <Text style={sectionStyles.value} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );

  useEffect(() => {
    if (!contactId) {
      setLoadError('No contact ID provided');
      setLoading(false);
      return;
    }
    fetchContact();
  }, [contactId]);

  const fetchContact = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await contactsAPI.get(contactId);
      setContact(response.data);
    } catch (error) {
      const status = error.response?.status;
      const serverMsg = error.response?.data?.error;
      const msg = status === 404
        ? 'Contact not found'
        : serverMsg || error.message || 'Failed to load contact';
      console.warn('Failed to fetch contact:', msg, '(status:', status, ')');
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchContactGroups = async () => {
    try {
      const response = await groupsAPI.forContact(contactId);
      setContactGroups(response.data.groups);
    } catch (error) {
      console.warn('Failed to fetch contact groups:', error?.message);
    }
  };

  useEffect(() => {
    if (contactId) fetchContactGroups();
  }, [contactId]);

  // Refetch when screen comes back into focus (e.g. after editing)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (contactId) {
        fetchContact();
        fetchContactGroups();
      }
    });
    return unsubscribe;
  }, [navigation, contactId]);

  const fetchEventHistory = async (contactData) => {
    try {
      setLoadingEvents(true);
      const events = [];

      // If this contact has an event_name in context, try to find matching events
      if (contactData?.context?.event_name) {
        const response = await eventsAPI.list();
        const allEvents = response.data?.events || [];
        const matched = allEvents.filter(
          (e) =>
            e.name &&
            e.name.toLowerCase() === contactData.context.event_name.toLowerCase()
        );
        matched.forEach((e) => {
          if (!events.find((ev) => ev.id === e.id)) {
            events.push(e);
          }
        });
      }

      setEventHistory(events);
    } catch (error) {
      console.warn('Failed to fetch event history:', error?.message);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (contact) {
      fetchEventHistory(contact);
    }
  }, [contact]);

  const handleDelete = () => {
    Alert.alert(
      'Delete Contact',
      `Are you sure you want to delete ${contact.full_name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await contactsAPI.delete(contactId);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete contact');
            }
          },
        },
      ]
    );
  };

  const handleToggleFavorite = async () => {
    try {
      await contactsAPI.update(contactId, { is_favorite: !contact.is_favorite });
      setContact((prev) => ({ ...prev, is_favorite: !prev.is_favorite }));
    } catch (error) {
      console.warn('Failed to toggle favorite:', error?.message);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (loadError || !contact) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textTertiary} />
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md, textAlign: 'center', paddingHorizontal: spacing.xl }]}>
          {loadError || 'Contact not found'}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
          <TouchableOpacity
            style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.background, borderRadius: borderRadius.full }}
            onPress={() => navigation.goBack()}
          >
            <Text style={[typography.body, { color: colors.textSecondary, fontWeight: '600' }]}>Go Back</Text>
          </TouchableOpacity>
          {contactId && (
            <TouchableOpacity
              style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.primary, borderRadius: borderRadius.full }}
              onPress={fetchContact}
            >
              <Text style={[typography.body, { color: colors.textInverse, fontWeight: '600' }]}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const initials = (contact.full_name || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => navigation.navigate('ShareContact', { contactId })}
            style={styles.headerButton}
          >
            <Ionicons name="share-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleToggleFavorite} style={styles.headerButton}>
            <Ionicons
              name={contact.is_favorite ? "star" : "star-outline"}
              size={24}
              color={contact.is_favorite ? colors.warning : colors.textTertiary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('EditContact', { contact })}
            style={styles.headerButton}
          >
            <Ionicons name="pencil" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: getAvatarColor(contact.full_name) }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{contact.full_name}</Text>
          {contact.nickname && <Text style={styles.nickname}>"{contact.nickname}"</Text>}
          {contact.pronouns && <Text style={styles.pronouns}>{contact.pronouns}</Text>}

          {contact.source && contact.source !== 'manual' && (
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceText}>
                Created via {contact.source === 'dictation' ? 'AI Dictation' : contact.source}
              </Text>
            </View>
          )}

          {/* Verified PeopleWallet User Badge */}
          {contact.linked_profile && contact.link_confidence === 'high' && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success || '#10B981'} />
              <Text style={styles.verifiedBadgeText}>Verified PeopleWallet user</Text>
            </View>
          )}
        </View>

        {/* Suggestion Banner - for name-based matches that need confirmation */}
        {contact.link_confidence === 'suggested' && contact.linked_profile && (
          <View style={styles.suggestionBanner}>
            <View style={styles.suggestionContent}>
              <Ionicons name="help-circle-outline" size={22} color={colors.primary} />
              <Text style={styles.suggestionText}>
                Is this {contact.linked_profile.name} on PeopleWallet?
              </Text>
            </View>
            <View style={styles.suggestionActions}>
              <TouchableOpacity
                style={styles.suggestionButtonConfirm}
                onPress={async () => {
                  try {
                    await contactsAPI.confirmLink(contactId, contact.linked_profile.id);
                    fetchContact();
                  } catch (e) {
                    Alert.alert('Error', 'Failed to confirm link');
                  }
                }}
              >
                <Text style={styles.suggestionButtonConfirmText}>Yes, link</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.suggestionButtonDismiss}
                onPress={async () => {
                  try {
                    await contactsAPI.dismissLink(contactId);
                    fetchContact();
                  } catch (e) {
                    Alert.alert('Error', 'Failed to dismiss link');
                  }
                }}
              >
                <Text style={styles.suggestionButtonDismissText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Mutual Connections */}
        <MutualConnectionsBadge
          contactId={contactId}
          contactName={contact.full_name}
          onPress={(connections) =>
            navigation.navigate('MutualConnections', {
              contactId,
              contactName: contact.full_name,
              connections,
            })
          }
        />

        {/* Professional Info */}
        {contact.professional && (
          <SectionCard title="Professional">
            {contact.professional.job_title && (
              <InfoRow label="Title" value={contact.professional.job_title} />
            )}
            {contact.professional.company && (
              <InfoRow label="Company" value={contact.professional.company} />
            )}
            {contact.professional.department && (
              <InfoRow label="Department" value={contact.professional.department} />
            )}
            {contact.professional.school && (
              <InfoRow label="School" value={contact.professional.school} />
            )}
            {contact.professional.major && (
              <InfoRow label="Major" value={contact.professional.major} />
            )}
            {contact.professional.graduation_year && (
              <InfoRow label="Year" value={contact.professional.graduation_year} />
            )}
          </SectionCard>
        )}

        {/* Linked Profile - "Their Profile" section */}
        {contact.linked_profile && contact.link_confidence === 'high' && (contact.linked_profile.bio || contact.linked_profile.professional || (contact.linked_profile.social && contact.linked_profile.social.length > 0) || contact.linked_profile.appearance) && (
          <SectionCard title="Their Profile">
            {contact.linked_profile.nickname && (
              <InfoRow label="Nickname" value={`"${contact.linked_profile.nickname}"`} />
            )}
            {contact.linked_profile.pronouns && (
              <InfoRow label="Pronouns" value={contact.linked_profile.pronouns} />
            )}
            {contact.linked_profile.bio && (
              <Text style={styles.linkedBio}>{contact.linked_profile.bio}</Text>
            )}
            {contact.linked_profile.professional && (
              <>
                {contact.linked_profile.professional.job_title && (
                  <InfoRow label="Title" value={contact.linked_profile.professional.job_title} />
                )}
                {contact.linked_profile.professional.company && (
                  <InfoRow label="Company" value={contact.linked_profile.professional.company} />
                )}
                {contact.linked_profile.professional.school && (
                  <InfoRow label="School" value={contact.linked_profile.professional.school} />
                )}
                {contact.linked_profile.professional.major && (
                  <InfoRow label="Major" value={contact.linked_profile.professional.major} />
                )}
              </>
            )}
            {contact.linked_profile.appearance && (
              <View style={styles.tagRow}>
                {contact.linked_profile.appearance.height_range && (
                  <Tag label={contact.linked_profile.appearance.height_range} variant="default" />
                )}
                {contact.linked_profile.appearance.hair_color && (
                  <Tag label={`${contact.linked_profile.appearance.hair_color} hair`} variant="default" />
                )}
                {contact.linked_profile.appearance.glasses && <Tag label="Glasses" variant="default" />}
                {contact.linked_profile.appearance.distinguishing_features?.map((f, i) => (
                  <Tag key={i} label={f} variant="default" />
                ))}
              </View>
            )}
            {contact.linked_profile.social && contact.linked_profile.social.length > 0 && (
              <>
                {contact.linked_profile.social.map((s, i) => (
                  <View key={i} style={styles.socialLinkRow}>
                    <View style={styles.socialLinkIcon}>
                      <SocialIcon platform={s.platform} size={18} color={colors.primary} />
                    </View>
                    <View style={styles.socialLinkText}>
                      <Text style={styles.socialLinkPlatform}>{getSocialLabel(s.platform)}</Text>
                      <Text style={styles.socialLinkHandle} numberOfLines={1}>{s.handle || s.url}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </SectionCard>
        )}

        {/* Context (How Met) */}
        {contact.context && (
          <SectionCard title="How We Met">
            {contact.context.event_name && (
              <InfoRow label="Event" value={contact.context.event_name} />
            )}
            {contact.context.how_met && (
              <InfoRow label="How" value={contact.context.how_met} />
            )}
            {contact.context.met_date && (
              <InfoRow label="Date" value={formatDate(contact.context.met_date)} />
            )}
            {contact.context.location && (
              <InfoRow label="Location" value={contact.context.location} />
            )}
            {contact.context.mutual_connections?.length > 0 && (
              <InfoRow
                label="Mutual"
                value={contact.context.mutual_connections.join(', ')}
              />
            )}
          </SectionCard>
        )}

        {/* Event History */}
        {eventHistory.length > 0 && (
          <SectionCard title="Event History">
            {eventHistory.map((event) => (
              <View key={event.id} style={styles.eventCard}>
                <View style={styles.eventCardHeader}>
                  <View style={styles.eventMetBadge}>
                    <Ionicons name="location" size={12} color={colors.primary} />
                    <Text style={styles.eventMetBadgeText}>Met at {event.name}</Text>
                  </View>
                </View>
                <View style={styles.eventCardBody}>
                  <InfoRow label="Event" value={event.name} />
                  {event.event_date && (
                    <InfoRow label="Date" value={formatDate(event.event_date)} />
                  )}
                  {event.location && (
                    <InfoRow label="Location" value={event.location} />
                  )}
                </View>
              </View>
            ))}
          </SectionCard>
        )}

        {/* Social Links */}
        {contact.social && contact.social.length > 0 && (
          <SectionCard title="Social">
            {contact.social.map((s, i) => (
              <View key={i} style={styles.socialLinkRow}>
                <View style={styles.socialLinkIcon}>
                  <SocialIcon platform={s.platform} size={18} color={colors.primary} />
                </View>
                <View style={styles.socialLinkText}>
                  <Text style={styles.socialLinkPlatform}>{getSocialLabel(s.platform)}</Text>
                  <Text style={styles.socialLinkHandle} numberOfLines={1}>{s.handle || s.url}</Text>
                </View>
              </View>
            ))}
          </SectionCard>
        )}

        {/* Appearance Tags */}
        {contact.appearance && (
          <SectionCard title="Appearance">
            <View style={styles.tagRow}>
              {contact.appearance.height_range && (
                <Tag label={contact.appearance.height_range} variant="default" />
              )}
              {contact.appearance.hair_color && (
                <Tag label={`${contact.appearance.hair_color} hair`} variant="default" />
              )}
              {contact.appearance.glasses && <Tag label="Glasses" variant="default" />}
              {contact.appearance.distinguishing_features?.map((f, i) => (
                <Tag key={i} label={f} variant="default" />
              ))}
            </View>
          </SectionCard>
        )}

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <SectionCard title="Tags">
            <View style={styles.tagRow}>
              {contact.tags.map((tag) => (
                <Tag key={tag} label={tag} variant="primary" />
              ))}
            </View>
          </SectionCard>
        )}

        {/* Notes */}
        {contact.notes && contact.notes.length > 0 && (
          <SectionCard title="Notes">
            {contact.notes.map((note, i) => (
              <View key={i} style={styles.noteCard}>
                <Text style={styles.noteContent}>{note.content}</Text>
                <View style={styles.noteMeta}>
                  <Text style={styles.noteSource}>
                    {note.source === 'ai_generated' ? 'AI Generated' : note.source}
                  </Text>
                  <Text style={styles.noteDate}>{formatDate(note.created_at)}</Text>
                </View>
              </View>
            ))}
          </SectionCard>
        )}

        {/* Groups */}
        <SectionCard title="Groups">
          {contactGroups.length > 0 ? (
            <View style={styles.groupsList}>
              {contactGroups.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.groupChip}
                  onPress={() => navigation.navigate('GroupDetail', { groupId: g.id })}
                >
                  <View style={[styles.groupChipIcon, { backgroundColor: (g.color || colors.primary) + '20' }]}>
                    <Ionicons name={g.icon || 'people'} size={14} color={g.color || colors.primary} />
                  </View>
                  <Text style={styles.groupChipText}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.addToGroupButton}
            onPress={() => setShowGroupModal(true)}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.addToGroupText}>
              {contactGroups.length > 0 ? 'Manage Groups' : 'Add to Group'}
            </Text>
          </TouchableOpacity>
        </SectionCard>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Share to Chat"
            onPress={() => setShowShareChat(true)}
            icon={<Ionicons name="chatbubble-outline" size={18} color={colors.textInverse} />}
            fullWidth
          />
          <Button
            title="Share Contact Card"
            onPress={() => navigation.navigate('ShareContact', { contactId })}
            icon={<Ionicons name="share-outline" size={18} color={colors.textInverse} />}
            variant="outline"
            fullWidth
          />
          <Button
            title="Edit Contact"
            onPress={() => navigation.navigate('EditContact', { contact })}
            variant="outline"
            fullWidth
          />
          <Button
            title="Delete Contact"
            onPress={handleDelete}
            variant="ghost"
            fullWidth
            textStyle={{ color: colors.error }}
            style={styles.deleteButton}
          />
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Add to Group Modal */}
      <AddToGroupModal
        visible={showGroupModal}
        onClose={(changed) => {
          setShowGroupModal(false);
          if (changed) fetchContactGroups();
        }}
        contactId={contactId}
        contactName={contact.full_name}
      />

      {/* Share to Chat Modal */}
      <ShareToChatModal
        visible={showShareChat}
        onClose={() => setShowShareChat(false)}
        messageType="contact_card"
        content={`Shared a contact: ${contact.full_name}`}
        metadata={{
          contact_id: contact.id,
          contact_name: contact.full_name,
          job_title: contact.professional?.job_title,
          company: contact.professional?.company,
          avatar_url: contact.avatar_url,
        }}
        preview={{
          title: contact.full_name,
          subtitle: [contact.professional?.job_title, contact.professional?.company].filter(Boolean).join(' at ') || undefined,
          imageUrl: contact.avatar_url,
        }}
      />
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

function formatDate(dateStr) {
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

const createSectionStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg, // pill shape
    padding: spacing.lg, // airy
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight, // subtle border
  },
  title: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    width: 80,
  },
  value: {
    ...typography.body, // Use slightly larger body text for info
    color: colors.textPrimary,
    flex: 1,
    fontWeight: '500',
  },
});

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
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerButton: {
    padding: spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  avatar: {
    width: 96, // larger avatar
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md, // Add pop
  },
  avatarText: {
    color: colors.textInverse,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 2,
  },
  name: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  nickname: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  pronouns: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: 2,
  },
  sourceBadge: {
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  sourceText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98115',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
    gap: 4,
  },
  verifiedBadgeText: {
    ...typography.caption,
    color: '#10B981',
    fontWeight: '600',
  },
  suggestionBanner: {
    backgroundColor: colors.primaryBg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  suggestionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  suggestionText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  suggestionButtonConfirm: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  suggestionButtonConfirmText: {
    ...typography.bodySmall,
    color: colors.textInverse,
    fontWeight: '600',
  },
  suggestionButtonDismiss: {
    backgroundColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  suggestionButtonDismissText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  linkedBio: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  socialLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  socialLinkIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialLinkText: {
    flex: 1,
  },
  socialLinkPlatform: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  socialLinkHandle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  noteCard: {
    backgroundColor: colors.primaryBg, // use a softer, theme-aligned background
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  noteContent: {
    ...typography.body, // more readable note content
    color: colors.textPrimary,
    lineHeight: 22,
  },
  noteMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  noteSource: {
    ...typography.caption,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },
  noteDate: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  actions: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  deleteButton: {
    marginTop: spacing.xs,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
  groupsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  groupChipIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupChipText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  addToGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  addToGroupText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  eventCard: {
    backgroundColor: colors.primaryBg,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  eventCardHeader: {
    marginBottom: spacing.sm,
  },
  eventMetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.primary}15`,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
    gap: 4,
  },
  eventMetBadgeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  eventCardBody: {},
});

export default ContactDetailScreen;

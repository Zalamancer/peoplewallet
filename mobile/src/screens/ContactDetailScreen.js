import React, { useState, useEffect } from 'react';
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
import { colors, spacing, typography, borderRadius, shadows } from '../theme/colors';
import { contactsAPI } from '../services/api';
import Tag from '../components/Tag';
import Button from '../components/Button';
import { Ionicons } from '@expo/vector-icons';

const ContactDetailScreen = ({ route, navigation }) => {
  const { contactId } = route.params;
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContact();
  }, [contactId]);

  const fetchContact = async () => {
    try {
      setLoading(true);
      const response = await contactsAPI.get(contactId);
      setContact(response.data);
    } catch (error) {
      console.error('Failed to fetch contact:', error);
      Alert.alert('Error', 'Failed to load contact');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

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
      console.error('Failed to toggle favorite:', error);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!contact) return null;

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
        </View>

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

        {/* Social Links */}
        {contact.social && contact.social.length > 0 && (
          <SectionCard title="Social">
            {contact.social.map((s, i) => (
              <InfoRow
                key={i}
                label={s.platform}
                value={s.handle || s.url}
              />
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

        {/* Actions */}
        <View style={styles.actions}>
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
    </SafeAreaView>
  );
};

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

const sectionStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
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

const styles = StyleSheet.create({
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
    color: colors.white,
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
});

export default ContactDetailScreen;

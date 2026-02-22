import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { coAttendeesAPI } from '../services/api';

const AVATAR_COLORS = [
  '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  const index =
    name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const CoAttendeeBrowserScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { eventId, eventName } = route.params;
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [savingIds, setSavingIds] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());
  const [toastMessage, setToastMessage] = useState(null);
  const [error, setError] = useState(null);

  const fetchAttendees = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const response = await coAttendeesAPI.list(eventId);
        const data = response.data.attendees || response.data || [];

        setAttendees(data);

        // Track already-saved attendees
        const alreadySaved = new Set(
          data.filter((a) => a.is_saved).map((a) => a.user_id || a.id)
        );
        setSavedIds(alreadySaved);
      } catch (err) {
        console.warn('Failed to fetch co-attendees:', err?.message);
        setError('Could not load attendees. Please try again.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [eventId]
  );

  useEffect(() => {
    fetchAttendees();
  }, [fetchAttendees]);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleSave = async (attendee) => {
    const attendeeId = attendee.user_id || attendee.id;
    if (savedIds.has(attendeeId) || savingIds.has(attendeeId)) return;

    setSavingIds((prev) => new Set([...prev, attendeeId]));

    try {
      await coAttendeesAPI.save({
        target_user_id: attendeeId,
        event_id: eventId,
      });

      setSavedIds((prev) => new Set([...prev, attendeeId]));
      showToast(`${attendee.full_name} saved to contacts`);
    } catch (err) {
      console.warn('Failed to save co-attendee:', err?.message);
      showToast('Failed to save. Please try again.');
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(attendeeId);
        return next;
      });
    }
  };

  const handleSaveWithNotes = async (attendee) => {
    const attendeeId = attendee.user_id || attendee.id;
    if (savedIds.has(attendeeId)) {
      // Already saved, just navigate to detail
      navigation.navigate('ContactDetail', { contactId: attendeeId });
      return;
    }

    setSavingIds((prev) => new Set([...prev, attendeeId]));

    try {
      const response = await coAttendeesAPI.save({
        target_user_id: attendeeId,
        event_id: eventId,
      });

      setSavedIds((prev) => new Set([...prev, attendeeId]));

      const contactId = response.data?.contact_id || attendeeId;
      navigation.navigate('ContactDetail', { contactId });
    } catch (err) {
      console.warn('Failed to save co-attendee:', err?.message);
      showToast('Failed to save. Please try again.');
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(attendeeId);
        return next;
      });
    }
  };

  // Filter attendees by search query
  const filteredAttendees = attendees.filter((attendee) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = (attendee.full_name || '').toLowerCase();
    const school = (attendee.school || '').toLowerCase();
    const major = (attendee.major || '').toLowerCase();
    return name.includes(query) || school.includes(query) || major.includes(query);
  });

  const renderAttendeeCard = ({ item }) => {
    const attendeeId = item.user_id || item.id;
    const isSaved = savedIds.has(attendeeId);
    const isSaving = savingIds.has(attendeeId);

    const subtitle = [item.school, item.major, item.year]
      .filter(Boolean)
      .join(' - ');

    return (
      <View style={styles.attendeeCard}>
        <View style={styles.attendeeRow}>
          {/* Avatar */}
          <View
            style={[
              styles.avatar,
              { backgroundColor: getAvatarColor(item.full_name) },
            ]}
          >
            <Text style={styles.initials}>{getInitials(item.full_name)}</Text>
          </View>

          {/* Info */}
          <View style={styles.attendeeInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.attendeeName} numberOfLines={1}>
                {item.full_name}
              </Text>
              {isSaved && (
                <View style={styles.savedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={styles.savedBadgeText}>Saved</Text>
                </View>
              )}
            </View>
            {subtitle ? (
              <Text style={styles.attendeeSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Action buttons */}
        {!isSaved && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => handleSave(item)}
              activeOpacity={0.7}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <>
                  <Ionicons name="person-add" size={16} color={colors.textInverse} />
                  <Text style={styles.saveButtonText}>Save</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveNotesButton}
              onPress={() => handleSaveWithNotes(item)}
              activeOpacity={0.7}
              disabled={isSaving}
            >
              <Ionicons name="create-outline" size={16} color={colors.primary} />
              <Text style={styles.saveNotesButtonText}>Save + Notes</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or school..."
          placeholderTextColor={colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: spacing.xs }}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Count */}
      {!loading && (
        <Text style={styles.count}>
          {filteredAttendees.length} attendee{filteredAttendees.length !== 1 ? 's' : ''}
          {savedIds.size > 0 ? ` - ${savedIds.size} saved` : ''}
        </Text>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;

    const isFiltered = searchQuery.trim().length > 0;

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons
            name={isFiltered ? 'search-outline' : 'people-outline'}
            size={48}
            color={colors.textTertiary}
          />
        </View>
        <Text style={styles.emptyTitle}>
          {isFiltered ? 'No matching attendees' : 'No other check-ins yet'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {isFiltered
            ? 'Try a different search term.'
            : 'All attendees have set profiles to private, or no one else has checked in yet.'}
        </Text>
      </View>
    );
  };

  const renderError = () => (
    <View style={styles.errorContainer}>
      <Ionicons name="cloud-offline-outline" size={48} color={colors.textTertiary} />
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={() => fetchAttendees()}
        activeOpacity={0.8}
      >
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {eventName || 'Event Attendees'}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {error ? (
        renderError()
      ) : (
        <FlatList
          data={filteredAttendees}
          keyExtractor={(item) => (item.user_id || item.id).toString()}
          renderItem={renderAttendeeCard}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchAttendees(true)}
              tintColor={colors.primary}
            />
          }
          ListFooterComponent={
            loading ? (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading attendees...</Text>
              </View>
            ) : null
          }
          contentContainerStyle={
            filteredAttendees.length === 0 && !loading
              ? styles.emptyListContent
              : styles.listContent
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Toast */}
      {toastMessage && (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={18} color={colors.textInverse} style={{ marginRight: spacing.sm }} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
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
  },
  backButton: {
    padding: spacing.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  emptyListContent: {
    flex: 1,
  },

  // List header
  listHeader: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 4,
    ...shadows.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  count: {
    ...typography.caption,
    color: colors.textTertiary,
  },

  // Attendee card
  attendeeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.sm,
  },
  initials: {
    color: colors.textInverse,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  attendeeInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  attendeeName: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  attendeeSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
    gap: 4,
  },
  savedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.success,
  },

  // Action buttons
  actionButtons: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    flex: 1,
  },
  saveButtonText: {
    ...typography.button,
    fontSize: 14,
    color: colors.textInverse,
  },
  saveNotesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    flex: 1,
  },
  saveNotesButtonText: {
    ...typography.button,
    fontSize: 14,
    color: colors.primary,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.tagBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 24,
  },

  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },

  // Loading
  loadingFooter: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },

  // Toast
  toast: {
    position: 'absolute',
    bottom: spacing.xxl,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    ...shadows.lg,
  },
  toastText: {
    ...typography.body,
    color: colors.textInverse,
    flex: 1,
  },
});

export default CoAttendeeBrowserScreen;

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { eventsAPI } from '../services/api';
import { formatEventDate } from '../services/calendar';
import ContactCard from '../components/ContactCard';

const EventPrepScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { eventTitle, eventLocation, eventDate, isAllDay } = route.params;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMatchingContacts();
  }, [eventTitle, eventLocation]);

  const fetchMatchingContacts = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await eventsAPI.matchContacts({
        event_name: eventTitle,
        location: eventLocation,
      });

      setContacts(response.data.relevantContacts || []);
    } catch (err) {
      console.warn('Failed to match contacts for event:', err?.message);
      setError('Could not load matching contacts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.eventHeader}>
      {/* Event Info Card */}
      <View style={styles.eventCard}>
        <View style={styles.eventIconContainer}>
          <Ionicons name="calendar" size={28} color={colors.primary} />
        </View>
        <Text style={styles.eventTitle}>{eventTitle}</Text>
        <Text style={styles.eventDate}>
          {formatEventDate(eventDate, isAllDay)}
        </Text>
        {eventLocation && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={16} color={colors.textTertiary} />
            <Text style={styles.eventLocation}>{eventLocation}</Text>
          </View>
        )}
      </View>

      {/* Contacts Section Header */}
      {contacts.length > 0 && (
        <View style={styles.contactsSectionHeader}>
          <View style={styles.matchBadge}>
            <Ionicons name="people" size={16} color={colors.primary} />
            <Text style={styles.matchBadgeText}>
              {contacts.length} relevant contact{contacts.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <Text style={styles.contactsSectionSubtitle}>
            People you've met at similar events or locations
          </Text>
        </View>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="search-outline" size={48} color={colors.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>No matching contacts</Text>
        <Text style={styles.emptySubtitle}>
          No saved contacts match this event yet. After meeting people at "{eventTitle}",
          save them with this event name and they'll show up here next time.
        </Text>
        <TouchableOpacity
          style={styles.addContactButton}
          onPress={() => navigation.navigate('CaptureChooser')}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
          <Text style={styles.addContactButtonText}>Add a Contact</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderError = () => (
    <View style={styles.errorContainer}>
      <Ionicons name="cloud-offline-outline" size={48} color={colors.textTertiary} />
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={fetchMatchingContacts}
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
        <Text style={styles.headerTitle}>Event Prep</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error ? (
        renderError()
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <ContactCard
              contact={{
                ...item,
                job_title: item.job_title,
                company: item.company,
                school: item.school,
                event_name: item.met_at_event,
              }}
              onPress={() => navigation.navigate('ContactDetail', { contactId: item.id })}
            />
          )}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={
            loading ? (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Finding relevant contacts...</Text>
              </View>
            ) : null
          }
          contentContainerStyle={
            contacts.length === 0 && !loading ? styles.emptyListContent : styles.listContent
          }
          showsVerticalScrollIndicator={false}
        />
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

  // Event info header
  eventHeader: {
    paddingBottom: spacing.sm,
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  eventIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  eventTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  eventDate: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  eventLocation: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },

  // Contacts section
  contactsSectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  matchBadgeText: {
    ...typography.h3,
    color: colors.primary,
  },
  contactsSectionSubtitle: {
    ...typography.bodySmall,
    color: colors.textTertiary,
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
    marginBottom: spacing.lg,
  },
  addContactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  addContactButtonText: {
    ...typography.button,
    color: colors.primary,
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
});

export default EventPrepScreen;

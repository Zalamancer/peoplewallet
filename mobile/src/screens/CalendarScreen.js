import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import {
  requestCalendarPermissions,
  getCalendarPermissionStatus,
  getUpcomingEvents,
  isNetworkingEvent,
  formatEventDate,
  getDaysUntilEvent,
} from '../services/calendar';
import PreEventPrepCard from '../components/PreEventPrepCard';
import { eventsAPI } from '../services/api';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All Events' },
  { key: 'networking', label: 'Networking' },
];

const CalendarScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [prepEvent, setPrepEvent] = useState(null);
  const [prepContacts, setPrepContacts] = useState([]);

  const fetchEvents = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const permissionStatus = await getCalendarPermissionStatus();
      const permitted = permissionStatus === 'granted';
      setHasPermission(permitted);

      if (!permitted) {
        setEvents([]);
        return;
      }

      const calendarEvents = await getUpcomingEvents(60);
      setEvents(calendarEvents);

      // Find the next upcoming networking event within 24 hours for prep card
      const now = new Date();
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const upcomingNetworking = calendarEvents.find((event) => {
        const eventDate = new Date(event.startDate);
        return eventDate >= now && eventDate <= in24Hours && isNetworkingEvent(event);
      });

      if (upcomingNetworking) {
        try {
          const response = await eventsAPI.matchContacts({
            event_name: upcomingNetworking.title,
            location: upcomingNetworking.location,
          });
          const matched = response.data.relevantContacts || [];
          if (matched.length > 0) {
            setPrepEvent(upcomingNetworking);
            setPrepContacts(matched);
          } else {
            setPrepEvent(null);
            setPrepContacts([]);
          }
        } catch (err) {
          console.warn('Failed to fetch prep contacts:', err?.message);
          setPrepEvent(null);
          setPrepContacts([]);
        }
      } else {
        setPrepEvent(null);
        setPrepContacts([]);
      }
    } catch (error) {
      console.warn('Failed to fetch calendar events:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Refresh when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchEvents();
    });
    return unsubscribe;
  }, [navigation, fetchEvents]);

  const handleRequestPermission = async () => {
    const granted = await requestCalendarPermissions();
    setHasPermission(granted);
    if (granted) {
      fetchEvents();
    } else {
      Alert.alert(
        'Calendar Access Required',
        'Please enable calendar access in your device settings to use this feature.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
    }
  };

  const filteredEvents = activeFilter === 'networking'
    ? events.filter(isNetworkingEvent)
    : events;

  // Group events by relative date
  const groupedEvents = groupEventsByDate(filteredEvents);

  const handleEventPress = (event) => {
    navigation.navigate('EventPrep', {
      eventTitle: event.title,
      eventLocation: event.location,
      eventDate: event.startDate,
      isAllDay: event.isAllDay,
    });
  };

  const renderPermissionRequest = () => (
    <View style={styles.permissionContainer}>
      <View style={styles.permissionCard}>
        <View style={styles.permissionIconContainer}>
          <Ionicons name="calendar-outline" size={64} color={colors.primary} />
        </View>
        <Text style={styles.permissionTitle}>Calendar Integration</Text>
        <Text style={styles.permissionDescription}>
          Connect your calendar to see upcoming events and get reminded of contacts
          you've met at similar events in the past.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={handleRequestPermission}
          activeOpacity={0.8}
        >
          <Ionicons name="calendar" size={20} color={colors.textInverse} style={{ marginRight: spacing.sm }} />
          <Text style={styles.permissionButtonText}>Connect Calendar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEventCard = ({ item: event }) => {
    const isNetworking = isNetworkingEvent(event);

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => handleEventPress(event)}
        activeOpacity={0.7}
      >
        <View style={styles.eventRow}>
          <View style={[styles.eventIcon, isNetworking && styles.eventIconNetworking]}>
            <Ionicons
              name={isNetworking ? 'people' : 'calendar'}
              size={20}
              color={isNetworking ? colors.primary : colors.textTertiary}
            />
          </View>
          <View style={styles.eventInfo}>
            <Text style={styles.eventTitle} numberOfLines={2}>
              {event.title}
            </Text>
            <Text style={styles.eventDate}>
              {formatEventDate(event.startDate, event.isAllDay)}
            </Text>
            {event.location && (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color={colors.textTertiary} />
                <Text style={styles.eventLocation} numberOfLines={1}>
                  {event.location}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.eventRight}>
            {isNetworking && (
              <View style={styles.networkingBadge}>
                <Text style={styles.networkingBadgeText}>Networking</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = (title) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  const renderGroupedList = () => {
    const sections = [];
    for (const [label, sectionEvents] of Object.entries(groupedEvents)) {
      sections.push({ type: 'header', key: `header-${label}`, label });
      sectionEvents.forEach((event, idx) => {
        sections.push({ type: 'event', key: `${label}-${event.id}-${idx}`, event });
      });
    }

    return (
      <FlatList
        data={sections}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return renderSectionHeader(item.label);
          }
          return renderEventCard({ item: item.event });
        }}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={64} color={colors.textTertiary} style={{ marginBottom: spacing.md }} />
              <Text style={styles.emptyTitle}>
                {activeFilter === 'networking' ? 'No networking events found' : 'No upcoming events'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeFilter === 'networking'
                  ? 'Try switching to "All Events" or add networking events to your calendar.'
                  : 'Your upcoming calendar events will appear here.'}
              </Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchEvents(true)}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={filteredEvents.length === 0 && !loading ? styles.emptyContainer : styles.listContent}
      />
    );
  };

  const handleViewAllPrep = (event) => {
    navigation.navigate('EventPrep', {
      eventTitle: event.title,
      eventLocation: event.location,
      eventDate: event.startDate,
      isAllDay: event.isAllDay,
    });
  };

  const renderHeader = () => (
    <View style={styles.header}>
      {prepEvent && prepContacts.length > 0 && (
        <PreEventPrepCard
          event={prepEvent}
          knownAttendees={prepContacts}
          onViewAll={handleViewAllPrep}
        />
      )}
      <View style={styles.filters}>
        {FILTER_OPTIONS.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterChip,
              activeFilter === filter.key && styles.filterChipActive,
            ]}
            onPress={() => setActiveFilter(filter.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                activeFilter === filter.key && styles.filterChipTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.count}>
        {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} in the next 60 days
      </Text>
    </View>
  );

  if (loading && hasPermission === null) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Calendar</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('NewEvent')}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {hasPermission === false ? (
        renderPermissionRequest()
      ) : loading ? (
        <View style={styles.loadingInner}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        renderGroupedList()
      )}
    </SafeAreaView>
  );
};

/**
 * Group events by relative date label: Today, Tomorrow, This Week, or by month name.
 * Events are expected to already be sorted by start date ascending.
 */
function groupEventsByDate(events) {
  const groups = {};
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));

  for (const event of events) {
    const date = new Date(event.startDate);
    let label;

    if (date.toDateString() === now.toDateString()) {
      label = 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      label = 'Tomorrow';
    } else if (date <= endOfWeek) {
      label = 'This Week';
    } else {
      label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(event);
  }

  return groups;
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
  loadingInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  addButton: {
    padding: spacing.xs,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    backgroundColor: colors.tagBg,
    borderWidth: 1,
    borderColor: colors.tagBorder,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.tagText,
  },
  filterChipTextActive: {
    color: colors.textInverse,
  },
  count: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  sectionHeader: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.tagBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  eventIconNetworking: {
    backgroundColor: colors.primaryBg,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  eventDate: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  eventLocation: {
    ...typography.caption,
    color: colors.textTertiary,
    flex: 1,
  },
  eventRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
    gap: spacing.xs,
  },
  networkingBadge: {
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  networkingBadgeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    fontSize: 11,
  },

  // Permission request
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  permissionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  permissionIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  permissionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  permissionDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  permissionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  permissionButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default CalendarScreen;

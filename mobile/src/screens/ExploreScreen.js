import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { eventsAPI, suggestionsAPI } from '../services/api';
import TabHeaderBar from '../components/TabHeaderBar';
import FilterRow from '../components/FilterRow';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'social', label: 'Social' },
  { key: 'religious', label: 'Religious' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'workshop', label: 'Workshop' },
  { key: 'info_session', label: 'Info Session' },
  { key: 'career_fair', label: 'Career Fair' },
  { key: 'guest_speaker', label: 'Speaker' },
  { key: 'cultural', label: 'Cultural' },
  { key: 'sports', label: 'Sports' },
  { key: 'fundraiser', label: 'Fundraiser' },
  { key: 'competition', label: 'Competition' },
  { key: 'other', label: 'Other' },
];

const ADVANCED_FILTERS = [
  {
    key: 'date',
    label: 'Date',
    icon: 'calendar-outline',
    options: [
      { key: 'all', label: 'All Dates' },
      { key: 'today', label: 'Today' },
      { key: 'week', label: 'This Week' },
      { key: 'month', label: 'This Month' },
    ],
  },
  {
    key: 'sort',
    label: 'Sort By',
    icon: 'swap-vertical-outline',
    options: [
      { key: 'upcoming', label: 'Upcoming' },
      { key: 'popular', label: 'Popular' },
      { key: 'newest', label: 'Newest' },
    ],
  },
];

const ExploreScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [events, setEvents] = useState([]);
  const [coAttendees, setCoAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeAdvanced, setActiveAdvanced] = useState({ date: 'all', sort: 'upcoming' });
  const debounceRef = useRef(null);

  const handleAdvancedChange = (groupKey, optionKey) => {
    setActiveAdvanced((prev) => ({ ...prev, [groupKey]: optionKey }));
  };

  const fetchEvents = useCallback(async (isRefresh = false, search = '') => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const params = {};
      if (search.trim()) params.search = search.trim();
      if (activeCategory !== 'all') params.event_type = activeCategory;
      if (activeAdvanced.date !== 'all') params.date_filter = activeAdvanced.date;
      if (activeAdvanced.sort !== 'upcoming') params.sort = activeAdvanced.sort;

      const [eventsRes, coAttendeesRes] = await Promise.allSettled([
        eventsAPI.list(params),
        suggestionsAPI.getCoAttendees(),
      ]);

      if (eventsRes.status === 'fulfilled') {
        setEvents(eventsRes.value.data.events || eventsRes.value.data || []);
      }
      if (coAttendeesRes.status === 'fulfilled') {
        const coData = coAttendeesRes.value.data;
        setCoAttendees(coData.suggestions || coData.coAttendees || (Array.isArray(coData) ? coData : []));
      }
    } catch (error) {
      console.warn('Failed to fetch events:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory, activeAdvanced]);

  useEffect(() => {
    fetchEvents(false, searchQuery);
  }, [fetchEvents]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchEvents(false, searchQuery);
    });
    return unsubscribe;
  }, [navigation, fetchEvents, searchQuery]);

  // Debounced search
  const handleSearchChange = (text) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchEvents(false, text);
    }, 300);
  };

  // Re-fetch when category or date filter changes
  useEffect(() => {
    fetchEvents(false, searchQuery);
  }, [activeCategory, activeAdvanced]);

  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getEventTypeColor = (eventType) => {
    const colorMap = {
      social: '#EC4899',
      religious: '#8B5CF6',
      meeting: '#6366F1',
      workshop: '#10B981',
      info_session: '#06B6D4',
      career_fair: '#3B82F6',
      guest_speaker: '#0EA5E9',
      cultural: '#F59E0B',
      sports: '#EF4444',
      fundraiser: '#F97316',
      competition: '#DC2626',
      performance: '#A855F7',
      study_session: '#14B8A6',
      other: colors.textTertiary,
    };
    return colorMap[eventType] || colors.textTertiary;
  };

  const getEventTypeLabel = (eventType) => {
    const labelMap = {
      social: 'Social',
      religious: 'Religious',
      meeting: 'Meeting',
      workshop: 'Workshop',
      info_session: 'Info Session',
      career_fair: 'Career Fair',
      guest_speaker: 'Speaker',
      cultural: 'Cultural',
      sports: 'Sports',
      fundraiser: 'Fundraiser',
      competition: 'Competition',
      performance: 'Performance',
      study_session: 'Study Session',
      other: 'Other',
    };
    return labelMap[eventType] || eventType || 'Event';
  };

  const renderCoAttendeesSection = () => {
    if (!Array.isArray(coAttendees) || coAttendees.length === 0) return null;

    return (
      <View style={styles.coAttendeesSection}>
        <Text style={styles.sectionLabel}>PEOPLE FROM YOUR EVENTS</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.coAttendeesScroll}
        >
          {coAttendees.map((person, index) => (
            <TouchableOpacity
              key={person.id || index}
              style={styles.coAttendeeCard}
              activeOpacity={0.7}
              onPress={() => {
                if (person.contactId) {
                  navigation.navigate('ContactDetail', { contactId: person.contactId });
                }
              }}
            >
              <View style={styles.coAttendeeAvatar}>
                <Text style={styles.coAttendeeInitial}>
                  {(person.name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.coAttendeeName} numberOfLines={1}>
                {person.name || 'Unknown'}
              </Text>
              {person.event_name && (
                <Text style={styles.coAttendeeEvent} numberOfLines={1}>
                  {person.event_name}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {renderCoAttendeesSection()}
      <FilterRow
        filters={CATEGORIES}
        activeFilter={activeCategory}
        onFilterChange={setActiveCategory}
        advancedFilters={ADVANCED_FILTERS}
        activeAdvanced={activeAdvanced}
        onAdvancedChange={handleAdvancedChange}
        style={{ marginBottom: spacing.sm }}
      />
    </View>
  );

  const renderEventCard = ({ item }) => {
    const typeColor = getEventTypeColor(item.event_type);

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.eventCardHeader}>
          <View style={[styles.eventTypeBadge, { backgroundColor: typeColor + '15', borderColor: typeColor + '30' }]}>
            <Text style={[styles.eventTypeBadgeText, { color: typeColor }]}>
              {getEventTypeLabel(item.event_type)}
            </Text>
          </View>
          {item.rsvp_count != null && (
            <View style={styles.rsvpCountBadge}>
              <Ionicons name="people-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.rsvpCountText}>{item.rsvp_count}</Text>
            </View>
          )}
        </View>

        <Text style={styles.eventName} numberOfLines={2}>{item.event_name || item.name || item.title}</Text>

        {item.club_name && (
          <Text style={styles.eventClubName} numberOfLines={1}>{item.club_name}</Text>
        )}

        <View style={styles.eventMeta}>
          <View style={styles.eventMetaRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.eventMetaText}>
              {formatDateTime(item.event_date || item.date || item.start_date) || 'Date TBD'}
            </Text>
          </View>
          {item.location && (
            <View style={styles.eventMetaRow}>
              <Ionicons name="location-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.eventMetaText} numberOfLines={1}>{item.location}</Text>
            </View>
          )}
        </View>

        <View style={styles.eventCardFooter}>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.empty}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="calendar-outline" size={64} color={colors.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>No events found</Text>
        <Text style={styles.emptySubtitle}>
          {searchQuery
            ? `No events match "${searchQuery}". Try a different search.`
            : 'There are no upcoming events right now. Check back later or create one.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TabHeaderBar
        title="Explore"
        navigation={navigation}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onSearchClear={() => handleSearchChange('')}
        searchPlaceholder="Search events..."
        rightContent={
          <TouchableOpacity
            onPress={() => navigation.navigate('EventMap', { activeCategory })}
            style={{ padding: spacing.xs }}
            activeOpacity={0.7}
          >
            <Ionicons name="map-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <FlatList
        data={events}
        keyExtractor={(item) => (item.id || Math.random()).toString()}
        renderItem={renderEventCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchEvents(true, searchQuery)}
            tintColor={colors.primary}
          />
        }
        ListFooterComponent={
          loading ? (
            <ActivityIndicator style={styles.loadingFooter} size="large" color={colors.primary} />
          ) : null
        }
        contentContainerStyle={
          events.length === 0 && !loading ? styles.emptyListContainer : styles.listContent
        }
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('NewEvent')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listHeader: {
    paddingBottom: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xxl + 60,
  },
  emptyListContainer: {
    flexGrow: 1,
  },

  // Co-attendees section
  coAttendeesSection: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  coAttendeesScroll: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  coAttendeeCard: {
    alignItems: 'center',
    width: 80,
  },
  coAttendeeAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    borderWidth: 2,
    borderColor: colors.primaryLight,
  },
  coAttendeeInitial: {
    ...typography.h3,
    color: colors.primary,
  },
  coAttendeeName: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  coAttendeeEvent: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // Event card
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
  eventCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  eventTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  eventTypeBadgeText: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 11,
  },
  rsvpCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rsvpCountText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  eventName: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  eventClubName: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  eventMeta: {
    gap: 4,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventMetaText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  eventCardFooter: {
    alignItems: 'flex-end',
    marginTop: spacing.sm,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.tagBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
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

  // Loading
  loadingFooter: {
    paddingVertical: spacing.xl,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
});

export default ExploreScreen;

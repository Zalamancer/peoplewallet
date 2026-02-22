import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { contactsAPI, eventsAPI, suggestionsAPI, coAttendeesAPI, clubsAPI } from '../services/api';
import ContactCard from '../components/ContactCard';
import PostEventCaptureCard from '../components/PostEventCaptureCard';
import PeopleYouMightKnow from '../components/PeopleYouMightKnow';
import TabHeaderBar from '../components/TabHeaderBar';
import FilterRow from '../components/FilterRow';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'ai', label: 'AI Created' },
  { key: 'recent', label: 'Recent' },
  { key: 'by_event', label: 'By Event' },
  { key: 'by_club', label: 'By Club' },
];

const CONTACT_ADVANCED_FILTERS = [
  {
    key: 'sort',
    label: 'Sort By',
    icon: 'swap-vertical-outline',
    options: [
      { key: 'newest', label: 'Newest' },
      { key: 'alphabetical', label: 'A-Z' },
      { key: 'last_contacted', label: 'Last Contacted' },
    ],
  },
  {
    key: 'added',
    label: 'Added',
    icon: 'time-outline',
    options: [
      { key: 'all', label: 'All Time' },
      { key: 'today', label: 'Today' },
      { key: 'week', label: 'This Week' },
      { key: 'month', label: 'This Month' },
    ],
  },
];

const ContactListScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [recentEvent, setRecentEvent] = useState(null);
  const [dismissedEvents, setDismissedEvents] = useState(new Set());
  const [suggestions, setSuggestions] = useState([]);

  // Event/Club filter state
  const [eventPickerVisible, setEventPickerVisible] = useState(false);
  const [clubPickerVisible, setClubPickerVisible] = useState(false);
  const [userEvents, setUserEvents] = useState([]);
  const [userClubs, setUserClubs] = useState([]);
  const [selectedEventName, setSelectedEventName] = useState(null);
  const [selectedClubId, setSelectedClubId] = useState(null);
  const [selectedClubName, setSelectedClubName] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [activeAdvanced, setActiveAdvanced] = useState({ sort: 'newest', added: 'all' });

  const handleAdvancedChange = (groupKey, optionKey) => {
    setActiveAdvanced((prev) => ({ ...prev, [groupKey]: optionKey }));
  };

  const DISMISSED_STORAGE_KEY = 'dismissed_post_event_prompts';

  const fetchRecentEvent = useCallback(async () => {
    try {
      // Load dismissed event IDs from storage
      const storedDismissed = await AsyncStorage.getItem(DISMISSED_STORAGE_KEY);
      const dismissedSet = storedDismissed ? new Set(JSON.parse(storedDismissed)) : new Set();
      setDismissedEvents(dismissedSet);

      // Fetch events and find one that ended within the last 2 hours
      const response = await eventsAPI.list({ upcoming_only: false });
      const events = response.data?.events || response.data || [];
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const recent = events.find((event) => {
        const eventDate = new Date(event.event_date);
        return eventDate <= now && eventDate >= twoHoursAgo && !dismissedSet.has(event.id);
      });

      setRecentEvent(recent || null);
    } catch (error) {
      console.warn('Failed to fetch recent events:', error?.message);
    }
  }, []);

  const handleDismissEvent = useCallback(async (eventId) => {
    const updatedSet = new Set(dismissedEvents);
    updatedSet.add(eventId);
    setDismissedEvents(updatedSet);
    setRecentEvent(null);

    try {
      await AsyncStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...updatedSet]));
    } catch (error) {
      console.warn('Failed to save dismissed events:', error?.message);
    }
  }, [dismissedEvents]);

  const fetchSuggestions = useCallback(async () => {
    try {
      const response = await suggestionsAPI.getCoAttendees();
      setSuggestions(response.data?.suggestions || response.data || []);
    } catch (error) {
      console.warn('Failed to fetch suggestions:', error?.message);
    }
  }, []);

  const handleSaveSuggestion = useCallback(async (suggestion) => {
    try {
      await coAttendeesAPI.save({
        target_user_id: suggestion.id,
        event_id: suggestion.events?.[0]?.id,
      });
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    } catch (error) {
      console.warn('Failed to save suggestion:', error?.message);
    }
  }, []);

  const handleDismissSuggestion = useCallback(async (suggestion) => {
    try {
      await suggestionsAPI.dismiss(suggestion.id);
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    } catch (error) {
      console.warn('Failed to dismiss suggestion:', error?.message);
    }
  }, []);

  const fetchUserEvents = useCallback(async () => {
    try {
      setLoadingEvents(true);
      const response = await eventsAPI.list({ upcoming_only: false });
      const events = response.data?.events || response.data || [];
      setUserEvents(events);
    } catch (error) {
      console.warn('Failed to fetch events for filter:', error?.message);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const fetchUserClubs = useCallback(async () => {
    try {
      setLoadingClubs(true);
      const response = await clubsAPI.list();
      const clubs = response.data?.clubs || response.data || [];
      setUserClubs(clubs);
    } catch (error) {
      console.warn('Failed to fetch clubs for filter:', error?.message);
    } finally {
      setLoadingClubs(false);
    }
  }, []);

  const handleFilterChange = useCallback((filterKey) => {
    setActiveFilter(filterKey);

    if (filterKey === 'by_event') {
      fetchUserEvents();
      setEventPickerVisible(true);
    } else if (filterKey === 'by_club') {
      fetchUserClubs();
      setClubPickerVisible(true);
    } else {
      // Clear event/club selections when switching to other filters
      setSelectedEventName(null);
      setSelectedClubId(null);
      setSelectedClubName(null);
    }
  }, [fetchUserEvents, fetchUserClubs]);

  const handleSelectEvent = useCallback((event) => {
    setSelectedEventName(event.name);
    setEventPickerVisible(false);
  }, []);

  const handleSelectClub = useCallback((club) => {
    setSelectedClubId(club.id);
    setSelectedClubName(club.name);
    setClubPickerVisible(false);
  }, []);

  const fetchContacts = useCallback(
    async (page = 1, isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else if (page === 1) setLoading(true);

        const sortMap = {
          newest: { sort: 'created_at', order: 'desc' },
          alphabetical: { sort: 'name', order: 'asc' },
          last_contacted: { sort: 'last_contacted_at', order: 'desc' },
        };
        const sortConfig = sortMap[activeAdvanced.sort] || sortMap.newest;

        const params = {
          page,
          limit: 20,
          sort: sortConfig.sort,
          order: sortConfig.order,
        };

        if (activeAdvanced.added !== 'all') {
          params.added_within = activeAdvanced.added;
        }

        if (searchQuery.trim()) {
          params.search = searchQuery.trim();
        }

        if (activeFilter === 'favorites') {
          params.is_favorite = 'true';
        } else if (activeFilter === 'ai') {
          params.source = 'dictation';
        } else if (activeFilter === 'recent') {
          params.sort = 'created_at';
          params.order = 'desc';
        } else if (activeFilter === 'by_event' && selectedEventName) {
          params.event_name = selectedEventName;
        } else if (activeFilter === 'by_club' && selectedClubId) {
          params.club_id = selectedClubId;
        }

        const response = await contactsAPI.list(params);
        const { contacts: data, pagination: pag } = response.data;

        if (page === 1) {
          setContacts(data);
        } else {
          setContacts((prev) => [...prev, ...data]);
        }
        setPagination(pag);
      } catch (error) {
        console.warn('Failed to fetch contacts:', error?.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchQuery, activeFilter, selectedEventName, selectedClubId, activeAdvanced]
  );

  useEffect(() => {
    fetchContacts(1);
    fetchRecentEvent();
    fetchSuggestions();
  }, [fetchContacts, fetchRecentEvent, fetchSuggestions]);

  // Refresh when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchContacts(1);
      fetchRecentEvent();
      fetchSuggestions();
    });
    return unsubscribe;
  }, [navigation, fetchContacts, fetchRecentEvent, fetchSuggestions]);

  const loadMore = () => {
    if (pagination.page < pagination.totalPages && !loading) {
      fetchContacts(pagination.page + 1);
    }
  };

  const filterOptions = FILTER_OPTIONS.map((filter) => {
    let label = filter.label;
    if (filter.key === 'by_event' && activeFilter === 'by_event' && selectedEventName) {
      label = selectedEventName.length > 16 ? selectedEventName.substring(0, 16) + '...' : selectedEventName;
    }
    if (filter.key === 'by_club' && activeFilter === 'by_club' && selectedClubName) {
      label = selectedClubName.length > 16 ? selectedClubName.substring(0, 16) + '...' : selectedClubName;
    }
    return { ...filter, label };
  });

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Post-event capture prompt */}
      {recentEvent && (
        <PostEventCaptureCard
          event={recentEvent}
          onDictate={(event) =>
            navigation.navigate('Dictation', { eventId: event.id, eventName: event.name })
          }
          onBrowseAttendees={(event) =>
            navigation.navigate('CoAttendeeBrowser', { eventId: event.id, eventName: event.name })
          }
          onDismiss={handleDismissEvent}
        />
      )}

      <FilterRow
        filters={filterOptions}
        activeFilter={activeFilter}
        onFilterChange={handleFilterChange}
        advancedFilters={CONTACT_ADVANCED_FILTERS}
        activeAdvanced={activeAdvanced}
        onAdvancedChange={handleAdvancedChange}
        style={{ marginBottom: spacing.sm }}
      />

      {/* People you might know suggestions */}
      {suggestions.length > 0 && (
        <PeopleYouMightKnow
          suggestions={suggestions}
          onSave={handleSaveSuggestion}
          onDismiss={handleDismissSuggestion}
        />
      )}

      <Text style={styles.count}>
        {pagination.total} contact{pagination.total !== 1 ? 's' : ''}
      </Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Ionicons name="people-outline" size={64} color={colors.textTertiary} style={{ marginBottom: spacing.md }} />
      <Text style={styles.emptyTitle}>No contacts yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to add your first contact,{'\n'}
        or use AI dictation to capture someone you just met.
      </Text>
    </View>
  );


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TabHeaderBar
        title="Contacts"
        navigation={navigation}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchClear={() => setSearchQuery('')}
        searchPlaceholder="Search contacts..."
      />

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ContactCard
            contact={item}
            onPress={() => navigation.navigate('ContactDetail', { contactId: item.id })}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!loading ? renderEmpty : null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchContacts(1, true)}
            tintColor={colors.primary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && contacts.length > 0 ? (
            <ActivityIndicator style={styles.footer} color={colors.primary} />
          ) : null
        }
        contentContainerStyle={contacts.length === 0 && !loading ? styles.emptyContainer : undefined}
      />

      {/* Floating Action Button */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('CaptureChooser')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={32} color={colors.textInverse} />
        </TouchableOpacity>
      </View>

      {/* Event Picker Modal */}
      <Modal
        visible={eventPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setEventPickerVisible(false);
          if (!selectedEventName) setActiveFilter('all');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Event</Text>
              <TouchableOpacity
                onPress={() => {
                  setEventPickerVisible(false);
                  if (!selectedEventName) setActiveFilter('all');
                }}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {loadingEvents ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.modalLoadingText}>Loading events...</Text>
              </View>
            ) : userEvents.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="calendar-outline" size={40} color={colors.textTertiary} />
                <Text style={styles.modalEmptyText}>No events found</Text>
              </View>
            ) : (
              <FlatList
                data={userEvents}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      selectedEventName === item.name && styles.modalItemSelected,
                    ]}
                    onPress={() => handleSelectEvent(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.modalItemIcon}>
                      <Ionicons
                        name="calendar"
                        size={20}
                        color={selectedEventName === item.name ? colors.white : colors.primary}
                      />
                    </View>
                    <View style={styles.modalItemInfo}>
                      <Text
                        style={[
                          styles.modalItemName,
                          selectedEventName === item.name && styles.modalItemNameSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {item.event_date && (
                        <Text
                          style={[
                            styles.modalItemDetail,
                            selectedEventName === item.name && styles.modalItemDetailSelected,
                          ]}
                        >
                          {new Date(item.event_date).toLocaleDateString()}
                          {item.location ? ` - ${item.location}` : ''}
                        </Text>
                      )}
                    </View>
                    {selectedEventName === item.name && (
                      <Ionicons name="checkmark" size={20} color={colors.textInverse} />
                    )}
                  </TouchableOpacity>
                )}
                style={styles.modalList}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Club Picker Modal */}
      <Modal
        visible={clubPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setClubPickerVisible(false);
          if (!selectedClubId) setActiveFilter('all');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Club</Text>
              <TouchableOpacity
                onPress={() => {
                  setClubPickerVisible(false);
                  if (!selectedClubId) setActiveFilter('all');
                }}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {loadingClubs ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.modalLoadingText}>Loading clubs...</Text>
              </View>
            ) : userClubs.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="people-outline" size={40} color={colors.textTertiary} />
                <Text style={styles.modalEmptyText}>No clubs found</Text>
              </View>
            ) : (
              <FlatList
                data={userClubs}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      selectedClubId === item.id && styles.modalItemSelected,
                    ]}
                    onPress={() => handleSelectClub(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.modalItemIcon}>
                      <Ionicons
                        name="people"
                        size={20}
                        color={selectedClubId === item.id ? colors.white : colors.primary}
                      />
                    </View>
                    <View style={styles.modalItemInfo}>
                      <Text
                        style={[
                          styles.modalItemName,
                          selectedClubId === item.id && styles.modalItemNameSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {item.category && (
                        <Text
                          style={[
                            styles.modalItemDetail,
                            selectedClubId === item.id && styles.modalItemDetailSelected,
                          ]}
                        >
                          {item.category}
                          {item.description ? ` - ${item.description.substring(0, 40)}...` : ''}
                        </Text>
                      )}
                    </View>
                    {selectedClubId === item.id && (
                      <Ionicons name="checkmark" size={20} color={colors.textInverse} />
                    )}
                  </TouchableOpacity>
                )}
                style={styles.modalList}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg, // slightly more breathing room
  },
  count: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
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
  footer: {
    paddingVertical: spacing.lg,
  },
  fabContainer: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    ...shadows.lg,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '70%',
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  modalList: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  modalItemSelected: {
    backgroundColor: colors.primary,
  },
  modalItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  modalItemInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  modalItemName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalItemNameSelected: {
    color: colors.textInverse,
  },
  modalItemDetail: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  modalItemDetailSelected: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  modalLoading: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  modalLoadingText: {
    ...typography.body,
    color: colors.textTertiary,
  },
  modalEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  modalEmptyText: {
    ...typography.body,
    color: colors.textTertiary,
  },
});

export default ContactListScreen;

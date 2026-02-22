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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { eventFeedAPI } from '../services/api';

const QUICK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'free_food', label: 'Free Food' },
  { key: 'free', label: 'Free' },
  { key: 'on_campus', label: 'On Campus' },
  { key: 'this_week', label: 'This Week' },
];

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'networking', label: 'Networking' },
  { key: 'career_fair', label: 'Career Fair' },
  { key: 'conference', label: 'Conference' },
  { key: 'meetup', label: 'Meetup' },
  { key: 'social', label: 'Social' },
  { key: 'sports', label: 'Sports' },
  { key: 'workshop', label: 'Workshop' },
  { key: 'info_session', label: 'Info Session' },
  { key: 'religious', label: 'Religious' },
  { key: 'arts', label: 'Arts' },
  { key: 'greek_life', label: 'Greek Life' },
  { key: 'other', label: 'Other' },
];

const PAGE_SIZE = 20;

const EventFeedScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeCategory, setActiveCategory] = useState('all');
  const pageRef = useRef(1);

  const buildParams = useCallback(() => {
    const params = { page: 1, limit: PAGE_SIZE };
    if (activeFilter !== 'all') params.filter = activeFilter;
    if (activeCategory !== 'all') params.event_type = activeCategory;
    return params;
  }, [activeFilter, activeCategory]);

  const fetchEvents = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      pageRef.current = 1;
      const params = buildParams();
      params.page = 1;

      const response = await eventFeedAPI.list(params);
      const data = response.data.events || response.data || [];
      setEvents(data);
      setHasMore(data.length >= PAGE_SIZE);
    } catch (error) {
      console.warn('Failed to fetch event feed:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildParams]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      pageRef.current += 1;
      const params = buildParams();
      params.page = pageRef.current;

      const response = await eventFeedAPI.list(params);
      const data = response.data.events || response.data || [];
      setEvents((prev) => [...prev, ...data]);
      setHasMore(data.length >= PAGE_SIZE);
    } catch (error) {
      console.warn('Failed to load more events:', error?.message);
      pageRef.current -= 1;
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, buildParams]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchEvents();
    });
    return unsubscribe;
  }, [navigation, fetchEvents]);

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

  const getConfidenceColor = (score) => {
    if (score == null) return colors.textTertiary;
    if (score > 0.8) return colors.confidenceHigh;
    if (score >= 0.5) return colors.confidenceMedium;
    return colors.confidenceLow;
  };

  const renderFilterChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsScroll}
      style={styles.chipsContainer}
    >
      {QUICK_FILTERS.map((filter) => (
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
    </ScrollView>
  );

  const renderCategoryChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsScroll}
      style={styles.categoryChipsContainer}
    >
      {CATEGORY_FILTERS.map((cat) => (
        <TouchableOpacity
          key={cat.key}
          style={[
            styles.categoryChip,
            activeCategory === cat.key && styles.categoryChipActive,
          ]}
          onPress={() => setActiveCategory(cat.key)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.categoryChipText,
              activeCategory === cat.key && styles.categoryChipTextActive,
            ]}
          >
            {cat.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderEventCard = ({ item: event }) => {
    const clubInitial = (event.club_name || '?').charAt(0).toUpperCase();
    const confidenceColor = getConfidenceColor(event.ai_confidence);

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => navigation.navigate('EventDetail', { eventId: event.id, source: 'feed' })}
        activeOpacity={0.7}
      >
        {/* Club header */}
        <View style={styles.eventClubRow}>
          {event.club_profile_image ? (
            <Image source={{ uri: event.club_profile_image }} style={styles.clubAvatar} />
          ) : (
            <View style={styles.clubAvatarPlaceholder}>
              <Text style={styles.clubAvatarText}>{clubInitial}</Text>
            </View>
          )}
          <Text style={styles.eventClubName} numberOfLines={1}>{event.club_name || 'Unknown Club'}</Text>
          {event.is_registered === true && (
            <Ionicons name="checkmark-circle" size={14} color={colors.primary} style={{ marginLeft: 4 }} />
          )}
          {event.ai_confidence != null && (
            <View style={[styles.confidenceDot, { backgroundColor: confidenceColor }]} />
          )}
        </View>

        {/* Event name */}
        <Text style={styles.eventName} numberOfLines={2}>
          {event.name || event.title}
        </Text>

        {/* Date/Time */}
        <View style={styles.eventDetailRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.eventDetailText}>
            {formatDateTime(event.date || event.start_date || event.event_date)}
          </Text>
        </View>

        {/* Location */}
        {(event.location || event.building_name) && (
          <View style={styles.eventDetailRow}>
            <Ionicons name="location-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.eventDetailText} numberOfLines={1}>
              {event.building_name ? `${event.building_name} - ${event.location || ''}` : event.location}
            </Text>
          </View>
        )}

        {/* Quick-glance badges */}
        <View style={styles.badgesRow}>
          {event.food_available && (
            <View style={[styles.quickBadge, styles.quickBadgeFood]}>
              <Text style={styles.quickBadgeText}>Free Food</Text>
            </View>
          )}
          {event.is_on_campus && (
            <View style={[styles.quickBadge, styles.quickBadgeLocation]}>
              <Text style={styles.quickBadgeText}>On Campus</Text>
            </View>
          )}
          {event.dress_code && (
            <View style={[styles.quickBadge, styles.quickBadgeDress]}>
              <Text style={styles.quickBadgeText}>Dress Code</Text>
            </View>
          )}
          {(event.is_free || event.cost === 0) && !event.food_available && (
            <View style={[styles.quickBadge, styles.quickBadgeFree]}>
              <Text style={styles.quickBadgeText}>Free</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {renderFilterChips()}
      {renderCategoryChips()}
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.empty}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="calendar-outline" size={64} color={colors.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>No events found</Text>
        <Text style={styles.emptySubtitle}>
          There are no events matching your filters right now. Check back soon or adjust your filters.
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <ActivityIndicator
          style={styles.loadingFooter}
          size="small"
          color={colors.primary}
        />
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Events</Text>
        <TouchableOpacity
          style={styles.mapButton}
          onPress={() => navigation.navigate('EventMap', { activeFilter, activeCategory })}
          activeOpacity={0.7}
        >
          <Ionicons name="map-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderEventCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          loading ? (
            <ActivityIndicator style={styles.loadingFooter} size="large" color={colors.primary} />
          ) : (
            renderFooter()
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchEvents(true)}
            tintColor={colors.primary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={
          events.length === 0 && !loading ? styles.emptyListContainer : styles.listContent
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  mapButton: {
    padding: spacing.sm,
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

  // Filter chips
  chipsContainer: {
    marginBottom: spacing.xs,
  },
  chipsScroll: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
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

  // Category chips
  categoryChipsContainer: {
    marginBottom: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primaryBg,
    borderColor: colors.primary,
  },
  categoryChipText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textTertiary,
    fontSize: 12,
  },
  categoryChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
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
  eventClubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  clubAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: spacing.sm,
  },
  clubAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  clubAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  eventClubName: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  confidenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.sm,
  },
  eventName: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  eventDetailText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    flex: 1,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  quickBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  quickBadgeFood: {
    backgroundColor: colors.success + '12',
    borderColor: colors.success + '30',
  },
  quickBadgeLocation: {
    backgroundColor: colors.info + '12',
    borderColor: colors.info + '30',
  },
  quickBadgeDress: {
    backgroundColor: colors.warning + '12',
    borderColor: colors.warning + '30',
  },
  quickBadgeFree: {
    backgroundColor: colors.accent + '12',
    borderColor: colors.accent + '30',
  },
  quickBadgeText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
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
});

export default EventFeedScreen;

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Animated,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { eventFeedAPI } from '../services/api';
import { resolveEventCoordinates, buildDirectionsUrl, UTD_CENTER } from '../utils/campusBuildings';

const CARD_HEIGHT = 280;

const UTD_REGION = {
  ...UTD_CENTER,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

const QUICK_FILTERS = [
  { key: 'all', label: 'All Events', icon: 'globe-outline' },
  { key: 'free_food', label: 'Free Food', icon: 'restaurant-outline' },
  { key: 'free', label: 'Free', icon: 'ticket-outline' },
  { key: 'on_campus', label: 'On Campus', icon: 'school-outline' },
  { key: 'this_week', label: 'This Week', icon: 'calendar-outline' },
];

const EVENT_TYPE_COLORS = {
  meeting: '#7C3AED',
  workshop: '#3B82F6',
  social: '#EC4899',
  info_session: '#F59E0B',
  fundraiser: '#10B981',
  competition: '#EF4444',
  performance: '#8B5CF6',
  study_session: '#6366F1',
  guest_speaker: '#14B8A6',
  career_fair: '#3B82F6',
  sports: '#EF4444',
  cultural: '#F97316',
  other: '#6B7280',
};

const EVENT_TYPE_LABELS = {
  meeting: 'Meeting',
  workshop: 'Workshop',
  social: 'Social',
  info_session: 'Info Session',
  fundraiser: 'Fundraiser',
  competition: 'Competition',
  performance: 'Performance',
  study_session: 'Study Session',
  guest_speaker: 'Guest Speaker',
  career_fair: 'Career Fair',
  sports: 'Sports',
  cultural: 'Cultural',
  other: 'Event',
};

const EventMapScreen = ({ navigation, route }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initialFilter = route.params?.activeFilter || 'all';
  const initialCategory = route.params?.activeCategory || 'all';

  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [filterDropdownVisible, setFilterDropdownVisible] = useState(false);
  const cardAnim = useRef(new Animated.Value(CARD_HEIGHT + 40)).current;
  const mapRef = useRef(null);

  const buildParams = useCallback(() => {
    const params = { limit: 100 };
    if (activeFilter === 'free_food') params.food_available = 'true';
    else if (activeFilter === 'free') params.is_free = 'true';
    else if (activeFilter === 'on_campus') params.is_on_campus = 'true';
    else if (activeFilter === 'this_week') {
      const now = new Date();
      params.date_from = now.toISOString().split('T')[0];
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      params.date_to = weekLater.toISOString().split('T')[0];
    }
    if (initialCategory !== 'all') params.category = initialCategory;
    return params;
  }, [activeFilter, initialCategory]);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const params = buildParams();
      const response = await eventFeedAPI.list(params);
      const data = response.data.events || response.data || [];
      setAllEvents(data);
    } catch (error) {
      console.warn('Failed to fetch events for map:', error?.message);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const mappableEvents = useMemo(() => {
    return allEvents
      .map((event) => {
        const coords = resolveEventCoordinates(event);
        if (!coords) return null;
        return { ...event, _lat: coords.latitude, _lng: coords.longitude };
      })
      .filter(Boolean);
  }, [allEvents]);

  const getMarkerColor = (eventType) => {
    return EVENT_TYPE_COLORS[eventType] || EVENT_TYPE_COLORS.other;
  };

  const formatTime = (timeStart, timeEnd) => {
    if (!timeStart) return '';
    const formatT = (t) => {
      const [h, m] = t.split(':');
      const hour = parseInt(h, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      return m === '00' ? `${hour12} ${ampm}` : `${hour12}:${m} ${ampm}`;
    };
    const start = formatT(timeStart);
    return timeEnd ? `${start} - ${formatT(timeEnd)}` : start;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const openInMaps = (event) => {
    Linking.openURL(buildDirectionsUrl(event)).catch(() => {});
  };

  const showCard = useCallback((event) => {
    setSelectedEvent(event);
    Animated.spring(cardAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [cardAnim]);

  const dismissCard = useCallback(() => {
    Animated.timing(cardAnim, {
      toValue: CARD_HEIGHT + 40,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelectedEvent(null));
  }, [cardAnim]);

  const handleMarkerPress = useCallback((event) => {
    showCard(event);
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: event._lat - 0.0015,
        longitude: event._lng,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
      }, 300);
    }
  }, [showCard]);

  const selectFilter = useCallback((key) => {
    setActiveFilter(key);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Map takes full screen */}
      <View style={styles.mapContainer}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={UTD_REGION}
          showsUserLocation
          showsMyLocationButton
          onPress={() => { if (selectedEvent) dismissCard(); }}
        >
          {mappableEvents.map((event) => (
            <Marker
              key={event.id}
              coordinate={{
                latitude: event._lat,
                longitude: event._lng,
              }}
              pinColor={getMarkerColor(event.event_type)}
              onPress={() => handleMarkerPress(event)}
            />
          ))}
        </MapView>

        {/* Floating header */}
        <View style={styles.floatingHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Centered title pill */}
        <View style={styles.titlePillWrapper} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.titlePill}
            onPress={() => setFilterDropdownVisible((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.titleText}>Event Map</Text>
            <View style={styles.countChip}>
              <Text style={styles.countText}>{mappableEvents.length}</Text>
            </View>
            <Ionicons
              name={filterDropdownVisible ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Filter pills row */}
        {filterDropdownVisible && (
          <View style={styles.filterRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScrollContent}
            >
              {QUICK_FILTERS.map((filter) => {
                const isActive = activeFilter === filter.key;
                return (
                  <TouchableOpacity
                    key={filter.key}
                    style={[styles.filterPill, isActive && styles.filterPillActive]}
                    onPress={() => selectFilter(filter.key)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={filter.icon}
                      size={14}
                      color={isActive ? colors.textInverse : colors.textSecondary}
                    />
                    <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                      {filter.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Bottom event detail card */}
        {selectedEvent && (
          <Animated.View
            style={[
              styles.eventCard,
              { transform: [{ translateY: cardAnim }] },
            ]}
          >
            <View style={styles.cardHandle} />

            <TouchableOpacity style={styles.cardClose} onPress={dismissCard} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={colors.textTertiary} />
            </TouchableOpacity>

            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.typeBadge,
                  { backgroundColor: getMarkerColor(selectedEvent.event_type) + '20' },
                ]}
              >
                <View
                  style={[
                    styles.typeDot,
                    { backgroundColor: getMarkerColor(selectedEvent.event_type) },
                  ]}
                />
                <Text
                  style={[
                    styles.typeBadgeText,
                    { color: getMarkerColor(selectedEvent.event_type) },
                  ]}
                >
                  {EVENT_TYPE_LABELS[selectedEvent.event_type] || 'Event'}
                </Text>
              </View>
            </View>

            <Text style={styles.cardTitle} numberOfLines={2}>
              {selectedEvent.name}
            </Text>

            {selectedEvent.club_name && (
              <Text style={styles.cardClub} numberOfLines={1}>
                {selectedEvent.club_name}
              </Text>
            )}

            <View style={styles.cardDetails}>
              {selectedEvent.event_date && (
                <View style={styles.cardDetailRow}>
                  <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                  <Text style={styles.cardDetailText}>
                    {formatDate(selectedEvent.event_date)}
                    {selectedEvent.time_start
                      ? `  ·  ${formatTime(selectedEvent.time_start, selectedEvent.time_end)}`
                      : ''}
                  </Text>
                </View>
              )}

              {(selectedEvent.location || selectedEvent.location_building) && (
                <View style={styles.cardDetailRow}>
                  <Ionicons name="location-outline" size={16} color={colors.primary} />
                  <Text style={styles.cardDetailText} numberOfLines={1}>
                    {[selectedEvent.location, selectedEvent.location_building]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.cardBadges}>
              {selectedEvent.food_available && (
                <View style={[styles.badge, { backgroundColor: colors.success + '15' }]}>
                  <Ionicons name="restaurant-outline" size={12} color={colors.success} />
                  <Text style={[styles.badgeText, { color: colors.success }]}>Free Food</Text>
                </View>
              )}
              {selectedEvent.is_free && (
                <View style={[styles.badge, { backgroundColor: colors.accent + '15' }]}>
                  <Ionicons name="ticket-outline" size={12} color={colors.accent} />
                  <Text style={[styles.badgeText, { color: colors.accent }]}>Free</Text>
                </View>
              )}
              {selectedEvent.is_on_campus && (
                <View style={[styles.badge, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name="school-outline" size={12} color={colors.primary} />
                  <Text style={[styles.badgeText, { color: colors.primary }]}>On Campus</Text>
                </View>
              )}
            </View>

            {selectedEvent.description && (
              <Text style={styles.cardDescription} numberOfLines={2}>
                {selectedEvent.description}
              </Text>
            )}

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.viewDetailsButton}
                onPress={() => {
                  dismissCard();
                  navigation.navigate('EventDetail', { eventId: selectedEvent.id, source: 'feed' });
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="open-outline" size={16} color={colors.textInverse} />
                <Text style={styles.viewDetailsText}>View Details</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.directionsButton}
                onPress={() => openInMaps(selectedEvent)}
                activeOpacity={0.8}
              >
                <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                <Text style={styles.directionsButtonText}>Directions</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>

    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Map
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background + '80',
    zIndex: 10,
  },

  // Floating header
  floatingHeader: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  titlePillWrapper: {
    position: 'absolute',
    top: spacing.sm,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },
  titlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: borderRadius.full,
    gap: 8,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  titleText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    fontSize: 15,
  },
  countChip: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Filter pills row
  filterRow: {
    position: 'absolute',
    top: spacing.sm + 48,
    left: 0,
    right: 0,
  },
  filterScrollContent: {
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    gap: 6,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.textInverse,
  },

  // Event detail card
  eventCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    ...shadows.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.borderLight,
  },
  cardHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderLight,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  cardClose: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.md,
    padding: spacing.xs,
    zIndex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    gap: 5,
  },
  typeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 2,
    paddingRight: 28,
  },
  cardClub: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 8,
  },
  cardDetails: {
    gap: 6,
    marginBottom: 8,
  },
  cardDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardDetailText: {
    ...typography.body,
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  cardBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardDescription: {
    ...typography.body,
    fontSize: 13,
    color: colors.textTertiary,
    lineHeight: 18,
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  viewDetailsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 11,
    borderRadius: borderRadius.lg,
    gap: 6,
  },
  viewDetailsText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 14,
  },
  directionsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 11,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    gap: 6,
  },
  directionsButtonText: {
    ...typography.button,
    color: colors.primary,
    fontSize: 14,
  },
});

export default EventMapScreen;

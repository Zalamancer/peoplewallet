import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Callout } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { eventFeedAPI } from '../services/api';
import { resolveEventCoordinates, buildDirectionsUrl, UTD_CENTER } from '../utils/campusBuildings';

const UTD_REGION = {
  ...UTD_CENTER,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

const QUICK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'free_food', label: 'Free Food' },
  { key: 'free', label: 'Free' },
  { key: 'on_campus', label: 'On Campus' },
  { key: 'this_week', label: 'This Week' },
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

const EventMapScreen = ({ navigation, route }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const initialFilter = route.params?.activeFilter || 'all';
  const initialCategory = route.params?.activeCategory || 'all';

  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [selectedEvent, setSelectedEvent] = useState(null);

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

  // Resolve coordinates client-side for each event
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Map</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Filter Chips */}
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

      {/* Map */}
      <View style={styles.mapContainer}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        <MapView
          style={styles.map}
          initialRegion={UTD_REGION}
          showsUserLocation
          showsMyLocationButton
        >
          {mappableEvents.map((event) => (
            <Marker
              key={event.id}
              coordinate={{
                latitude: event._lat,
                longitude: event._lng,
              }}
              pinColor={getMarkerColor(event.event_type)}
              onPress={() => setSelectedEvent(event)}
            >
              <Callout
                tooltip
                onPress={() => navigation.navigate('EventDetail', { eventId: event.id, source: 'feed' })}
              >
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle} numberOfLines={2}>
                    {event.name}
                  </Text>
                  {event.club_name && (
                    <Text style={styles.calloutClub} numberOfLines={1}>
                      {event.club_name}
                    </Text>
                  )}
                  <View style={styles.calloutDetailRow}>
                    <Ionicons name="calendar-outline" size={12} color={colors.textTertiary} />
                    <Text style={styles.calloutDetailText}>
                      {formatDate(event.event_date)}
                      {event.time_start ? ` ${formatTime(event.time_start, event.time_end)}` : ''}
                    </Text>
                  </View>
                  {event.location && (
                    <View style={styles.calloutDetailRow}>
                      <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
                      <Text style={styles.calloutDetailText} numberOfLines={1}>
                        {event.location}
                      </Text>
                    </View>
                  )}
                  <View style={styles.calloutBadges}>
                    {event.food_available && (
                      <View style={styles.calloutBadge}>
                        <Text style={styles.calloutBadgeText}>Free Food</Text>
                      </View>
                    )}
                    {event.is_free && !event.food_available && (
                      <View style={styles.calloutBadgeFree}>
                        <Text style={styles.calloutBadgeText}>Free</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.calloutTap}>Tap for details</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>

        {/* Event count badge */}
        {!loading && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {mappableEvents.length} event{mappableEvents.length !== 1 ? 's' : ''} on map
            </Text>
          </View>
        )}

        {/* Directions button for selected event */}
        {selectedEvent && (
          <TouchableOpacity
            style={styles.directionsButton}
            onPress={() => openInMaps(selectedEvent)}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate-outline" size={18} color={colors.textInverse} />
            <Text style={styles.directionsButtonText}>Get Directions</Text>
          </TouchableOpacity>
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
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  headerSpacer: {
    width: 40,
  },

  // Filter chips
  chipsContainer: {
    maxHeight: 44,
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

  // Map
  mapContainer: {
    flex: 1,
    marginTop: spacing.sm,
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

  // Callout
  callout: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    minWidth: 200,
    maxWidth: 280,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  calloutTitle: {
    ...typography.h3,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  calloutClub: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 6,
  },
  calloutDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  calloutDetailText: {
    ...typography.caption,
    color: colors.textTertiary,
    flex: 1,
  },
  calloutBadges: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
  },
  calloutBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success + '15',
  },
  calloutBadgeFree: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent + '15',
  },
  calloutBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.success,
  },
  calloutTap: {
    ...typography.caption,
    fontSize: 10,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 6,
  },

  // Count badge
  countBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  countBadgeText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Directions button
  directionsButton: {
    position: 'absolute',
    bottom: spacing.xl,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
    ...shadows.md,
  },
  directionsButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
});

export default EventMapScreen;

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  RefreshControl,
  Image,
  Linking,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { eventsAPI, rsvpsAPI, eventFeedAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ShareEventModal from '../components/ShareEventModal';
import { resolveEventCoordinates, buildDirectionsUrl } from '../utils/campusBuildings';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_WIDTH = SCREEN_WIDTH - spacing.md * 2;
const CAROUSEL_HEIGHT = 300;

const EventDetailScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const RSVP_OPTIONS = useMemo(() => [
    { key: 'going', label: 'Going', icon: 'checkmark-circle', color: colors.success },
    { key: 'maybe', label: 'Maybe', icon: 'help-circle', color: colors.warning },
    { key: 'not_going', label: "Can't Go", icon: 'close-circle', color: colors.error },
  ], [colors]);

  const { eventId, source } = route.params;
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [knownAttendees, setKnownAttendees] = useState([]);
  const [interactionState, setInteractionState] = useState({ interested: false, going: false, saved: false });
  const [interactionLoading, setInteractionLoading] = useState(false);
  const [relatedEvents, setRelatedEvents] = useState([]);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const fetchEvent = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      // Use eventFeedAPI for feed-sourced events to get joined post data
      const useFeedAPI = source === 'feed';
      const response = useFeedAPI
        ? await eventFeedAPI.get(eventId)
        : await eventsAPI.get(eventId);
      const eventData = response.data.event || response.data;
      setEvent(eventData);

      // Set current user's RSVP status if present
      if (eventData.user_rsvp_status) {
        setRsvpStatus(eventData.user_rsvp_status);
      }

      // Set known attendees if present
      if (eventData.known_attendees) {
        setKnownAttendees(eventData.known_attendees);
      }

      // Set interaction state for feed events
      if (eventData.user_interactions) {
        const interactions = eventData.user_interactions || [];
        setInteractionState({
          interested: interactions.some((i) => i.interaction_type === 'interested'),
          going: interactions.some((i) => i.interaction_type === 'going'),
          saved: interactions.some((i) => i.interaction_type === 'saved'),
        });
      } else if (eventData.user_interaction) {
        setInteractionState({
          interested: eventData.user_interaction.interested || false,
          going: eventData.user_interaction.going || false,
          saved: eventData.user_interaction.saved || false,
        });
      }

      // Load related events from same club
      if (eventData.club_id) {
        try {
          const relatedRes = await eventFeedAPI.list({ club_id: eventData.club_id, limit: 5 });
          const relatedData = relatedRes.data.events || relatedRes.data || [];
          setRelatedEvents(relatedData.filter((e) => e.id !== eventId));
        } catch {
          // Silently ignore related events failure
        }
      }
    } catch (error) {
      console.warn('Failed to fetch event:', error?.message);
      Alert.alert('Error', 'Failed to load event details.');
      navigation.goBack();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, navigation]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  const handleRsvp = async (status) => {
    try {
      setRsvpLoading(true);

      if (rsvpStatus === status) {
        // Cancel RSVP if tapping the same status
        await rsvpsAPI.cancel(eventId);
        setRsvpStatus(null);
      } else {
        await rsvpsAPI.rsvp(eventId, status);
        setRsvpStatus(status);
      }

      // Refresh event data to get updated counts
      const response = await eventsAPI.get(eventId);
      const eventData = response.data.event || response.data;
      setEvent(eventData);
    } catch (error) {
      console.warn('Failed to RSVP:', error?.message);
      const msg = error.response?.data?.error || 'Failed to update RSVP.';
      Alert.alert('Error', msg);
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleShare = () => {
    if (!event) return;
    setShareModalVisible(true);
  };

  const isAIEvent = event?.source === 'instagram_ai' || !!event?.post_id;

  const handleInteraction = async (type) => {
    try {
      setInteractionLoading(true);
      if (interactionState[type]) {
        await eventFeedAPI.removeInteraction(eventId, type);
        setInteractionState((prev) => ({ ...prev, [type]: false }));
      } else {
        if (type === 'interested') await eventFeedAPI.markInterested(eventId);
        else if (type === 'going') await eventFeedAPI.markGoing(eventId);
        else if (type === 'saved') await eventFeedAPI.saveEvent(eventId);
        setInteractionState((prev) => ({ ...prev, [type]: true }));
      }
    } catch (error) {
      console.warn(`Failed to update ${type}:`, error?.message);
    } finally {
      setInteractionLoading(false);
    }
  };

  const buildGoogleCalendarLink = () => {
    if (!event) return '';
    const title = encodeURIComponent(event.name || event.title || '');
    const location = encodeURIComponent(event.location || '');
    const description = encodeURIComponent(event.description || '');
    const startDate = event.date || event.start_date || event.event_date;
    const endDate = event.end_date;

    const formatGCalDate = (d) => {
      if (!d) return '';
      return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };

    const start = formatGCalDate(startDate);
    const end = endDate ? formatGCalDate(endDate) : formatGCalDate(startDate);

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&location=${location}&details=${description}`;
  };

  const handleOpenOriginalPost = () => {
    if (event?.post_url) {
      Linking.openURL(event.post_url).catch(() => {
        Alert.alert('Error', 'Could not open the original post.');
      });
    }
  };

  const handleOpenRsvpLink = () => {
    if (event?.rsvp_link) {
      Linking.openURL(event.rsvp_link).catch(() => {
        Alert.alert('Error', 'Could not open the RSVP link.');
      });
    }
  };

  const handleAddToCalendar = () => {
    const url = buildGoogleCalendarLink();
    if (url) {
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Could not open Google Calendar.');
      });
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getEventTypeColor = (eventType) => {
    const colorMap = {
      networking: '#7C3AED',
      career_fair: '#3B82F6',
      conference: '#10B981',
      meetup: '#F59E0B',
      social: '#EC4899',
      sports: '#EF4444',
      other: colors.textTertiary,
    };
    return colorMap[eventType] || colors.textTertiary;
  };

  const getEventTypeLabel = (eventType) => {
    const labelMap = {
      networking: 'Networking',
      career_fair: 'Career Fair',
      conference: 'Conference',
      meetup: 'Meetup',
      social: 'Social',
      sports: 'Sports',
      other: 'Other',
    };
    return labelMap[eventType] || eventType || 'Event';
  };

  const formatRelativeTime = (dateString) => {
    if (!dateString) return '';
    const now = new Date();
    const then = new Date(dateString);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCount = (count) => {
    if (count == null) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  };

  const handleCarouselScroll = (e) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / CAROUSEL_WIDTH);
    setActiveImageIndex(index);
  };

  const postImages = event?.post_image_urls || (event?.image_url ? [event.image_url] : []);

  const isOfficerOrPresident = () => {
    if (!user || !event) return false;
    return (
      event.user_role === 'officer' ||
      event.user_role === 'president' ||
      event.created_by === user.id
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Event</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingInner}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!event) return null;

  const typeColor = getEventTypeColor(event.event_type);
  const capacityText =
    event.capacity && event.rsvp_count != null
      ? `${event.rsvp_count}/${event.capacity} spots`
      : event.rsvp_count != null
      ? `${event.rsvp_count} going`
      : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {event.name || event.title}
        </Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
          <Ionicons name="share-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchEvent(true)}
            tintColor={colors.primary}
          />
        }
      >
        {/* Club Header - for AI-extracted events */}
        {isAIEvent && event.club_name && (
          <TouchableOpacity
            style={styles.clubHeaderCard}
            onPress={() => event.club_id && navigation.navigate('ClubDetail', { clubId: event.club_id })}
            activeOpacity={0.7}
          >
            {event.club_profile_image ? (
              <Image source={{ uri: event.club_profile_image }} style={styles.clubHeaderImage} />
            ) : (
              <View style={styles.clubHeaderImagePlaceholder}>
                <Text style={styles.clubHeaderInitial}>
                  {(event.club_name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.clubHeaderInfo}>
              <View style={styles.clubHeaderNameRow}>
                <Text style={styles.clubHeaderName}>{event.club_name}</Text>
                {event.is_registered === true && (
                  <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={{ marginLeft: 4 }} />
                )}
              </View>
              <Text style={styles.clubHeaderSub}>View Club</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}

        {/* Original Post - for AI-extracted events */}
        {isAIEvent && postImages.length > 0 && (
          <View style={styles.originalPostSection}>
            {/* Image Carousel */}
            <View style={styles.carouselContainer}>
              <FlatList
                data={postImages}
                keyExtractor={(_, i) => `img-${i}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleCarouselScroll}
                scrollEventThrottle={16}
                renderItem={({ item }) => (
                  <Image
                    source={{ uri: item }}
                    style={styles.carouselImage}
                    resizeMode="cover"
                  />
                )}
              />
              {postImages.length > 1 && (
                <View style={styles.paginationDots}>
                  {postImages.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        i === activeImageIndex && styles.dotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>

            {/* Post Stats Row */}
            {(event.post_likes_count != null || event.post_comments_count != null) && (
              <View style={styles.postStatsRow}>
                {event.post_likes_count != null && (
                  <View style={styles.postStat}>
                    <Ionicons name="heart" size={16} color={colors.error} />
                    <Text style={styles.postStatText}>{formatCount(event.post_likes_count)}</Text>
                  </View>
                )}
                {event.post_comments_count != null && (
                  <View style={styles.postStat}>
                    <Ionicons name="chatbubble" size={14} color={colors.textTertiary} />
                    <Text style={styles.postStatText}>{formatCount(event.post_comments_count)}</Text>
                  </View>
                )}
                {event.post_posted_at && (
                  <Text style={styles.postTimestamp}>
                    Posted {formatRelativeTime(event.post_posted_at)}
                  </Text>
                )}
              </View>
            )}

            {/* Caption */}
            {event.post_caption && (
              <View style={styles.captionContainer}>
                <Text
                  style={styles.captionText}
                  numberOfLines={captionExpanded ? undefined : 3}
                >
                  {event.post_caption}
                </Text>
                {event.post_caption.length > 120 && !captionExpanded && (
                  <TouchableOpacity onPress={() => setCaptionExpanded(true)} activeOpacity={0.7}>
                    <Text style={styles.readMore}>Read more</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* View on Instagram link */}
            {event.post_url && (
              <TouchableOpacity
                style={styles.viewOnInstagram}
                onPress={handleOpenOriginalPost}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-instagram" size={16} color="#E4405F" />
                <Text style={styles.viewOnInstagramText}>View on Instagram</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Event Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.eventName}>{event.name || event.title}</Text>

          <View style={styles.badgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: typeColor + '15', borderColor: typeColor + '30' }]}>
              <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                {getEventTypeLabel(event.event_type)}
              </Text>
            </View>
            {event.has_free_food && (
              <View style={styles.freeFoodBadge}>
                <Ionicons name="fast-food-outline" size={14} color={colors.success} />
                <Text style={styles.freeFoodText}>Free Food</Text>
              </View>
            )}
          </View>

          {/* Date/Time */}
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            </View>
            <Text style={styles.detailText}>
              {formatDateTime(event.date || event.start_date || event.event_date)}
            </Text>
          </View>

          {/* Location */}
          {event.location && (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="location-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.detailText}>{event.location}</Text>
            </View>
          )}

          {/* Mini-map preview — resolves coordinates from building names client-side */}
          {(() => {
            const coords = resolveEventCoordinates(event);
            if (!coords) return null;
            return (
              <View style={styles.miniMapContainer}>
                <MapView
                  style={styles.miniMap}
                  initialRegion={{
                    ...coords,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                >
                  <Marker coordinate={coords} />
                </MapView>
                <TouchableOpacity
                  style={styles.directionsOverlay}
                  onPress={() => {
                    Linking.openURL(buildDirectionsUrl(event)).catch(() => {});
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="navigate-outline" size={14} color={colors.textInverse} />
                  <Text style={styles.directionsOverlayText}>Get Directions</Text>
                </TouchableOpacity>
              </View>
            );
          })()}

          {/* Attendee count / capacity */}
          {capacityText && (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="people-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.detailText}>{capacityText}</Text>
            </View>
          )}

          {/* Dress Code */}
          {event.dress_code && (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="shirt-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.detailText}>Dress Code: {event.dress_code}</Text>
            </View>
          )}

          {/* Prerequisites */}
          {event.prerequisites && (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.detailText}>Prerequisites: {event.prerequisites}</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {event.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.descriptionCard}>
              <Text style={styles.descriptionText}>{event.description}</Text>
            </View>
          </View>
        )}

        {/* AI Event Details */}
        {isAIEvent && (
          <>
            {/* Food Details */}
            {event.food_available && event.food_details && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Food</Text>
                <View style={styles.descriptionCard}>
                  <View style={styles.aiDetailRow}>
                    <Ionicons name="fast-food-outline" size={18} color={colors.success} />
                    <Text style={styles.aiDetailText}>{event.food_details}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Dress Code Details */}
            {event.dress_code && event.dress_code_details && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Dress Code</Text>
                <View style={styles.descriptionCard}>
                  <View style={styles.aiDetailRow}>
                    <Ionicons name="shirt-outline" size={18} color={colors.warning} />
                    <Text style={styles.aiDetailText}>{event.dress_code_details}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Cost */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cost</Text>
              <View style={styles.descriptionCard}>
                {event.is_free || event.cost === 0 ? (
                  <View style={styles.freeBadgeLarge}>
                    <Ionicons name="pricetag-outline" size={16} color={colors.success} />
                    <Text style={styles.freeBadgeLargeText}>Free</Text>
                  </View>
                ) : (
                  <Text style={styles.costText}>
                    {event.cost != null ? `$${event.cost}` : 'See event details'}
                  </Text>
                )}
              </View>
            </View>

            {/* Open to All / Members Only */}
            <View style={styles.section}>
              <View style={styles.descriptionCard}>
                {event.open_to_all !== false ? (
                  <View style={styles.accessBadge}>
                    <Ionicons name="globe-outline" size={16} color={colors.success} />
                    <Text style={[styles.accessBadgeText, { color: colors.success }]}>Open to All</Text>
                  </View>
                ) : (
                  <View style={styles.accessBadge}>
                    <Ionicons name="lock-closed-outline" size={16} color={colors.warning} />
                    <Text style={[styles.accessBadgeText, { color: colors.warning }]}>Members Only</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Perks */}
            {event.perks && event.perks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Perks</Text>
                <View style={styles.descriptionCard}>
                  <View style={styles.chipsRow}>
                    {event.perks.map((perk, index) => (
                      <View key={index} style={styles.perkChip}>
                        <Text style={styles.perkChipText}>{perk}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Tags */}
            {event.tags && event.tags.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Tags</Text>
                <View style={styles.descriptionCard}>
                  <View style={styles.chipsRow}>
                    {event.tags.map((tag, index) => (
                      <TouchableOpacity key={index} style={styles.tagChip} activeOpacity={0.7}>
                        <Text style={styles.tagChipText}>{tag}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Interaction Buttons: Interested / Going / Save */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Interested?</Text>
              <View style={styles.interactionCard}>
                <View style={styles.interactionRow}>
                  <TouchableOpacity
                    style={[
                      styles.interactionButton,
                      interactionState.interested && styles.interactionButtonActive,
                    ]}
                    onPress={() => handleInteraction('interested')}
                    disabled={interactionLoading}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={interactionState.interested ? 'star' : 'star-outline'}
                      size={22}
                      color={interactionState.interested ? colors.warning : colors.textTertiary}
                    />
                    <Text style={[
                      styles.interactionButtonText,
                      interactionState.interested && { color: colors.warning },
                    ]}>Interested</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.interactionButton,
                      interactionState.going && styles.interactionButtonActiveGoing,
                    ]}
                    onPress={() => handleInteraction('going')}
                    disabled={interactionLoading}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={interactionState.going ? 'checkmark-circle' : 'checkmark-circle-outline'}
                      size={22}
                      color={interactionState.going ? colors.success : colors.textTertiary}
                    />
                    <Text style={[
                      styles.interactionButtonText,
                      interactionState.going && { color: colors.success },
                    ]}>Going</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.interactionButton,
                      interactionState.saved && styles.interactionButtonActiveSaved,
                    ]}
                    onPress={() => handleInteraction('saved')}
                    disabled={interactionLoading}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={interactionState.saved ? 'bookmark' : 'bookmark-outline'}
                      size={22}
                      color={interactionState.saved ? colors.primary : colors.textTertiary}
                    />
                    <Text style={[
                      styles.interactionButtonText,
                      interactionState.saved && { color: colors.primary },
                    ]}>Save</Text>
                  </TouchableOpacity>
                </View>
                {interactionLoading && (
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.sm }} />
                )}
              </View>
            </View>

            {/* RSVP Link */}
            {event.rsvp_link && (
              <View style={styles.section}>
                <TouchableOpacity style={styles.rsvpLinkButton} onPress={handleOpenRsvpLink} activeOpacity={0.7}>
                  <Ionicons name="open-outline" size={18} color={colors.textInverse} />
                  <Text style={styles.rsvpLinkButtonText}>RSVP Now</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Add to Google Calendar */}
            <View style={styles.section}>
              <TouchableOpacity style={styles.calendarButton} onPress={handleAddToCalendar} activeOpacity={0.7}>
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                <Text style={styles.calendarButtonText}>Add to Google Calendar</Text>
              </TouchableOpacity>
            </View>

            {/* View Original Post (shown only when no post section rendered above) */}
            {event.post_url && postImages.length === 0 && (
              <View style={styles.section}>
                <TouchableOpacity style={styles.originalPostButton} onPress={handleOpenOriginalPost} activeOpacity={0.7}>
                  <Ionicons name="logo-instagram" size={18} color="#E4405F" />
                  <Text style={styles.originalPostButtonText}>View Original Post</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* RSVP Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RSVP</Text>
          <View style={styles.rsvpCard}>
            <View style={styles.rsvpButtonsRow}>
              {RSVP_OPTIONS.map((option) => {
                const isActive = rsvpStatus === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.rsvpButton,
                      isActive && { backgroundColor: option.color + '15', borderColor: option.color },
                    ]}
                    onPress={() => handleRsvp(option.key)}
                    activeOpacity={0.7}
                    disabled={rsvpLoading}
                  >
                    <Ionicons
                      name={isActive ? option.icon : option.icon + '-outline'}
                      size={24}
                      color={isActive ? option.color : colors.textTertiary}
                    />
                    <Text
                      style={[
                        styles.rsvpButtonText,
                        isActive && { color: option.color, fontWeight: '600' },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {rsvpLoading && (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={styles.rsvpLoading}
              />
            )}
          </View>
        </View>

        {/* Known Attendees */}
        {knownAttendees.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>People You Know Going</Text>
            <View style={styles.attendeesCard}>
              {knownAttendees.map((attendee, index) => (
                <TouchableOpacity
                  key={attendee.id || index}
                  style={styles.attendeeRow}
                  onPress={() => {
                    if (attendee.contactId) {
                      navigation.navigate('ContactDetail', { contactId: attendee.contactId });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.attendeeAvatar}>
                    <Text style={styles.attendeeInitial}>
                      {(attendee.name || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.attendeeInfo}>
                    <Text style={styles.attendeeName}>{attendee.name}</Text>
                    {attendee.rsvp_status && (
                      <Text style={styles.attendeeStatus}>{attendee.rsvp_status}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Officer/President Actions */}
        {isOfficerOrPresident() && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Management</Text>
            <View style={styles.managementCard}>
              <TouchableOpacity
                style={styles.managementButton}
                onPress={() => navigation.navigate('QRDisplay', { eventId })}
                activeOpacity={0.7}
              >
                <View style={styles.managementButtonIcon}>
                  <Ionicons name="qr-code-outline" size={22} color={colors.primary} />
                </View>
                <Text style={styles.managementButtonText}>Show QR Code</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>

              <View style={styles.managementDivider} />

              <TouchableOpacity
                style={styles.managementButton}
                onPress={() => navigation.navigate('ManageAttendees', { eventId })}
                activeOpacity={0.7}
              >
                <View style={styles.managementButtonIcon}>
                  <Ionicons name="people-outline" size={22} color={colors.primary} />
                </View>
                <Text style={styles.managementButtonText}>Manage Attendees</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Related Events from Same Club */}
        {isAIEvent && relatedEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>More from {event.club_name || 'This Club'}</Text>
            <View style={styles.relatedEventsCard}>
              {relatedEvents.slice(0, 3).map((relEvent, index) => (
                <TouchableOpacity
                  key={relEvent.id || index}
                  style={[
                    styles.relatedEventRow,
                    index < Math.min(relatedEvents.length, 3) - 1 && styles.relatedEventRowBorder,
                  ]}
                  onPress={() => navigation.push('EventDetail', { eventId: relEvent.id, source: 'feed' })}
                  activeOpacity={0.7}
                >
                  <View style={styles.relatedEventInfo}>
                    <Text style={styles.relatedEventName} numberOfLines={1}>
                      {relEvent.name || relEvent.title}
                    </Text>
                    <Text style={styles.relatedEventDate}>
                      {relEvent.date || relEvent.start_date
                        ? formatDateTime(relEvent.date || relEvent.start_date)
                        : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* Share Modal */}
      <ShareEventModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        event={event}
        navigation={navigation}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
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
  shareButton: {
    padding: spacing.sm,
  },
  headerSpacer: {
    width: 40,
  },

  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  // Event Info Card
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  eventName: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  typeBadgeText: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 12,
  },
  freeFoodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success + '15',
    borderWidth: 1,
    borderColor: colors.success + '30',
  },
  freeFoodText: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 12,
    color: colors.success,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  detailIcon: {
    width: 28,
    alignItems: 'center',
    marginTop: 1,
  },
  detailText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },

  // Mini-map
  miniMapContainer: {
    height: 160,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
    position: 'relative',
  },
  miniMap: {
    ...StyleSheet.absoluteFillObject,
  },
  directionsOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    gap: 4,
    ...shadows.sm,
  },
  directionsOverlayText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textInverse,
  },

  // Section
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },

  // Description
  descriptionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  descriptionText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },

  // RSVP
  rsvpCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  rsvpButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rsvpButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  rsvpButtonText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  rsvpLoading: {
    marginTop: spacing.sm,
  },

  // Known Attendees
  attendeesCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  attendeeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  attendeeInitial: {
    ...typography.h3,
    fontSize: 16,
    color: colors.primary,
  },
  attendeeInfo: {
    flex: 1,
  },
  attendeeName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  attendeeStatus: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Management section
  managementCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  managementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  managementButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  managementButtonText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
    flex: 1,
  },
  managementDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: spacing.lg + 40 + spacing.md,
  },

  // Club Header (AI events)
  clubHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  clubHeaderImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: spacing.md,
  },
  clubHeaderImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  clubHeaderInitial: {
    ...typography.h3,
    fontSize: 18,
    color: colors.primary,
  },
  clubHeaderInfo: {
    flex: 1,
  },
  clubHeaderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clubHeaderName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  clubHeaderSub: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Original Post Section
  originalPostSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },

  // Image Carousel
  carouselContainer: {
    position: 'relative',
  },
  carouselImage: {
    width: CAROUSEL_WIDTH,
    height: CAROUSEL_HEIGHT,
    backgroundColor: colors.borderLight,
  },
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Post Stats
  postStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  postStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postStatText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  postTimestamp: {
    ...typography.caption,
    color: colors.textTertiary,
    marginLeft: 'auto',
  },

  // Caption
  captionContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  captionText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  readMore: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },

  // View on Instagram
  viewOnInstagram: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  viewOnInstagramText: {
    ...typography.bodySmall,
    color: '#E4405F',
    fontWeight: '500',
  },

  // AI Detail rows
  aiDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  aiDetailText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 22,
  },

  // Cost section
  freeBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  freeBadgeLargeText: {
    ...typography.body,
    color: colors.success,
    fontWeight: '600',
  },
  costText: {
    ...typography.body,
    color: colors.textSecondary,
  },

  // Access badge
  accessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  accessBadgeText: {
    ...typography.body,
    fontWeight: '600',
  },

  // Chips (perks, tags)
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  perkChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent + '12',
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  perkChipText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  tagChipText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },

  // Interaction buttons
  interactionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  interactionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  interactionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  interactionButtonActive: {
    backgroundColor: colors.warning + '12',
    borderColor: colors.warning,
  },
  interactionButtonActiveGoing: {
    backgroundColor: colors.success + '12',
    borderColor: colors.success,
  },
  interactionButtonActiveSaved: {
    backgroundColor: colors.primary + '12',
    borderColor: colors.primary,
  },
  interactionButtonText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '500',
  },

  // RSVP Link button
  rsvpLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    gap: spacing.sm,
    ...shadows.md,
  },
  rsvpLinkButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },

  // Calendar button
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  calendarButtonText: {
    ...typography.button,
    color: colors.primary,
  },

  // Original post button
  originalPostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  originalPostButtonText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // Related events
  relatedEventsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  relatedEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  relatedEventRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  relatedEventInfo: {
    flex: 1,
  },
  relatedEventName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  relatedEventDate: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
});

export default EventDetailScreen;

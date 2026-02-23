import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { Dimensions } from 'react-native';
import { clubsAPI, eventFeedAPI, clubFollowsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import ShareToChatModal from '../components/ShareToChatModal';

const CATEGORY_ICONS = {
  tech: 'hardware-chip',
  academic: 'school',
  social: 'people',
  sports: 'football',
  arts: 'color-palette',
  professional: 'briefcase',
  cultural: 'globe',
  general: 'apps',
  other: 'ellipsis-horizontal',
};

const CATEGORY_LABELS = {
  tech: 'Technology',
  academic: 'Academic',
  social: 'Social',
  sports: 'Sports',
  arts: 'Arts',
  professional: 'Professional',
  cultural: 'Cultural',
  general: 'General',
  other: 'Other',
};

function getClubColor(name) {
  const palette = [
    '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
    '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
  ];
  if (!name) return palette[0];
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % palette.length;
  return palette[idx];
}

const ClubDetailScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { clubId } = route.params;
  const { user } = useAuth();
  const [club, setClub] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [showShareChat, setShowShareChat] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const fetchClub = useCallback(async () => {
    try {
      const response = await clubsAPI.get(clubId);
      setClub(response.data);
      setIsFollowing(!!response.data.is_following);
    } catch (err) {
      Alert.alert('Error', 'Failed to load club', [
        { text: 'Go Back', onPress: () => navigation.goBack() },
      ]);
    }
  }, [clubId, navigation]);

  const fetchClubEvents = useCallback(async () => {
    try {
      setEventsLoading(true);
      // Only fetch events that belong to this club via the AI event feed
      const response = await eventFeedAPI.list({ club_id: clubId });
      const feedEvents = response.data.events || response.data || [];
      setEvents(feedEvents);
    } catch (error) {
      console.warn('Failed to fetch club events:', error?.message);
    } finally {
      setEventsLoading(false);
    }
  }, [clubId]);

  const fetchClubPosts = useCallback(async () => {
    try {
      setPostsLoading(true);
      const response = await clubsAPI.getPosts(clubId);
      setPosts(response.data.posts || []);
    } catch (error) {
      console.warn('Failed to fetch club posts:', error?.message);
    } finally {
      setPostsLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchClub(), fetchClubEvents(), fetchClubPosts()]);
      setLoading(false);
    };
    init();
  }, [fetchClub, fetchClubEvents, fetchClubPosts]);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchClub();
      fetchClubEvents();
      fetchClubPosts();
    });
    return unsubscribe;
  }, [navigation, fetchClub, fetchClubEvents, fetchClubPosts]);

  const handleJoin = async () => {
    try {
      setJoining(true);
      await clubsAPI.join(clubId);
      await fetchClub(); // Refresh to get updated membership
      Alert.alert('Joined!', 'You are now a member of this club.');
    } catch (error) {
      const msg = error.response?.data?.error || 'Failed to join club';
      Alert.alert('Error', msg);
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    Alert.alert(
      'Leave Club',
      `Are you sure you want to leave ${club.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              setJoining(true);
              await clubsAPI.leave(clubId);
              await fetchClub();
              Alert.alert('Left', 'You have left this club.');
            } catch (error) {
              const msg = error.response?.data?.error || 'Failed to leave club';
              Alert.alert('Error', msg);
            } finally {
              setJoining(false);
            }
          },
        },
      ]
    );
  };

  const handleFollowToggle = async () => {
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setFollowLoading(true);
    try {
      if (wasFollowing) {
        await clubFollowsAPI.unfollow(clubId);
      } else {
        await clubFollowsAPI.follow(clubId);
      }
    } catch (error) {
      setIsFollowing(wasFollowing);
      Alert.alert('Error', `Failed to ${wasFollowing ? 'unfollow' : 'follow'} club`);
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!club) return null;

  const initial = (club.name || '?')[0].toUpperCase();
  const clubColor = getClubColor(club.name);
  const userRole = club.user_role;
  const isPresident = userRole === 'president';
  const isOfficer = userRole === 'officer';
  const isMember = !!userRole;
  const canCreateEvent = isPresident || isOfficer;
  const displayMembers = (club.members || []).slice(0, 5);
  const totalMembers = club.member_count || (club.members || []).length;

  const formatDate = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Club</Text>
        <TouchableOpacity onPress={() => setShowShareChat(true)} style={styles.backButton}>
          <Ionicons name="share-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Club Profile Header */}
        <View style={styles.profileHeader}>
          {club.profile_image_url ? (
            <Image source={{ uri: club.profile_image_url }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: clubColor }]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <Text style={styles.clubName}>{club.name}</Text>

          {/* Instagram handle */}
          {club.instagram_handle && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`https://instagram.com/${club.instagram_handle}`)}
              style={styles.handleRow}
            >
              <Ionicons name="logo-instagram" size={16} color={colors.primary} />
              <Text style={styles.handleText}>@{club.instagram_handle}</Text>
            </TouchableOpacity>
          )}

          {/* Category badge */}
          {club.category && (
            <View style={styles.categoryBadge}>
              <Ionicons
                name={CATEGORY_ICONS[club.category] || 'apps'}
                size={14}
                color={colors.primary}
              />
              <Text style={styles.categoryText}>
                {CATEGORY_LABELS[club.category] || club.category}
              </Text>
            </View>
          )}

          {/* School */}
          {club.school_name && (
            <View style={styles.schoolRow}>
              <Ionicons name="school-outline" size={16} color={colors.textTertiary} />
              <Text style={styles.schoolText}>{club.school_name}</Text>
            </View>
          )}

          {/* Stats row */}
          <View style={styles.statsRow}>
            {(club.follower_count || 0) > 0 && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{Number(club.follower_count).toLocaleString()}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
            )}
            {(club.following_count || 0) > 0 && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{Number(club.following_count).toLocaleString()}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </View>
            )}
            {(club.media_count || 0) > 0 && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{Number(club.media_count).toLocaleString()}</Text>
                <Text style={styles.statLabel}>Posts</Text>
              </View>
            )}
          </View>
        </View>

        {/* Instagram Bio */}
        {club.bio && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>BIO</Text>
            <Text style={styles.descriptionText}>{club.bio}</Text>
          </View>
        )}

        {/* Join / Leave / President status */}
        <View style={styles.actionSection}>
          {isPresident ? (
            <View style={styles.presidentBadge}>
              <Ionicons name="star" size={18} color={colors.warning} />
              <Text style={styles.presidentText}>You're the president</Text>
            </View>
          ) : isMember ? (
            <Button
              title="Leave Club"
              onPress={handleLeave}
              variant="outline"
              loading={joining}
              fullWidth
              icon={<Ionicons name="exit-outline" size={18} color={colors.primary} />}
            />
          ) : (
            <Button
              title="Join Club"
              onPress={handleJoin}
              loading={joining}
              fullWidth
              icon={<Ionicons name="add-circle-outline" size={18} color={colors.textInverse} />}
            />
          )}

          {/* Follow / Unfollow toggle (independent from membership) */}
          <TouchableOpacity
            style={[styles.followButton, isFollowing && styles.followButtonActive]}
            onPress={handleFollowToggle}
            activeOpacity={0.7}
            disabled={followLoading}
          >
            <Ionicons
              name={isFollowing ? 'heart' : 'heart-outline'}
              size={18}
              color={isFollowing ? '#EF4444' : colors.primary}
            />
            <Text style={[styles.followButtonText, isFollowing && styles.followButtonTextActive]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Description */}
        {club.description && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>ABOUT</Text>
            <Text style={styles.descriptionText}>{club.description}</Text>
          </View>
        )}

        {/* Members */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>MEMBERS</Text>
            {totalMembers > 5 && (
              <TouchableOpacity
                onPress={() => navigation.navigate('ClubMembers', { clubId, clubName: club.name })}
              >
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            )}
          </View>
          {displayMembers.length > 0 ? (
            displayMembers.map((member) => (
              <View key={member.user_id} style={styles.memberRow}>
                <View
                  style={[
                    styles.memberAvatar,
                    { backgroundColor: getClubColor(member.display_name || 'U') },
                  ]}
                >
                  <Text style={styles.memberAvatarText}>
                    {(member.display_name || 'U')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member.display_name || 'Member'}
                  </Text>
                  {member.role !== 'member' && (
                    <Text style={styles.memberRole}>
                      {member.role === 'president' ? 'President' : 'Officer'}
                    </Text>
                  )}
                </View>
                {member.role === 'president' && (
                  <Ionicons name="star" size={16} color={colors.warning} />
                )}
                {member.role === 'officer' && (
                  <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
                )}
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No members yet</Text>
          )}
        </View>

        {/* Recent Posts */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>RECENT POSTS</Text>
          {postsLoading ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ paddingVertical: spacing.md }}
            />
          ) : posts.length > 0 ? (
            <View style={styles.postsGrid}>
              {posts.map((post) => {
                const thumb = Array.isArray(post.image_urls) && post.image_urls.length > 0
                  ? post.image_urls[0]
                  : null;
                return (
                  <TouchableOpacity
                    key={post.id}
                    style={styles.postGridItem}
                    onPress={() => {
                      if (post.post_url) {
                        Linking.openURL(post.post_url).catch(() => {});
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    {thumb ? (
                      <Image source={{ uri: thumb }} style={styles.postGridImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.postGridPlaceholder}>
                        <Ionicons name="image-outline" size={24} color={colors.textTertiary} />
                      </View>
                    )}
                    {Array.isArray(post.image_urls) && post.image_urls.length > 1 && (
                      <View style={styles.multiImageBadge}>
                        <Ionicons name="copy-outline" size={12} color="#FFFFFF" />
                      </View>
                    )}
                    {/* Stats overlay */}
                    <View style={styles.postGridOverlay}>
                      {post.likes_count != null && (
                        <View style={styles.postGridStat}>
                          <Ionicons name="heart" size={12} color="#FFFFFF" />
                          <Text style={styles.postGridStatText}>
                            {post.likes_count >= 1000 ? `${(post.likes_count / 1000).toFixed(1)}K` : post.likes_count}
                          </Text>
                        </View>
                      )}
                      {post.comments_count != null && (
                        <View style={styles.postGridStat}>
                          <Ionicons name="chatbubble" size={11} color="#FFFFFF" />
                          <Text style={styles.postGridStatText}>{post.comments_count}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyEvents}>
              <Ionicons name="images-outline" size={32} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No posts yet</Text>
            </View>
          )}
        </View>

        {/* Upcoming Events */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>UPCOMING EVENTS</Text>
            {canCreateEvent && (
              <TouchableOpacity
                onPress={() => navigation.navigate('NewEvent', { clubId })}
              >
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
          {eventsLoading ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ paddingVertical: spacing.md }}
            />
          ) : events.length > 0 ? (
            events.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={styles.eventCard}
                onPress={() =>
                  navigation.navigate('EventDetail', {
                    eventId: event.id,
                    source: 'feed',
                  })
                }
                activeOpacity={0.7}
              >
                <View style={styles.eventIcon}>
                  <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventName} numberOfLines={1}>
                    {event.name}
                  </Text>
                  <Text style={styles.eventDate}>{formatDate(event.event_date)}</Text>
                  {event.location && (
                    <View style={styles.eventLocationRow}>
                      <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
                      <Text style={styles.eventLocation} numberOfLines={1}>
                        {event.location}
                      </Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyEvents}>
              <Ionicons name="calendar-outline" size={32} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No upcoming events</Text>
              {canCreateEvent && (
                <TouchableOpacity
                  style={styles.createEventButton}
                  onPress={() => navigation.navigate('NewEvent', { clubId })}
                  activeOpacity={0.7}
                >
                  <Text style={styles.createEventText}>Create Event</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Share to Chat Modal */}
      {club && (
        <ShareToChatModal
          visible={showShareChat}
          onClose={() => setShowShareChat(false)}
          messageType="club_card"
          content={`Shared a club: ${club.name}`}
          metadata={{
            club_id: club.id,
            club_name: club.name,
            category: club.category,
            image_url: club.profile_image_url,
            instagram_handle: club.instagram_handle,
            member_count: club.member_count,
          }}
          preview={{
            title: club.name,
            subtitle: club.category ? (CATEGORY_LABELS[club.category] || club.category) : undefined,
            imageUrl: club.profile_image_url,
          }}
          shareUrl={club.instagram_handle ? `https://instagram.com/${club.instagram_handle}` : undefined}
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
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },

  // Profile Header
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  avatarText: {
    color: colors.textInverse,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 2,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
  },
  handleText: {
    ...typography.bodySmall,
    color: colors.primary,
  },
  clubName: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  categoryText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  schoolText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },

  // Action Section
  actionSection: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  presidentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  presidentText: {
    ...typography.body,
    color: '#92400E',
    fontWeight: '600',
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  followButtonActive: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  followButtonText: {
    ...typography.button,
    color: colors.primary,
    fontSize: 14,
  },
  followButtonTextActive: {
    color: '#EF4444',
  },

  // Section Card
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  seeAllText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  descriptionText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
    marginTop: spacing.xs,
  },

  // Members
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  memberAvatarText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  memberRole: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    textTransform: 'capitalize',
    marginTop: 1,
  },

  // Events
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  eventIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  eventDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  eventLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  eventLocation: {
    ...typography.caption,
    color: colors.textTertiary,
    flex: 1,
  },

  // Empty states
  emptyEvents: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  createEventButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  createEventText: {
    ...typography.button,
    color: colors.primary,
    fontSize: 14,
  },

  // Posts Grid
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    gap: 2,
  },
  postGridItem: {
    width: Math.floor((Dimensions.get('window').width - spacing.md * 2 - spacing.lg * 2 - 2 - 2 * 2) / 3),
    aspectRatio: 1,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  postGridImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.borderLight,
  },
  postGridPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiImageBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    padding: 2,
  },
  postGridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  postGridStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  postGridStatText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },

  bottomSpacer: {
    height: spacing.xxl,
  },
});

export default ClubDetailScreen;

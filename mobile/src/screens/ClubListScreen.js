import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { clubsAPI, clubFollowsAPI } from '../services/api';
import TabHeaderBar from '../components/TabHeaderBar';
import FilterRow from '../components/FilterRow';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'academic', label: 'Academic' },
  { key: 'professional', label: 'Professional' },
  { key: 'social', label: 'Social' },
  { key: 'sports', label: 'Sports' },
  { key: 'cultural', label: 'Cultural' },
  { key: 'service', label: 'Service' },
  { key: 'religious', label: 'Religious' },
  { key: 'arts', label: 'Arts' },
  { key: 'greek_life', label: 'Greek Life' },
  { key: 'other', label: 'Other' },
];

const CLUB_ADVANCED_FILTERS = [
  {
    key: 'membership',
    label: 'Membership',
    icon: 'people-outline',
    options: [
      { key: 'all', label: 'All' },
      { key: 'mine', label: 'My Clubs' },
      { key: 'following', label: 'Following' },
    ],
  },
  {
    key: 'sort',
    label: 'Sort By',
    icon: 'swap-vertical-outline',
    options: [
      { key: 'popular', label: 'Popular' },
      { key: 'newest', label: 'Newest' },
      { key: 'az', label: 'A-Z' },
    ],
  },
];

const ClubListScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [myClubs, setMyClubs] = useState([]);
  const [allClubs, setAllClubs] = useState([]);
  const [followedClubIds, setFollowedClubIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeAdvanced, setActiveAdvanced] = useState({ membership: 'all', sort: 'popular' });

  const handleAdvancedChange = (groupKey, optionKey) => {
    setActiveAdvanced((prev) => ({ ...prev, [groupKey]: optionKey }));
  };

  const fetchClubs = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const params = {};
      if (activeCategory !== 'all') params.category = activeCategory;

      const [myRes, allRes, followsRes] = await Promise.allSettled([
        clubsAPI.list({ ...params, membership: 'mine' }),
        clubsAPI.list(params),
        clubFollowsAPI.myClubs(),
      ]);

      if (myRes.status === 'fulfilled') {
        setMyClubs(myRes.value.data.clubs || myRes.value.data || []);
      }
      if (allRes.status === 'fulfilled') {
        setAllClubs(allRes.value.data.clubs || allRes.value.data || []);
      }
      if (followsRes.status === 'fulfilled') {
        const followedClubs = followsRes.value.data.clubs || followsRes.value.data || [];
        setFollowedClubIds(new Set(followedClubs.map((c) => c.id || c.club_id)));
      }
    } catch (error) {
      console.warn('Failed to fetch clubs:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    fetchClubs();
  }, [fetchClubs]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchClubs();
    });
    return unsubscribe;
  }, [navigation, fetchClubs]);

  const getCategoryColor = (category) => {
    const colorMap = {
      academic: '#3B82F6',
      professional: '#7C3AED',
      social: '#EC4899',
      sports: '#EF4444',
      cultural: '#F59E0B',
      service: '#10B981',
      religious: '#8B5CF6',
      arts: '#F97316',
      greek_life: '#06B6D4',
      other: colors.textTertiary,
    };
    return colorMap[category] || colors.textTertiary;
  };

  const getCategoryLabel = (category) => {
    const labelMap = {
      academic: 'Academic',
      professional: 'Professional',
      social: 'Social',
      sports: 'Sports',
      cultural: 'Cultural',
      service: 'Service',
      religious: 'Religious',
      arts: 'Arts',
      greek_life: 'Greek Life',
      other: 'Other',
    };
    return labelMap[category] || category || 'Club';
  };

  const handleFollowToggle = async (clubId) => {
    try {
      const isFollowed = followedClubIds.has(clubId);
      if (isFollowed) {
        await clubFollowsAPI.unfollow(clubId);
        setFollowedClubIds((prev) => {
          const next = new Set(prev);
          next.delete(clubId);
          return next;
        });
      } else {
        await clubFollowsAPI.follow(clubId);
        setFollowedClubIds((prev) => new Set(prev).add(clubId));
      }
    } catch (error) {
      console.warn('Failed to toggle follow:', error?.message);
    }
  };

  // Filter clubs by search query (client-side)
  const filterBySearch = (clubs) => {
    if (!searchQuery.trim()) return clubs;
    const q = searchQuery.toLowerCase().trim();
    return clubs.filter(
      (club) =>
        (club.name || '').toLowerCase().includes(q) ||
        (club.category || '').toLowerCase().includes(q)
    );
  };

  const filteredMyClubs = filterBySearch(myClubs);
  const filteredAllClubs = filterBySearch(allClubs);

  // Remove clubs in "My Clubs" from "Browse All" to avoid duplication
  const myClubIds = new Set(filteredMyClubs.map((c) => c.id));
  const browseClubs = filteredAllClubs.filter((c) => !myClubIds.has(c.id));

  const renderClubCard = (club) => {
    const catColor = getCategoryColor(club.category);
    const initial = (club.name || '?').charAt(0).toUpperCase();
    const isFollowed = followedClubIds.has(club.id);

    return (
      <TouchableOpacity
        key={club.id}
        style={styles.clubCard}
        onPress={() => navigation.navigate('ClubDetail', { clubId: club.id })}
        activeOpacity={0.7}
      >
        <View style={styles.clubRow}>
          {club.profile_image_url ? (
            <Image source={{ uri: club.profile_image_url }} style={styles.clubLogoImage} />
          ) : (
            <View style={[styles.clubLogo, { backgroundColor: catColor + '15' }]}>
              <Text style={[styles.clubLogoText, { color: catColor }]}>{initial}</Text>
            </View>
          )}
          <View style={styles.clubInfo}>
            <View style={styles.clubNameRow}>
              <Text style={styles.clubName} numberOfLines={1}>{club.name}</Text>
              {club.is_registered === true && (
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={styles.verifiedBadge} />
              )}
            </View>
            <View style={styles.clubMeta}>
              <View style={[styles.categoryBadge, { backgroundColor: catColor + '15', borderColor: catColor + '30' }]}>
                <Text style={[styles.categoryBadgeText, { color: catColor }]}>
                  {getCategoryLabel(club.category)}
                </Text>
              </View>
              {(club.follower_count || 0) > 0 && (
                <View style={styles.followerRow}>
                  <Ionicons name="logo-instagram" size={12} color="#E4405F" />
                  <Text style={styles.memberCountText}>
                    {Number(club.follower_count).toLocaleString()}
                  </Text>
                </View>
              )}
              <View style={styles.memberCountRow}>
                <Ionicons name="people-outline" size={13} color={colors.textTertiary} />
                <Text style={styles.memberCountText}>
                  {club.member_count || 0} {(club.member_count || 0) === 1 ? 'member' : 'members'}
                </Text>
              </View>
              {club.ranking_score != null && (
                <View style={styles.rankingScoreRow}>
                  <Ionicons name="trending-up-outline" size={12} color={colors.textTertiary} />
                  <Text style={styles.rankingScoreText}>{club.ranking_score}</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={styles.followButton}
            onPress={(e) => {
              e.stopPropagation?.();
              handleFollowToggle(club.id);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <Ionicons
              name={isFollowed ? 'heart' : 'heart-outline'}
              size={22}
              color={isFollowed ? colors.error : colors.textTertiary}
            />
          </TouchableOpacity>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  const sortClubs = (clubs) => {
    if (activeAdvanced.sort === 'az') {
      return [...clubs].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    if (activeAdvanced.sort === 'newest') {
      return [...clubs].sort((a, b) =>
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
    }
    // popular (default) - sort by member_count desc
    return [...clubs].sort((a, b) => (b.member_count || 0) - (a.member_count || 0));
  };

  // Build a flat data array with section headers for FlatList
  const buildListData = () => {
    const data = [];

    if (activeAdvanced.membership === 'mine') {
      const sorted = sortClubs(filteredMyClubs);
      if (sorted.length > 0) {
        data.push({ type: 'header', key: 'header-my', label: 'MY CLUBS' });
        sorted.forEach((club) => data.push({ type: 'club', key: `my-${club.id}`, club }));
      }
      return data;
    }

    if (activeAdvanced.membership === 'following') {
      const followedAll = sortClubs(
        filteredAllClubs.filter((c) => followedClubIds.has(c.id))
      );
      if (followedAll.length > 0) {
        data.push({ type: 'header', key: 'header-following', label: 'FOLLOWING' });
        followedAll.forEach((club) => data.push({ type: 'club', key: `fol-${club.id}`, club }));
      }
      return data;
    }

    // 'all' membership
    const sortedMy = sortClubs(filteredMyClubs);
    if (sortedMy.length > 0) {
      data.push({ type: 'header', key: 'header-my', label: 'MY CLUBS' });
      sortedMy.forEach((club) => data.push({ type: 'club', key: `my-${club.id}`, club }));
    }

    const sortedBrowse = sortClubs(browseClubs);
    if (sortedBrowse.length > 0) {
      data.push({ type: 'header', key: 'header-browse', label: 'BROWSE ALL' });
      sortedBrowse.forEach((club) => data.push({ type: 'club', key: `all-${club.id}`, club }));
    }

    return data;
  };

  const listData = buildListData();

  const renderItem = ({ item }) => {
    if (item.type === 'header') {
      return <Text style={styles.sectionLabel}>{item.label}</Text>;
    }
    return renderClubCard(item.club);
  };

  const renderHeader = () => (
    <View style={styles.listHeader}>
      <FilterRow
        filters={CATEGORIES}
        activeFilter={activeCategory}
        onFilterChange={setActiveCategory}
        advancedFilters={CLUB_ADVANCED_FILTERS}
        activeAdvanced={activeAdvanced}
        onAdvancedChange={handleAdvancedChange}
        style={{ marginBottom: spacing.sm }}
      />
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.empty}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="people-outline" size={64} color={colors.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>No clubs found</Text>
        <Text style={styles.emptySubtitle}>
          {searchQuery
            ? `No clubs match "${searchQuery}". Try a different search.`
            : 'There are no clubs available yet. Be the first to create one!'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TabHeaderBar
        title="Clubs"
        navigation={navigation}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchClear={() => setSearchQuery('')}
        searchPlaceholder="Search clubs..."
      />

      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchClubs(true)}
            tintColor={colors.primary}
          />
        }
        ListFooterComponent={
          loading ? (
            <ActivityIndicator style={styles.loadingFooter} size="large" color={colors.primary} />
          ) : null
        }
        contentContainerStyle={
          listData.length === 0 && !loading ? styles.emptyListContainer : styles.listContent
        }
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateClub')}
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


  // Section labels
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  // Club card
  clubCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clubLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  clubLogoImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: spacing.md,
  },
  clubLogoText: {
    ...typography.h2,
    fontSize: 20,
    fontWeight: '700',
  },
  followerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  clubInfo: {
    flex: 1,
  },
  clubNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  clubName: {
    ...typography.h3,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  verifiedBadge: {
    marginLeft: 4,
  },
  clubMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  categoryBadgeText: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 11,
  },
  memberCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberCountText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  rankingScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  rankingScoreText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '500',
    fontSize: 11,
  },
  followButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
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

export default ClubListScreen;

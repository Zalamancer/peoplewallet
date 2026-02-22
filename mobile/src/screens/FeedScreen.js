import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Linking,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { feedAPI } from '../services/api';
import FeedCard from '../components/FeedCard';
import PostViewModal from '../components/PostViewModal';
import TabHeaderBar from '../components/TabHeaderBar';
import FilterRow from '../components/FilterRow';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const FEED_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter', label: 'X' },
  { key: 'event', label: 'Events' },
];

const FEED_ADVANCED_FILTERS = [
  {
    key: 'recency',
    label: 'Recency',
    icon: 'time-outline',
    options: [
      { key: 'all', label: 'All Time' },
      { key: '24h', label: 'Last 24h' },
      { key: 'week', label: 'This Week' },
      { key: 'month', label: 'This Month' },
    ],
  },
  {
    key: 'sort',
    label: 'Sort By',
    icon: 'swap-vertical-outline',
    options: [
      { key: 'latest', label: 'Latest' },
      { key: 'contact', label: 'By Contact' },
    ],
  },
];

const FeedScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [error, setError] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeAdvanced, setActiveAdvanced] = useState({ recency: 'all', sort: 'latest' });

  const handleAdvancedChange = (groupKey, optionKey) => {
    setActiveAdvanced((prev) => ({ ...prev, [groupKey]: optionKey }));
  };

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fetchFeed = useCallback(
    async (page = 1, isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else if (page === 1) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }

        setError(null);

        const response = await feedAPI.list({ page, limit: 20 });
        const { items: data, pagination: pag } = response.data;

        if (page === 1) {
          setItems(data);
          // Fade in animation for fresh load
          fadeAnim.setValue(0);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start();
        } else {
          setItems((prev) => [...prev, ...data]);
        }
        setPagination(pag);
      } catch (err) {
        console.warn('Failed to fetch feed:', err?.message);
        setError('Unable to load feed. Pull to retry.');
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [fadeAnim]
  );

  useEffect(() => {
    fetchFeed(1);
  }, [fetchFeed]);

  // Refresh when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchFeed(1);
    });
    return unsubscribe;
  }, [navigation, fetchFeed]);

  const handleRefresh = () => {
    fetchFeed(1, true);
  };

  const handleLoadMore = () => {
    if (pagination.page < pagination.totalPages && !loadingMore && !loading) {
      fetchFeed(pagination.page + 1);
    }
  };

  const handleViewProfile = (item) => {
    if (item.contact_id) {
      navigation.navigate('ContactDetail', { contactId: item.contact_id });
    }
  };

  const handleOpenPost = (item) => {
    // Event cards don't have external content URLs
    if (item.platform === 'event' && item.contact_id) {
      navigation.navigate('ContactDetail', { contactId: item.contact_id });
      return;
    }
    // If we have embed data or thumbnail, open in-app modal
    if (item.html_embed || item.thumbnail_url || item.embed_description) {
      setSelectedPost(item);
      return;
    }
    // Fallback to external browser
    if (item.content_url) {
      Linking.openURL(item.content_url).catch(() => {});
    }
  };

  const filteredItems = useMemo(() => {
    let result = items;
    if (activeFilter !== 'all') {
      result = result.filter((item) => item.platform === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((item) =>
        (item.contact_name || '').toLowerCase().includes(q)
      );
    }
    // Recency filter
    if (activeAdvanced.recency !== 'all') {
      const now = Date.now();
      const cutoffs = { '24h': 86400000, week: 604800000, month: 2592000000 };
      const cutoff = cutoffs[activeAdvanced.recency];
      if (cutoff) {
        result = result.filter((item) => {
          const ts = new Date(item.fetched_at || item.created_at || 0).getTime();
          return now - ts <= cutoff;
        });
      }
    }
    // Sort
    if (activeAdvanced.sort === 'contact') {
      result = [...result].sort((a, b) =>
        (a.contact_name || '').localeCompare(b.contact_name || '')
      );
    }
    return result;
  }, [items, activeFilter, searchQuery, activeAdvanced]);

  const renderItem = ({ item }) => (
    <FeedCard
      item={item}
      onViewProfile={handleViewProfile}
      onOpenPost={handleOpenPost}
    />
  );

  const renderEmpty = () => (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrapper}>
        <Ionicons name="newspaper-outline" size={48} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>Your For You page is empty</Text>
      <Text style={styles.emptySubtitle}>
        Add contacts with social profiles (Instagram,{'\n'}
        LinkedIn, Twitter) to see their latest updates here.
      </Text>
      <View style={styles.emptyHint}>
        <Ionicons name="arrow-down-outline" size={16} color={colors.textTertiary} />
        <Text style={styles.emptyHintText}>
          Go to Contacts and add social links
        </Text>
      </View>
    </View>
  );

  const renderError = () => (
    <View style={styles.empty}>
      <Ionicons name="cloud-offline-outline" size={48} color={colors.textTertiary} style={{ marginBottom: spacing.md }} />
      <Text style={styles.emptyTitle}>Something went wrong</Text>
      <Text style={styles.emptySubtitle}>{error}</Text>
    </View>
  );

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (items.length > 0 && pagination.page >= pagination.totalPages) {
      return (
        <View style={styles.footerEnd}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>You're all caught up</Text>
          <View style={styles.footerDivider} />
        </View>
      );
    }
    return null;
  };

  const updatesBadge = (
    <View style={styles.titleBadge}>
      <Ionicons name="pulse" size={14} color={colors.accent} />
      <Text style={styles.titleBadgeText}>{pagination.total} updates</Text>
    </View>
  );

  if (loading && items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TabHeaderBar
          title="For You"
          navigation={navigation}
          showSearch={false}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your feed...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TabHeaderBar
        title="For You"
        navigation={navigation}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchClear={() => setSearchQuery('')}
        searchPlaceholder="Search by contact name..."
        rightContent={updatesBadge}
      />
      <FilterRow
        filters={FEED_FILTERS}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        advancedFilters={FEED_ADVANCED_FILTERS}
        activeAdvanced={activeAdvanced}
        onAdvancedChange={handleAdvancedChange}
        style={{ marginBottom: spacing.sm }}
      />

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.feed_id}
          renderItem={renderItem}
          ListEmptyComponent={error ? renderError : renderEmpty}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            items.length === 0 && !loading ? styles.emptyContainer : styles.listContent
          }
          // Smooth scrolling configuration
          decelerationRate="normal"
          snapToAlignment="start"
        />
      </Animated.View>

      {/* In-app post viewer modal */}
      <PostViewModal
        visible={!!selectedPost}
        onClose={() => setSelectedPost(null)}
        item={selectedPost}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  titleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    gap: 5,
    ...shadows.sm,
  },
  titleBadgeText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  listContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
  },

  // Loading state
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textTertiary,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
  },
  empty: {
    alignItems: 'center',
    paddingTop: SCREEN_HEIGHT * 0.15,
    paddingHorizontal: spacing.xl,
  },
  emptyIconWrapper: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadows.sm,
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
    marginBottom: spacing.lg,
  },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    ...shadows.sm,
  },
  emptyHintText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // Footer
  footer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  footerEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  footerDivider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  footerText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '500',
  },
});

export default FeedScreen;

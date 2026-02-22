import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { insightsAPI, contactsAPI } from '../services/api';
import InsightCard from '../components/InsightCard';
import NetworkingStatsCard from '../components/NetworkingStatsCard';

const InsightsScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [insights, setInsights] = useState([]);
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recapPeriod, setRecapPeriod] = useState('month');
  const [recapLoading, setRecapLoading] = useState(false);
  const [networkingStats, setNetworkingStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchNetworkingStats = useCallback(async () => {
    try {
      setStatsLoading(true);

      // Fetch total contacts count from contacts API
      const contactsRes = await contactsAPI.list({ limit: 1 });
      const totalContacts = contactsRes.data.pagination?.total || 0;

      // Try to fetch detailed stats from insights endpoint
      let contactsThisMonth = 0;
      let eventsAttended = 0;
      let topConnections = [];

      try {
        const statsRes = await insightsAPI.getRecap('month');
        const statsData = statsRes.data?.stats || {};
        contactsThisMonth = statsData.totalContacts || 0;
        eventsAttended = statsData.topEvents?.length || 0;

        // Build top connections from recap data if available
        if (statsData.topCompanies && statsData.topCompanies.length > 0) {
          topConnections = statsData.topCompanies.slice(0, 3).map((c) => ({
            name: c.name,
            score: Math.min(c.count * 20, 100),
          }));
        }
      } catch (statsErr) {
        console.warn('Could not fetch detailed stats:', statsErr);
      }

      setNetworkingStats({
        totalContacts,
        contactsThisMonth,
        eventsAttended,
        topConnections,
      });
    } catch (error) {
      console.warn('Failed to fetch networking stats:', error?.message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [insightsRes, recapRes] = await Promise.all([
        insightsAPI.getInsights(),
        insightsAPI.getRecap(recapPeriod),
      ]);

      setInsights(insightsRes.data.insights || []);
      setRecap(recapRes.data || null);
    } catch (error) {
      console.warn('Failed to fetch insights:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [recapPeriod]);

  useEffect(() => {
    fetchInsights();
    fetchNetworkingStats();
  }, [fetchInsights, fetchNetworkingStats]);

  // Refresh when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchInsights();
      fetchNetworkingStats();
    });
    return unsubscribe;
  }, [navigation, fetchInsights, fetchNetworkingStats]);

  const handleRecapPeriodChange = async (period) => {
    setRecapPeriod(period);
    setRecapLoading(true);
    try {
      const res = await insightsAPI.getRecap(period);
      setRecap(res.data || null);
    } catch (error) {
      console.warn('Failed to fetch recap:', error?.message);
    } finally {
      setRecapLoading(false);
    }
  };

  const handleContactPress = (contactId) => {
    navigation.navigate('ContactDetail', { contactId });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.screenTitle}>Insights</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Generating your insights...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.screenTitle}>Insights</Text>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              fetchInsights(true);
              fetchNetworkingStats();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {/* AI Nudge Banner */}
        <View style={styles.banner}>
          <Ionicons name="sparkles" size={20} color={colors.primary} />
          <Text style={styles.bannerText}>
            AI-powered insights about your network
          </Text>
        </View>

        {/* Networking Stats Section */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Networking Stats</Text>
          {statsLoading ? (
            <ActivityIndicator
              style={{ paddingVertical: spacing.lg }}
              color={colors.primary}
            />
          ) : networkingStats ? (
            <NetworkingStatsCard stats={networkingStats} />
          ) : null}
        </View>

        {/* Insight Cards */}
        {insights.length > 0 ? (
          insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onPress={() => handleInsightPress(insight, navigation)}
              onContactPress={handleContactPress}
            />
          ))
        ) : (
          <EmptyInsights />
        )}

        {/* Recap Section */}
        {recap && (
          <View style={styles.recapSection}>
            <View style={styles.recapHeader}>
              <Text style={styles.sectionTitle}>
                {recap.periodLabel || 'Recap'}
              </Text>
              <View style={styles.periodToggle}>
                <TouchableOpacity
                  style={[
                    styles.periodButton,
                    recapPeriod === 'month' && styles.periodButtonActive,
                  ]}
                  onPress={() => handleRecapPeriodChange('month')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.periodButtonText,
                      recapPeriod === 'month' && styles.periodButtonTextActive,
                    ]}
                  >
                    Month
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.periodButton,
                    recapPeriod === 'semester' && styles.periodButtonActive,
                  ]}
                  onPress={() => handleRecapPeriodChange('semester')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.periodButtonText,
                      recapPeriod === 'semester' && styles.periodButtonTextActive,
                    ]}
                  >
                    Semester
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {recapLoading ? (
              <ActivityIndicator style={{ paddingVertical: spacing.lg }} color={colors.primary} />
            ) : (
              <RecapCard recap={recap} />
            )}
          </View>
        )}

        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ──────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────

const EmptyInsights = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.empty}>
      <Ionicons name="bulb-outline" size={48} color={colors.textTertiary} style={{ marginBottom: spacing.md }} />
      <Text style={styles.emptyTitle}>No insights yet</Text>
      <Text style={styles.emptySubtitle}>
        As you add more contacts, we will generate personalized insights{'\n'}
        and suggestions to help you maintain your network.
      </Text>
    </View>
  );
};

const RecapCard = ({ recap }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { stats, message } = recap;

  if (!stats) return null;

  return (
    <View style={styles.recapCard}>
      {/* AI-generated recap message */}
      {message && (
        <View style={styles.recapMessage}>
          <Ionicons name="sparkles" size={16} color={colors.primary} />
          <Text style={styles.recapMessageText}>{message}</Text>
        </View>
      )}

      {/* Stats grid */}
      <View style={styles.recapStatsGrid}>
        <RecapStat
          icon="people-outline"
          value={stats.totalContacts}
          label="People Met"
          color="#007AFF"
        />
        <RecapStat
          icon="calendar-outline"
          value={stats.topEvents?.length || 0}
          label="Events"
          color="#FF9500"
        />
        <RecapStat
          icon="document-text-outline"
          value={stats.contactsWithNotes}
          label="With Notes"
          color="#34C759"
        />
      </View>

      {/* Top events */}
      {stats.topEvents && stats.topEvents.length > 0 && (
        <View style={styles.recapList}>
          <Text style={styles.recapListTitle}>Top Events</Text>
          {stats.topEvents.slice(0, 3).map((event, idx) => (
            <View key={idx} style={styles.recapListItem}>
              <Ionicons name="flag-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.recapListItemText} numberOfLines={1}>
                {event.name}
              </Text>
              <Text style={styles.recapListItemCount}>{event.count}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Top companies */}
      {stats.topCompanies && stats.topCompanies.length > 0 && (
        <View style={styles.recapList}>
          <Text style={styles.recapListTitle}>Top Companies</Text>
          {stats.topCompanies.slice(0, 3).map((company, idx) => (
            <View key={idx} style={styles.recapListItem}>
              <Ionicons name="business-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.recapListItemText} numberOfLines={1}>
                {company.name}
              </Text>
              <Text style={styles.recapListItemCount}>{company.count}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const RecapStat = ({ icon, value, label, color }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.recapStatItem}>
      <View style={[styles.recapStatIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.recapStatValue, { color }]}>{value}</Text>
      <Text style={styles.recapStatLabel}>{label}</Text>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────────────
// Navigation helper
// ──────────────────────────────────────────────────────────────────────

function handleInsightPress(insight, navigation) {
  // Navigate to relevant screen based on insight type
  if (insight.type === 'reconnect' && insight.data?.groups?.length > 0) {
    const firstContact = insight.data.groups[0]?.contacts?.[0];
    if (firstContact) {
      navigation.navigate('ContactDetail', { contactId: firstContact.id });
    }
  } else if (insight.type === 'suggestions' && insight.data?.contacts?.length > 0) {
    navigation.navigate('ContactDetail', { contactId: insight.data.contacts[0].id });
  }
}

// ──────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryBg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  bannerText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '500',
  },

  // Stats section
  statsSection: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },

  // Empty
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
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

  // Recap section
  recapSection: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  recapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: colors.borderLight,
    borderRadius: borderRadius.md,
    padding: 2,
  },
  periodButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  periodButtonActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  periodButtonText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  periodButtonTextActive: {
    color: colors.primary,
  },

  // Recap card
  recapCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  recapMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primaryBg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  recapMessageText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  recapStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
  },
  recapStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  recapStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  recapStatValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  recapStatLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
    fontSize: 11,
  },
  recapList: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  recapListTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  recapListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  recapListItemText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flex: 1,
  },
  recapListItemCount: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
  },
});

export default InsightsScreen;

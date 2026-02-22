import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { connectionsAPI } from '../services/api';

/**
 * MutualConnectionsScreen
 * Full list of mutual connections, accessible from:
 *   1. ContactDetailScreen (scoped to a single contact)
 *   2. Future: standalone screen showing all mutual connections
 *
 * Route params:
 *   - contactId (optional): if provided, shows mutual connections for that contact
 *   - contactName (optional): the contact's name for the header
 *   - connections (optional): pre-fetched connections array to avoid re-fetching
 */
const MutualConnectionsScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { contactId, contactName, connections: preloaded } = route.params || {};
  const [connections, setConnections] = useState(preloaded || []);
  const [loading, setLoading] = useState(!preloaded);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!preloaded) {
      fetchConnections();
    }
  }, [contactId]);

  const fetchConnections = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      let response;
      if (contactId) {
        response = await connectionsAPI.getMutualForContact(contactId);
      } else {
        response = await connectionsAPI.getAllMutual();
      }
      setConnections(response.data.connections || []);
    } catch (error) {
      console.warn('Failed to fetch mutual connections:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getHeaderTitle = () => {
    if (contactName) {
      const firstName = contactName.split(' ')[0];
      return `Mutual with ${firstName}`;
    }
    return 'Mutual Connections';
  };

  const renderConnectionItem = ({ item }) => {
    // For contact-scoped view: item has other_user_name, matched_on, etc.
    // For all-connections view: item has user_name, shared_count, shared_names
    const isContactScoped = !!contactId;

    if (isContactScoped) {
      return (
        <View style={styles.connectionCard}>
          <View style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.other_user_name) }]}>
              <Text style={styles.initials}>
                {getInitials(item.other_user_name)}
              </Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {item.other_user_name}
              </Text>
              <View style={styles.matchRow}>
                <Ionicons
                  name={getMatchIcon(item.matched_on)}
                  size={14}
                  color={colors.textTertiary}
                />
                <Text style={styles.matchText}>
                  Matched via {item.matched_on}
                </Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    // All-connections view
    return (
      <View style={styles.connectionCard}>
        <View style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.user_name) }]}>
            <Text style={styles.initials}>
              {getInitials(item.user_name)}
            </Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {item.user_name}
            </Text>
            <Text style={styles.sharedCount}>
              {item.shared_count} shared connection{parseInt(item.shared_count, 10) !== 1 ? 's' : ''}
            </Text>
            {item.shared_names && item.shared_names.length > 0 && (
              <Text style={styles.sharedNames} numberOfLines={1}>
                {item.shared_names.filter(Boolean).slice(0, 3).join(', ')}
              </Text>
            )}
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{item.shared_count}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Ionicons
        name="people-outline"
        size={64}
        color={colors.textTertiary}
        style={{ marginBottom: spacing.md }}
      />
      <Text style={styles.emptyTitle}>No mutual connections</Text>
      <Text style={styles.emptySubtitle}>
        {contactId
          ? 'No other users on PeopleWallet have this person saved yet.'
          : 'When other users save the same contacts as you, mutual connections will appear here.'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary */}
      {connections.length > 0 && (
        <View style={styles.summary}>
          <Ionicons name="people" size={18} color={colors.accent} />
          <Text style={styles.summaryText}>
            {connections.length} mutual connection{connections.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      <FlatList
        data={connections}
        keyExtractor={(item) => item.id || item.user_id || String(Math.random())}
        renderItem={renderConnectionItem}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchConnections(true)}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={
          connections.length === 0 ? styles.emptyContainer : styles.listContent
        }
      />
    </SafeAreaView>
  );
};

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name) {
  const palette = [
    '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
    '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
  ];
  if (!name) return palette[0];
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % palette.length;
  return palette[idx];
}

function getMatchIcon(matchType) {
  switch (matchType) {
    case 'linkedin':
      return 'logo-linkedin';
    case 'email':
      return 'mail-outline';
    case 'name':
      return 'person-outline';
    default:
      return 'link-outline';
  }
}

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
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  summaryText: {
    ...typography.bodySmall,
    color: colors.accent,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  connectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.sm,
  },
  initials: {
    color: colors.textInverse,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  matchText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  sharedCount: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sharedNames: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: spacing.sm,
  },
  countText: {
    ...typography.bodySmall,
    color: colors.accentDark,
    fontWeight: '700',
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
});

export default MutualConnectionsScreen;

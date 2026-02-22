import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { groupsAPI } from '../services/api';

const GroupsScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [groups, setGroups] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState([]);

  const fetchGroups = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [groupsRes, suggestionsRes] = await Promise.all([
        groupsAPI.list(),
        groupsAPI.getSuggestions(),
      ]);

      setGroups(groupsRes.data.groups);
      setSuggestions(suggestionsRes.data.suggestions);
    } catch (error) {
      console.warn('Failed to fetch groups:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchGroups();
    });
    return unsubscribe;
  }, [navigation, fetchGroups]);

  const handleAutoCreate = async (suggestion) => {
    try {
      const iconMap = { event: 'calendar', school: 'school', company: 'business' };
      const colorMap = { event: '#7C3AED', school: '#10B981', company: '#3B82F6' };

      await groupsAPI.autoCreate({
        name: suggestion.value,
        type: suggestion.type,
        value: suggestion.value,
        color: colorMap[suggestion.type] || '#007AFF',
        icon: iconMap[suggestion.type] || 'people',
      });

      Alert.alert('Group Created', `"${suggestion.value}" group created with ${suggestion.contact_count} contacts.`);
      fetchGroups();
    } catch (error) {
      const msg = error.response?.data?.error || 'Failed to create group';
      Alert.alert('Error', msg);
    }
  };

  const handleDismissSuggestion = (suggestion) => {
    setDismissedSuggestions((prev) => [...prev, `${suggestion.type}:${suggestion.value}`]);
  };

  const filteredSuggestions = suggestions.filter(
    (s) => !dismissedSuggestions.includes(`${s.type}:${s.value}`)
  );

  const renderSuggestionCard = (suggestion) => {
    const typeLabels = { event: 'Event', school: 'School', company: 'Company' };
    const typeIcons = { event: 'calendar-outline', school: 'school-outline', company: 'business-outline' };
    const typeColors = { event: '#7C3AED', school: '#10B981', company: '#3B82F6' };

    return (
      <View style={styles.suggestionCard} key={`${suggestion.type}:${suggestion.value}`}>
        <View style={styles.suggestionHeader}>
          <View style={[styles.suggestionIcon, { backgroundColor: typeColors[suggestion.type] + '15' }]}>
            <Ionicons
              name={typeIcons[suggestion.type] || 'people-outline'}
              size={20}
              color={typeColors[suggestion.type]}
            />
          </View>
          <View style={styles.suggestionInfo}>
            <Text style={styles.suggestionText}>
              We noticed {suggestion.contact_count} contacts from
            </Text>
            <Text style={styles.suggestionValue}>"{suggestion.value}"</Text>
          </View>
          <TouchableOpacity
            onPress={() => handleDismissSuggestion(suggestion)}
            style={styles.dismissButton}
          >
            <Ionicons name="close" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
        <View style={styles.suggestionActions}>
          <TouchableOpacity
            style={styles.suggestionCreateButton}
            onPress={() => handleAutoCreate(suggestion)}
          >
            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.suggestionCreateText}>Create Group</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderGroupCard = ({ item }) => (
    <TouchableOpacity
      style={styles.groupCard}
      onPress={() => navigation.navigate('GroupDetail', { groupId: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.groupRow}>
        <View style={[styles.groupIcon, { backgroundColor: item.color + '20' }]}>
          <Ionicons
            name={item.icon || 'people'}
            size={24}
            color={item.color || colors.primary}
          />
        </View>
        <View style={styles.groupInfo}>
          <Text style={styles.groupName} numberOfLines={1}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.groupDescription} numberOfLines={1}>{item.description}</Text>
          ) : null}
          <Text style={styles.groupMemberCount}>
            {item.member_count} {item.member_count === 1 ? 'contact' : 'contacts'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {/* Suggestions */}
      {filteredSuggestions.length > 0 && (
        <View style={styles.suggestionsSection}>
          <Text style={styles.sectionLabel}>SUGGESTED GROUPS</Text>
          {filteredSuggestions.slice(0, 3).map(renderSuggestionCard)}
        </View>
      )}

      {groups.length > 0 && (
        <Text style={styles.sectionLabel}>YOUR GROUPS</Text>
      )}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Ionicons name="folder-open-outline" size={64} color={colors.textTertiary} style={{ marginBottom: spacing.md }} />
      <Text style={styles.emptyTitle}>No groups yet</Text>
      <Text style={styles.emptySubtitle}>
        Create groups to organize your contacts{'\n'}by event, company, or any custom category.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Groups</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('CreateGroup')}
        >
          <Ionicons name="add-circle" size={32} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderGroupCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!loading ? renderEmpty : null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchGroups(true)}
            tintColor={colors.primary}
          />
        }
        ListFooterComponent={
          loading ? (
            <ActivityIndicator style={styles.footer} color={colors.primary} />
          ) : null
        }
        contentContainerStyle={groups.length === 0 && !loading ? styles.emptyContainer : undefined}
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
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  addButton: {
    padding: spacing.xs,
  },
  listHeader: {
    paddingHorizontal: spacing.md,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // Suggestion cards
  suggestionsSection: {
    marginBottom: spacing.md,
  },
  suggestionCard: {
    backgroundColor: colors.primaryBg,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  suggestionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  suggestionValue: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: 2,
  },
  dismissButton: {
    padding: spacing.xs,
  },
  suggestionActions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.primaryLight,
  },
  suggestionCreateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  suggestionCreateText: {
    ...typography.button,
    color: colors.primary,
    fontSize: 14,
  },

  // Group cards
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  groupDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  groupMemberCount: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 4,
  },

  // Empty state
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
});

export default GroupsScreen;

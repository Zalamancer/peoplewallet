import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { socialAPI } from '../services/api';
import SuggestionCard from '../components/SuggestionCard';
import { Ionicons } from '@expo/vector-icons';

/**
 * QuickAddScreen
 * Shows a list of recent social connections (LinkedIn, Instagram) as
 * suggestion cards for quick-add. This is "Mode B" capture — the app
 * surfaces the user's most recent social connections and pre-populates
 * a contact card with available public data.
 */
const QuickAddScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [platformFilter, setPlatformFilter] = useState(null); // null = all

  const fetchSuggestions = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);

      const params = { limit: 20 };
      if (platformFilter) params.platform = platformFilter;

      const response = await socialAPI.getSuggestions(params);
      setSuggestions(response.data.suggestions || []);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to load suggestions';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [platformFilter]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSuggestions(true);
  };

  const handleAdd = (suggestion) => {
    // Build pre-populated contact data matching NewContactScreen's expected format
    const contactData = {
      full_name: suggestion.full_name || '',
      professional: {},
      social: {},
    };

    // Parse headline for job title / company
    if (suggestion.headline) {
      const atMatch = suggestion.headline.match(/^(.+?)\s+at\s+(.+)$/i);
      if (atMatch) {
        contactData.professional.job_title = atMatch[1].trim();
        contactData.professional.company = atMatch[2].trim();
      } else if (suggestion.headline.toLowerCase().includes('student')) {
        const studentMatch = suggestion.headline.match(/student\s+at\s+(.+)/i);
        if (studentMatch) {
          contactData.professional.job_title = 'Student';
          contactData.professional.school = studentMatch[1].trim();
        }
      }
    }

    // Set social link for the source platform
    if (suggestion.platform === 'linkedin' && suggestion.profile_url) {
      contactData.social.linkedin = suggestion.profile_url;
    } else if (suggestion.platform === 'instagram' && suggestion.profile_url) {
      contactData.social.instagram = suggestion.profile_url;
    }

    // Set the avatar URL if available
    if (suggestion.avatar_url) {
      contactData.avatar_url = suggestion.avatar_url;
    }

    // Add a note about where this suggestion came from
    const platformLabel = suggestion.platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
    contactData.notes = [
      {
        content: `Added via Quick Add from ${platformLabel} connection.${
          suggestion.headline ? `\n${platformLabel}: ${suggestion.headline}` : ''
        }`,
      },
    ];

    navigation.navigate('NewContact', {
      contactData,
      source: suggestion.platform,
    });
  };

  const renderItem = ({ item }) => (
    <SuggestionCard suggestion={item} onAdd={() => handleAdd(item)} />
  );

  const renderEmpty = () => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="people-outline" size={48} color={colors.textTertiary} />
        </View>
        <Text style={styles.emptyTitle}>No Suggestions Yet</Text>
        <Text style={styles.emptyDescription}>
          {error
            ? error
            : 'Connect your LinkedIn or Instagram account in Settings to see recent connections here.'}
        </Text>
        <TouchableOpacity
          style={styles.emptyAction}
          onPress={() => navigation.navigate('Main', { screen: 'SettingsTab' })}
        >
          <Ionicons name="settings-outline" size={18} color={colors.primary} />
          <Text style={styles.emptyActionText}>Go to Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.emptyAction, { marginTop: spacing.sm }]}
          onPress={() =>
            navigation.navigate('NewContact', { source: 'manual' })
          }
        >
          <Ionicons name="create-outline" size={18} color={colors.primary} />
          <Text style={styles.emptyActionText}>Add Contact Manually</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.filterRow}>
      <TouchableOpacity
        style={[styles.filterChip, !platformFilter && styles.filterChipActive]}
        onPress={() => setPlatformFilter(null)}
      >
        <Text
          style={[
            styles.filterChipText,
            !platformFilter && styles.filterChipTextActive,
          ]}
        >
          All
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.filterChip,
          platformFilter === 'linkedin' && styles.filterChipActive,
        ]}
        onPress={() =>
          setPlatformFilter(platformFilter === 'linkedin' ? null : 'linkedin')
        }
      >
        <Ionicons
          name="logo-linkedin"
          size={14}
          color={platformFilter === 'linkedin' ? colors.white : '#0A66C2'}
        />
        <Text
          style={[
            styles.filterChipText,
            platformFilter === 'linkedin' && styles.filterChipTextActive,
          ]}
        >
          LinkedIn
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.filterChip,
          platformFilter === 'instagram' && styles.filterChipActive,
        ]}
        onPress={() =>
          setPlatformFilter(platformFilter === 'instagram' ? null : 'instagram')
        }
      >
        <Ionicons
          name="logo-instagram"
          size={14}
          color={platformFilter === 'instagram' ? colors.white : '#E4405F'}
        />
        <Text
          style={[
            styles.filterChipText,
            platformFilter === 'instagram' && styles.filterChipTextActive,
          ]}
        >
          Instagram
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Quick Add</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
          <Ionicons
            name="refresh-outline"
            size={22}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Recent social connections ready to add
      </Text>

      {/* Platform filter */}
      {renderHeader()}

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Finding recent connections...</Text>
        </View>
      ) : (
        <FlatList
          data={suggestions}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backButton: {
    padding: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  refreshButton: {
    padding: spacing.sm,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.borderLight,
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.textInverse,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: spacing.xxl * 2,
  },
  loadingText: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl * 2,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primaryBg,
    borderRadius: borderRadius.lg,
  },
  emptyActionText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
});

export default QuickAddScreen;

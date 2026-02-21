import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, shadows } from '../theme/colors';
import { contactsAPI } from '../services/api';
import ContactCard from '../components/ContactCard';
import Tag from '../components/Tag';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'ai', label: 'AI Created' },
  { key: 'recent', label: 'Recent' },
];

const ContactListScreen = ({ navigation }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });

  const fetchContacts = useCallback(
    async (page = 1, isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else if (page === 1) setLoading(true);

        const params = {
          page,
          limit: 20,
          sort: 'created_at',
          order: 'desc',
        };

        if (searchQuery.trim()) {
          params.search = searchQuery.trim();
        }

        if (activeFilter === 'favorites') {
          params.is_favorite = 'true';
        } else if (activeFilter === 'ai') {
          params.source = 'dictation';
        } else if (activeFilter === 'recent') {
          params.sort = 'created_at';
          params.order = 'desc';
        }

        const response = await contactsAPI.list(params);
        const { contacts: data, pagination: pag } = response.data;

        if (page === 1) {
          setContacts(data);
        } else {
          setContacts((prev) => [...prev, ...data]);
        }
        setPagination(pag);
      } catch (error) {
        console.error('Failed to fetch contacts:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchQuery, activeFilter]
  );

  useEffect(() => {
    fetchContacts(1);
  }, [fetchContacts]);

  // Refresh when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchContacts(1);
    });
    return unsubscribe;
  }, [navigation, fetchContacts]);

  const loadMore = () => {
    if (pagination.page < pagination.totalPages && !loading) {
      fetchContacts(pagination.page + 1);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
          placeholderTextColor={colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: spacing.xs }}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filters}>
        {FILTER_OPTIONS.map((filter) => (
          <Tag
            key={filter.key}
            label={filter.label}
            selected={activeFilter === filter.key}
            onPress={() => setActiveFilter(filter.key)}
            variant={activeFilter === filter.key ? 'primary' : 'default'}
          />
        ))}
      </View>

      <Text style={styles.count}>
        {pagination.total} contact{pagination.total !== 1 ? 's' : ''}
      </Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Ionicons name="people-outline" size={64} color={colors.textTertiary} style={{ marginBottom: spacing.md }} />
      <Text style={styles.emptyTitle}>No contacts yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to add your first contact,{'\n'}
        or use AI dictation to capture someone you just met.
      </Text>
    </View>
  );


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Contacts</Text>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ContactCard
            contact={item}
            onPress={() => navigation.navigate('ContactDetail', { contactId: item.id })}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={!loading ? renderEmpty : null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchContacts(1, true)}
            tintColor={colors.primary}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading && contacts.length > 0 ? (
            <ActivityIndicator style={styles.footer} color={colors.primary} />
          ) : null
        }
        contentContainerStyle={contacts.length === 0 && !loading ? styles.emptyContainer : undefined}
      />

      {/* Floating Action Button */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('CaptureChooser')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={32} color={colors.white} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, // More breathable side padding
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.primaryDark, // Use deeper color for title
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg, // slightly more breathing room
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 4,
    ...shadows.sm,
    marginBottom: spacing.md,
    marginHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  count: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
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
  footer: {
    paddingVertical: spacing.lg,
  },
  fabContainer: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    ...shadows.lg,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ContactListScreen;

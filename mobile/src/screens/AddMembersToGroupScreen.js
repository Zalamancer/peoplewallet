import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { contactsAPI, groupsAPI } from '../services/api';
import Button from '../components/Button';

const AddMembersToGroupScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { groupId, groupName } = route.params;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [existingMemberIds, setExistingMemberIds] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [contactsRes, groupRes] = await Promise.all([
        contactsAPI.list({ limit: 200, sort: 'full_name', order: 'asc' }),
        groupsAPI.get(groupId),
      ]);

      setContacts(contactsRes.data.contacts);
      const memberIds = (groupRes.data.members || []).map((m) => m.id);
      setExistingMemberIds(memberIds);
    } catch (error) {
      console.warn('Failed to fetch contacts:', error?.message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSelect = (contactId) => {
    setSelectedIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleAdd = async () => {
    if (selectedIds.length === 0) return;

    setSaving(true);
    try {
      await groupsAPI.addMembers(groupId, selectedIds);
      navigation.goBack();
    } catch (error) {
      const msg = error.response?.data?.error || 'Failed to add contacts';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredContacts = contacts.filter((c) => {
    // Filter out existing members
    if (existingMemberIds.includes(c.id)) return false;

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c.school || '').toLowerCase().includes(q) ||
        (c.event_name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getInitials = (name) =>
    (name || '?')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const getAvatarColor = (name) => {
    const palette = [
      '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
      '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
    ];
    if (!name) return palette[0];
    const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % palette.length;
    return palette[idx];
  };

  const renderContact = ({ item }) => {
    const isSelected = selectedIds.includes(item.id);
    const subtitle = [item.job_title, item.company, item.school].filter(Boolean).join(' at ');

    return (
      <TouchableOpacity
        style={[styles.contactRow, isSelected && styles.contactRowSelected]}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
          {isSelected && <Ionicons name="checkmark" size={16} color={colors.textInverse} />}
        </View>
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.full_name) }]}>
          <Text style={styles.initials}>{getInitials(item.full_name)}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName} numberOfLines={1}>{item.full_name}</Text>
          {subtitle ? (
            <Text style={styles.contactSubtitle} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Add to {groupName}</Text>
        <Button
          title={`Add (${selectedIds.length})`}
          onPress={handleAdd}
          loading={saving}
          size="sm"
          disabled={selectedIds.length === 0}
        />
      </View>

      {/* Search */}
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

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
      ) : (
        <FlatList
          data={filteredContacts}
          keyExtractor={(item) => item.id}
          renderItem={renderContact}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {searchQuery ? 'No contacts match your search' : 'All contacts are already in this group'}
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  backButton: {
    padding: spacing.sm,
  },
  backText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 4,
    ...shadows.sm,
    margin: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  contactRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  initials: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  contactSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  loader: {
    paddingTop: spacing.xxl,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});

export default AddMembersToGroupScreen;

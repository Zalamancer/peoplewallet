import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { groupsAPI, contactsAPI } from '../services/api';
import ContactCard from '../components/ContactCard';
import Button from '../components/Button';

const GroupDetailScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { groupId } = route.params;
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const fetchGroup = useCallback(async () => {
    try {
      setLoading(true);
      const response = await groupsAPI.get(groupId);
      setGroup(response.data);
    } catch (error) {
      console.warn('Failed to fetch group:', error?.message);
      Alert.alert('Error', 'Failed to load group');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [groupId, navigation]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchGroup();
    });
    return unsubscribe;
  }, [navigation, fetchGroup]);

  const handleDeleteGroup = () => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${group.name}"? This will not delete the contacts themselves.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await groupsAPI.delete(groupId);
              navigation.goBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
    );
  };

  const handleRemoveSelected = () => {
    if (selectedIds.length === 0) return;

    Alert.alert(
      'Remove from Group',
      `Remove ${selectedIds.length} contact(s) from "${group.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await groupsAPI.removeMembers(groupId, selectedIds);
              setSelectedIds([]);
              setSelectMode(false);
              fetchGroup();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove contacts');
            }
          },
        },
      ]
    );
  };

  const handleExport = () => {
    Alert.alert(
      'Export Group',
      `Export "${group.name}" contacts as:`,
      [
        {
          text: 'CSV',
          onPress: async () => {
            try {
              const response = await groupsAPI.export(groupId, 'csv');
              await Share.share({
                message: `${group.name} contacts exported as CSV`,
                url: undefined,
              });
            } catch (error) {
              Alert.alert('Error', 'Failed to export group');
            }
          },
        },
        {
          text: 'vCard',
          onPress: async () => {
            try {
              const response = await groupsAPI.export(groupId, 'vcard');
              await Share.share({
                message: `${group.name} contacts exported as vCard`,
                url: undefined,
              });
            } catch (error) {
              Alert.alert('Error', 'Failed to export group');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const toggleSelect = (contactId) => {
    setSelectedIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!group) return null;

  const renderHeader = () => (
    <View style={styles.groupHeader}>
      <View style={[styles.groupIconLarge, { backgroundColor: (group.color || colors.primary) + '20' }]}>
        <Ionicons
          name={group.icon || 'people'}
          size={40}
          color={group.color || colors.primary}
        />
      </View>
      <Text style={styles.groupName}>{group.name}</Text>
      {group.description ? (
        <Text style={styles.groupDescription}>{group.description}</Text>
      ) : null}
      <Text style={styles.memberCount}>
        {group.member_count} {group.member_count === 1 ? 'contact' : 'contacts'}
      </Text>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('AddMembersToGroup', { groupId: group.id, groupName: group.name })}
        >
          <View style={styles.actionIconCircle}>
            <Ionicons name="person-add-outline" size={20} color={colors.primary} />
          </View>
          <Text style={styles.actionLabel}>Add</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            setSelectMode(!selectMode);
            setSelectedIds([]);
          }}
        >
          <View style={styles.actionIconCircle}>
            <Ionicons name="checkbox-outline" size={20} color={colors.primary} />
          </View>
          <Text style={styles.actionLabel}>Select</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleExport}>
          <View style={styles.actionIconCircle}>
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          </View>
          <Text style={styles.actionLabel}>Export</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('CreateGroup', { group })}
        >
          <View style={styles.actionIconCircle}>
            <Ionicons name="pencil-outline" size={20} color={colors.primary} />
          </View>
          <Text style={styles.actionLabel}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* Select mode bar */}
      {selectMode && (
        <View style={styles.selectBar}>
          <Text style={styles.selectBarText}>
            {selectedIds.length} selected
          </Text>
          <Button
            title="Remove Selected"
            onPress={handleRemoveSelected}
            variant="danger"
            size="sm"
            disabled={selectedIds.length === 0}
          />
        </View>
      )}

      {group.members && group.members.length > 0 && (
        <Text style={styles.membersLabel}>MEMBERS</Text>
      )}
    </View>
  );

  const renderMember = ({ item }) => {
    if (selectMode) {
      const isSelected = selectedIds.includes(item.id);
      return (
        <TouchableOpacity
          style={[styles.selectableCard, isSelected && styles.selectedCard]}
          onPress={() => toggleSelect(item.id)}
          activeOpacity={0.7}
        >
          <View style={styles.selectRow}>
            <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
              {isSelected && <Ionicons name="checkmark" size={16} color={colors.textInverse} />}
            </View>
            <View style={styles.selectCardContent}>
              <ContactCard
                contact={item}
                onPress={() => toggleSelect(item.id)}
              />
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <ContactCard
        contact={item}
        onPress={() => navigation.navigate('ContactDetail', { contactId: item.id })}
      />
    );
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Ionicons name="people-outline" size={48} color={colors.textTertiary} style={{ marginBottom: spacing.md }} />
      <Text style={styles.emptyTitle}>No contacts in this group</Text>
      <Text style={styles.emptySubtitle}>Tap "Add" to add contacts to this group.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Nav header */}
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleDeleteGroup} style={styles.headerButton}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={group.members || []}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={
          (!group.members || group.members.length === 0) ? styles.emptyContainer : undefined
        }
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    padding: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerButton: {
    padding: spacing.sm,
  },
  groupHeader: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  groupIconLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  groupName: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  groupDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  memberCount: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  actionButton: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  actionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    width: '100%',
    ...shadows.sm,
  },
  selectBarText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  membersLabel: {
    ...typography.label,
    color: colors.textTertiary,
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  // Select mode
  selectableCard: {
    marginHorizontal: 0,
  },
  selectedCard: {
    opacity: 0.9,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectCardContent: {
    flex: 1,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});

export default GroupDetailScreen;

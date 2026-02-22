import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { groupsAPI } from '../services/api';
import Button from './Button';

const AddToGroupModal = ({ visible, onClose, contactId, contactName }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [groups, setGroups] = useState([]);
  const [contactGroups, setContactGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && contactId) {
      fetchData();
    }
  }, [visible, contactId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [allGroupsRes, contactGroupsRes] = await Promise.all([
        groupsAPI.list(),
        groupsAPI.forContact(contactId),
      ]);

      setGroups(allGroupsRes.data.groups);
      const existing = contactGroupsRes.data.groups.map((g) => g.id);
      setContactGroups(existing);
      setSelectedIds(existing);
    } catch (error) {
      console.warn('Failed to load groups:', error?.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (groupId) => {
    setSelectedIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Find groups to add to (newly selected)
      const toAdd = selectedIds.filter((id) => !contactGroups.includes(id));
      // Find groups to remove from (deselected)
      const toRemove = contactGroups.filter((id) => !selectedIds.includes(id));

      const promises = [];

      for (const groupId of toAdd) {
        promises.push(groupsAPI.addMembers(groupId, [contactId]));
      }

      for (const groupId of toRemove) {
        promises.push(groupsAPI.removeMembers(groupId, [contactId]));
      }

      await Promise.all(promises);
      onClose(true); // true means changes were made
    } catch (error) {
      const msg = error.response?.data?.error || 'Failed to update groups';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const renderGroup = ({ item }) => {
    const isSelected = selectedIds.includes(item.id);
    const wasAlreadyMember = contactGroups.includes(item.id);

    return (
      <TouchableOpacity
        style={[styles.groupRow, isSelected && styles.groupRowSelected]}
        onPress={() => toggleGroup(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
          {isSelected && <Ionicons name="checkmark" size={16} color={colors.textInverse} />}
        </View>
        <View style={[styles.groupIcon, { backgroundColor: (item.color || colors.primary) + '20' }]}>
          <Ionicons
            name={item.icon || 'people'}
            size={20}
            color={item.color || colors.primary}
          />
        </View>
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{item.name}</Text>
          <Text style={styles.groupMeta}>
            {item.member_count} {item.member_count === 1 ? 'contact' : 'contacts'}
            {wasAlreadyMember ? ' (already member)' : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => onClose(false)}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => onClose(false)} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add to Groups</Text>
          <Button
            title="Done"
            onPress={handleSave}
            loading={saving}
            size="sm"
          />
        </View>

        <Text style={styles.subtitle}>
          Select groups for {contactName}
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No groups yet. Create a group first.</Text>
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id}
            renderItem={renderGroup}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </Modal>
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
    paddingTop: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  cancelButton: {
    padding: spacing.sm,
  },
  cancelText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  groupRow: {
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
  groupRowSelected: {
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
  groupIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  groupMeta: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  loader: {
    paddingTop: spacing.xxl,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl * 2,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});

export default AddToGroupModal;

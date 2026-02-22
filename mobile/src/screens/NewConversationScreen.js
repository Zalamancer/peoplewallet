import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import api, { messagesAPI, contactsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { joinConversation } from '../services/socket';

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
};

const getAvatarColor = (name) => {
  const palette = ['#4F46E5', '#7C3AED', '#EC4899', '#EF4444', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6'];
  if (!name) return palette[0];
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % palette.length;
  return palette[idx];
};

const NewConversationScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/auth/users', {
        params: { search: searchQuery },
      });
      setUsers((response.data.users || []).filter((u) => u.id !== user?.id));
    } catch (err) {
      // Fallback: try contacts as user proxies
      try {
        const contactsResponse = await contactsAPI.list();
        const contacts = contactsResponse.data?.contacts || [];
        // Create pseudo-user entries from contacts that have user_ids
        const contactUsers = contacts
          .filter((c) => c.user_id && c.user_id !== user?.id)
          .map((c) => ({ id: c.user_id, name: c.full_name, email: c.email }));
        setUsers(contactUsers);
      } catch {
        setUsers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const toggleUser = (u) => {
    if (isGroupMode) {
      setSelectedUsers((prev) => {
        const exists = prev.find((s) => s.id === u.id);
        if (exists) return prev.filter((s) => s.id !== u.id);
        return [...prev, u];
      });
    } else {
      // Direct message — create immediately
      createDirectConversation(u);
    }
  };

  const createDirectConversation = async (otherUser) => {
    if (creating) return;
    setCreating(true);
    try {
      const response = await messagesAPI.createConversation({
        type: 'direct',
        participantIds: [otherUser.id],
      });
      const conv = response.data.conversation;
      joinConversation(conv.id);
      navigation.replace('Chat', {
        conversationId: conv.id,
        title: otherUser.name,
        isGroup: false,
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to start conversation');
      setCreating(false);
    }
  };

  const createGroupConversation = async () => {
    if (creating || selectedUsers.length < 2) return;
    if (!groupName.trim()) {
      Alert.alert('Group Name', 'Please enter a group name');
      return;
    }
    setCreating(true);
    try {
      const response = await messagesAPI.createConversation({
        type: 'group',
        name: groupName.trim(),
        participantIds: selectedUsers.map((u) => u.id),
      });
      const conv = response.data.conversation;
      joinConversation(conv.id);
      navigation.replace('Chat', {
        conversationId: conv.id,
        title: groupName.trim(),
        isGroup: true,
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to create group');
      setCreating(false);
    }
  };

  const renderUser = ({ item }) => {
    const isSelected = selectedUsers.find((s) => s.id === item.id);
    return (
      <TouchableOpacity
        style={[styles.userItem, isSelected && styles.userItemSelected]}
        onPress={() => toggleUser(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.name) }]}>
          <Text style={styles.initials}>{getInitials(item.name)}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}</Text>
          {item.email && <Text style={styles.userEmail}>{item.email}</Text>}
        </View>
        {isGroupMode && (
          <Ionicons
            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={isSelected ? colors.primary : colors.textTertiary}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Message</Text>
        <TouchableOpacity
          onPress={() => setIsGroupMode(!isGroupMode)}
          style={styles.headerButton}
        >
          <Ionicons name={isGroupMode ? 'person' : 'people'} size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Group name input (when in group mode) */}
      {isGroupMode && (
        <View style={styles.groupNameRow}>
          <TextInput
            style={styles.groupNameInput}
            placeholder="Group name..."
            placeholderTextColor={colors.placeholder}
            value={groupName}
            onChangeText={setGroupName}
          />
        </View>
      )}

      {/* Selected users (group mode) */}
      {isGroupMode && selectedUsers.length > 0 && (
        <View style={styles.selectedRow}>
          {selectedUsers.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={styles.selectedChip}
              onPress={() => toggleUser(u)}
            >
              <Text style={styles.selectedChipText}>{u.name.split(' ')[0]}</Text>
              <Ionicons name="close" size={14} color={colors.primary} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people..."
          placeholderTextColor={colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />
      </View>

      {/* User list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
        />
      )}

      {/* Create group button */}
      {isGroupMode && selectedUsers.length >= 2 && (
        <View style={styles.createGroupBar}>
          <TouchableOpacity
            style={[styles.createGroupButton, creating && styles.createGroupButtonDisabled]}
            onPress={createGroupConversation}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <>
                <Ionicons name="people" size={20} color={colors.textInverse} />
                <Text style={styles.createGroupText}>Create Group ({selectedUsers.length})</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerButton: {
    padding: spacing.xs,
  },
  cancelText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  groupNameRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  groupNameInput: {
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
  },
  selectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  selectedChipText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  userItemSelected: {
    backgroundColor: colors.primaryBg,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  initials: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    ...typography.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  userEmail: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  createGroupBar: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  createGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  createGroupButtonDisabled: {
    opacity: 0.6,
  },
  createGroupText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default NewConversationScreen;

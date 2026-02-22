import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { messagesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

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

const GroupChatInfoScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { conversationId } = route.params;
  const { user } = useAuth();
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [editing, setEditing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchParticipants();
  }, [conversationId]);

  const fetchParticipants = async () => {
    try {
      const response = await messagesAPI.getParticipants(conversationId);
      const parts = response.data.participants || [];
      setParticipants(parts);

      const me = parts.find((p) => p.user_id === user?.id);
      if (me) {
        setMuted(me.muted);
        setIsAdmin(me.role === 'admin');
      }

      // Fetch conversation details
      const convResponse = await messagesAPI.getConversations();
      const conv = (convResponse.data.conversations || []).find((c) => c.id === conversationId);
      if (conv) {
        setGroupName(conv.name || '');
      }
    } catch (err) {
      console.warn('Failed to fetch group info:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async () => {
    try {
      await messagesAPI.updateConversation(conversationId, { name: groupName.trim() });
      setEditing(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to update group name');
    }
  };

  const handleToggleMute = async (value) => {
    try {
      await messagesAPI.muteConversation(conversationId, value);
      setMuted(value);
    } catch (err) {
      Alert.alert('Error', 'Failed to update mute setting');
    }
  };

  const handleLeave = () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await messagesAPI.leaveConversation(conversationId);
              navigation.popToTop();
            } catch (err) {
              Alert.alert('Error', 'Failed to leave group');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Info</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Group name */}
        <View style={styles.section}>
          <View style={styles.groupHeader}>
            <View style={[styles.groupAvatar, { backgroundColor: getAvatarColor(groupName) }]}>
              <Ionicons name="people" size={36} color={colors.textInverse} />
            </View>
            {editing ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.nameInput}
                  value={groupName}
                  onChangeText={setGroupName}
                  autoFocus
                />
                <TouchableOpacity onPress={handleUpdateName} style={styles.saveButton}>
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => isAdmin && setEditing(true)}>
                <Text style={styles.groupName}>{groupName || 'Group Chat'}</Text>
                <Text style={styles.memberCount}>{participants.length} members</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <Ionicons name="notifications-off-outline" size={22} color={colors.textPrimary} />
            <Text style={styles.settingLabel}>Mute Notifications</Text>
            <Switch
              value={muted}
              onValueChange={handleToggleMute}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </View>

        {/* Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members</Text>
          {isAdmin && (
            <TouchableOpacity
              style={styles.addMemberButton}
              onPress={() => navigation.navigate('NewConversation', { addToGroup: conversationId })}
            >
              <Ionicons name="person-add-outline" size={20} color={colors.primary} />
              <Text style={styles.addMemberText}>Add Members</Text>
            </TouchableOpacity>
          )}
          {participants.map((p) => (
            <View key={p.user_id} style={styles.memberRow}>
              <View style={[styles.memberAvatar, { backgroundColor: getAvatarColor(p.name) }]}>
                <Text style={styles.memberInitials}>{getInitials(p.name)}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>
                  {p.name} {p.user_id === user?.id ? '(You)' : ''}
                </Text>
                {p.role === 'admin' && <Text style={styles.adminBadge}>Admin</Text>}
              </View>
            </View>
          ))}
        </View>

        {/* Leave group */}
        <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
          <Ionicons name="exit-outline" size={20} color={colors.error} />
          <Text style={styles.leaveText}>Leave Group</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  section: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  groupHeader: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  groupAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  groupName: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  memberCount: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 2,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nameInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical: spacing.xs,
  },
  saveButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  saveButtonText: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  addMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  addMemberText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  memberInitials: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memberName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  adminBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  leaveText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default GroupChatInfoScreen;

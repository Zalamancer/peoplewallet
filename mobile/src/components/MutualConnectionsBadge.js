import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, typography, spacing, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { connectionsAPI } from '../services/api';

/**
 * MutualConnectionsBadge
 * Displays "You and [Name] have N mutual connections" on ContactDetailScreen.
 * Tappable to navigate to the full MutualConnectionsScreen.
 */
const MutualConnectionsBadge = ({ contactId, contactName, onPress }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMutualConnections();
  }, [contactId]);

  const fetchMutualConnections = async () => {
    try {
      setLoading(true);
      const response = await connectionsAPI.getMutualForContact(contactId);
      setConnections(response.data.connections || []);
    } catch (error) {
      // Silently fail - mutual connections are supplementary info
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null; // Don't show loading spinner for supplementary data
  }

  if (connections.length === 0) {
    return null; // Don't render anything if no mutual connections
  }

  const count = connections.length;
  const firstName = contactName ? contactName.split(' ')[0] : 'this contact';

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress && onPress(connections)}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Ionicons name="people" size={20} color={colors.accent} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>
          You and {firstName} have {count} mutual connection{count !== 1 ? 's' : ''}
        </Text>
        <Text style={styles.subtitle}>
          {connections
            .slice(0, 3)
            .map((c) => c.other_user_name)
            .join(', ')}
          {count > 3 ? ` and ${count - 3} more` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.accentLight,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
});

export default MutualConnectionsBadge;

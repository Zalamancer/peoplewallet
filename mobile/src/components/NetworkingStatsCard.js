import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

/**
 * NetworkingStatsCard
 * Compact stats card for displaying networking statistics.
 *
 * Props:
 *   stats - { totalContacts, contactsThisMonth, eventsAttended, topConnections }
 *     topConnections = [{ name, score }]  (score 0-100)
 */
const NetworkingStatsCard = ({ stats }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!stats) return null;

  const { totalContacts, contactsThisMonth, eventsAttended, topConnections } = stats;

  // Pick the strongest connection for the 4th grid cell
  const strongest = topConnections && topConnections.length > 0 ? topConnections[0] : null;

  return (
    <View style={styles.card}>
      {/* 2x2 stat grid */}
      <View style={styles.grid}>
        <StatBox
          icon="people-outline"
          iconColor="#007AFF"
          value={totalContacts}
          label="Total Contacts"
        />
        <StatBox
          icon="person-add-outline"
          iconColor="#34C759"
          value={contactsThisMonth}
          label="This Month"
        />
        <StatBox
          icon="calendar-outline"
          iconColor="#FF9500"
          value={eventsAttended}
          label="Events"
        />
        {strongest ? (
          <View style={styles.statBox}>
            <View style={[styles.statIconBg, { backgroundColor: '#7C3AED15' }]}>
              <Ionicons name="trophy-outline" size={18} color="#7C3AED" />
            </View>
            <Text style={styles.strongestName} numberOfLines={1}>
              {strongest.name}
            </Text>
            <View style={styles.scoreBarContainer}>
              <View
                style={[
                  styles.scoreBar,
                  { width: `${Math.min(strongest.score, 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.statLabel}>Strongest</Text>
          </View>
        ) : (
          <StatBox
            icon="trophy-outline"
            iconColor="#7C3AED"
            value="--"
            label="Strongest"
          />
        )}
      </View>

      {/* Top 3 connections list (if more than one) */}
      {topConnections && topConnections.length > 1 && (
        <View style={styles.connectionsSection}>
          <Text style={styles.connectionsSectionTitle}>Top Connections</Text>
          {topConnections.slice(0, 3).map((connection, idx) => (
            <View key={idx} style={styles.connectionRow}>
              <View style={styles.connectionRank}>
                <Text style={styles.connectionRankText}>{idx + 1}</Text>
              </View>
              <Text style={styles.connectionName} numberOfLines={1}>
                {connection.name}
              </Text>
              <View style={styles.connectionScoreContainer}>
                <View
                  style={[
                    styles.connectionScoreBar,
                    { width: `${Math.min(connection.score, 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.connectionScoreText}>
                {Math.round(connection.score)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const StatBox = ({ icon, iconColor, value, label }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
  <View style={styles.statBox}>
    <View style={[styles.statIconBg, { backgroundColor: `${iconColor}15` }]}>
      <Ionicons name={icon} size={18} color={iconColor} />
    </View>
    <Text style={[styles.statValue, { color: iconColor }]}>
      {value ?? 0}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },

  // 2x2 Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statBox: {
    width: '48%',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    flex: 0,
    flexBasis: '47%',
  },
  statIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
    fontSize: 11,
    textAlign: 'center',
  },

  // Strongest connection in grid
  strongestName: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
  scoreBarContainer: {
    width: '80%',
    height: 4,
    backgroundColor: colors.borderLight,
    borderRadius: 2,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  scoreBar: {
    height: 4,
    backgroundColor: '#7C3AED',
    borderRadius: 2,
  },

  // Top connections list
  connectionsSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  connectionsSectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    gap: spacing.sm,
  },
  connectionRank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionRankText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  connectionName: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '500',
    flex: 1,
  },
  connectionScoreContainer: {
    width: 60,
    height: 4,
    backgroundColor: colors.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  connectionScoreBar: {
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  connectionScoreText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '600',
    fontSize: 11,
    width: 24,
    textAlign: 'right',
  },
});

export default NetworkingStatsCard;

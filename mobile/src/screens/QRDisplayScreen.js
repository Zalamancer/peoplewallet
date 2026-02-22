import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { attendancesAPI, eventsAPI } from '../services/api';

const QR_REFRESH_INTERVAL = 25; // seconds
const ATTENDEE_REFRESH_INTERVAL = 10000; // 10 seconds in ms

const QRDisplayScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { eventId } = route.params;
  const [event, setEvent] = useState(null);
  const [qrToken, setQrToken] = useState(null);
  const [countdown, setCountdown] = useState(QR_REFRESH_INTERVAL);
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [error, setError] = useState(null);

  const countdownRef = useRef(null);
  const attendeeIntervalRef = useRef(null);

  // Fetch event details
  const fetchEvent = useCallback(async () => {
    try {
      const response = await eventsAPI.get(eventId);
      setEvent(response.data);
    } catch (err) {
      console.warn('Failed to fetch event:', err?.message);
      setError('Failed to load event details');
    }
  }, [eventId]);

  // Fetch QR token
  const fetchQRToken = useCallback(async () => {
    try {
      setQrLoading(true);
      const response = await attendancesAPI.getQR(eventId);
      setQrToken(response.data.token);
      setCountdown(QR_REFRESH_INTERVAL);
    } catch (err) {
      console.warn('Failed to fetch QR token:', err?.message);
      const errorMsg = err.response?.data?.error || 'Failed to generate QR code';
      Alert.alert('Error', errorMsg);
    } finally {
      setQrLoading(false);
    }
  }, [eventId]);

  // Fetch attendee count
  const fetchAttendeeCount = useCallback(async () => {
    try {
      const response = await attendancesAPI.list(eventId, { page: 1, limit: 1 });
      setAttendeeCount(response.data.pagination.total);
    } catch (err) {
      // Non-critical, silently fail
      console.warn('Failed to fetch attendee count:', err?.message);
    }
  }, [eventId]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchEvent(), fetchQRToken(), fetchAttendeeCount()]);
      setLoading(false);
    };
    init();
  }, [fetchEvent, fetchQRToken, fetchAttendeeCount]);

  // Keep screen awake
  useEffect(() => {
    activateKeepAwakeAsync('qr-display');
    return () => {
      deactivateKeepAwake('qr-display');
    };
  }, []);

  // Countdown timer and QR refresh
  useEffect(() => {
    if (!qrToken) return;

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchQRToken();
          return QR_REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [qrToken, fetchQRToken]);

  // Attendee count refresh
  useEffect(() => {
    attendeeIntervalRef.current = setInterval(fetchAttendeeCount, ATTENDEE_REFRESH_INTERVAL);

    return () => {
      if (attendeeIntervalRef.current) {
        clearInterval(attendeeIntervalRef.current);
      }
    };
  }, [fetchAttendeeCount]);

  const handleManualCheckin = () => {
    navigation.navigate('ManualCheckin', { eventId });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Generating QR code...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>QR Check-In</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setError(null);
              setLoading(true);
              Promise.all([fetchEvent(), fetchQRToken(), fetchAttendeeCount()]).then(() =>
                setLoading(false)
              );
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>QR Check-In</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Event Name */}
        <View style={styles.eventInfo}>
          <View style={styles.eventIconContainer}>
            <Ionicons name="calendar" size={28} color={colors.primary} />
          </View>
          <Text style={styles.eventName} numberOfLines={2}>
            {event?.name || 'Event'}
          </Text>
          {event?.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color={colors.textTertiary} />
              <Text style={styles.locationText}>{event.location}</Text>
            </View>
          )}
        </View>

        {/* QR Code */}
        <View style={styles.qrCard}>
          {qrLoading ? (
            <View style={styles.qrPlaceholder}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.qrRefreshingText}>Refreshing QR...</Text>
            </View>
          ) : qrToken ? (
            <View style={styles.qrContainer}>
              <QRCode
                value={qrToken}
                size={260}
                color={colors.textPrimary}
                backgroundColor={colors.surface}
              />
            </View>
          ) : (
            <View style={styles.qrPlaceholder}>
              <Ionicons name="qr-code-outline" size={64} color={colors.textTertiary} />
              <Text style={styles.qrErrorText}>Could not generate QR code</Text>
            </View>
          )}

          {/* Countdown */}
          <View style={styles.countdownContainer}>
            <Ionicons name="refresh-outline" size={16} color={colors.textTertiary} />
            <Text style={styles.countdownText}>
              Refreshes in {countdown}s
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(countdown / QR_REFRESH_INTERVAL) * 100}%` },
              ]}
            />
          </View>
        </View>

        {/* Attendee Counter */}
        <View style={styles.attendeeCard}>
          <View style={styles.attendeeRow}>
            <View style={styles.attendeeIconContainer}>
              <Ionicons name="people" size={24} color={colors.primary} />
            </View>
            <View style={styles.attendeeInfo}>
              <Text style={styles.attendeeCount}>{attendeeCount}</Text>
              <Text style={styles.attendeeLabel}>
                Checked In
              </Text>
            </View>
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>HOW IT WORKS</Text>
          <View style={styles.instructionStep}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.stepText}>Display this QR code to attendees</Text>
          </View>
          <View style={styles.instructionStep}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.stepText}>They scan it with their PeopleWallet app</Text>
          </View>
          <View style={styles.instructionStep}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={styles.stepText}>Check-in is recorded automatically</Text>
          </View>
        </View>

        {/* Manual Check-In Button */}
        <TouchableOpacity
          style={styles.manualCheckinButton}
          onPress={handleManualCheckin}
          activeOpacity={0.7}
        >
          <Ionicons name="person-add-outline" size={20} color={colors.primary} />
          <Text style={styles.manualCheckinText}>Manual Check-In</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  loadingText: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    padding: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  // Event Info
  eventInfo: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  eventIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  eventName: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  locationText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },

  // QR Card
  qrCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
    ...shadows.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  qrContainer: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  qrPlaceholder: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrRefreshingText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  qrErrorText: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  countdownText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: colors.borderLight,
    borderRadius: 2,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },

  // Attendee Card
  attendeeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  attendeeInfo: {
    flex: 1,
  },
  attendeeCount: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  attendeeLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: -2,
  },

  // Instructions
  instructionsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  instructionsTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  instructionStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stepNumberText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '700',
  },
  stepText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },

  // Manual Check-In
  manualCheckinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  manualCheckinText: {
    ...typography.button,
    color: colors.primary,
  },

  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },

  bottomSpacer: {
    height: spacing.xxl,
  },
});

export default QRDisplayScreen;

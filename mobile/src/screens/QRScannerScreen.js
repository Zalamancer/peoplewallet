import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius, shadows } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { attendancesAPI } from '../services/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.7;

const QRScannerScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null); // { type: 'success' | 'error', title, message }
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scanLockRef = useRef(false);

  const showResult = useCallback((type, title, message) => {
    setResult({ type, title, message });
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setResult(null);
        setScanned(false);
        scanLockRef.current = false;
      });
    }, 3000);
  }, [fadeAnim]);

  const decodeJWTPayload = (token) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = parts[1];
      // Base64 decode
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  };

  const handleBarCodeScanned = useCallback(async ({ data }) => {
    // Prevent double-scan
    if (scanLockRef.current || scanned || processing) return;
    scanLockRef.current = true;
    setScanned(true);
    setProcessing(true);

    try {
      const payload = data.trim();

      // Check if it's a JWT (event check-in QR)
      if (payload.startsWith('eyJ')) {
        const decoded = decodeJWTPayload(payload);

        if (!decoded || !decoded.eventId) {
          showResult('error', 'Invalid QR Code', 'This QR code is not a valid event check-in code.');
          setProcessing(false);
          return;
        }

        try {
          const response = await attendancesAPI.checkin(decoded.eventId, payload);
          showResult(
            'success',
            'Checked In!',
            response.data.message || 'You have been checked in successfully.'
          );
        } catch (error) {
          const errorMsg = error.response?.data?.error || 'Check-in failed. Please try again.';
          showResult('error', 'Check-In Failed', errorMsg);
        }
      } else if (payload.startsWith('http://') || payload.startsWith('https://')) {
        // URL format - navigate to contact sharing flow
        setProcessing(false);
        scanLockRef.current = false;
        setScanned(false);
        navigation.navigate('ShareContact', { shareUrl: payload });
      } else {
        showResult('error', 'Unknown QR Code', 'This QR code format is not recognized.');
      }
    } catch (error) {
      showResult('error', 'Scan Error', 'Something went wrong processing this QR code.');
    } finally {
      setProcessing(false);
    }
  }, [scanned, processing, navigation, showResult]);

  // Permission not yet determined
  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <View style={styles.permissionCard}>
            <View style={styles.permissionIconContainer}>
              <Ionicons name="camera-outline" size={64} color={colors.primary} />
            </View>
            <Text style={styles.permissionTitle}>Camera Access Required</Text>
            <Text style={styles.permissionDescription}>
              PeopleWallet needs camera access to scan QR codes for event check-ins and contact sharing.
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              onPress={requestPermission}
              activeOpacity={0.8}
            >
              <Ionicons name="camera" size={20} color={colors.textInverse} style={{ marginRight: spacing.sm }} />
              <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.fullScreen}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Scanning Overlay */}
      <View style={styles.overlay}>
        {/* Top dark area */}
        <View style={styles.overlayTop} />

        {/* Middle row: dark | transparent | dark */}
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <View style={styles.scanArea}>
            {/* Corner decorations */}
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
          <View style={styles.overlaySide} />
        </View>

        {/* Bottom dark area */}
        <View style={styles.overlayBottom}>
          <Text style={styles.instructionText}>
            {processing ? 'Processing...' : 'Point camera at a QR code'}
          </Text>
          {processing && (
            <ActivityIndicator
              size="small"
              color={colors.textInverse}
              style={{ marginTop: spacing.sm }}
            />
          )}
        </View>
      </View>

      {/* Back Button */}
      <SafeAreaView style={styles.headerOverlay} edges={['top']}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textInverse} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR Code</Text>
        <View style={styles.headerSpacer} />
      </SafeAreaView>

      {/* Result overlay */}
      {result && (
        <Animated.View style={[styles.resultOverlay, { opacity: fadeAnim }]}>
          <View
            style={[
              styles.resultCard,
              result.type === 'success' ? styles.resultCardSuccess : styles.resultCardError,
            ]}
          >
            <View
              style={[
                styles.resultIconContainer,
                {
                  backgroundColor:
                    result.type === 'success'
                      ? colors.success + '20'
                      : colors.error + '20',
                },
              ]}
            >
              <Ionicons
                name={result.type === 'success' ? 'checkmark-circle' : 'close-circle'}
                size={56}
                color={result.type === 'success' ? colors.success : colors.error}
              />
            </View>
            <Text style={styles.resultTitle}>{result.title}</Text>
            <Text style={styles.resultMessage}>{result.message}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const CORNER_SIZE = 24;
const CORNER_BORDER = 3;

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreen: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: SCAN_AREA_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  instructionText: {
    ...typography.body,
    color: colors.textInverse,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Corners
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_BORDER,
    borderLeftWidth: CORNER_BORDER,
    borderTopLeftRadius: 4,
    borderColor: colors.white,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_BORDER,
    borderRightWidth: CORNER_BORDER,
    borderTopRightRadius: 4,
    borderColor: colors.white,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_BORDER,
    borderLeftWidth: CORNER_BORDER,
    borderBottomLeftRadius: 4,
    borderColor: colors.white,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_BORDER,
    borderRightWidth: CORNER_BORDER,
    borderBottomRightRadius: 4,
    borderColor: colors.white,
  },

  // Header
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textInverse,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },

  // Permission
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  permissionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  permissionIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  permissionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  permissionDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  permissionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  permissionButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  cancelButton: {
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  cancelButtonText: {
    ...typography.body,
    color: colors.textTertiary,
    fontWeight: '500',
  },

  // Result overlay
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: spacing.xl,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    ...shadows.lg,
  },
  resultCardSuccess: {
    borderTopWidth: 4,
    borderTopColor: colors.success,
  },
  resultCardError: {
    borderTopWidth: 4,
    borderTopColor: colors.error,
  },
  resultIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  resultTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  resultMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default QRScannerScreen;

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { colors, spacing, typography, borderRadius, shadows } from '../theme/colors';
import { aiAPI } from '../services/api';
import Button from '../components/Button';
import { Ionicons } from '@expo/vector-icons';

const STATES = {
  CONSENT: 'consent',
  RECORDING: 'recording',
  PROCESSING: 'processing',
  REVIEWING: 'reviewing',
  ERROR: 'error',
};

const RecordingScreen = ({ navigation }) => {
  const [state, setState] = useState(STATES.CONSENT);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcriptionResult, setTranscriptionResult] = useState(null);
  const [extractionResult, setExtractionResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [consentChecks, setConsentChecks] = useState({ informed: false, visible: false, discarded: false });
  const recordingRef = useRef(null);
  const timerRef = useRef(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      if (recordingRef.current) recordingRef.current.stopAndUnloadAsync().catch(() => { });
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state === STATES.RECORDING) {
      const blink = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      blink.start();
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => { blink.stop(); pulse.stop(); };
    }
  }, [state]);

  const allConsented = Object.values(consentChecks).every(Boolean);
  const toggleConsent = (key) => setConsentChecks((prev) => ({ ...prev, [key]: !prev[key] }));

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant microphone access.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;

      setState(STATES.RECORDING);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => setRecordingDuration((p) => p + 1), 1000);
    } catch (error) {
      console.error('Recording error:', error);
      Alert.alert('Error', 'Failed to start recording');
      setState(STATES.CONSENT);
    }
  };

  const stopRecording = async () => {
    try {
      if (timerRef.current) clearInterval(timerRef.current);
      if (!recordingRef.current) return;

      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      setState(STATES.PROCESSING);

      const formData = new FormData();
      formData.append('audio', { uri, type: 'audio/m4a', name: 'live_recording.m4a' });

      const response = await aiAPI.transcribe(formData);
      setTranscriptionResult(response.data.transcription);
      setExtractionResult(response.data.extraction);
      setState(STATES.REVIEWING);
    } catch (error) {
      console.error('Processing error:', error);
      setState(STATES.ERROR);
      setErrorMessage(error.response?.data?.message || 'Failed to process recording');
    }
  };

  const handleCreateContact = () => {
    if (!extractionResult) return;
    navigation.navigate('NewContact', {
      contactData: extractionResult.raw,
      fields: extractionResult.fields,
      source: 'recording',
    });
  };

  const formatDuration = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Live Recording</Text>
        {state === STATES.RECORDING ? (
          <Animated.View style={[styles.recordIndicator, { opacity: blinkAnim }]}>
            <View style={styles.recordDot} />
            <Text style={styles.recText}>REC</Text>
          </Animated.View>
        ) : <View style={{ width: 60 }} />}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Consent */}
        {state === STATES.CONSENT && (
          <View style={styles.consentContent}>
            <Text style={styles.consentTitle}>Recording Consent</Text>
            <Text style={styles.consentDesc}>
              Live recording captures a conversation in real-time.{'\n'}Please confirm the following:
            </Text>
            <View style={styles.checklist}>
              <ConsentItem checked={consentChecks.informed} onToggle={() => toggleConsent('informed')}
                label="All parties have been informed and consent to being recorded" />
              <ConsentItem checked={consentChecks.visible} onToggle={() => toggleConsent('visible')}
                label="A visible recording indicator will be displayed" />
              <ConsentItem checked={consentChecks.discarded} onToggle={() => toggleConsent('discarded')}
                label="Audio will be discarded after transcription. Only text is retained" />
            </View>
            <View style={styles.warning}>
              <Ionicons name="warning" size={20} color="#92400E" />
              <Text style={styles.warningText}>
                Recording without consent may violate local laws.{'\n'}Some states require all-party consent.
              </Text>
            </View>
            <Button title="Start Recording" onPress={startRecording} fullWidth size="lg" disabled={!allConsented} />
          </View>
        )}

        {/* Recording */}
        {state === STATES.RECORDING && (
          <View style={styles.centeredContent}>
            <View style={styles.bigIndicator}>
              <Animated.View style={[styles.indicatorDot, { opacity: blinkAnim }]} />
              <Text style={styles.indicatorText}>RECORDING IN PROGRESS</Text>
            </View>
            <Text style={styles.duration}>{formatDuration(recordingDuration)}</Text>
            <Text style={styles.recordHint}>Place your phone where both parties{'\n'}can see the recording indicator</Text>
            <Animated.View style={[styles.stopOuter, { transform: [{ scale: pulseAnim }] }]}>
              <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
                <View style={styles.stopIcon} />
              </TouchableOpacity>
            </Animated.View>
            <Text style={styles.hint}>Tap to stop recording</Text>
          </View>
        )}

        {/* Processing */}
        {state === STATES.PROCESSING && (
          <View style={styles.centeredContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingText}>Processing recording...</Text>
            <Text style={styles.processingHint}>Audio will be discarded after transcription</Text>
          </View>
        )}

        {/* Review */}
        {state === STATES.REVIEWING && transcriptionResult && extractionResult && (
          <View style={styles.reviewContent}>
            <View style={styles.discardedNotice}>
              <Ionicons name="checkmark-circle" size={20} color="#166534" />
              <Text style={styles.discardedText}>Audio has been discarded. Only text is retained.</Text>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Transcript</Text>
              <View style={styles.card}>
                <Text style={styles.transcriptText}>{transcriptionResult.text}</Text>
              </View>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Extracted Contact Info</Text>
              <View style={styles.card}>
                {extractionResult.raw?.name?.full_name && (
                  <Text style={styles.extractedName}>{extractionResult.raw.name.full_name}</Text>
                )}
                <Text style={styles.confLabel}>
                  Confidence: {Math.round((extractionResult.overallConfidence || 0) * 100)}%
                </Text>
              </View>
            </View>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Button title="Create Contact" onPress={handleCreateContact} fullWidth size="lg" />
              <Button title="Discard & Start Over" onPress={() => setState(STATES.CONSENT)} variant="ghost" fullWidth textStyle={{ color: colors.error }} />
            </View>
          </View>
        )}

        {/* Error */}
        {state === STATES.ERROR && (
          <View style={styles.centeredContent}>
            <Ionicons name="warning-outline" size={64} color={colors.error} style={{ marginBottom: spacing.md }} />
            <Text style={styles.errorTitle}>Processing Failed</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <Button title="Try Again" onPress={() => setState(STATES.CONSENT)} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const ConsentItem = ({ checked, onToggle, label }) => (
  <TouchableOpacity style={styles.consentItem} onPress={onToggle} activeOpacity={0.7}>
    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
      {checked && <Ionicons name="checkmark" size={16} color={colors.white} />}
    </View>
    <Text style={styles.consentLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white },
  backButton: { padding: spacing.xs },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h3, color: colors.textPrimary },
  recordIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.recordingBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: borderRadius.full },
  recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.recording, marginRight: 6 },
  recText: { ...typography.caption, color: colors.recording, fontWeight: '700' },
  content: { flex: 1 },
  contentContainer: { flexGrow: 1, paddingBottom: spacing.xxl },

  consentContent: { padding: spacing.lg },
  consentTitle: { ...typography.h2, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  consentDesc: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: spacing.xl },
  checklist: { gap: spacing.md, marginBottom: spacing.xl },
  consentItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  checkbox: { width: 24, height: 24, borderRadius: borderRadius.sm, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: colors.white, fontSize: 14, fontWeight: '700' },
  consentLabel: { ...typography.body, color: colors.textPrimary, flex: 1, lineHeight: 24 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FEF3C7', padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.xl, gap: spacing.sm },
  warningText: { ...typography.bodySmall, color: '#92400E', flex: 1, lineHeight: 20 },

  centeredContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl * 2 },
  bigIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.recording, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full, marginBottom: spacing.xl },
  indicatorDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.white, marginRight: spacing.sm },
  indicatorText: { ...typography.label, color: colors.white, fontWeight: '700', letterSpacing: 1 },
  duration: { fontSize: 56, fontWeight: '200', color: colors.textPrimary, fontVariant: ['tabular-nums'], marginBottom: spacing.md },
  recordHint: { ...typography.bodySmall, color: colors.textTertiary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
  stopOuter: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.recordingBg, alignItems: 'center', justifyContent: 'center' },
  stopButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.recording, alignItems: 'center', justifyContent: 'center' },
  stopIcon: { width: 24, height: 24, borderRadius: 4, backgroundColor: colors.white },
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.lg },

  processingText: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.lg },
  processingHint: { ...typography.bodySmall, color: colors.textTertiary, marginTop: spacing.sm },

  reviewContent: { padding: spacing.md },
  discardedNotice: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCFCE7', padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.lg, gap: spacing.sm },
  discardedText: { ...typography.bodySmall, color: '#166534', fontWeight: '500' },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.label, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.md, ...shadows.sm },
  transcriptText: { ...typography.body, color: colors.textPrimary, lineHeight: 24 },
  extractedName: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  confLabel: { ...typography.caption, color: colors.textTertiary },

  errorTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  errorMessage: { ...typography.body, color: colors.textTertiary, textAlign: 'center', marginBottom: spacing.xl },
});

export default RecordingScreen;

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

const STATES = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PROCESSING: 'processing',
  REVIEWING: 'reviewing',
  ERROR: 'error',
};

const DictationScreen = ({ navigation }) => {
  const [state, setState] = useState(STATES.IDLE);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcriptionResult, setTranscriptionResult] = useState(null);
  const [extractionResult, setExtractionResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const recordingRef = useRef(null);
  const timerRef = useRef(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state === STATES.RECORDING) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state]);

  useEffect(() => {
    if (state === STATES.REVIEWING) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [state]);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant microphone access to use dictation.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;

      setState(STATES.RECORDING);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Start recording error:', error);
      Alert.alert('Error', 'Failed to start recording. Please check microphone permissions.');
      setState(STATES.ERROR);
      setErrorMessage('Microphone access denied or unavailable');
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
      await processAudio(uri);
    } catch (error) {
      console.error('Stop recording error:', error);
      setState(STATES.ERROR);
      setErrorMessage('Failed to stop recording');
    }
  };

  const processAudio = async (uri) => {
    try {
      const formData = new FormData();
      formData.append('audio', {
        uri,
        type: 'audio/m4a',
        name: 'dictation.m4a',
      });

      const response = await aiAPI.transcribe(formData);
      const { transcription, extraction } = response.data;

      setTranscriptionResult(transcription);
      setExtractionResult(extraction);
      setState(STATES.REVIEWING);
    } catch (error) {
      console.error('Processing error:', error);
      const msg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Failed to process audio. Please try again.';
      setState(STATES.ERROR);
      setErrorMessage(msg);
    }
  };

  const handleCreateContact = () => {
    if (!extractionResult) return;
    navigation.navigate('NewContact', {
      contactData: extractionResult.raw,
      fields: extractionResult.fields,
      source: 'dictation',
    });
  };

  const handleRetry = () => {
    setState(STATES.IDLE);
    setTranscriptionResult(null);
    setExtractionResult(null);
    setErrorMessage('');
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AI Dictation</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {state === STATES.IDLE && (
          <View style={styles.centeredContent}>
            <Text style={styles.instruction}>
              Tap the microphone and describe{'\n'}the person you just met
            </Text>
            <Text style={styles.example}>
              "I just met Sarah Chen, she's a junior{'\n'}CS major at UTD, works at a startup{'\n'}called DataFlow, interested in ML..."
            </Text>
            <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
              <Text style={styles.micIcon}>{'\u{1F3A4}'}</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>Tap to start recording (15-30 seconds)</Text>
          </View>
        )}

        {state === STATES.RECORDING && (
          <View style={styles.centeredContent}>
            <Text style={styles.recordingLabel}>Recording...</Text>
            <Text style={styles.duration}>{formatDuration(recordingDuration)}</Text>
            <Animated.View style={[styles.recordButtonActive, { transform: [{ scale: pulseAnim }] }]}>
              <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
                <View style={styles.stopIcon} />
              </TouchableOpacity>
            </Animated.View>
            <Text style={styles.hint}>Tap to stop recording</Text>
          </View>
        )}

        {state === STATES.PROCESSING && (
          <View style={styles.centeredContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingText}>Processing your dictation...</Text>
            <View style={styles.processingSteps}>
              <ProcessingStep label="Transcribing audio (Deepgram)" active />
              <ProcessingStep label="Extracting contact info (Claude AI)" />
              <ProcessingStep label="Building contact card" />
            </View>
          </View>
        )}

        {state === STATES.REVIEWING && transcriptionResult && extractionResult && (
          <Animated.View style={[styles.reviewContent, { opacity: fadeAnim }]}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Transcript</Text>
              <View style={styles.card}>
                <Text style={styles.transcriptText}>{transcriptionResult.text}</Text>
                <Text style={styles.confidenceLabel}>
                  Audio confidence: {Math.round((transcriptionResult.audioConfidence || 0) * 100)}%
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Extracted Information</Text>
              <View style={styles.card}>
                <ConfidenceField label="Name" value={extractionResult.raw?.name?.full_name} status={extractionResult.fields?.name?.full_name?.status} />
                <ConfidenceField label="School" value={extractionResult.raw?.professional?.school} status={extractionResult.fields?.professional?.school?.status} />
                <ConfidenceField label="Major" value={extractionResult.raw?.professional?.major} status={extractionResult.fields?.professional?.major?.status} />
                <ConfidenceField label="Company" value={extractionResult.raw?.professional?.company} status={extractionResult.fields?.professional?.company?.status} />
                <ConfidenceField label="Title" value={extractionResult.raw?.professional?.job_title} status={extractionResult.fields?.professional?.job_title?.status} />
                {extractionResult.raw?.interests?.length > 0 && (
                  <View style={styles.interestsRow}>
                    <Text style={styles.fieldLabel}>Interests</Text>
                    <Text style={styles.fieldValue}>{extractionResult.raw.interests.join(', ')}</Text>
                  </View>
                )}
                <Text style={styles.overallConfidence}>
                  Overall: {Math.round((extractionResult.overallConfidence || 0) * 100)}%
                </Text>
              </View>
            </View>

            <View style={styles.legend}>
              <LegendItem color={colors.confidenceHigh} text="Auto-filled" />
              <LegendItem color={colors.confidenceMedium} text="Suggested" />
              <LegendItem color={colors.confidenceLow} text="Not detected" />
            </View>

            <View style={styles.reviewActions}>
              <Button title="Create Contact" onPress={handleCreateContact} fullWidth size="lg" />
              <Button title="Try Again" onPress={handleRetry} variant="outline" fullWidth style={{ marginTop: spacing.sm }} />
            </View>
          </Animated.View>
        )}

        {state === STATES.ERROR && (
          <View style={styles.centeredContent}>
            <Text style={{ fontSize: 64, marginBottom: spacing.md }}>{'\u26A0'}</Text>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <Button title="Try Again" onPress={handleRetry} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const ProcessingStep = ({ label, active }) => (
  <View style={styles.stepRow}>
    {active ? <ActivityIndicator size="small" color={colors.primary} /> : <View style={styles.stepDot} />}
    <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
  </View>
);

const ConfidenceField = ({ label, value, status }) => {
  if (!value) return null;
  const dotColor = status === 'auto' ? colors.confidenceHigh : status === 'suggest' ? colors.confidenceMedium : colors.confidenceLow;
  return (
    <View style={styles.fieldRow}>
      <View style={[styles.fieldDot, { backgroundColor: dotColor }]} />
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} numberOfLines={1}>{value}</Text>
    </View>
  );
};

const LegendItem = ({ color, text }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendDot, { backgroundColor: color }]} />
    <Text style={styles.legendText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white },
  backButton: { padding: spacing.xs },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.h3, color: colors.textPrimary },
  placeholder: { width: 60 },
  content: { flex: 1 },
  contentContainer: { flexGrow: 1, paddingBottom: spacing.xxl },
  centeredContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl * 2 },
  instruction: { ...typography.h3, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 26 },
  example: { ...typography.bodySmall, color: colors.textTertiary, textAlign: 'center', fontStyle: 'italic', marginBottom: spacing.xxl, lineHeight: 22 },
  recordButton: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadows.lg },
  micIcon: { fontSize: 40 },
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.lg },
  recordingLabel: { ...typography.h2, color: colors.recording, marginBottom: spacing.sm },
  duration: { fontSize: 48, fontWeight: '200', color: colors.textPrimary, marginBottom: spacing.xl, fontVariant: ['tabular-nums'] },
  recordButtonActive: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.recordingBg, alignItems: 'center', justifyContent: 'center' },
  stopButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.recording, alignItems: 'center', justifyContent: 'center' },
  stopIcon: { width: 24, height: 24, borderRadius: 4, backgroundColor: colors.white },
  processingText: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.xl },
  processingSteps: { gap: spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.border },
  stepLabel: { ...typography.body, color: colors.textTertiary },
  stepLabelActive: { color: colors.primary, fontWeight: '600' },
  reviewContent: { padding: spacing.md },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.label, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.md, ...shadows.sm },
  transcriptText: { ...typography.body, color: colors.textPrimary, lineHeight: 24 },
  confidenceLabel: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  fieldDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  fieldLabel: { ...typography.bodySmall, color: colors.textTertiary, width: 70 },
  fieldValue: { ...typography.bodySmall, color: colors.textPrimary, fontWeight: '500', flex: 1 },
  interestsRow: { paddingVertical: spacing.xs, paddingLeft: spacing.md + spacing.sm },
  overallConfidence: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm, textAlign: 'right' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...typography.caption, color: colors.textTertiary },
  reviewActions: { gap: spacing.sm, marginTop: spacing.md },
  errorTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  errorMessage: { ...typography.body, color: colors.textTertiary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 24 },
});

export default DictationScreen;

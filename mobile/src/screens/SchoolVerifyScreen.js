import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import Button from '../components/Button';
import Input from '../components/Input';

const SchoolVerifyScreen = ({ navigation, route }) => {
  const mode = route.params?.mode || 'signup'; // 'signup' | 'link'
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { login, verifySchoolEmail } = useAuth();

  const [phase, setPhase] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const codeRefs = useRef([]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const validateEmail = (text) => {
    const trimmed = text.trim().toLowerCase();
    if (!trimmed) return 'Email is required';
    if (!trimmed.endsWith('.edu')) return 'Please enter a .edu email address';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) return 'Please enter a valid email';
    return null;
  };

  const handleSendCode = async () => {
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }

    if (mode === 'signup' && !name.trim()) {
      setError('Name is required');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await authAPI.sendVerification({ email: email.trim().toLowerCase() });
      setPhase('code');
      setResendCooldown(60);
      // In dev, show the code so you don't need email delivery
      if (__DEV__ && response.data?.devCode) {
        Alert.alert('Dev Mode', `Your code: ${response.data.devCode}`);
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to send code. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError('');

    try {
      const response = await authAPI.sendVerification({ email: email.trim().toLowerCase() });
      setResendCooldown(60);
      setCode(['', '', '', '', '', '']);
      codeRefs.current[0]?.focus();
      if (__DEV__ && response.data?.devCode) {
        Alert.alert('Dev Mode', `Your code: ${response.data.devCode}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (index, value) => {
    // Only allow digits
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    setError('');

    if (digit && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (digit && index === 5) {
      const fullCode = newCode.join('');
      if (fullCode.length === 6) {
        handleVerify(fullCode);
      }
    }
  };

  const handleCodeKeyPress = (index, key) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
    }
  };

  const handleVerify = async (fullCode) => {
    const codeStr = fullCode || code.join('');
    if (codeStr.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const payload = {
        email: email.trim().toLowerCase(),
        code: codeStr,
      };

      if (mode === 'signup') {
        payload.name = name.trim();
        const response = await authAPI.verifyEmail(payload);
        const { user, token } = response.data;
        // Log in via AuthContext
        await login({ email: user.email, _directAuth: { user, token } });
      } else {
        // Link mode — existing user
        await verifySchoolEmail(payload);
        Alert.alert('Verified!', 'Your school email has been verified.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Verification failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <View style={styles.iconContainer}>
            <Ionicons name="school-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.title}>Verify Your School</Text>

          {phase === 'email' ? (
            <>
              <Text style={styles.subtitle}>
                Enter your .edu email to {mode === 'signup' ? 'create your account' : 'link your school'}.
              </Text>

              {mode === 'signup' && (
                <Input
                  label="Name"
                  value={name}
                  onChangeText={(t) => { setName(t); setError(''); }}
                  placeholder="Your full name"
                  autoCapitalize="words"
                />
              )}

              <Input
                label="School Email"
                value={email}
                onChangeText={(t) => { setEmail(t); setError(''); }}
                placeholder="you@university.edu"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                error={error}
              />

              {mode === 'signup' && (
                <Text style={styles.legalText}>
                  By signing up, you agree to our{' '}
                  <Text style={styles.legalLink} onPress={() => Linking.openURL('https://peoplewallet.app/legal/terms-of-service.html')}>
                    Terms of Service
                  </Text>{' '}and{' '}
                  <Text style={styles.legalLink} onPress={() => Linking.openURL('https://peoplewallet.app/legal/privacy-policy.html')}>
                    Privacy Policy
                  </Text>.
                </Text>
              )}

              <Button
                title="Send Code"
                onPress={handleSendCode}
                loading={loading}
                fullWidth
                size="lg"
                style={styles.actionButton}
              />
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>
                Code sent to <Text style={styles.emailHighlight}>{email.trim().toLowerCase()}</Text>
              </Text>

              <View style={styles.codeContainer}>
                {code.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => { codeRefs.current[index] = ref; }}
                    style={[
                      styles.codeInput,
                      digit ? styles.codeInputFilled : null,
                    ]}
                    value={digit}
                    onChangeText={(value) => handleCodeChange(index, value)}
                    onKeyPress={({ nativeEvent }) => handleCodeKeyPress(index, nativeEvent.key)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                    autoFocus={index === 0}
                  />
                ))}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Button
                title="Verify"
                onPress={() => handleVerify()}
                loading={loading}
                fullWidth
                size="lg"
                style={styles.actionButton}
              />

              <TouchableOpacity
                onPress={handleResendCode}
                disabled={resendCooldown > 0 || loading}
                style={styles.resendButton}
              >
                <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Code'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  emailHighlight: {
    fontWeight: '600',
    color: colors.primary,
  },
  actionButton: {
    marginTop: spacing.md,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  codeInput: {
    width: 48,
    height: 56,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  codeInputFilled: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}08`,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  resendButton: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    padding: spacing.sm,
  },
  resendText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '500',
  },
  resendTextDisabled: {
    color: colors.textTertiary,
  },
  legalText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  legalLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});

export default SchoolVerifyScreen;

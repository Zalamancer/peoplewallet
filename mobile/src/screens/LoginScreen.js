import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking as RNLinking,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import Button from '../components/Button';
import Input from '../components/Input';

const LoginScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { login, register, loginWithLinkedIn, loading, error, clearError } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [emailError, setEmailError] = useState('');

  const validateEmail = (text) => {
    setEmail(text);
    setEmailError('');
    clearError();
  };

  const handleSubmit = async () => {
    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email');
      return;
    }

    try {
      if (isRegister) {
        await register({ email: email.trim(), name: name.trim() || undefined });
      } else {
        await login({ email: email.trim() });
      }
    } catch (err) {
      // If login fails with "not found", suggest registration
      if (err.message.includes('not found') && !isRegister) {
        Alert.alert(
          'Account not found',
          'Would you like to create a new account?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Up', onPress: () => setIsRegister(true) },
          ]
        );
      }
    }
  };

  const handleLinkedInLogin = async () => {
    try {
      // Generate the redirect URL that expo-web-browser will intercept
      // This is the URL the server will redirect to after LinkedIn auth completes
      const redirectUrl = Linking.createURL('auth/linkedin/callback');

      // Call server to get the LinkedIn OAuth URL, passing our returnUrl
      const response = await authAPI.getLinkedInAuthUrl(redirectUrl);
      const { authUrl } = response.data;

      if (!authUrl) {
        Alert.alert(
          'Configuration Error',
          'LinkedIn OAuth is not configured. Make sure LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are set in the server .env file.'
        );
        return;
      }

      // Open an in-app browser that will auto-close when it hits the redirectUrl
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

      if (result.type === 'success' && result.url) {
        // Parse the returned URL to extract token and user data
        const parsed = Linking.parse(result.url);
        const { token, userId, name: userName, email: userEmail } = parsed.queryParams || {};

        if (token) {
          // Use the loginWithToken method from AuthContext
          await loginWithLinkedIn({ token, userId, name: userName, email: userEmail });
        } else {
          Alert.alert('Error', 'No authentication token received from LinkedIn.');
        }
      } else if (result.type === 'cancel') {
        // User closed the browser — do nothing
      }
    } catch (err) {
      console.warn('LinkedIn login error:', err?.message, err?.response?.status, err?.response?.data);
      if (err.message?.includes('Network Error') || err.code === 'ECONNABORTED') {
        Alert.alert(
          'Connection Error',
          'Cannot reach the server. Make sure the backend is running on your computer.'
        );
      } else {
        const serverMsg = err.response?.data?.error;
        const status = err.response?.status;
        const detail = serverMsg
          ? `Server error: ${serverMsg}`
          : status
            ? `Server returned status ${status}`
            : err.message || 'Unknown error';
        Alert.alert('LinkedIn Login Error', detail);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>PeopleWallet</Text>
          <Text style={styles.logoSub}></Text>
          <Text style={styles.tagline}>
            Remember everyone you meet.
          </Text>
        </View>

        <View style={styles.form}>
          {isRegister && (
            <Input
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              autoCapitalize="words"
            />
          )}

          <Input
            label="Email"
            value={email}
            onChangeText={validateEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={emailError || (error && !isRegister ? error : '')}
          />

          {error && isRegister && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <Button
            title={isRegister ? 'Create Account' : 'Sign In'}
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            size="lg"
            style={styles.submitButton}
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            title="Continue with LinkedIn"
            onPress={handleLinkedInLogin}
            variant="outline"
            fullWidth
            size="lg"
            icon={<Text style={styles.linkedInIcon}>in</Text>}
          />

          <Button
            title="Sign Up with School Email"
            onPress={() => navigation.navigate('SchoolVerify', { mode: 'signup' })}
            variant="outline"
            fullWidth
            size="lg"
            icon={<Ionicons name="school-outline" size={20} color={colors.primary} />}
            style={styles.schoolButton}
          />

          <Text style={styles.legalText}>
            By continuing, you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => RNLinking.openURL('https://peoplewallet.app/legal/terms-of-service.html')}>
              Terms of Service
            </Text>{' '}and{' '}
            <Text style={styles.legalLink} onPress={() => RNLinking.openURL('https://peoplewallet.app/legal/privacy-policy.html')}>
              Privacy Policy
            </Text>.
          </Text>

          <Button
            title={isRegister ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            onPress={() => {
              setIsRegister(!isRegister);
              clearError();
              setEmailError('');
            }}
            variant="ghost"
            style={styles.switchButton}
          />
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
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -1,
  },
  logoSub: {
    fontSize: 20,
    fontWeight: '300',
    color: colors.textSecondary,
    marginTop: -4,
    letterSpacing: 4,
  },
  tagline: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  submitButton: {
    marginTop: spacing.sm,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textTertiary,
    marginHorizontal: spacing.md,
  },
  linkedInIcon: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 18,
  },
  schoolButton: {
    marginTop: spacing.sm,
  },
  switchButton: {
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  legalText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 18,
  },
  legalLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});

export default LoginScreen;

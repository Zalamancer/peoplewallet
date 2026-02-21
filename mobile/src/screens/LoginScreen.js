import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { colors, spacing, typography, borderRadius } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import Button from '../components/Button';
import Input from '../components/Input';

const LoginScreen = () => {
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
      console.error('LinkedIn login error:', err);
      if (err.message?.includes('Network Error') || err.code === 'ECONNABORTED') {
        Alert.alert(
          'Connection Error',
          'Cannot reach the server. Make sure the backend is running on your computer.'
        );
      } else {
        Alert.alert('Error', 'Failed to initiate LinkedIn login. Check server configuration.');
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
          <Text style={styles.logo}>ProAnimate</Text>
          <Text style={styles.logoSub}>Connect</Text>
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

const styles = StyleSheet.create({
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
  switchButton: {
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
});

export default LoginScreen;

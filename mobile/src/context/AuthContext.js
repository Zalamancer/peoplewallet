import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { authAPI, setOnUnauthorized } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check for existing session on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Listen for LinkedIn OAuth deep link callback (peoplewallet://auth/linkedin?token=...)
  useEffect(() => {
    const handleDeepLink = async ({ url }) => {
      if (!url) return;

      try {
        const parsed = Linking.parse(url);
        // Handle: peoplewallet://auth/linkedin?token=xxx&userId=xxx&name=xxx&email=xxx
        if (parsed.path === 'auth/linkedin' && parsed.queryParams?.token) {
          const { token: authToken, userId, name, email } = parsed.queryParams;

          const userData = {
            id: userId,
            name: name || '',
            email: email || '',
          };

          await AsyncStorage.setItem('auth_token', authToken);
          await AsyncStorage.setItem('user', JSON.stringify(userData));

          setToken(authToken);
          setUser(userData);

          // Fetch full profile from server to get complete data
          try {
            const response = await authAPI.getProfile();
            setUser(response.data);
            await AsyncStorage.setItem('user', JSON.stringify(response.data));
          } catch (profileErr) {
            // Non-critical — we already have basic user data
            console.warn('Could not fetch full profile after LinkedIn login:', profileErr);
          }
        }
      } catch (err) {
        console.warn('Deep link handling error:', err?.message);
      }
    };

    // Handle deep links when app is already open
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Handle deep link that launched the app
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => subscription?.remove();
  }, []);

  const checkAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      const storedUser = await AsyncStorage.getItem('user');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));

        // Verify token is still valid
        try {
          const response = await authAPI.getProfile();
          setUser(response.data);
          await AsyncStorage.setItem('user', JSON.stringify(response.data));
        } catch (err) {
          // Token expired or invalid
          if (err.response?.status === 401) {
            await logout();
          }
        }
      }
    } catch (err) {
      console.warn('Auth check error:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  const login = useCallback(async ({ email, firebase_uid, name, _directAuth }) => {
    try {
      setError(null);
      setLoading(true);

      let userData, authToken;

      if (_directAuth) {
        // Direct auth from school email verification (already have user + token)
        userData = _directAuth.user;
        authToken = _directAuth.token;
      } else {
        const response = await authAPI.login({ email, firebase_uid, name });
        userData = response.data.user;
        authToken = response.data.token;
      }

      await AsyncStorage.setItem('auth_token', authToken);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setToken(authToken);
      setUser(userData);

      return userData;
    } catch (err) {
      const message = err.response?.data?.error
        || (err.message === 'Network Error' ? 'Cannot connect to server. Make sure the server is running.' : 'Login failed');
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async ({ email, name, firebase_uid }) => {
    try {
      setError(null);
      setLoading(true);

      const response = await authAPI.register({ email, name, firebase_uid });
      const { user: userData, token: authToken } = response.data;

      await AsyncStorage.setItem('auth_token', authToken);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setToken(authToken);
      setUser(userData);

      return userData;
    } catch (err) {
      const message = err.response?.data?.error || 'Registration failed';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithLinkedIn = useCallback(async ({ token: authToken, userId, name, email }) => {
    try {
      setError(null);
      setLoading(true);

      const userData = {
        id: userId,
        name: name || '',
        email: email || '',
      };

      await AsyncStorage.setItem('auth_token', authToken);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setToken(authToken);
      setUser(userData);

      // Fetch full profile from server
      try {
        const response = await authAPI.getProfile();
        setUser(response.data);
        await AsyncStorage.setItem('user', JSON.stringify(response.data));
      } catch (profileErr) {
        console.warn('Could not fetch full profile after LinkedIn login:', profileErr);
      }

      return userData;
    } catch (err) {
      const message = 'LinkedIn login failed';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  // Register the logout callback so the API interceptor can trigger a real logout on 401
  useEffect(() => {
    setOnUnauthorized(() => {
      setToken(null);
      setUser(null);
    });
    return () => setOnUnauthorized(null);
  }, []);

  const updateUser = useCallback(async (data) => {
    try {
      const response = await authAPI.updateProfile(data);
      const updated = { ...user, ...response.data };
      setUser(updated);
      await AsyncStorage.setItem('user', JSON.stringify(updated));
      return updated;
    } catch (err) {
      throw new Error(err.response?.data?.error || 'Update failed');
    }
  }, [user]);

  const verifySchoolEmail = useCallback(async ({ email, code }) => {
    const response = await authAPI.verifyEmail({ email, code });
    // Refresh user profile to get updated school info
    try {
      const profileResponse = await authAPI.getProfile();
      setUser(profileResponse.data);
      await AsyncStorage.setItem('user', JSON.stringify(profileResponse.data));
    } catch (profileErr) {
      // Fall back to updating from the verify response
      const updated = { ...user, ...response.data.user };
      setUser(updated);
      await AsyncStorage.setItem('user', JSON.stringify(updated));
    }
    return response.data;
  }, [user]);

  const value = {
    user,
    token,
    loading,
    error,
    isAuthenticated: !!token,
    login,
    register,
    loginWithLinkedIn,
    logout,
    updateUser,
    verifySchoolEmail,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;

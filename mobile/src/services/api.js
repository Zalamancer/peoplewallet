import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Auto-detect the dev server IP from Expo's hostUri (works on both emulator & physical device)
const getDevBaseUrl = () => {
  const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0]; // Extract IP, strip Expo's port
    return `http://${host}:3000/api`;
  }
  // Fallback: Android emulator uses 10.0.2.2, iOS simulator uses localhost
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000/api';
  }
  return 'http://localhost:3000/api';
};

const API_BASE_URL = __DEV__
  ? getDevBaseUrl()
  : 'https://api.proanimate.connect/api'; // Replace with production URL

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach auth token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('user');
      // Navigation will handle redirect to login via AuthContext
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/me', data),
  getLinkedInAuthUrl: (returnUrl) => api.get('/auth/linkedin', { params: { returnUrl } }),
};

// Contacts API
export const contactsAPI = {
  list: (params) => api.get('/contacts', { params }),
  get: (id) => api.get(`/contacts/${id}`),
  create: (data) => api.post('/contacts', data),
  update: (id, data) => api.put(`/contacts/${id}`, data),
  delete: (id) => api.delete(`/contacts/${id}`),
  addNote: (id, data) => api.post(`/contacts/${id}/notes`, data),
  addTags: (id, data) => api.post(`/contacts/${id}/tags`, data),
};

// AI API
export const aiAPI = {
  transcribe: (formData) =>
    api.post('/ai/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // 60 second timeout for AI processing
    }),
  extractFromText: (text) => api.post('/ai/extract', { text }),
  transcribeOnly: (formData) =>
    api.post('/ai/transcribe-only', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    }),
};

// Notifications API
export const notificationsAPI = {
  registerToken: (push_token, platform) =>
    api.post('/notifications/register', { push_token, platform }),
  unregisterToken: (push_token) =>
    api.delete('/notifications/unregister', { data: { push_token } }),
  getPreferences: () => api.get('/notifications/preferences'),
  updatePreferences: (data) => api.put('/notifications/preferences', data),
};

// Events API
export const eventsAPI = {
  list: (params) => api.get('/events', { params }),
  get: (id) => api.get(`/events/${id}`),
  create: (data) => api.post('/events', data),
  update: (id, data) => api.put(`/events/${id}`, data),
  delete: (id) => api.delete(`/events/${id}`),
  getPrep: (id) => api.get(`/events/${id}/prep`),
};

export default api;

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
  : 'https://api.peoplewallet.app/api'; // Replace with production URL

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

// Logout callback - set by AuthContext so the interceptor can trigger a real logout
let _onUnauthorized = null;
export const setOnUnauthorized = (callback) => {
  _onUnauthorized = callback;
};

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('user');
      if (_onUnauthorized) _onUnauthorized();
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
  getPublicProfile: (userId) => api.get(`/auth/users/${userId}/profile`),
  sendVerification: (data) => api.post('/auth/send-verification', data),
  verifyEmail: (data) => api.post('/auth/verify-email', data),
  deleteAccount: () => api.delete('/auth/me'),
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
  getShareLink: (id) => api.get(`/contacts/${id}/share`),
  toggleShare: (id, shareEnabled) => api.put(`/contacts/${id}/share`, { share_enabled: shareEnabled }),
  confirmLink: (id, linkedUserId) => api.post(`/contacts/${id}/link`, { linked_user_id: linkedUserId }),
  dismissLink: (id) => api.post(`/contacts/${id}/unlink`),
  bulkImport: (contacts) => api.post('/contacts/bulk-import', { contacts }),
};

// LinkedIn API
export const linkedinAPI = {
  lookup: (url) => api.post('/linkedin/lookup', { url }, { timeout: 15000 }),
  recentConnections: (params) => api.get('/linkedin/recent-connections', { params, timeout: 15000 }),
};

// Social API
export const socialAPI = {
  getSuggestions: (params) => api.get('/social/suggestions', { params, timeout: 15000 }),
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

// Connections API
export const connectionsAPI = {
  getMutualForContact: (contactId) => api.get(`/contacts/${contactId}/mutual`),
  getAllMutual: () => api.get('/connections/mutual'),
  getMutualWithUser: (userId) => api.get(`/connections/mutual/${userId}`),
  discover: () => api.post('/connections/discover'),
};

// Feed API
export const feedAPI = {
  list: (params) => api.get('/feed', { params }),
  refreshContact: (contactId) => api.post(`/feed/refresh/${contactId}`),
};

// Co-Attendees API
export const coAttendeesAPI = {
  list: (eventId) => api.get(`/co-attendees/${eventId}`),
  save: (data) => api.post('/co-attendees/save', data),
};

// Events API
export const eventsAPI = {
  list: (params) => api.get('/events/feed', { params }),
  get: (id) => api.get(`/events/feed/${id}`),
  create: (data) => api.post('/events', data),
  update: (id, data) => api.put(`/events/${id}`, data),
  delete: (id) => api.delete(`/events/${id}`),
  getPrep: (id) => api.get(`/events/${id}/prep`),
  matchContacts: (data) => api.post('/events/match', data),
};

// Groups API
export const groupsAPI = {
  list: () => api.get('/groups'),
  get: (id) => api.get(`/groups/${id}`),
  create: (data) => api.post('/groups', data),
  update: (id, data) => api.put(`/groups/${id}`, data),
  delete: (id) => api.delete(`/groups/${id}`),
  addMembers: (id, contact_ids) => api.post(`/groups/${id}/members`, { contact_ids }),
  removeMembers: (id, contact_ids) => api.delete(`/groups/${id}/members`, { data: { contact_ids } }),
  export: (id, format = 'csv') => api.get(`/groups/${id}/export`, { params: { format }, responseType: 'blob' }),
  getSuggestions: () => api.get('/groups/suggestions'),
  autoCreate: (data) => api.post('/groups/auto-create', data),
  forContact: (contactId) => api.get(`/groups/for-contact/${contactId}`),
};

// Insights API
export const insightsAPI = {
  getInsights: () => api.get('/insights'),
  getRecap: (period = 'month') => api.get('/insights/recap', { params: { period } }),
};

// Suggestions API
export const suggestionsAPI = {
  getCoAttendees: () => api.get('/suggestions/co-attendees'),
  dismiss: (suggestedUserId) => api.post('/suggestions/dismiss', { suggested_user_id: suggestedUserId }),
};

// Card Exchange API
export const cardExchangeAPI = {
  send: (data) => api.post('/card-exchange/send', data),
  receive: (data) => api.post('/card-exchange/receive', data),
  checkMutual: (contactId) => api.get(`/card-exchange/mutual/${contactId}`),
};

// Auto-tag API
export const autoTagAPI = {
  checkRecent: () => api.get('/events/recent-attended'),
  tagContact: (eventId, contactId) => api.post(`/events/${eventId}/auto-tag`, { contact_id: contactId }),
};

// Attendances API
export const attendancesAPI = {
  checkin: (eventId, qrToken) => api.post(`/attendances/events/${eventId}/checkin`, { qrToken }),
  manualCheckin: (eventId, userId) => api.post(`/attendances/events/${eventId}/manual-checkin`, { userId }),
  getQR: (eventId) => api.get(`/attendances/events/${eventId}/qr`),
  list: (eventId, params) => api.get(`/attendances/events/${eventId}/attendances`, { params }),
  history: (params) => api.get('/attendances/me/history', { params }),
};

// Clubs API
export const clubsAPI = {
  list: (params) => api.get('/clubs', { params }),
  get: (id) => api.get(`/clubs/${id}`),
  create: (data) => api.post('/clubs', data),
  join: (id) => api.post(`/clubs/${id}/join`),
  leave: (id) => api.delete(`/clubs/${id}/leave`),
  getMembers: (id, params) => api.get(`/clubs/${id}/members`, { params }),
  updateMemberRole: (clubId, userId, role) => api.patch(`/clubs/${clubId}/members/${userId}/role`, { role }),
  suggest: (data) => api.post('/clubs/suggest', data),
  register: (clubId) => api.post('/clubs/register', { club_id: clubId }),
  getPosts: (id, params) => api.get(`/clubs/${id}/posts`, { params }),
};

// Club Follows API
export const clubFollowsAPI = {
  myClubs: () => api.get('/me/clubs'),
  follow: (clubId) => api.post(`/me/clubs/${clubId}/follow`),
  unfollow: (clubId) => api.delete(`/me/clubs/${clubId}/follow`),
};

// Event Feed API
export const eventFeedAPI = {
  list: (params) => api.get('/events/feed', { params }),
  get: (id) => api.get(`/events/feed/${id}`),
  calendar: (params) => api.get('/events/calendar', { params }),
  mapEvents: (params) => api.get('/events/feed/map', { params }),
  markInterested: (id) => api.post(`/events/${id}/interested`),
  markGoing: (id) => api.post(`/events/${id}/going`),
  saveEvent: (id) => api.post(`/events/${id}/save`),
  removeInteraction: (id, type) => api.delete(`/events/${id}/interaction`, { params: { type } }),
};

// Schools API
export const schoolsAPI = {
  list: () => api.get('/schools'),
  get: (id) => api.get(`/schools/${id}`),
};

// RSVPs API
export const rsvpsAPI = {
  rsvp: (eventId, status) => api.post(`/rsvps/events/${eventId}/rsvp`, { status }),
  cancel: (eventId) => api.delete(`/rsvps/events/${eventId}/rsvp`),
  list: (eventId, params) => api.get(`/rsvps/events/${eventId}/rsvps`, { params }),
  mine: (params) => api.get('/rsvps/me', { params }),
};

// Messages API
export const messagesAPI = {
  getConversations: () => api.get('/messages/conversations'),
  createConversation: (data) => api.post('/messages/conversations', data),
  getMessages: (conversationId, params) => api.get(`/messages/conversations/${conversationId}/messages`, { params }),
  updateConversation: (id, data) => api.put(`/messages/conversations/${id}`, data),
  addParticipants: (id, userIds) => api.post(`/messages/conversations/${id}/participants`, { userIds }),
  getParticipants: (id) => api.get(`/messages/conversations/${id}/participants`),
  leaveConversation: (id) => api.delete(`/messages/conversations/${id}/leave`),
  muteConversation: (id, muted) => api.put(`/messages/conversations/${id}/mute`, { muted }),
  deleteMessage: (messageId) => api.delete(`/messages/${messageId}`),
  searchMessages: (q, limit) => api.get('/messages/search', { params: { q, limit } }),
  getUnreadCount: () => api.get('/messages/unread-count'),
};

// Admin API (testing)
export const adminAPI = {
  runPipelines: () => api.post('/admin/run-pipelines', {}, { timeout: 300000 }), // 5 min timeout
};

export default api;

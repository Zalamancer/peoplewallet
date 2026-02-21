import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import api from './api';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and return the Expo Push Token
 */
export const registerForPushNotifications = async () => {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return null;
  }

  // Get Expo Push Token
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: 'PLACEHOLDER_PROJECT_ID', // Replace with actual EAS project ID
  });

  const pushToken = tokenData.data;

  // Register token with our server
  try {
    await api.post('/notifications/register', {
      push_token: pushToken,
      platform: Platform.OS,
    });
  } catch (error) {
    console.error('Failed to register push token with server:', error);
  }

  // Configure Android notification channel
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F46E5',
    });
  }

  return pushToken;
};

/**
 * Add a listener for received notifications (foreground)
 */
export const addNotificationReceivedListener = (callback) => {
  return Notifications.addNotificationReceivedListener(callback);
};

/**
 * Add a listener for notification responses (user tapped notification)
 */
export const addNotificationResponseListener = (callback) => {
  return Notifications.addNotificationResponseReceivedListener(callback);
};

/**
 * Unregister push token on logout
 */
export const unregisterPushToken = async (pushToken) => {
  if (!pushToken) return;

  try {
    await api.delete('/notifications/unregister', {
      data: { push_token: pushToken },
    });
  } catch (error) {
    console.error('Failed to unregister push token:', error);
  }
};

/**
 * Get notification preferences from server
 */
export const getNotificationPreferences = async () => {
  const response = await api.get('/notifications/preferences');
  return response.data;
};

/**
 * Update notification preferences on server
 */
export const updateNotificationPreferences = async (preferences) => {
  const response = await api.put('/notifications/preferences', preferences);
  return response.data;
};

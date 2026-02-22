import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

// 30+ networking-related keywords for event classification
const NETWORKING_KEYWORDS = [
  // Event types
  'networking', 'meetup', 'meet-up', 'mixer', 'conference', 'summit',
  'symposium', 'workshop', 'seminar', 'webinar', 'hackathon',
  'pitch', 'demo day', 'career fair', 'job fair', 'recruiting',
  'hiring', 'interview', 'happy hour', 'social', 'reception',
  'gala', 'awards', 'fundraiser',
  // Professional gatherings
  'professional', 'industry', 'trade show', 'expo', 'convention',
  'panel', 'fireside chat', 'keynote', 'speaker', 'talk', 'lecture',
  'info session', 'lunch and learn', 'breakfast', 'dinner', 'luncheon',
  // Community & entrepreneurship
  'startup', 'founder', 'entrepreneur', 'incubator', 'accelerator',
  'alumni', 'chapter', 'association', 'chamber of commerce',
  'coffee chat',
  // Tech-specific
  'tech talk', 'dev meetup', 'open source', 'user group',
];

/**
 * CalendarSyncService
 * Reads device calendar events via expo-calendar and provides utilities
 * for networking event detection and human-friendly date formatting.
 */

/**
 * Request calendar permissions from the user.
 * @returns {Promise<boolean>} Whether permission was granted.
 */
export const requestCalendarPermissions = async () => {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
};

/**
 * Get the current calendar permission status without prompting.
 * @returns {Promise<string>} Permission status: 'granted', 'denied', or 'undetermined'.
 */
export const getCalendarPermissionStatus = async () => {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  return status;
};

/**
 * Get all calendars available on the device.
 * @returns {Promise<Array>} Array of calendar objects.
 */
export const getDeviceCalendars = async () => {
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return calendars;
  } catch (error) {
    console.warn('Failed to get device calendars:', error?.message);
    return [];
  }
};

/**
 * Fetch upcoming events from all device calendars.
 * @param {number} daysAhead - Number of days to look ahead (default 60).
 * @returns {Promise<Array>} Array of calendar event objects, sorted by start date.
 */
export const getUpcomingEvents = async (daysAhead = 60) => {
  try {
    const permissionStatus = await getCalendarPermissionStatus();
    if (permissionStatus !== 'granted') {
      return [];
    }

    const calendars = await getDeviceCalendars();
    if (calendars.length === 0) return [];

    const calendarIds = calendars.map((cal) => cal.id);
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead);

    const events = await Calendar.getEventsAsync(calendarIds, startDate, endDate);

    // Sort by start date ascending, deduplicate by title + date
    const seen = new Set();
    const uniqueEvents = events
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .filter((event) => {
        const key = `${event.title}-${new Date(event.startDate).toDateString()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return uniqueEvents.map((event) => ({
      id: event.id,
      title: event.title || 'Untitled Event',
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location || null,
      notes: event.notes || null,
      calendarId: event.calendarId,
      isAllDay: event.allDay || false,
    }));
  } catch (error) {
    console.warn('Failed to get upcoming events:', error?.message);
    return [];
  }
};

/**
 * Fetch past events from all device calendars.
 * @param {number} daysBack - Number of days to look back.
 * @returns {Promise<Array>} Array of calendar event objects, sorted by start date descending.
 */
export const getPastEvents = async (daysBack) => {
  try {
    const permissionStatus = await getCalendarPermissionStatus();
    if (permissionStatus !== 'granted') {
      return [];
    }

    const calendars = await getDeviceCalendars();
    if (calendars.length === 0) return [];

    const calendarIds = calendars.map((cal) => cal.id);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const events = await Calendar.getEventsAsync(calendarIds, startDate, endDate);

    // Sort by start date descending (most recent first)
    return events
      .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
      .map((event) => ({
        id: event.id,
        title: event.title || 'Untitled Event',
        startDate: event.startDate,
        endDate: event.endDate,
        location: event.location || null,
        notes: event.notes || null,
        isAllDay: event.allDay || false,
      }));
  } catch (error) {
    console.warn('Failed to get past events:', error?.message);
    return [];
  }
};

/**
 * Determine whether a calendar event is likely a networking event.
 * Checks the event title, location, and notes against 30+ networking keywords.
 * @param {Object} event - A calendar event object.
 * @returns {boolean} True if the event matches networking keywords.
 */
export const isNetworkingEvent = (event) => {
  const searchText = [
    event.title || '',
    event.location || '',
    event.notes || '',
  ]
    .join(' ')
    .toLowerCase();

  return NETWORKING_KEYWORDS.some((keyword) => searchText.includes(keyword));
};

/**
 * Format an event date string into a human-friendly relative label.
 * Examples: "Today at 3:00 PM", "Tomorrow at 10:00 AM", "Mon, Mar 5 at 2:00 PM"
 * @param {string} dateStr - ISO date string.
 * @param {boolean} isAllDay - Whether the event is an all-day event.
 * @returns {string} Formatted date string.
 */
export const formatEventDate = (dateStr, isAllDay = false) => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    if (isToday) {
      return isAllDay ? 'Today (all day)' : `Today at ${timeStr}`;
    }

    if (isTomorrow) {
      return isAllDay ? 'Tomorrow (all day)' : `Tomorrow at ${timeStr}`;
    }

    const dateFormatted = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    return isAllDay ? `${dateFormatted} (all day)` : `${dateFormatted} at ${timeStr}`;
  } catch {
    return dateStr;
  }
};

/**
 * Calculate the number of days until an event.
 * Returns 0 for today, positive for future, negative for past.
 * @param {string} dateStr - ISO date string of the event.
 * @returns {number} Number of days until the event.
 */
export const getDaysUntilEvent = (dateStr) => {
  const eventDate = new Date(dateStr);
  const now = new Date();
  eventDate.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffMs = eventDate - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

export default {
  requestCalendarPermissions,
  getCalendarPermissionStatus,
  getDeviceCalendars,
  getUpcomingEvents,
  getPastEvents,
  isNetworkingEvent,
  formatEventDate,
  getDaysUntilEvent,
};

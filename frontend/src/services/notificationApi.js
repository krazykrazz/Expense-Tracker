/**
 * Notification Settings API Service
 * Discord notifications through Notifiarr (Settings → Notifications).
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, logApiError } from '../utils/apiClient.js';

const call = async (context, fn) => {
  try {
    return await fn();
  } catch (error) {
    if (error.name !== 'AbortError') logApiError(context, error);
    throw error;
  }
};

/**
 * Saved settings; the Notifiarr API key is only ever returned as a masked hint.
 * @returns {Promise<{enabled: boolean, configured: boolean, keyHint: (string|null), keyError: (string|null),
 *   channelId: string, pingUserId: string, events: Array<{key: string, label: string, enabled: boolean}>}>}
 */
export const getNotificationSettings = (options = {}) =>
  call('fetching notification settings', () => apiGet(API_ENDPOINTS.SETTINGS_NOTIFICATIONS, 'fetch notification settings', options));

/** @param {{apiKey?: string, channelId?: string, enabled?: boolean, events?: string[]}} fields a blank apiKey keeps the saved key */
export const saveNotificationSettings = (fields) =>
  call('saving notification settings', () => apiPut(API_ENDPOINTS.SETTINGS_NOTIFICATIONS, fields, 'save notification settings'));

/** Posts a test message with the given (or saved) key and channel; nothing is saved: `{ ok, message }`. */
export const testNotificationSettings = (fields) =>
  call('testing notification settings', () => apiPost(API_ENDPOINTS.SETTINGS_NOTIFICATIONS_TEST, fields, 'send test notification'));

/** Removes the API key and channel and turns notifications off. */
export const clearNotificationSettings = () =>
  call('removing notification settings', () => apiDelete(API_ENDPOINTS.SETTINGS_NOTIFICATIONS, 'remove notification settings'));

/**
 * Activity Log API Service
 * Handles all API calls related to activity log retrieval and statistics
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPut, logApiError } from '../utils/apiClient.js';

/**
 * Fetch recent activity log events with pagination
 * @param {number} limit - Maximum number of events to return (default: 50)
 * @param {number} offset - Number of events to skip for pagination (default: 0)
 * @returns {Promise<Object>} Response with events array, total count, limit, and offset
 * 
 * Response format:
 * {
 *   events: [
 *     {
 *       id: number,
 *       event_type: string,
 *       entity_type: string,
 *       entity_id: number|null,
 *       user_action: string,
 *       metadata: object|null,
 *       timestamp: string (ISO 8601)
 *     }
 *   ],
 *   total: number,
 *   limit: number,
 *   offset: number
 * }
 * 
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
 */
export const fetchRecentEvents = async (limit = 50, offset = 0) => {
  try {
    // Build query parameters
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());
    
    const url = `${API_ENDPOINTS.ACTIVITY_LOGS}?${params.toString()}`;
    
    return await apiGet(url, 'fetch recent activity events');
  } catch (error) {
    logApiError('fetching recent activity events', error);
    throw error;
  }
};

/**
 * Fetch activity log cleanup statistics and retention policy information
 * @returns {Promise<Object>} Cleanup statistics object
 * 
 * Response format:
 * {
 *   retentionDays: number,
 *   maxEntries: number,
 *   currentCount: number,
 *   oldestEventTimestamp: string|null (ISO 8601),
 *   lastCleanupRun: string|null (ISO 8601),
 *   lastCleanupDeletedCount: number
 * }
 * 
 * _Requirements: 9B.4_
 */
export const fetchCleanupStats = async () => {
  try {
    return await apiGet(API_ENDPOINTS.ACTIVITY_LOGS_STATS, 'fetch activity log cleanup statistics');
  } catch (error) {
    logApiError('fetching activity log cleanup statistics', error);
    throw error;
  }
};

/**
 * Fetch current retention policy settings
 * @returns {Promise<Object>} Retention settings object
 * 
 * Response format:
 * {
 *   maxAgeDays: number,
 *   maxCount: number
 * }
 * 
 * _Requirements: 2.1_
 */
export const fetchRetentionSettings = async () => {
  try {
    return await apiGet(API_ENDPOINTS.ACTIVITY_LOGS_SETTINGS, 'fetch retention settings');
  } catch (error) {
    logApiError('fetching retention settings', error);
    throw error;
  }
};

/**
 * Update retention policy settings
 * @param {number} maxAgeDays - Maximum age in days (7-365)
 * @param {number} maxCount - Maximum event count (100-10000)
 * @returns {Promise<Object>} Updated retention settings object
 * 
 * Response format:
 * {
 *   maxAgeDays: number,
 *   maxCount: number,
 *   message: string
 * }
 * 
 * _Requirements: 2.2_
 */
export const updateRetentionSettings = async (maxAgeDays, maxCount) => {
  try {
    const data = { maxAgeDays, maxCount };
    return await apiPut(API_ENDPOINTS.ACTIVITY_LOGS_SETTINGS, data, 'update retention settings');
  } catch (error) {
    logApiError('updating retention settings', error);
    throw error;
  }
};

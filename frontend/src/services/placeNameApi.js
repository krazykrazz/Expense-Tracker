/**
 * Place Name API Service
 * Handles all API calls related to place name standardization
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, logApiError } from '../utils/apiClient.js';

/**
 * Analyze all place names and return similarity groups
 * @returns {Promise<Object>} { groups: Array, totalGroups: number, totalExpenses: number }
 */
export const analyzePlaceNames = async () => {
  try {
    return await apiGet(API_ENDPOINTS.PLACE_NAMES_ANALYZE, 'analyze place names');
  } catch (error) {
    logApiError('analyzing place names', error);
    throw error;
  }
};

/**
 * Apply standardization changes to place names
 * @param {Array} updates - Array of { from: string[], to: string } objects
 * @returns {Promise<Object>} { success: boolean, updatedCount: number, message: string }
 */
export const standardizePlaceNames = async (updates) => {
  try {
    return await apiPost(API_ENDPOINTS.PLACE_NAMES_STANDARDIZE, { updates }, 'standardize place names');
  } catch (error) {
    logApiError('standardizing place names', error);
    throw error;
  }
};

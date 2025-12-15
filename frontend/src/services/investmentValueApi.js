/**
 * Investment Value API Service
 * Handles all API calls related to investment value tracking
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiDelete, logApiError } from '../utils/apiClient.js';

/**
 * Get value history for a specific investment
 * @param {number} investmentId - Investment ID
 * @returns {Promise<Array>} Array of value entries with calculated changes
 */
export const getValueHistory = async (investmentId) => {
  try {
    return await apiGet(`${API_ENDPOINTS.INVESTMENT_VALUES}/${investmentId}`, 'fetch value history');
  } catch (error) {
    logApiError('fetching value history', error);
    throw error;
  }
};

/**
 * Get value entry for a specific investment and month
 * @param {number} investmentId - Investment ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Value entry object
 */
export const getValueForMonth = async (investmentId, year, month) => {
  try {
    return await apiGet(`${API_ENDPOINTS.INVESTMENT_VALUES}/${investmentId}/${year}/${month}`, 'fetch value for month');
  } catch (error) {
    logApiError('fetching value for month', error);
    throw error;
  }
};

/**
 * Create or update a value entry
 * @param {Object} valueData - { investment_id, year, month, value }
 * @returns {Promise<Object>} Created or updated value entry
 */
export const createOrUpdateValue = async (valueData) => {
  try {
    return await apiPost(API_ENDPOINTS.INVESTMENT_VALUES, valueData, 'create or update value');
  } catch (error) {
    logApiError('creating or updating value', error);
    throw error;
  }
};

/**
 * Delete a value entry
 * @param {number} id - Value entry ID
 * @returns {Promise<Object>} Success response
 */
export const deleteValue = async (id) => {
  try {
    return await apiDelete(`${API_ENDPOINTS.INVESTMENT_VALUES}/${id}`, 'delete value entry');
  } catch (error) {
    logApiError('deleting value entry', error);
    throw error;
  }
};

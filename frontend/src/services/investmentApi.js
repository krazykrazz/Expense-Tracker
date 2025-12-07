/**
 * Investment API Service
 * Handles all API calls related to investment management
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, logApiError } from '../utils/apiClient.js';

/**
 * Get all investments with current values
 * @returns {Promise<Array>} Array of investment objects with current values
 */
export const getAllInvestments = async () => {
  try {
    return await apiGet(API_ENDPOINTS.INVESTMENTS, 'fetch investments');
  } catch (error) {
    logApiError('fetching investments', error);
    throw error;
  }
};

/**
 * Create a new investment
 * @param {Object} investmentData - { name, type, initial_value }
 * @returns {Promise<Object>} Created investment object
 */
export const createInvestment = async (investmentData) => {
  try {
    return await apiPost(API_ENDPOINTS.INVESTMENTS, investmentData, 'create investment');
  } catch (error) {
    logApiError('creating investment', error);
    throw error;
  }
};

/**
 * Update an existing investment
 * @param {number} id - Investment ID
 * @param {Object} investmentData - { name, type }
 * @returns {Promise<Object>} Updated investment object
 */
export const updateInvestment = async (id, investmentData) => {
  try {
    return await apiPut(`${API_ENDPOINTS.INVESTMENTS}/${id}`, investmentData, 'update investment');
  } catch (error) {
    logApiError('updating investment', error);
    throw error;
  }
};

/**
 * Delete an investment
 * @param {number} id - Investment ID
 * @returns {Promise<Object>} Success response
 */
export const deleteInvestment = async (id) => {
  try {
    return await apiDelete(`${API_ENDPOINTS.INVESTMENTS}/${id}`, 'delete investment');
  } catch (error) {
    logApiError('deleting investment', error);
    throw error;
  }
};

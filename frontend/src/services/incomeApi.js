/**
 * Income API Service
 * Handles all API calls related to income source management
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, logApiError } from '../utils/apiClient.js';

/**
 * Get all income sources for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} { sources: Array, total: number, byCategory: Object }
 */
export const getMonthlyIncomeSources = async (year, month) => {
  try {
    const data = await apiGet(API_ENDPOINTS.INCOME_BY_MONTH(year, month), 'fetch income sources');
    
    // Parse byCategory from response (Requirement 2.5)
    return {
      sources: data.sources || [],
      total: data.total || 0,
      byCategory: data.byCategory || {}
    };
  } catch (error) {
    logApiError('fetching monthly income sources', error);
    throw error;
  }
};

/**
 * Create a new income source
 * @param {Object} data - { year, month, name, amount, category }
 * @returns {Promise<Object>} Created income source
 */
export const createIncomeSource = async (data) => {
  try {
    // Include category in request body (Requirement 1.5)
    return await apiPost(API_ENDPOINTS.INCOME, {
      year: data.year,
      month: data.month,
      name: data.name,
      amount: data.amount,
      category: data.category || 'Other'
    }, 'create income source');
  } catch (error) {
    logApiError('creating income source', error);
    throw error;
  }
};

/**
 * Update an income source
 * @param {number} id - Income source ID
 * @param {Object} data - { name, amount, category }
 * @returns {Promise<Object>} Updated income source
 */
export const updateIncomeSource = async (id, data) => {
  try {
    // Include category in request body (Requirement 3.3)
    return await apiPut(API_ENDPOINTS.INCOME_BY_ID(id), {
      name: data.name,
      amount: data.amount,
      category: data.category
    }, 'update income source');
  } catch (error) {
    logApiError('updating income source', error);
    throw error;
  }
};

/**
 * Delete an income source
 * @param {number} id - Income source ID
 * @returns {Promise<Object>} Success response
 */
export const deleteIncomeSource = async (id) => {
  try {
    return await apiDelete(API_ENDPOINTS.INCOME_BY_ID(id), 'delete income source');
  } catch (error) {
    logApiError('deleting income source', error);
    throw error;
  }
};

/**
 * Carry forward income sources from previous month
 * @param {number} year - Target year
 * @param {number} month - Target month (1-12)
 * @returns {Promise<Object>} { sources: Array, count: number }
 */
export const carryForwardIncomeSources = async (year, month) => {
  try {
    return await apiPost(API_ENDPOINTS.INCOME_COPY_PREVIOUS(year, month), {}, 'carry forward income sources');
  } catch (error) {
    logApiError('carrying forward income sources', error);
    throw error;
  }
};

/**
 * Get annual income breakdown by category
 * @param {number} year - Year
 * @returns {Promise<Object>} Category breakdown for the year
 */
export const getAnnualIncomeByCategory = async (year) => {
  try {
    return await apiGet(`${API_ENDPOINTS.INCOME}/annual/${year}/by-category`, 'fetch annual income by category');
  } catch (error) {
    logApiError('fetching annual income by category', error);
    throw error;
  }
};

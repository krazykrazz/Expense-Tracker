/**
 * Budget API Service
 * Handles all API calls related to budget management
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, logApiError } from '../utils/apiClient.js';

/**
 * Get all budgets for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} { budgets: Array }
 */
export const getBudgets = async (year, month) => {
  try {
    return await apiGet(`${API_ENDPOINTS.BUDGETS}?year=${year}&month=${month}`, 'fetch budgets');
  } catch (error) {
    logApiError('fetching budgets', error);
    throw error;
  }
};

/**
 * Create a new budget
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {string} category - Budget category (Food, Gas, Other)
 * @param {number} limit - Budget limit amount
 * @returns {Promise<Object>} Created budget object
 */
export const createBudget = async (year, month, category, limit) => {
  try {
    return await apiPost(API_ENDPOINTS.BUDGETS, { year, month, category, limit }, 'create budget');
  } catch (error) {
    logApiError('creating budget', error);
    throw error;
  }
};

/**
 * Update an existing budget limit
 * @param {number} id - Budget ID
 * @param {number} limit - New budget limit amount
 * @returns {Promise<Object>} Updated budget object
 */
export const updateBudget = async (id, limit) => {
  try {
    return await apiPut(`${API_ENDPOINTS.BUDGETS}/${id}`, { limit }, 'update budget');
  } catch (error) {
    logApiError('updating budget', error);
    throw error;
  }
};

/**
 * Delete a budget
 * @param {number} id - Budget ID
 * @returns {Promise<void>}
 */
export const deleteBudget = async (id) => {
  try {
    return await apiDelete(`${API_ENDPOINTS.BUDGETS}/${id}`, 'delete budget');
  } catch (error) {
    logApiError('deleting budget', error);
    throw error;
  }
};

/**
 * Get budget summary for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Budget summary with totals and progress
 */
export const getBudgetSummary = async (year, month) => {
  try {
    return await apiGet(`${API_ENDPOINTS.BUDGET_SUMMARY}?year=${year}&month=${month}`, 'fetch budget summary');
  } catch (error) {
    logApiError('fetching budget summary', error);
    throw error;
  }
};

/**
 * Get budget history for a time period
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {number} periodMonths - Number of months to include (3, 6, or 12)
 * @returns {Promise<Object>} Historical budget performance data
 */
export const getBudgetHistory = async (year, month, periodMonths = 6) => {
  try {
    return await apiGet(
      `${API_ENDPOINTS.BUDGET_HISTORY}?year=${year}&month=${month}&months=${periodMonths}`,
      'fetch budget history'
    );
  } catch (error) {
    logApiError('fetching budget history', error);
    throw error;
  }
};

/**
 * Copy budgets from one month to another
 * @param {number} sourceYear - Source year
 * @param {number} sourceMonth - Source month (1-12)
 * @param {number} targetYear - Target year
 * @param {number} targetMonth - Target month (1-12)
 * @param {boolean} overwrite - Whether to overwrite existing budgets in target month
 * @returns {Promise<Object>} { copied: number, skipped: number, overwritten: number }
 */
export const copyBudgets = async (sourceYear, sourceMonth, targetYear, targetMonth, overwrite = false) => {
  try {
    return await apiPost(
      API_ENDPOINTS.BUDGET_COPY,
      { sourceYear, sourceMonth, targetYear, targetMonth, overwrite },
      'copy budgets'
    );
  } catch (error) {
    logApiError('copying budgets', error);
    throw error;
  }
};

/**
 * Get budget suggestion based on historical spending
 * @param {number} year - Target year
 * @param {number} month - Target month (1-12)
 * @param {string} category - Budget category
 * @returns {Promise<Object>} { category, suggestedAmount, averageSpending, basedOnMonths }
 */
export const getBudgetSuggestion = async (year, month, category) => {
  try {
    return await apiGet(
      `${API_ENDPOINTS.BUDGET_SUGGEST}?year=${year}&month=${month}&category=${encodeURIComponent(category)}`,
      'fetch budget suggestion'
    );
  } catch (error) {
    logApiError('fetching budget suggestion', error);
    throw error;
  }
};

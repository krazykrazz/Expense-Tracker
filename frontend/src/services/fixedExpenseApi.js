/**
 * Fixed Expense API Service
 * Handles all API calls related to fixed expense management
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, logApiError } from '../utils/apiClient.js';

/**
 * Get all fixed expense items for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} { items: Array, total: number }
 */
export const getMonthlyFixedExpenses = async (year, month) => {
  try {
    return await apiGet(API_ENDPOINTS.FIXED_EXPENSES_BY_MONTH(year, month), 'fetch fixed expenses');
  } catch (error) {
    logApiError('fetching monthly fixed expenses', error);
    throw error;
  }
};

/**
 * Create a new fixed expense item
 * @param {Object} data - { year, month, name, amount, category, payment_type }
 * @returns {Promise<Object>} Created fixed expense
 */
export const createFixedExpense = async (data) => {
  try {
    return await apiPost(API_ENDPOINTS.FIXED_EXPENSES, data, 'create fixed expense');
  } catch (error) {
    logApiError('creating fixed expense', error);
    throw error;
  }
};

/**
 * Update a fixed expense item
 * @param {number} id - Fixed expense ID
 * @param {Object} data - { name, amount, category, payment_type }
 * @returns {Promise<Object>} Updated fixed expense
 */
export const updateFixedExpense = async (id, data) => {
  try {
    return await apiPut(API_ENDPOINTS.FIXED_EXPENSES_BY_ID(id), data, 'update fixed expense');
  } catch (error) {
    logApiError('updating fixed expense', error);
    throw error;
  }
};

/**
 * Delete a fixed expense item
 * @param {number} id - Fixed expense ID
 * @returns {Promise<Object>} Success response
 */
export const deleteFixedExpense = async (id) => {
  try {
    return await apiDelete(API_ENDPOINTS.FIXED_EXPENSES_BY_ID(id), 'delete fixed expense');
  } catch (error) {
    logApiError('deleting fixed expense', error);
    throw error;
  }
};

/**
 * Carry forward fixed expenses from previous month
 * @param {number} year - Target year
 * @param {number} month - Target month (1-12)
 * @returns {Promise<Object>} { items: Array, count: number }
 */
export const carryForwardFixedExpenses = async (year, month) => {
  try {
    return await apiPost(API_ENDPOINTS.FIXED_EXPENSES_CARRY_FORWARD, { year, month }, 'carry forward fixed expenses');
  } catch (error) {
    logApiError('carrying forward fixed expenses', error);
    throw error;
  }
};

/**
 * Get fixed expenses linked to a specific loan
 * @param {number} loanId - Loan ID
 * @returns {Promise<Array>} Array of fixed expense objects
 */
export const getFixedExpensesByLoan = async (loanId) => {
  try {
    return await apiGet(API_ENDPOINTS.FIXED_EXPENSES_BY_LOAN(loanId), 'fetch fixed expenses by loan');
  } catch (error) {
    logApiError('fetching fixed expenses by loan', error);
    throw error;
  }
};

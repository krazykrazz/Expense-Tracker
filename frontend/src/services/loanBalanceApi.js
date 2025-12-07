/**
 * Loan Balance API Service
 * Handles all API calls related to loan balance tracking
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiDelete, logApiError } from '../utils/apiClient.js';

/**
 * Get balance history for a specific loan
 * @param {number} loanId - Loan ID
 * @returns {Promise<Array>} Array of balance entries with calculated changes
 */
export const getBalanceHistory = async (loanId) => {
  try {
    return await apiGet(`${API_ENDPOINTS.LOAN_BALANCES}/${loanId}`, 'fetch balance history');
  } catch (error) {
    logApiError('fetching balance history', error);
    throw error;
  }
};

/**
 * Get balance entry for a specific loan and month
 * @param {number} loanId - Loan ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Balance entry object
 */
export const getBalanceForMonth = async (loanId, year, month) => {
  try {
    return await apiGet(`${API_ENDPOINTS.LOAN_BALANCES}/${loanId}/${year}/${month}`, 'fetch balance for month');
  } catch (error) {
    logApiError('fetching balance for month', error);
    throw error;
  }
};

/**
 * Create or update a balance entry
 * @param {Object} balanceData - { loan_id, year, month, remaining_balance, rate }
 * @returns {Promise<Object>} Created or updated balance entry
 */
export const createOrUpdateBalance = async (balanceData) => {
  try {
    return await apiPost(API_ENDPOINTS.LOAN_BALANCES, balanceData, 'create or update balance');
  } catch (error) {
    logApiError('creating or updating balance', error);
    throw error;
  }
};

/**
 * Delete a balance entry
 * @param {number} id - Balance entry ID
 * @returns {Promise<Object>} Success response
 */
export const deleteBalance = async (id) => {
  try {
    return await apiDelete(`${API_ENDPOINTS.LOAN_BALANCES}/${id}`, 'delete balance entry');
  } catch (error) {
    logApiError('deleting balance entry', error);
    throw error;
  }
};

/**
 * Get total debt over time across all active loans
 * @returns {Promise<Array>} Array of {year, month, total_debt, loan_count} objects
 */
export const getTotalDebtOverTime = async () => {
  try {
    return await apiGet(`${API_ENDPOINTS.LOAN_BALANCES}/total/history`, 'fetch total debt history');
  } catch (error) {
    logApiError('fetching total debt history', error);
    throw error;
  }
};



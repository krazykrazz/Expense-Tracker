/**
 * Loan API Service
 * Handles all API calls related to loan management
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, logApiError } from '../utils/apiClient.js';

/**
 * Get all loans with current balances
 * @returns {Promise<Array>} Array of loan objects with current balances
 */
export const getAllLoans = async () => {
  try {
    return await apiGet(API_ENDPOINTS.LOANS, 'fetch loans');
  } catch (error) {
    logApiError('fetching loans', error);
    throw error;
  }
};

/**
 * Create a new loan
 * @param {Object} loanData - { name, initial_balance, start_date, notes }
 * @returns {Promise<Object>} Created loan object
 */
export const createLoan = async (loanData) => {
  try {
    return await apiPost(API_ENDPOINTS.LOANS, loanData, 'create loan');
  } catch (error) {
    logApiError('creating loan', error);
    throw error;
  }
};

/**
 * Update an existing loan
 * @param {number} id - Loan ID
 * @param {Object} loanData - { name, notes }
 * @returns {Promise<Object>} Updated loan object
 */
export const updateLoan = async (id, loanData) => {
  try {
    return await apiPut(`${API_ENDPOINTS.LOANS}/${id}`, loanData, 'update loan');
  } catch (error) {
    logApiError('updating loan', error);
    throw error;
  }
};

/**
 * Delete a loan
 * @param {number} id - Loan ID
 * @returns {Promise<Object>} Success response
 */
export const deleteLoan = async (id) => {
  try {
    return await apiDelete(`${API_ENDPOINTS.LOANS}/${id}`, 'delete loan');
  } catch (error) {
    logApiError('deleting loan', error);
    throw error;
  }
};

/**
 * Mark a loan as paid off or reactivate it
 * @param {number} id - Loan ID
 * @param {boolean} isPaidOff - True to mark as paid off, false to reactivate
 * @returns {Promise<Object>} Updated loan object
 */
export const markPaidOff = async (id, isPaidOff) => {
  try {
    return await apiPut(`${API_ENDPOINTS.LOANS}/${id}/paid-off`, { isPaidOff }, 'update loan paid-off status');
  } catch (error) {
    logApiError('updating loan paid-off status', error);
    throw error;
  }
};

/**
 * Mortgage Insights API Service
 * Handles all API calls related to mortgage insights and payment tracking
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, logApiError } from '../utils/apiClient.js';

/**
 * Get mortgage insights including interest breakdown, projections, and status
 * @param {number} mortgageId - Mortgage loan ID
 * @returns {Promise<Object>} Mortgage insights object
 */
export const getMortgageInsights = async (mortgageId) => {
  try {
    return await apiGet(API_ENDPOINTS.LOAN_INSIGHTS(mortgageId), 'fetch mortgage insights');
  } catch (error) {
    logApiError('fetching mortgage insights', error);
    throw error;
  }
};

/**
 * Get payment history for a mortgage
 * @param {number} mortgageId - Mortgage loan ID
 * @returns {Promise<Array>} Array of payment entries in chronological order
 */
export const getMortgagePayments = async (mortgageId) => {
  try {
    return await apiGet(API_ENDPOINTS.LOAN_PAYMENTS(mortgageId), 'fetch mortgage payments');
  } catch (error) {
    logApiError('fetching mortgage payments', error);
    throw error;
  }
};

/**
 * Create a new mortgage payment entry
 * @param {number} mortgageId - Mortgage loan ID
 * @param {Object} data - { payment_amount, effective_date, notes? }
 * @returns {Promise<Object>} Created payment entry
 */
export const createMortgagePayment = async (mortgageId, data) => {
  try {
    return await apiPost(API_ENDPOINTS.LOAN_PAYMENTS(mortgageId), data, 'create mortgage payment');
  } catch (error) {
    logApiError('creating mortgage payment', error);
    throw error;
  }
};

/**
 * Update an existing mortgage payment entry
 * @param {number} mortgageId - Mortgage loan ID
 * @param {number} paymentId - Payment entry ID
 * @param {Object} data - { payment_amount, effective_date, notes? }
 * @returns {Promise<Object>} Updated payment entry
 */
export const updateMortgagePayment = async (mortgageId, paymentId, data) => {
  try {
    return await apiPut(API_ENDPOINTS.LOAN_PAYMENT(mortgageId, paymentId), data, 'update mortgage payment');
  } catch (error) {
    logApiError('updating mortgage payment', error);
    throw error;
  }
};

/**
 * Delete a mortgage payment entry
 * @param {number} mortgageId - Mortgage loan ID
 * @param {number} paymentId - Payment entry ID
 * @returns {Promise<Object>} Success response
 */
export const deleteMortgagePayment = async (mortgageId, paymentId) => {
  try {
    return await apiDelete(API_ENDPOINTS.LOAN_PAYMENT(mortgageId, paymentId), 'delete mortgage payment');
  } catch (error) {
    logApiError('deleting mortgage payment', error);
    throw error;
  }
};

/**
 * Calculate what-if scenario for extra payment
 * @param {number} mortgageId - Mortgage loan ID
 * @param {number} extraPayment - Extra payment amount to add
 * @returns {Promise<Object>} Scenario results with savings calculations
 */
export const calculateScenario = async (mortgageId, extraPayment) => {
  try {
    return await apiPost(
      API_ENDPOINTS.LOAN_SCENARIO(mortgageId), 
      { extra_payment: extraPayment }, 
      'calculate mortgage scenario'
    );
  } catch (error) {
    logApiError('calculating mortgage scenario', error);
    throw error;
  }
};

/**
 * Update the current interest rate for a variable rate mortgage
 * Creates or updates the balance entry for the current month with the new rate
 * @param {number} mortgageId - Mortgage loan ID
 * @param {number} rate - New interest rate (percentage)
 * @returns {Promise<Object>} Updated balance entry
 */
export const updateMortgageRate = async (mortgageId, rate) => {
  try {
    return await apiPut(
      API_ENDPOINTS.LOAN_RATE(mortgageId), 
      { rate }, 
      'update mortgage rate'
    );
  } catch (error) {
    logApiError('updating mortgage rate', error);
    throw error;
  }
};

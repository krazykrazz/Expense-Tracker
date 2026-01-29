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
 * @param {Object} loanData - { name, initial_balance, start_date, notes, ...mortgageFields }
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
 * @param {Object} loanData - { name, notes, ...editableMortgageFields }
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

// ============================================
// Mortgage-specific API functions
// ============================================

/**
 * Get amortization schedule for a mortgage
 * @param {number} id - Loan ID (must be a mortgage)
 * @returns {Promise<Object>} Amortization schedule with payment breakdown
 */
export const getAmortizationSchedule = async (id) => {
  try {
    return await apiGet(API_ENDPOINTS.LOAN_AMORTIZATION(id), 'fetch amortization schedule');
  } catch (error) {
    logApiError('fetching amortization schedule', error);
    throw error;
  }
};

/**
 * Get equity history for a mortgage
 * @param {number} id - Loan ID (must be a mortgage with estimated property value)
 * @returns {Promise<Object>} Equity history with current and historical equity data
 */
export const getEquityHistory = async (id) => {
  try {
    return await apiGet(API_ENDPOINTS.LOAN_EQUITY_HISTORY(id), 'fetch equity history');
  } catch (error) {
    logApiError('fetching equity history', error);
    throw error;
  }
};

/**
 * Update the estimated property value for a mortgage
 * @param {number} id - Loan ID (must be a mortgage)
 * @param {number} estimatedPropertyValue - New estimated property value
 * @returns {Promise<Object>} Updated mortgage with recalculated equity
 */
export const updatePropertyValue = async (id, estimatedPropertyValue) => {
  try {
    return await apiPut(
      API_ENDPOINTS.LOAN_PROPERTY_VALUE(id), 
      { estimated_property_value: estimatedPropertyValue }, 
      'update property value'
    );
  } catch (error) {
    logApiError('updating property value', error);
    throw error;
  }
};

// ============================================
// Mortgage Insights API functions
// ============================================

/**
 * Get mortgage insights (interest breakdown, projections, etc.)
 * @param {number} id - Loan ID (must be a mortgage)
 * @returns {Promise<Object>} Mortgage insights data
 */
export const getMortgageInsights = async (id) => {
  try {
    return await apiGet(API_ENDPOINTS.LOAN_INSIGHTS(id), 'fetch mortgage insights');
  } catch (error) {
    logApiError('fetching mortgage insights', error);
    throw error;
  }
};

/**
 * Get mortgage payment history
 * @param {number} id - Loan ID (must be a mortgage)
 * @returns {Promise<Array>} Array of payment entries
 */
export const getMortgagePayments = async (id) => {
  try {
    return await apiGet(API_ENDPOINTS.LOAN_PAYMENTS(id), 'fetch mortgage payments');
  } catch (error) {
    logApiError('fetching mortgage payments', error);
    throw error;
  }
};

/**
 * Create a mortgage payment entry
 * @param {number} id - Loan ID (must be a mortgage)
 * @param {Object} paymentData - { payment_amount, effective_date, notes? }
 * @returns {Promise<Object>} Created payment entry
 */
export const createMortgagePayment = async (id, paymentData) => {
  try {
    return await apiPost(API_ENDPOINTS.LOAN_PAYMENTS(id), paymentData, 'create mortgage payment');
  } catch (error) {
    logApiError('creating mortgage payment', error);
    throw error;
  }
};

/**
 * Update a mortgage payment entry
 * @param {number} loanId - Loan ID
 * @param {number} paymentId - Payment entry ID
 * @param {Object} paymentData - { payment_amount, effective_date, notes? }
 * @returns {Promise<Object>} Updated payment entry
 */
export const updateMortgagePayment = async (loanId, paymentId, paymentData) => {
  try {
    return await apiPut(
      `${API_ENDPOINTS.LOAN_PAYMENTS(loanId)}/${paymentId}`, 
      paymentData, 
      'update mortgage payment'
    );
  } catch (error) {
    logApiError('updating mortgage payment', error);
    throw error;
  }
};

/**
 * Delete a mortgage payment entry
 * @param {number} loanId - Loan ID
 * @param {number} paymentId - Payment entry ID
 * @returns {Promise<Object>} Success response
 */
export const deleteMortgagePayment = async (loanId, paymentId) => {
  try {
    return await apiDelete(
      `${API_ENDPOINTS.LOAN_PAYMENTS(loanId)}/${paymentId}`, 
      'delete mortgage payment'
    );
  } catch (error) {
    logApiError('deleting mortgage payment', error);
    throw error;
  }
};

/**
 * Calculate what-if scenario for extra payment
 * @param {number} id - Loan ID (must be a mortgage)
 * @param {number} extraPayment - Extra payment amount
 * @returns {Promise<Object>} Scenario calculation results
 */
export const calculateScenario = async (id, extraPayment) => {
  try {
    return await apiPost(
      API_ENDPOINTS.LOAN_SCENARIO(id), 
      { extra_payment: extraPayment }, 
      'calculate scenario'
    );
  } catch (error) {
    logApiError('calculating scenario', error);
    throw error;
  }
};

/**
 * Update the current interest rate for a mortgage (variable rate support)
 * @param {number} id - Loan ID (must be a mortgage)
 * @param {number} rate - New interest rate (percentage)
 * @returns {Promise<Object>} Updated balance entry and current status
 */
export const updateMortgageRate = async (id, rate) => {
  try {
    return await apiPut(
      API_ENDPOINTS.LOAN_RATE(id), 
      { rate }, 
      'update mortgage rate'
    );
  } catch (error) {
    logApiError('updating mortgage rate', error);
    throw error;
  }
};

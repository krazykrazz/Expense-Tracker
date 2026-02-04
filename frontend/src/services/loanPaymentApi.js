/**
 * Loan Payment API Service
 * Handles all API calls related to loan payment tracking for loans and mortgages.
 * 
 * This service provides payment-based tracking functionality:
 * - CRUD operations for payment entries
 * - Calculated balance retrieval
 * - Payment suggestions
 * - Migration from balance entries to payments
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 3.1, 4.1
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, logApiError } from '../utils/apiClient.js';

/**
 * Create a new payment entry for a loan
 * @param {number} loanId - Loan ID
 * @param {Object} paymentData - { amount, payment_date, notes? }
 * @returns {Promise<Object>} Created payment entry
 * Requirements: 1.1
 */
export const createPayment = async (loanId, paymentData) => {
  try {
    return await apiPost(
      API_ENDPOINTS.LOAN_PAYMENT_ENTRIES(loanId),
      paymentData,
      'create loan payment'
    );
  } catch (error) {
    logApiError('creating loan payment', error);
    throw error;
  }
};

/**
 * Get all payments for a loan in reverse chronological order
 * @param {number} loanId - Loan ID
 * @returns {Promise<Array>} Array of payment entries
 * Requirements: 1.2
 */
export const getPayments = async (loanId) => {
  try {
    return await apiGet(
      API_ENDPOINTS.LOAN_PAYMENT_ENTRIES(loanId),
      'fetch loan payments'
    );
  } catch (error) {
    logApiError('fetching loan payments', error);
    throw error;
  }
};


/**
 * Get a specific payment by ID
 * @param {number} loanId - Loan ID
 * @param {number} paymentId - Payment ID
 * @returns {Promise<Object>} Payment entry
 * Requirements: 1.1
 */
export const getPaymentById = async (loanId, paymentId) => {
  try {
    return await apiGet(
      API_ENDPOINTS.LOAN_PAYMENT_ENTRY(loanId, paymentId),
      'fetch loan payment'
    );
  } catch (error) {
    logApiError('fetching loan payment', error);
    throw error;
  }
};

/**
 * Update a payment entry
 * @param {number} loanId - Loan ID
 * @param {number} paymentId - Payment ID
 * @param {Object} paymentData - Updated payment data { amount?, payment_date?, notes? }
 * @returns {Promise<Object>} Updated payment entry
 * Requirements: 1.3
 */
export const updatePayment = async (loanId, paymentId, paymentData) => {
  try {
    return await apiPut(
      API_ENDPOINTS.LOAN_PAYMENT_ENTRY(loanId, paymentId),
      paymentData,
      'update loan payment'
    );
  } catch (error) {
    logApiError('updating loan payment', error);
    throw error;
  }
};

/**
 * Delete a payment entry
 * @param {number} loanId - Loan ID
 * @param {number} paymentId - Payment ID
 * @returns {Promise<Object>} Success response
 * Requirements: 1.4
 */
export const deletePayment = async (loanId, paymentId) => {
  try {
    return await apiDelete(
      API_ENDPOINTS.LOAN_PAYMENT_ENTRY(loanId, paymentId),
      'delete loan payment'
    );
  } catch (error) {
    logApiError('deleting loan payment', error);
    throw error;
  }
};

/**
 * Get calculated balance for a loan
 * Returns: { loanId, initialBalance, totalPayments, currentBalance, paymentCount, lastPaymentDate }
 * @param {number} loanId - Loan ID
 * @returns {Promise<Object>} Calculated balance data
 * Requirements: 2.1
 */
export const getCalculatedBalance = async (loanId) => {
  try {
    return await apiGet(
      API_ENDPOINTS.LOAN_CALCULATED_BALANCE(loanId),
      'fetch calculated balance'
    );
  } catch (error) {
    logApiError('fetching calculated balance', error);
    throw error;
  }
};

/**
 * Get balance history with running totals
 * Returns array of { date, payment, runningBalance }
 * @param {number} loanId - Loan ID
 * @returns {Promise<Array>} Balance history entries
 * Requirements: 2.1
 */
export const getBalanceHistory = async (loanId) => {
  try {
    return await apiGet(
      API_ENDPOINTS.LOAN_PAYMENT_BALANCE_HISTORY(loanId),
      'fetch balance history'
    );
  } catch (error) {
    logApiError('fetching balance history', error);
    throw error;
  }
};

/**
 * Get payment suggestion for a loan
 * Returns: { suggestedAmount, source, confidence, message }
 * - For mortgages: returns monthly_payment field value
 * - For loans with history: returns average of previous payments
 * - For loans without history: returns null
 * @param {number} loanId - Loan ID
 * @returns {Promise<Object>} Payment suggestion data
 * Requirements: 3.1
 */
export const getPaymentSuggestion = async (loanId) => {
  try {
    return await apiGet(
      API_ENDPOINTS.LOAN_PAYMENT_SUGGESTION(loanId),
      'fetch payment suggestion'
    );
  } catch (error) {
    logApiError('fetching payment suggestion', error);
    throw error;
  }
};

/**
 * Preview migration of balance entries to payment entries
 * Returns what would be migrated without executing
 * @param {number} loanId - Loan ID
 * @returns {Promise<Object>} Migration preview data
 * Requirements: 4.1
 */
export const previewMigration = async (loanId) => {
  try {
    return await apiGet(
      API_ENDPOINTS.LOAN_MIGRATE_BALANCES_PREVIEW(loanId),
      'preview balance migration'
    );
  } catch (error) {
    logApiError('previewing balance migration', error);
    throw error;
  }
};

/**
 * Migrate balance entries to payment entries
 * Converts existing balance differences to payment records
 * Returns: { loanId, converted, skipped, summary }
 * @param {number} loanId - Loan ID
 * @returns {Promise<Object>} Migration result
 * Requirements: 4.1
 */
export const migrateBalances = async (loanId) => {
  try {
    return await apiPost(
      API_ENDPOINTS.LOAN_MIGRATE_BALANCES(loanId),
      {},
      'migrate balance entries'
    );
  } catch (error) {
    logApiError('migrating balance entries', error);
    throw error;
  }
};

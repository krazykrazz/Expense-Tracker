/**
 * Credit Card API Service
 * Handles API calls related to credit card payments and statements
 */

import { API_ENDPOINTS } from '../config.js';
import { createLogger } from '../utils/logger';

const logger = createLogger('CreditCardApi');

/**
 * Retry configuration for API calls
 */
const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 1000,
  retryableStatuses: [408, 429, 500, 502, 503, 504]
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Enhanced fetch with retry logic
 */
const fetchWithRetry = async (url, options = {}, retryCount = 0) => {
  try {
    const response = await fetch(url, options);
    
    if (response.ok || !RETRY_CONFIG.retryableStatuses.includes(response.status)) {
      return response;
    }
    
    if (retryCount < RETRY_CONFIG.maxRetries) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response;
  } catch (error) {
    if (retryCount < RETRY_CONFIG.maxRetries) {
      await sleep(RETRY_CONFIG.retryDelay * (retryCount + 1));
      return fetchWithRetry(url, options, retryCount + 1);
    }
    throw error;
  }
};

// ==========================================
// Credit Card Payment Functions
// ==========================================


/**
 * Record a credit card payment
 * @param {number} paymentMethodId - Payment method ID (must be credit_card type)
 * @param {Object} paymentData - Payment data
 * @param {number} paymentData.amount - Payment amount (positive number)
 * @param {string} paymentData.payment_date - Payment date (YYYY-MM-DD)
 * @param {string} paymentData.notes - Optional notes
 * @returns {Promise<Object>} Created payment with updated balance
 */
export const recordPayment = async (paymentMethodId, paymentData) => {
  try {
    const response = await fetchWithRetry(API_ENDPOINTS.PAYMENT_METHOD_PAYMENTS(paymentMethodId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentData)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to record payment (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to record credit card payment:', error);
    throw new Error(`Unable to record payment: ${error.message}`);
  }
};

/**
 * Get payment history for a credit card
 * @param {number} paymentMethodId - Payment method ID
 * @param {Object} options - Filter options
 * @param {string} options.startDate - Start date filter (YYYY-MM-DD)
 * @param {string} options.endDate - End date filter (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of payments in reverse chronological order
 */
export const getPayments = async (paymentMethodId, options = {}) => {
  try {
    const params = new URLSearchParams();
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    
    const url = params.toString()
      ? `${API_ENDPOINTS.PAYMENT_METHOD_PAYMENTS(paymentMethodId)}?${params.toString()}`
      : API_ENDPOINTS.PAYMENT_METHOD_PAYMENTS(paymentMethodId);
    
    const response = await fetchWithRetry(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch payments (${response.status})`);
    }
    
    const data = await response.json();
    return data.payments || [];
  } catch (error) {
    logger.error('Failed to fetch credit card payments:', error);
    throw new Error(`Unable to load payments: ${error.message}`);
  }
};

/**
 * Delete a credit card payment
 * @param {number} paymentMethodId - Payment method ID
 * @param {number} paymentId - Payment ID to delete
 * @returns {Promise<Object>} Success response with updated balance
 */
export const deletePayment = async (paymentMethodId, paymentId) => {
  try {
    const response = await fetchWithRetry(
      API_ENDPOINTS.PAYMENT_METHOD_PAYMENT(paymentMethodId, paymentId),
      { method: 'DELETE' }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to delete payment (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to delete credit card payment:', error);
    throw new Error(`Unable to delete payment: ${error.message}`);
  }
};

/**
 * Get total payments for a credit card in a date range
 * @param {number} paymentMethodId - Payment method ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Total payments data
 */
export const getTotalPayments = async (paymentMethodId, startDate, endDate) => {
  try {
    const params = new URLSearchParams();
    params.append('startDate', startDate);
    params.append('endDate', endDate);
    
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.PAYMENT_METHOD_PAYMENTS_TOTAL(paymentMethodId)}?${params.toString()}`
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch total payments (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to fetch total payments:', error);
    throw new Error(`Unable to load total payments: ${error.message}`);
  }
};

// ==========================================
// Credit Card Statement Functions
// ==========================================

/**
 * Upload a credit card statement
 * @param {number} paymentMethodId - Payment method ID
 * @param {File} file - Statement file (PDF)
 * @param {Object} metadata - Statement metadata
 * @param {string} metadata.statement_date - Statement date (YYYY-MM-DD)
 * @param {string} metadata.statement_period_start - Period start date (YYYY-MM-DD)
 * @param {string} metadata.statement_period_end - Period end date (YYYY-MM-DD)
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} Created statement data
 */
export const uploadStatement = async (paymentMethodId, file, metadata, onProgress = null) => {
  try {
    const formData = new FormData();
    formData.append('statement', file);
    formData.append('statement_date', metadata.statement_date);
    formData.append('statement_period_start', metadata.statement_period_start);
    formData.append('statement_period_end', metadata.statement_period_end);

    // Use XMLHttpRequest for progress tracking if callback provided
    if (onProgress && typeof onProgress === 'function') {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        });

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (parseError) {
              reject(new Error('Invalid server response'));
            }
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              reject(new Error(errorResponse.error || `Upload failed (${xhr.status})`));
            } catch (parseError) {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during upload'));
        };

        xhr.ontimeout = () => {
          reject(new Error('Upload timed out'));
        };

        xhr.open('POST', API_ENDPOINTS.PAYMENT_METHOD_STATEMENTS(paymentMethodId));
        xhr.timeout = 60000;
        xhr.send(formData);
      });
    }

    // Fallback to regular fetch
    const response = await fetchWithRetry(
      API_ENDPOINTS.PAYMENT_METHOD_STATEMENTS(paymentMethodId),
      {
        method: 'POST',
        body: formData
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Statement upload failed (${response.status})`);
    }

    return await response.json();
  } catch (error) {
    logger.error('Failed to upload statement:', error);
    throw new Error(`Unable to upload statement: ${error.message}`);
  }
};

/**
 * Get all statements for a credit card
 * @param {number} paymentMethodId - Payment method ID
 * @returns {Promise<Array>} Array of statements in reverse chronological order
 */
export const getStatements = async (paymentMethodId) => {
  try {
    const response = await fetchWithRetry(
      API_ENDPOINTS.PAYMENT_METHOD_STATEMENTS(paymentMethodId)
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch statements (${response.status})`);
    }
    
    const data = await response.json();
    return data.statements || [];
  } catch (error) {
    logger.error('Failed to fetch statements:', error);
    throw new Error(`Unable to load statements: ${error.message}`);
  }
};

/**
 * Get URL for downloading a statement file
 * @param {number} paymentMethodId - Payment method ID
 * @param {number} statementId - Statement ID
 * @returns {string} URL to download the statement
 */
export const getStatementUrl = (paymentMethodId, statementId) => {
  return API_ENDPOINTS.PAYMENT_METHOD_STATEMENT(paymentMethodId, statementId);
};

/**
 * Download a statement file
 * @param {number} paymentMethodId - Payment method ID
 * @param {number} statementId - Statement ID
 * @returns {Promise<Blob>} Statement file blob
 */
export const downloadStatement = async (paymentMethodId, statementId) => {
  try {
    const response = await fetchWithRetry(
      API_ENDPOINTS.PAYMENT_METHOD_STATEMENT(paymentMethodId, statementId)
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to download statement (${response.status})`);
    }
    
    return await response.blob();
  } catch (error) {
    logger.error('Failed to download statement:', error);
    throw new Error(`Unable to download statement: ${error.message}`);
  }
};

/**
 * Delete a statement
 * @param {number} paymentMethodId - Payment method ID
 * @param {number} statementId - Statement ID
 * @returns {Promise<Object>} Success response
 */
export const deleteStatement = async (paymentMethodId, statementId) => {
  try {
    const response = await fetchWithRetry(
      API_ENDPOINTS.PAYMENT_METHOD_STATEMENT(paymentMethodId, statementId),
      { method: 'DELETE' }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to delete statement (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to delete statement:', error);
    throw new Error(`Unable to delete statement: ${error.message}`);
  }
};

// ==========================================
// Credit Card Billing Cycle Functions
// ==========================================

/**
 * Get billing cycle history for a credit card (legacy endpoint)
 * @param {number} paymentMethodId - Payment method ID
 * @param {number} count - Number of cycles to retrieve (default 6, max 24)
 * @returns {Promise<Array>} Array of billing cycle details sorted by date descending
 */
export const getBillingCycles = async (paymentMethodId, count = 6) => {
  try {
    const params = new URLSearchParams();
    if (count && count !== 6) {
      params.append('count', count.toString());
    }
    
    const url = params.toString()
      ? `${API_ENDPOINTS.PAYMENT_METHOD_BILLING_CYCLES(paymentMethodId)}?${params.toString()}`
      : API_ENDPOINTS.PAYMENT_METHOD_BILLING_CYCLES(paymentMethodId);
    
    const response = await fetchWithRetry(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch billing cycles (${response.status})`);
    }
    
    const data = await response.json();
    return data.cycles || [];
  } catch (error) {
    logger.error('Failed to fetch billing cycles:', error);
    throw new Error(`Unable to load billing cycles: ${error.message}`);
  }
};

// ==========================================
// Credit Card Billing Cycle History Functions
// ==========================================

/**
 * Create a billing cycle record with actual statement balance
 * @param {number} paymentMethodId - Payment method ID (must be credit_card type with billing_cycle_day)
 * @param {Object} data - Billing cycle data
 * @param {number} data.actual_statement_balance - Actual statement balance from credit card statement
 * @param {number} [data.minimum_payment] - Optional minimum payment amount
 * @param {string} [data.due_date] - Optional due date (YYYY-MM-DD)
 * @param {string} [data.notes] - Optional notes
 * @returns {Promise<Object>} Created billing cycle record with discrepancy info
 */
export const createBillingCycle = async (paymentMethodId, data) => {
  try {
    const response = await fetchWithRetry(
      API_ENDPOINTS.PAYMENT_METHOD_BILLING_CYCLE_CREATE(paymentMethodId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to create billing cycle (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to create billing cycle:', error);
    throw new Error(`Unable to create billing cycle: ${error.message}`);
  }
};

/**
 * Get billing cycle history with discrepancy calculations
 * @param {number} paymentMethodId - Payment method ID
 * @param {Object} [options] - Query options
 * @param {number} [options.limit] - Maximum number of records to return
 * @param {string} [options.startDate] - Start date filter (YYYY-MM-DD)
 * @param {string} [options.endDate] - End date filter (YYYY-MM-DD)
 * @returns {Promise<Object>} Billing cycle history with records sorted by cycle_end_date DESC
 */
export const getBillingCycleHistory = async (paymentMethodId, options = {}) => {
  try {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    
    const url = params.toString()
      ? `${API_ENDPOINTS.PAYMENT_METHOD_BILLING_CYCLE_HISTORY(paymentMethodId)}?${params.toString()}`
      : API_ENDPOINTS.PAYMENT_METHOD_BILLING_CYCLE_HISTORY(paymentMethodId);
    
    const response = await fetchWithRetry(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch billing cycle history (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to fetch billing cycle history:', error);
    throw new Error(`Unable to load billing cycle history: ${error.message}`);
  }
};

/**
 * Update a billing cycle record
 * @param {number} paymentMethodId - Payment method ID
 * @param {number} cycleId - Billing cycle record ID
 * @param {Object} data - Updated data
 * @param {number} [data.actual_statement_balance] - Updated actual statement balance
 * @param {number} [data.minimum_payment] - Updated minimum payment
 * @param {string} [data.due_date] - Updated due date (YYYY-MM-DD)
 * @param {string} [data.notes] - Updated notes
 * @returns {Promise<Object>} Updated billing cycle record with discrepancy info
 */
export const updateBillingCycle = async (paymentMethodId, cycleId, data) => {
  try {
    const response = await fetchWithRetry(
      API_ENDPOINTS.PAYMENT_METHOD_BILLING_CYCLE_UPDATE(paymentMethodId, cycleId),
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to update billing cycle (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to update billing cycle:', error);
    throw new Error(`Unable to update billing cycle: ${error.message}`);
  }
};

/**
 * Delete a billing cycle record
 * @param {number} paymentMethodId - Payment method ID
 * @param {number} cycleId - Billing cycle record ID
 * @returns {Promise<Object>} Success response
 */
export const deleteBillingCycle = async (paymentMethodId, cycleId) => {
  try {
    const response = await fetchWithRetry(
      API_ENDPOINTS.PAYMENT_METHOD_BILLING_CYCLE_DELETE(paymentMethodId, cycleId),
      { method: 'DELETE' }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to delete billing cycle (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to delete billing cycle:', error);
    throw new Error(`Unable to delete billing cycle: ${error.message}`);
  }
};

/**
 * Get current billing cycle status for a credit card
 * Returns whether actual balance has been entered for the current period
 * @param {number} paymentMethodId - Payment method ID
 * @returns {Promise<Object>} Current cycle status
 * {
 *   hasActualBalance: boolean,
 *   cycleStartDate: string (YYYY-MM-DD),
 *   cycleEndDate: string (YYYY-MM-DD),
 *   actualBalance: number|null,
 *   calculatedBalance: number,
 *   daysUntilCycleEnd: number,
 *   needsEntry: boolean
 * }
 */
export const getCurrentCycleStatus = async (paymentMethodId) => {
  try {
    const response = await fetchWithRetry(
      API_ENDPOINTS.PAYMENT_METHOD_BILLING_CYCLE_CURRENT(paymentMethodId)
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch current cycle status (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to fetch current cycle status:', error);
    throw new Error(`Unable to load current cycle status: ${error.message}`);
  }
};

/**
 * Get statement balance info for a credit card
 * Returns the calculated statement balance based on billing_cycle_day
 * @param {number} paymentMethodId - Payment method ID
 * @returns {Promise<Object|null>} Statement balance info or null if not configured
 * {
 *   statementBalance: number,
 *   cycleStartDate: string (YYYY-MM-DD),
 *   cycleEndDate: string (YYYY-MM-DD),
 *   totalExpenses: number,
 *   totalPayments: number,
 *   isPaid: boolean
 * }
 */
export const getStatementBalance = async (paymentMethodId) => {
  try {
    const response = await fetchWithRetry(
      API_ENDPOINTS.PAYMENT_METHOD_STATEMENT_BALANCE(paymentMethodId)
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch statement balance (${response.status})`);
    }
    
    const data = await response.json();
    return data.statementBalance || null;
  } catch (error) {
    logger.error('Failed to fetch statement balance:', error);
    throw new Error(`Unable to load statement balance: ${error.message}`);
  }
};

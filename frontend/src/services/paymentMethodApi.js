/**
 * Payment Method API Service
 * Handles API calls related to payment method management
 */

import { API_ENDPOINTS } from '../config.js';
import { createLogger } from '../utils/logger';
import { fetchWithTabId } from '../utils/tabId';
import { getFetchFn } from '../utils/fetchProvider';

const logger = createLogger('PaymentMethodApi');

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
    const fn = getFetchFn();
    const response = await fn(url, options);
    
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


/**
 * Get all payment methods
 * @param {Object} options - Filter options
 * @param {string} options.type - Filter by payment method type
 * @param {boolean} options.activeOnly - Filter to active methods only
 * @param {boolean} options.withCounts - Include expense counts (default: true)
 * @returns {Promise<Array>} Array of payment methods
 */
export const getPaymentMethods = async (options = {}) => {
  try {
    const params = new URLSearchParams();
    if (options.type) params.append('type', options.type);
    if (options.activeOnly !== undefined) params.append('activeOnly', options.activeOnly);
    // Include expense counts by default for the payment methods list
    params.append('withCounts', options.withCounts !== false ? 'true' : 'false');
    
    const url = `${API_ENDPOINTS.PAYMENT_METHODS}?${params.toString()}`;
    
    const response = await fetchWithRetry(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch payment methods (${response.status})`);
    }
    
    const data = await response.json();
    return data.paymentMethods || [];
  } catch (error) {
    logger.error('Failed to fetch payment methods:', error);
    throw new Error(`Unable to load payment methods: ${error.message}`);
  }
};

/**
 * Get active payment methods for dropdown population
 * @returns {Promise<Array>} Array of active payment methods
 */
export const getActivePaymentMethods = async () => {
  try {
    const response = await fetchWithRetry(API_ENDPOINTS.PAYMENT_METHOD_ACTIVE);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch active payment methods (${response.status})`);
    }
    
    const data = await response.json();
    return data.paymentMethods || [];
  } catch (error) {
    logger.error('Failed to fetch active payment methods:', error);
    throw new Error(`Unable to load active payment methods: ${error.message}`);
  }
};

/**
 * Get a specific payment method by ID
 * @param {number} id - Payment method ID
 * @returns {Promise<Object>} Payment method data with computed fields
 */
export const getPaymentMethod = async (id) => {
  try {
    const response = await fetchWithRetry(API_ENDPOINTS.PAYMENT_METHOD_BY_ID(id));
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch payment method (${response.status})`);
    }
    
    const data = await response.json();
    return data.paymentMethod;
  } catch (error) {
    logger.error('Failed to fetch payment method:', error);
    throw new Error(`Unable to load payment method: ${error.message}`);
  }
};

/**
 * Create a new payment method
 * @param {Object} paymentMethodData - Payment method data
 * @returns {Promise<Object>} Created payment method
 */
export const createPaymentMethod = async (paymentMethodData) => {
  try {
    const response = await fetchWithTabId(API_ENDPOINTS.PAYMENT_METHODS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentMethodData)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to create payment method (${response.status})`);
    }
    
    const data = await response.json();
    return data.paymentMethod;
  } catch (error) {
    logger.error('Failed to create payment method:', error);
    throw new Error(`Unable to create payment method: ${error.message}`);
  }
};

/**
 * Update an existing payment method
 * @param {number} id - Payment method ID
 * @param {Object} paymentMethodData - Updated payment method data
 * @returns {Promise<Object>} Updated payment method
 */
export const updatePaymentMethod = async (id, paymentMethodData) => {
  try {
    const response = await fetchWithTabId(API_ENDPOINTS.PAYMENT_METHOD_BY_ID(id), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentMethodData)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to update payment method (${response.status})`);
    }
    
    const data = await response.json();
    return data.paymentMethod;
  } catch (error) {
    logger.error('Failed to update payment method:', error);
    throw new Error(`Unable to update payment method: ${error.message}`);
  }
};

/**
 * Delete a payment method (only if no associated expenses)
 * @param {number} id - Payment method ID
 * @returns {Promise<Object>} Success response
 */
export const deletePaymentMethod = async (id) => {
  try {
    const response = await fetchWithTabId(API_ENDPOINTS.PAYMENT_METHOD_BY_ID(id), {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to delete payment method (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to delete payment method:', error);
    throw new Error(`Unable to delete payment method: ${error.message}`);
  }
};

/**
 * Set payment method active/inactive status
 * @param {number} id - Payment method ID
 * @param {boolean} isActive - Active status
 * @returns {Promise<Object>} Updated payment method
 */
export const setPaymentMethodActive = async (id, isActive) => {
  try {
    const response = await fetchWithTabId(API_ENDPOINTS.PAYMENT_METHOD_SET_ACTIVE(id), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ isActive })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to update payment method status (${response.status})`);
    }
    
    const data = await response.json();
    return data.paymentMethod;
  } catch (error) {
    logger.error('Failed to update payment method status:', error);
    throw new Error(`Unable to update payment method status: ${error.message}`);
  }
};

/**
 * Get all display names (for validation)
 * @returns {Promise<Array>} Array of display names
 */
export const getDisplayNames = async () => {
  try {
    const response = await fetchWithRetry(API_ENDPOINTS.PAYMENT_METHOD_DISPLAY_NAMES);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch display names (${response.status})`);
    }
    
    const data = await response.json();
    return data.displayNames || [];
  } catch (error) {
    logger.error('Failed to fetch display names:', error);
    throw new Error(`Unable to load display names: ${error.message}`);
  }
};

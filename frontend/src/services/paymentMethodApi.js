/**
 * Payment Method API Service
 * Handles API calls related to payment method management
 */

import { API_ENDPOINTS } from '../config.js';
import { createLogger } from '../utils/logger';
import { apiGet, apiPost, apiPut, apiDelete, apiPatch, ApiError } from '../utils/apiClient';
import { apiGetWithRetry } from '../utils/fetchWithRetry';

const logger = createLogger('PaymentMethodApi');

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
    const data = await apiGetWithRetry(apiGet, url, 'fetch payment methods');
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
    const data = await apiGetWithRetry(apiGet, API_ENDPOINTS.PAYMENT_METHOD_ACTIVE, 'fetch active payment methods');
    return data.paymentMethods || [];
  } catch (error) {
    logger.error('Failed to fetch active payment methods:', error);
    throw new Error(`Unable to load active payment methods: ${error.message}`);
  }
};

/**
 * Get a specific payment method by ID
 * @param {number} id - Payment method ID
 * @returns {Promise<Object|null>} Payment method data with computed fields, or null if not found
 */
export const getPaymentMethod = async (id) => {
  try {
    const data = await apiGetWithRetry(apiGet, API_ENDPOINTS.PAYMENT_METHOD_BY_ID(id), 'fetch payment method');
    return data.paymentMethod;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
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
    const data = await apiPost(API_ENDPOINTS.PAYMENT_METHODS, paymentMethodData, 'create payment method');
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
    const data = await apiPut(API_ENDPOINTS.PAYMENT_METHOD_BY_ID(id), paymentMethodData, 'update payment method');
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
    return await apiDelete(API_ENDPOINTS.PAYMENT_METHOD_BY_ID(id), 'delete payment method');
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
    const data = await apiPatch(API_ENDPOINTS.PAYMENT_METHOD_SET_ACTIVE(id), { isActive }, 'update payment method status');
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
    const data = await apiGetWithRetry(apiGet, API_ENDPOINTS.PAYMENT_METHOD_DISPLAY_NAMES, 'fetch display names');
    return data.displayNames || [];
  } catch (error) {
    logger.error('Failed to fetch display names:', error);
    throw new Error(`Unable to load display names: ${error.message}`);
  }
};

/**
 * Shared fetch retry utility.
 * Provides retry logic with linear backoff for transient HTTP failures.
 *
 * Extracted from identical inline implementations in creditCardApi.js,
 * paymentMethodApi.js, and invoiceApi.js to eliminate ~90 lines of duplication.
 */

import { getFetchFn } from './fetchProvider';

export const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 1000,
  retryableStatuses: [408, 429, 500, 502, 503, 504]
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch with automatic retry on transient failures.
 * Uses linear backoff: retryDelay * (retryCount + 1).
 *
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {number} retryCount - Current retry attempt (internal, starts at 0)
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithRetry(url, options = {}, retryCount = 0) {
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
}

/**
 * Convenience wrapper: apiGet with retry logic.
 * Composes fetchWithRetry's transient-failure handling with apiGet's
 * centralized response parsing and error handling.
 *
 * Retries on retryable HTTP statuses (via ApiError.status) and
 * network errors (status 0).
 *
 * @param {Function} apiGetFn - The apiGet function from apiClient
 * @param {string} url - API endpoint URL
 * @param {string} operation - Description for error messages
 * @param {number} retryCount - Current retry attempt (internal)
 * @returns {Promise<any>} Parsed response data
 */
export async function apiGetWithRetry(apiGetFn, url, operation, retryCount = 0) {
  try {
    return await apiGetFn(url, operation);
  } catch (error) {
    const status = error.status || 0;
    const isRetryable = RETRY_CONFIG.retryableStatuses.includes(status) || status === 0;
    if (isRetryable && retryCount < RETRY_CONFIG.maxRetries) {
      await sleep(RETRY_CONFIG.retryDelay * (retryCount + 1));
      return apiGetWithRetry(apiGetFn, url, operation, retryCount + 1);
    }
    throw error;
  }
}

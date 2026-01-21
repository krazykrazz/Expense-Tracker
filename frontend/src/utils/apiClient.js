/**
 * Centralized API Client Utility
 * Provides consistent error handling and request/response processing for all API calls
 */

import { createLogger } from './logger';

const logger = createLogger('ApiClient');

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Process API response and handle errors consistently
 * @param {Response} response - Fetch API response object
 * @param {string} operation - Description of the operation for error messages
 * @returns {Promise<any>} Parsed JSON response
 * @throws {ApiError} If response is not ok
 */
async function handleResponse(response, operation) {
  if (!response.ok) {
    // Try to parse error data from response
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || errorData.error || `Failed to ${operation}`;
    
    throw new ApiError(errorMessage, response.status, errorData);
  }
  
  // Handle 204 No Content responses
  if (response.status === 204) {
    return null;
  }
  
  return await response.json();
}

/**
 * Make a GET request
 * @param {string} url - API endpoint URL
 * @param {string} operation - Description of operation for error messages
 * @returns {Promise<any>} Response data
 */
export async function apiGet(url, operation = 'fetch data') {
  try {
    const response = await fetch(url);
    return await handleResponse(response, operation);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network or other errors
    throw new ApiError(`Network error: ${error.message}`, 0, { originalError: error });
  }
}

/**
 * Make a POST request
 * @param {string} url - API endpoint URL
 * @param {Object} data - Request body data
 * @param {string} operation - Description of operation for error messages
 * @returns {Promise<any>} Response data
 */
export async function apiPost(url, data, operation = 'create resource') {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    return await handleResponse(response, operation);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(`Network error: ${error.message}`, 0, { originalError: error });
  }
}

/**
 * Make a PUT request
 * @param {string} url - API endpoint URL
 * @param {Object} data - Request body data
 * @param {string} operation - Description of operation for error messages
 * @returns {Promise<any>} Response data
 */
export async function apiPut(url, data, operation = 'update resource') {
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    return await handleResponse(response, operation);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(`Network error: ${error.message}`, 0, { originalError: error });
  }
}

/**
 * Make a DELETE request
 * @param {string} url - API endpoint URL
 * @param {string} operation - Description of operation for error messages
 * @returns {Promise<any>} Response data (may be null for 204 responses)
 */
export async function apiDelete(url, operation = 'delete resource') {
  try {
    const response = await fetch(url, {
      method: 'DELETE'
    });
    return await handleResponse(response, operation);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(`Network error: ${error.message}`, 0, { originalError: error });
  }
}

/**
 * Make a PATCH request
 * @param {string} url - API endpoint URL
 * @param {Object} data - Request body data
 * @param {string} operation - Description of operation for error messages
 * @returns {Promise<any>} Response data
 */
export async function apiPatch(url, data, operation = 'patch resource') {
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    return await handleResponse(response, operation);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(`Network error: ${error.message}`, 0, { originalError: error });
  }
}

/**
 * Log API errors using the centralized logger
 * In production, this could be extended to send to error tracking service
 * @param {string} context - Context of the error (e.g., 'fetching loans')
 * @param {Error} error - The error object
 */
export function logApiError(context, error) {
  if (error instanceof ApiError) {
    logger.error(`${context}:`, {
      message: error.message,
      status: error.status,
      data: error.data
    });
  } else {
    logger.error(`${context}:`, error);
  }
}

/**
 * Invoice API Service
 * Handles API calls related to invoice management for medical expenses
 * Supports multiple invoices per expense with optional person linking
 */

import { API_ENDPOINTS } from '../config.js';
import { createLogger } from '../utils/logger';

const logger = createLogger('InvoiceApi');

/**
 * Retry configuration for API calls
 */
const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 1000, // 1 second
  retryableStatuses: [408, 429, 500, 502, 503, 504]
};

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Enhanced fetch with retry logic
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {number} retryCount - Current retry count
 * @returns {Promise<Response>} Fetch response
 */
const fetchWithRetry = async (url, options = {}, retryCount = 0) => {
  try {
    const response = await fetch(url, options);
    
    // If response is ok or not retryable, return it
    if (response.ok || !RETRY_CONFIG.retryableStatuses.includes(response.status)) {
      return response;
    }
    
    // If we can retry, throw error to trigger retry logic
    if (retryCount < RETRY_CONFIG.maxRetries) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response;
  } catch (error) {
    // Retry on network errors or retryable HTTP errors
    if (retryCount < RETRY_CONFIG.maxRetries) {
      await sleep(RETRY_CONFIG.retryDelay * (retryCount + 1)); // Exponential backoff
      return fetchWithRetry(url, options, retryCount + 1);
    }
    
    throw error;
  }
};

/**
 * Get invoice metadata for an expense (backward compatible - returns first invoice)
 * @param {number} expenseId - Expense ID
 * @returns {Promise<Object|null>} Invoice metadata or null if not found
 */
export const getInvoiceMetadata = async (expenseId) => {
  try {
    const response = await fetchWithRetry(API_ENDPOINTS.INVOICE_METADATA(expenseId));
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // No invoice found
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch invoice metadata (${response.status})`);
    }
    
    const data = await response.json();
    return data.invoice;
  } catch (error) {
    logger.error('Failed to fetch invoice metadata:', error);
    throw new Error(`Unable to load invoice information: ${error.message}`);
  }
};

/**
 * Get all invoices for an expense
 * @param {number} expenseId - Expense ID
 * @returns {Promise<Array>} Array of invoice metadata with person info
 */
export const getInvoicesForExpense = async (expenseId) => {
  try {
    const response = await fetchWithRetry(API_ENDPOINTS.INVOICES_FOR_EXPENSE(expenseId));
    
    if (!response.ok) {
      if (response.status === 404) {
        return []; // No invoices found
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch invoices (${response.status})`);
    }
    
    const data = await response.json();
    return data.invoices || [];
  } catch (error) {
    logger.error('Failed to fetch invoices for expense:', error);
    throw new Error(`Unable to load invoices: ${error.message}`);
  }
};

/**
 * Delete all invoices for an expense (backward compatible)
 * @param {number} expenseId - Expense ID
 * @returns {Promise<Object>} Success response
 */
export const deleteInvoice = async (expenseId) => {
  try {
    const response = await fetchWithRetry(API_ENDPOINTS.INVOICE_DELETE_ALL(expenseId), {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to delete invoice (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to delete invoice:', error);
    throw new Error(`Unable to delete invoice: ${error.message}`);
  }
};

/**
 * Delete a specific invoice by ID
 * @param {number} invoiceId - Invoice ID
 * @returns {Promise<Object>} Success response
 */
export const deleteInvoiceById = async (invoiceId) => {
  try {
    const response = await fetchWithRetry(API_ENDPOINTS.INVOICE_BY_ID(invoiceId), {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to delete invoice (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to delete invoice by ID:', error);
    throw new Error(`Unable to delete invoice: ${error.message}`);
  }
};

/**
 * Update person association for an invoice
 * @param {number} invoiceId - Invoice ID
 * @param {number|null} personId - Person ID to link, or null to unlink
 * @returns {Promise<Object>} Updated invoice data
 */
export const updateInvoicePersonLink = async (invoiceId, personId) => {
  try {
    const response = await fetchWithRetry(API_ENDPOINTS.INVOICE_BY_ID(invoiceId), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ personId })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to update invoice person link (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error('Failed to update invoice person link:', error);
    throw new Error(`Unable to update invoice: ${error.message}`);
  }
};

/**
 * Upload invoice for an expense with progress tracking
 * @param {number} expenseId - Expense ID
 * @param {File} file - Invoice file to upload
 * @param {Object} options - Upload options
 * @param {number|null} options.personId - Optional person ID to link invoice to
 * @param {Function} options.onProgress - Progress callback (optional)
 * @returns {Promise<Object>} Upload response with invoice data
 */
export const uploadInvoice = async (expenseId, file, options = {}) => {
  const { personId = null, onProgress = null } = options;
  
  try {
    const formData = new FormData();
    formData.append('invoice', file);
    formData.append('expenseId', expenseId.toString());
    
    // Add personId if provided
    if (personId !== null && personId !== undefined) {
      formData.append('personId', personId.toString());
    }

    // Use XMLHttpRequest for progress tracking if callback provided
    if (onProgress && typeof onProgress === 'function') {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Set up progress tracking
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

        xhr.open('POST', API_ENDPOINTS.INVOICE_UPLOAD);
        xhr.timeout = 60000; // 60 second timeout
        xhr.send(formData);
      });
    }

    // Fallback to regular fetch for simpler uploads
    const response = await fetchWithRetry(API_ENDPOINTS.INVOICE_UPLOAD, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Invoice upload failed (${response.status})`);
    }

    return await response.json();
  } catch (error) {
    logger.error('Failed to upload invoice:', error);
    throw new Error(`Unable to upload invoice: ${error.message}`);
  }
};

/**
 * Get URL for viewing a specific invoice file
 * @param {number} expenseId - Expense ID
 * @param {number} invoiceId - Invoice ID
 * @returns {string} URL to fetch the invoice file
 */
export const getInvoiceFileUrl = (expenseId, invoiceId) => {
  return API_ENDPOINTS.INVOICE_FILE(expenseId, invoiceId);
};

/**
 * Get URL for viewing the first invoice file (backward compatible)
 * @param {number} expenseId - Expense ID
 * @returns {string} URL to fetch the invoice file
 */
export const getInvoiceUrl = (expenseId) => {
  return `${API_ENDPOINTS.INVOICE_BY_EXPENSE(expenseId)}/file`;
};

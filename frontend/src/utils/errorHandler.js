/**
 * Centralized error handling utility for consistent error management
 */

/**
 * Handle errors consistently across the application
 * @param {Error} error - The error object
 * @param {Object} options - Configuration options
 * @param {boolean} options.showToUser - Whether to return user-friendly message
 * @param {boolean} options.logToConsole - Whether to log to console
 * @param {string} options.context - Context for logging (e.g., component name)
 * @param {string} options.fallbackMessage - Custom fallback message
 * @returns {Object|null} Error message object or null
 */
export const handleError = (error, options = {}) => {
  const {
    showToUser = true,
    logToConsole = true,
    context = 'Unknown',
    fallbackMessage = 'An unexpected error occurred'
  } = options;

  // Log to console if enabled
  if (logToConsole) {
    console.error(`[${context}]`, error);
  }

  // Return user-friendly message if enabled
  if (showToUser) {
    return {
      message: error.message || fallbackMessage,
      type: 'error'
    };
  }

  return null;
};

/**
 * Handle async errors with optional cleanup
 * @param {Function} asyncFn - Async function to execute
 * @param {Object} options - Error handling options
 * @returns {Promise<any>} Result or null on error
 */
export const handleAsyncError = async (asyncFn, options = {}) => {
  try {
    return await asyncFn();
  } catch (error) {
    handleError(error, options);
    return null;
  }
};

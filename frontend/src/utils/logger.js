/**
 * Frontend Logger Utility
 * Provides consistent logging across the frontend application
 * 
 * In development: logs to console
 * In production: could be extended to send to error tracking service
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Default to WARN in production, DEBUG in development
const currentLevel = import.meta.env.PROD ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG;

/**
 * Format log message with timestamp and context
 * @param {string} level - Log level
 * @param {string} context - Context/component name
 * @param {string} message - Log message
 * @param {any} data - Additional data
 * @returns {string} Formatted message
 */
function formatMessage(level, context, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] [${context}] ${message}`;
}

/**
 * Create a logger instance for a specific context
 * @param {string} context - Context name (e.g., component name, service name)
 * @returns {Object} Logger instance with debug, info, warn, error methods
 */
export function createLogger(context) {
  return {
    debug: (message, data = null) => {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        if (data) {
          console.debug(formatMessage('DEBUG', context, message), data);
        } else {
          console.debug(formatMessage('DEBUG', context, message));
        }
      }
    },
    
    info: (message, data = null) => {
      if (currentLevel <= LOG_LEVELS.INFO) {
        if (data) {
          console.info(formatMessage('INFO', context, message), data);
        } else {
          console.info(formatMessage('INFO', context, message));
        }
      }
    },
    
    warn: (message, data = null) => {
      if (currentLevel <= LOG_LEVELS.WARN) {
        if (data) {
          console.warn(formatMessage('WARN', context, message), data);
        } else {
          console.warn(formatMessage('WARN', context, message));
        }
      }
    },
    
    error: (message, error = null) => {
      if (currentLevel <= LOG_LEVELS.ERROR) {
        if (error) {
          console.error(formatMessage('ERROR', context, message), error);
        } else {
          console.error(formatMessage('ERROR', context, message));
        }
      }
    }
  };
}

// Default logger for general use
const defaultLogger = createLogger('App');

export default defaultLogger;

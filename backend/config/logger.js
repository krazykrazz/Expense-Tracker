/**
 * Logging configuration module
 * Supports configurable log levels via LOG_LEVEL environment variable
 */

// Log levels in order of severity
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Get configured log level from environment (default: info)
const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const currentLogLevel = LOG_LEVELS[configuredLevel] !== undefined 
  ? LOG_LEVELS[configuredLevel] 
  : LOG_LEVELS.info;

/**
 * Format log message with timestamp and level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @returns {string} Formatted log message
 */
function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

/**
 * Generic log function
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments
 */
function log(level, message, ...args) {
  const levelValue = LOG_LEVELS[level] || LOG_LEVELS.info;
  
  if (levelValue >= currentLogLevel) {
    const formattedMessage = formatMessage(level, message);
    
    // Use appropriate console method based on level
    switch (level) {
      case 'error':
        console.error(formattedMessage, ...args);
        break;
      case 'warn':
        console.warn(formattedMessage, ...args);
        break;
      case 'debug':
      case 'info':
      default:
        console.log(formattedMessage, ...args);
        break;
    }
  }
}

/**
 * Log debug message
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments
 */
function debug(message, ...args) {
  log('debug', message, ...args);
}

/**
 * Log info message
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments
 */
function info(message, ...args) {
  log('info', message, ...args);
}

/**
 * Log warning message
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments
 */
function warn(message, ...args) {
  log('warn', message, ...args);
}

/**
 * Log error message
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments
 */
function error(message, ...args) {
  log('error', message, ...args);
}

/**
 * Get current log level
 * @returns {string} Current log level
 */
function getLogLevel() {
  return configuredLevel;
}

module.exports = {
  log,
  debug,
  info,
  warn,
  error,
  getLogLevel
};

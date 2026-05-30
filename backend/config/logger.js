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

/**
 * Get the current log level from environment
 * This is evaluated dynamically to handle any timing issues with env vars
 * @returns {Object} Object with configuredLevel string and currentLogLevel number
 */
function getLogLevelConfig() {
  const rawLogLevel = process.env.LOG_LEVEL;
  const configuredLevel = (rawLogLevel || 'info').toLowerCase().trim();
  const currentLogLevel = LOG_LEVELS[configuredLevel] !== undefined 
    ? LOG_LEVELS[configuredLevel] 
    : LOG_LEVELS.info;
  return { configuredLevel, currentLogLevel };
}

/**
 * Redact sensitive values (e.g. auth tokens passed as query params) from a
 * string before it is written to a log sink. Defense in depth: the SSE endpoint
 * accepts a `?token=<jwt>` query param because the EventSource API cannot send
 * headers, so ensure such tokens never leak into logs.
 * @param {*} value
 * @returns {*} Redacted string, or the original value if not a string.
 */
function redactSensitive(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/([?&](?:token|access_token|refresh_token)=)[^&\s"']+/gi, '$1[REDACTED]');
}

/**
 * Format log message with timestamp and level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @returns {string} Formatted log message
 */
function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${redactSensitive(message)}`;
}

/**
 * Generic log function
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments
 */
function log(level, message, ...args) {
  const { currentLogLevel } = getLogLevelConfig();
  const levelValue = LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : LOG_LEVELS.info;
  
  if (levelValue >= currentLogLevel) {
    const formattedMessage = formatMessage(level, message);
    const safeArgs = args.map(redactSensitive);
    
    // Use appropriate console method based on level
    switch (level) {
      case 'error':
        console.error(formattedMessage, ...safeArgs);
        break;
      case 'warn':
        console.warn(formattedMessage, ...safeArgs);
        break;
      case 'debug':
      case 'info':
      default:
        console.log(formattedMessage, ...safeArgs);
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
  const { configuredLevel } = getLogLevelConfig();
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

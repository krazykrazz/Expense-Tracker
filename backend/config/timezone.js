/**
 * Timezone configuration module
 * Supports configurable timezone via SERVICE_TZ environment variable
 */

const logger = require('./logger');

// Default timezone
const DEFAULT_TIMEZONE = 'Etc/UTC';

/**
 * Validate if a timezone string is valid
 * @param {string} tz - Timezone identifier
 * @returns {boolean} True if valid, false otherwise
 */
function validateTimezone(tz) {
  try {
    // Try to create a date formatter with the timezone
    // This will throw if the timezone is invalid
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get the configured timezone
 * @returns {string} Configured timezone identifier
 */
function getTimezone() {
  const configuredTz = process.env.SERVICE_TZ || DEFAULT_TIMEZONE;
  
  if (validateTimezone(configuredTz)) {
    return configuredTz;
  } else {
    logger.warn(`Invalid timezone "${configuredTz}", falling back to ${DEFAULT_TIMEZONE}`);
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Configure the system timezone
 * Sets the TZ environment variable for the process
 */
function configureTimezone() {
  const timezone = getTimezone();
  
  // Set TZ environment variable
  process.env.TZ = timezone;
  
  logger.info(`Timezone configured: ${timezone}`);
}

module.exports = {
  configureTimezone,
  getTimezone,
  validateTimezone
};

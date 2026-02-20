/**
 * Timezone configuration module
 *
 * Provides the default business timezone constant and a validation utility.
 * The process timezone is assumed to be UTC (set via TZ=Etc/UTC in the environment).
 * Business-local date derivation is handled by TimeBoundaryService using Intl.DateTimeFormat.
 */

/**
 * Default business timezone used when no BUSINESS_TIMEZONE setting is configured.
 * @type {string}
 */
const DEFAULT_BUSINESS_TIMEZONE = 'America/Toronto';

/**
 * Validate whether a string is a valid IANA timezone identifier.
 * Uses Intl.DateTimeFormat — throws on invalid timezone, returns false.
 *
 * @param {string} tz - Timezone identifier to validate
 * @returns {boolean} True if valid IANA timezone, false otherwise
 */
function validateTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

module.exports = { DEFAULT_BUSINESS_TIMEZONE, validateTimezone };

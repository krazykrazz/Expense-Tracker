const settingsRepository = require('../repositories/settingsRepository');
const logger = require('../config/logger');
const { DEFAULT_BUSINESS_TIMEZONE, validateTimezone } = require('../config/timezone');

// Lazy require to avoid circular dependency (activityLogService imports settingsService)
let _activityLogService = null;
function getActivityLogService() {
  if (!_activityLogService) {
    _activityLogService = require('./activityLogService');
  }
  return _activityLogService;
}

// Default retention settings
const DEFAULT_SETTINGS = {
  maxAgeDays: 90,
  maxCount: 1000
};

// Setting keys
const SETTING_KEYS = {
  MAX_AGE_DAYS: 'activity_log_max_age_days',
  MAX_COUNT: 'activity_log_max_count',
  BUSINESS_TIMEZONE: 'business_timezone'
};

// Validation constraints
const CONSTRAINTS = {
  MAX_AGE_DAYS: { min: 7, max: 365 },
  MAX_COUNT: { min: 100, max: 10000 }
};

/**
 * Validate retention settings
 * @param {number} maxAgeDays - Maximum age in days
 * @param {number} maxCount - Maximum event count
 * @throws {Error} - If validation fails
 */
function validateRetentionSettings(maxAgeDays, maxCount) {
  // Check if values are provided
  if (maxAgeDays === undefined || maxAgeDays === null) {
    throw new Error('maxAgeDays is required');
  }
  if (maxCount === undefined || maxCount === null) {
    throw new Error('maxCount is required');
  }

  // Check if values are numbers
  if (typeof maxAgeDays !== 'number' || isNaN(maxAgeDays)) {
    throw new Error('maxAgeDays must be a number');
  }
  if (typeof maxCount !== 'number' || isNaN(maxCount)) {
    throw new Error('maxCount must be a number');
  }

  // Check if values are integers
  if (!Number.isInteger(maxAgeDays)) {
    throw new Error('maxAgeDays must be an integer');
  }
  if (!Number.isInteger(maxCount)) {
    throw new Error('maxCount must be an integer');
  }

  // Validate maxAgeDays range
  if (maxAgeDays < CONSTRAINTS.MAX_AGE_DAYS.min || maxAgeDays > CONSTRAINTS.MAX_AGE_DAYS.max) {
    throw new Error(
      `maxAgeDays must be between ${CONSTRAINTS.MAX_AGE_DAYS.min} and ${CONSTRAINTS.MAX_AGE_DAYS.max}`
    );
  }

  // Validate maxCount range
  if (maxCount < CONSTRAINTS.MAX_COUNT.min || maxCount > CONSTRAINTS.MAX_COUNT.max) {
    throw new Error(
      `maxCount must be between ${CONSTRAINTS.MAX_COUNT.min} and ${CONSTRAINTS.MAX_COUNT.max}`
    );
  }
}

/**
 * Get retention policy settings
 * @returns {Promise<{maxAgeDays: number, maxCount: number}>}
 */
async function getRetentionSettings() {
  try {
    const settings = await settingsRepository.getMultiple([
      SETTING_KEYS.MAX_AGE_DAYS,
      SETTING_KEYS.MAX_COUNT
    ]);

    // Parse stored string values to integers
    const maxAgeDays = settings[SETTING_KEYS.MAX_AGE_DAYS]
      ? parseInt(settings[SETTING_KEYS.MAX_AGE_DAYS], 10)
      : DEFAULT_SETTINGS.maxAgeDays;

    const maxCount = settings[SETTING_KEYS.MAX_COUNT]
      ? parseInt(settings[SETTING_KEYS.MAX_COUNT], 10)
      : DEFAULT_SETTINGS.maxCount;

    // Return defaults if parsing fails
    if (isNaN(maxAgeDays) || isNaN(maxCount)) {
      logger.warn('Failed to parse retention settings, using defaults');
      return { ...DEFAULT_SETTINGS };
    }

    return { maxAgeDays, maxCount };
  } catch (error) {
    logger.error('Error getting retention settings, using defaults:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Update retention policy settings
 * @param {number} maxAgeDays - Max age in days (7-365)
 * @param {number} maxCount - Max event count (100-10000)
 * @returns {Promise<{maxAgeDays: number, maxCount: number}>}
 * @throws {Error} - If validation fails
 */
async function updateRetentionSettings(maxAgeDays, maxCount) {
  // Validate input
  validateRetentionSettings(maxAgeDays, maxCount);

  try {
    // Fetch current settings before update for activity log
    const oldSettings = await getRetentionSettings();

    // Store as strings in database
    await settingsRepository.setSetting(
      SETTING_KEYS.MAX_AGE_DAYS,
      maxAgeDays.toString()
    );
    await settingsRepository.setSetting(
      SETTING_KEYS.MAX_COUNT,
      maxCount.toString()
    );

    logger.info('Retention settings updated:', { maxAgeDays, maxCount });

    // Log activity event (fire-and-forget)
    const newSettings = { maxAgeDays, maxCount };
    try {
      getActivityLogService().logEvent(
        'settings_updated',
        'settings',
        null,
        `Updated retention settings: maxAgeDays ${oldSettings.maxAgeDays} → ${maxAgeDays}, maxCount ${oldSettings.maxCount} → ${maxCount}`,
        { oldSettings, newSettings }
      );
    } catch (logError) {
      logger.error('Failed to log settings update activity:', logError);
    }

    // Return the updated settings
    return newSettings;
  } catch (error) {
    logger.error('Error updating retention settings:', error);
    throw new Error('Failed to update retention settings');
  }
}

/**
 * Get the configured business timezone
 * @returns {Promise<string>} IANA timezone identifier, defaults to 'America/Toronto'
 */
async function getBusinessTimezone() {
  try {
    const value = await settingsRepository.getSetting(SETTING_KEYS.BUSINESS_TIMEZONE);
    return value || DEFAULT_BUSINESS_TIMEZONE;
  } catch (error) {
    logger.error('Error getting business timezone, using default:', error);
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

/**
 * Update the business timezone setting
 * @param {string} timezone - Valid IANA timezone identifier
 * @returns {Promise<string>} The saved timezone
 * @throws {Error} If the timezone is invalid or save fails
 */
async function updateBusinessTimezone(timezone) {
  if (!validateTimezone(timezone)) {
    throw new Error(`Invalid IANA timezone identifier: ${timezone}`);
  }
  try {
    await settingsRepository.setSetting(SETTING_KEYS.BUSINESS_TIMEZONE, timezone);
    logger.info('Business timezone updated:', { timezone });
    return timezone;
  } catch (error) {
    logger.error('Error updating business timezone:', error);
    throw new Error('Failed to update business timezone');
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  CONSTRAINTS,
  SETTING_KEYS,
  getRetentionSettings,
  updateRetentionSettings,
  validateRetentionSettings,
  getBusinessTimezone,
  updateBusinessTimezone
};

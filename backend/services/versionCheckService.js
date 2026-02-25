const logger = require('../config/logger');
const settingsService = require('./settingsService');
const activityLogService = require('./activityLogService');

const SETTING_KEY = 'last_known_version';

/**
 * Get current application version from package.json
 * @returns {string} - Version string (e.g., "5.10.0")
 */
function getCurrentVersion() {
  return require('../package.json').version;
}

/**
 * Get last known version from settings
 * @returns {Promise<string|null>} - Version string or null if not set
 */
async function getLastKnownVersion() {
  return settingsService.getLastKnownVersion();
}

/**
 * Update last known version in settings
 * @param {string} version - Version string to store
 * @returns {Promise<void>}
 */
async function updateLastKnownVersion(version) {
  await settingsService.setLastKnownVersion(version);
}

/**
 * Check for version upgrades and log to activity log.
 * Called during server startup using fire-and-forget pattern.
 * @returns {Promise<void>}
 */
async function checkAndLogVersionUpgrade() {
  try {
    const currentVersion = module.exports.getCurrentVersion();

    if (!currentVersion || typeof currentVersion !== 'string' || currentVersion.trim() === '') {
      logger.warn('Version check: Missing or invalid version in package.json');
      return;
    }

    const lastKnownVersion = await getLastKnownVersion();

    if (!lastKnownVersion) {
      // First startup - store current version, don't log event
      logger.info('Version check: First startup detected, storing current version', { version: currentVersion });
      await updateLastKnownVersion(currentVersion);
      return;
    }

    if (lastKnownVersion === currentVersion) {
      // Same version - nothing to do
      return;
    }

    // Version changed - log upgrade event
    logger.info('Version check: Upgrade detected', { from: lastKnownVersion, to: currentVersion });

    await activityLogService.logEvent(
      'version_upgraded',
      'system',
      null,
      `Application upgraded from v${lastKnownVersion} to v${currentVersion}`,
      { old_version: lastKnownVersion, new_version: currentVersion }
    );

    await updateLastKnownVersion(currentVersion);
  } catch (error) {
    // Fire-and-forget: log errors, never throw
    logger.error('Version check: Failed to check/log version upgrade', { error });
  }
}

module.exports = {
  getCurrentVersion,
  getLastKnownVersion,
  updateLastKnownVersion,
  checkAndLogVersionUpgrade
};

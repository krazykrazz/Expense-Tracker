const logger = require('../config/logger');

// In-memory cache
let cachedResult = null;

/**
 * Get the configured GitHub repository (owner/repo)
 * @returns {string} - Repository identifier (e.g., "krazykrazz/expense-tracker")
 */
function getGitHubRepo() {
  return process.env.GITHUB_REPO || 'krazykrazz/expense-tracker';
}

/**
 * Get cache duration in milliseconds
 * @returns {number} - Cache TTL in milliseconds
 */
function getCacheDurationMs() {
  const seconds = parseInt(process.env.UPDATE_CHECK_INTERVAL_SECONDS, 10);
  if (!isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  return 86400 * 1000; // Default: 24 hours
}

/**
 * Compare two semantic version strings
 * @param {string} current - Current version (e.g., "5.10.1")
 * @param {string} latest - Latest version (e.g., "5.11.0")
 * @returns {boolean} - true if latest > current
 */
function isNewerVersion(current, latest) {
  const currentParts = current.split('.').map(p => parseInt(p, 10));
  const latestParts = latest.split('.').map(p => parseInt(p, 10));

  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

/**
 * Fetch the latest release version from GitHub Releases API
 * @returns {Promise<string|null>} - Latest version string or null on error
 */
async function fetchLatestRelease() {
  const repo = getGitHubRepo();
  const url = `https://api.github.com/repos/${repo}/releases/latest`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'expense-tracker-update-check',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      logger.warn('Update check: GitHub API returned non-OK status', { status: response.status, repo });
      return null;
    }

    const data = await response.json();

    if (!data || !data.tag_name) {
      logger.warn('Update check: GitHub API response missing tag_name', { repo });
      return null;
    }

    // Strip leading 'v' prefix
    const version = data.tag_name.replace(/^v/, '');
    return version;
  } catch (error) {
    if (error.name === 'AbortError') {
      logger.warn('Update check: GitHub API request timed out', { repo });
    } else {
      logger.warn('Update check: Failed to fetch latest release', { error: error.message, repo });
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Check if a newer version is available on GitHub
 * Returns cached result if cache is still valid
 * @returns {Promise<Object>} - { updateAvailable, currentVersion, latestVersion, checkedAt, error? }
 */
async function checkForUpdate() {
  // Return cached result if still valid
  if (cachedResult && Date.now() < cachedResult.expiresAt) {
    const { expiresAt, ...result } = cachedResult;
    return result;
  }

  const currentVersion = require('../package.json').version;
  const checkedAt = new Date().toISOString();

  try {
    const latestVersion = await module.exports.fetchLatestRelease();

    if (!latestVersion) {
      const result = {
        updateAvailable: false,
        currentVersion,
        latestVersion: null,
        checkedAt,
        error: 'Unable to fetch latest release from GitHub'
      };
      cachedResult = { ...result, expiresAt: Date.now() + getCacheDurationMs() };
      return result;
    }

    const updateAvailable = isNewerVersion(currentVersion, latestVersion);

    const result = {
      updateAvailable,
      currentVersion,
      latestVersion,
      checkedAt
    };
    cachedResult = { ...result, expiresAt: Date.now() + getCacheDurationMs() };
    return result;
  } catch (error) {
    logger.error('Update check: Unexpected error during update check', { error: error.message });
    const result = {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      checkedAt,
      error: error.message
    };
    cachedResult = { ...result, expiresAt: Date.now() + getCacheDurationMs() };
    return result;
  }
}

/**
 * Clear the cached update check result (for testing)
 */
function clearCache() {
  cachedResult = null;
}

module.exports = {
  isNewerVersion,
  getGitHubRepo,
  fetchLatestRelease,
  checkForUpdate,
  clearCache
};

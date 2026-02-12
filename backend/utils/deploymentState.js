/**
 * Deployment State Tracking Utility
 *
 * Encapsulates deployment metadata generation, recording, and history query logic.
 * The CI workflow uses this logic via inline steps; this module is the testable
 * source of truth for deployment state management.
 */

/**
 * Generate deployment metadata JSON.
 *
 * @param {Object} params
 * @param {string} params.sha - Git commit SHA
 * @param {string} params.timestamp - ISO 8601 timestamp
 * @param {string} params.environment - Deployment environment (e.g., "production")
 * @param {string} params.version - Application version from package.json
 * @param {string} params.status - Deployment status ("success" | "failed" | "rolled_back")
 * @param {Object} params.healthChecks - Health check results { backend: "passed"|"failed", frontend: "passed"|"failed" }
 * @param {Object} [params.rollbackInfo] - Optional rollback info
 * @returns {Object} Complete deployment metadata record
 */
function generateDeploymentMetadata(params) {
  const { sha, timestamp, environment, version, status, healthChecks, rollbackInfo } = params;

  if (!sha || typeof sha !== 'string') {
    throw new Error('sha is required and must be a string');
  }
  if (!timestamp || typeof timestamp !== 'string') {
    throw new Error('timestamp is required and must be a string');
  }
  if (!environment || typeof environment !== 'string') {
    throw new Error('environment is required and must be a string');
  }
  if (!version || typeof version !== 'string') {
    throw new Error('version is required and must be a string');
  }

  const validStatuses = ['success', 'failed', 'rolled_back'];
  if (!validStatuses.includes(status)) {
    throw new Error(`status must be one of: ${validStatuses.join(', ')}`);
  }

  if (!healthChecks || typeof healthChecks !== 'object') {
    throw new Error('healthChecks is required and must be an object');
  }

  const metadata = {
    sha,
    timestamp,
    environment,
    version,
    status,
    healthChecks: {
      backend: healthChecks.backend || 'unknown',
      frontend: healthChecks.frontend || 'unknown',
    },
  };

  if (rollbackInfo) {
    metadata.rollbackInfo = {
      previousSha: rollbackInfo.previousSha || '',
      reason: rollbackInfo.reason || '',
      timestamp: rollbackInfo.timestamp || '',
    };
  }

  return metadata;
}

/**
 * Validate that a deployment metadata record has all required fields.
 *
 * @param {Object} record - Deployment metadata record
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateDeploymentMetadata(record) {
  const errors = [];
  const requiredFields = ['sha', 'timestamp', 'environment', 'version', 'status', 'healthChecks'];

  for (const field of requiredFields) {
    if (!record || record[field] === undefined || record[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (record && record.healthChecks) {
    if (!record.healthChecks.backend) errors.push('Missing healthChecks.backend');
    if (!record.healthChecks.frontend) errors.push('Missing healthChecks.frontend');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Query deployment history, returning the last N successful deployments
 * ordered by timestamp descending.
 *
 * @param {Object[]} allRecords - Array of all deployment records
 * @param {number} n - Number of records to return
 * @returns {Object[]} Last N successful deployments, newest first
 */
function queryDeploymentHistory(allRecords, n) {
  if (!Array.isArray(allRecords)) {
    return [];
  }
  if (typeof n !== 'number' || n < 0) {
    return [];
  }

  const successful = allRecords
    .filter((r) => r && r.status === 'success')
    .sort((a, b) => {
      // Sort by timestamp descending (newest first)
      if (a.timestamp > b.timestamp) return -1;
      if (a.timestamp < b.timestamp) return 1;
      return 0;
    });

  return successful.slice(0, n);
}

/**
 * Generate OCI image labels for deployment metadata.
 *
 * @param {Object} params
 * @param {string} params.version - Application version
 * @param {string} params.sha - Git commit SHA
 * @param {string} params.buildDate - ISO 8601 build timestamp
 * @param {string} params.source - Repository URL
 * @returns {Object} Map of OCI annotation keys to values
 */
function generateImageLabels(params) {
  const { version, sha, buildDate, source } = params;

  return {
    'org.opencontainers.image.version': version || '',
    'org.opencontainers.image.revision': sha || '',
    'org.opencontainers.image.created': buildDate || '',
    'org.opencontainers.image.source': source || '',
    'org.opencontainers.image.title': 'expense-tracker',
    'org.opencontainers.image.description': 'Personal expense tracking application',
  };
}

module.exports = {
  generateDeploymentMetadata,
  validateDeploymentMetadata,
  queryDeploymentHistory,
  generateImageLabels,
};

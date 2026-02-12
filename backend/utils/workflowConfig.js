/**
 * Workflow Configuration Resolver
 *
 * Resolves CI workflow configuration from user-provided inputs,
 * applying sensible defaults when values are not provided.
 * Mirrors the workflow_dispatch inputs in .github/workflows/ci.yml.
 */

const DEFAULTS = {
  health_check_timeout: 30,
  health_check_retries: 10,
  enable_security_scan: true,
};

/**
 * Resolve a single numeric config value with a default fallback.
 * @param {*} value - User-provided value (may be string, number, undefined, null, or empty)
 * @param {number} defaultValue - Default to use when value is missing or invalid
 * @returns {number}
 */
function resolveNumeric(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || isNaN(parsed) || parsed < 1) {
    return defaultValue;
  }
  return Math.floor(parsed);
}

/**
 * Resolve a boolean config value with a default fallback.
 * @param {*} value - User-provided value
 * @param {boolean} defaultValue - Default to use when value is missing
 * @returns {boolean}
 */
function resolveBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return defaultValue;
}

/**
 * Resolve full workflow configuration from inputs.
 * @param {Object} inputs - Raw inputs (may have missing/invalid values)
 * @returns {Object} Resolved configuration with all fields populated
 */
function resolveWorkflowConfig(inputs = {}) {
  return {
    health_check_timeout: resolveNumeric(inputs.health_check_timeout, DEFAULTS.health_check_timeout),
    health_check_retries: resolveNumeric(inputs.health_check_retries, DEFAULTS.health_check_retries),
    enable_security_scan: resolveBoolean(inputs.enable_security_scan, DEFAULTS.enable_security_scan),
  };
}

module.exports = {
  DEFAULTS,
  resolveNumeric,
  resolveBoolean,
  resolveWorkflowConfig,
};

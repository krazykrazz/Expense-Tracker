/**
 * Health Check Utility
 * 
 * Encapsulates the retry-with-exponential-backoff logic used by the
 * CI health-check script (scripts/health-check.sh) in a testable JS module.
 * 
 * This module is the source of truth for the retry algorithm.
 * The bash script implements the same logic for CI runners.
 */

/**
 * Calculate the wait time for a given retry attempt using exponential backoff.
 * @param {number} attempt - Current attempt number (1-based)
 * @param {number} baseDelay - Base delay in seconds
 * @returns {number} Wait time in seconds
 */
function calculateBackoffDelay(attempt, baseDelay) {
  if (attempt < 1 || !Number.isInteger(attempt)) {
    throw new Error('Attempt must be a positive integer');
  }
  if (baseDelay < 0) {
    throw new Error('Base delay must be non-negative');
  }
  return baseDelay * Math.pow(2, attempt - 1);
}

/**
 * Simulate a full health check run and return the result.
 * 
 * @param {Object} config - Health check configuration
 * @param {number} config.maxRetries - Maximum number of retry attempts
 * @param {number} config.retryDelay - Initial delay between retries in seconds
 * @param {number} config.timeout - HTTP request timeout in seconds
 * @param {Function} httpCall - Async function that returns { statusCode: number }
 *   Called once per attempt. Simulates the HTTP request.
 * @returns {Promise<Object>} Result with { success, attempts, totalWaitTime, lastStatus }
 */
async function executeHealthCheck(config, httpCall) {
  const { maxRetries, retryDelay } = config;
  let totalWaitTime = 0;
  let lastStatus = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await httpCall(attempt);
    lastStatus = result.statusCode;

    if (result.statusCode === 200) {
      return {
        success: true,
        attempts: attempt,
        totalWaitTime,
        lastStatus,
      };
    }

    if (attempt < maxRetries) {
      const waitTime = calculateBackoffDelay(attempt, retryDelay);
      totalWaitTime += waitTime;
    }
  }

  return {
    success: false,
    attempts: maxRetries,
    totalWaitTime,
    lastStatus,
  };
}

/**
 * Execute health checks against multiple endpoints.
 * Deployment is only marked successful when ALL endpoints return 200.
 *
 * @param {Object} config - Health check configuration (maxRetries, retryDelay, timeout)
 * @param {Object[]} endpoints - Array of { name, httpCall } objects
 * @returns {Promise<Object>} Result with { success, results: { [name]: checkResult }, failedEndpoints }
 */
async function executeMultiEndpointHealthCheck(config, endpoints) {
  if (!endpoints || endpoints.length === 0) {
    return { success: false, results: {}, failedEndpoints: ['no endpoints configured'] };
  }

  const results = {};
  const failedEndpoints = [];

  for (const endpoint of endpoints) {
    const result = await executeHealthCheck(config, endpoint.httpCall);
    results[endpoint.name] = result;
    if (!result.success) {
      failedEndpoints.push(endpoint.name);
    }
  }

  return {
    success: failedEndpoints.length === 0,
    results,
    failedEndpoints,
  };
}

/**
 * Validate health check configuration.
 * @param {Object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }
  if (!Number.isInteger(config.maxRetries) || config.maxRetries < 1) {
    errors.push('maxRetries must be a positive integer');
  }
  if (typeof config.retryDelay !== 'number' || config.retryDelay < 0) {
    errors.push('retryDelay must be a non-negative number');
  }
  if (typeof config.timeout !== 'number' || config.timeout <= 0) {
    errors.push('timeout must be a positive number');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  calculateBackoffDelay,
  executeHealthCheck,
  executeMultiEndpointHealthCheck,
  validateConfig,
};

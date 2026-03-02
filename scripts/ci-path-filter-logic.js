/**
 * CI Path Filter Logic Helper
 * 
 * Simulates the dorny/paths-filter GitHub Action logic for testing purposes.
 * This module provides functions to evaluate which test jobs should run based
 * on changed files in a PR.
 */

/**
 * Evaluates path filter outputs based on changed files
 * @param {string[]} changedFiles - Array of file paths that changed
 * @returns {{ backend: boolean, frontend: boolean, shared: boolean }} Filter outputs
 */
function evaluatePathFilter(changedFiles) {
  if (!Array.isArray(changedFiles)) {
    throw new TypeError('changedFiles must be an array');
  }

  const backend = changedFiles.some(f => f.startsWith('backend/'));
  const frontend = changedFiles.some(f => f.startsWith('frontend/'));
  
  const sharedPatterns = [
    'scripts/',
    'Dockerfile',
    'docker-compose',
    '.github/workflows/',
    '.dockerignore',
    'package.json',
    'package-lock.json'
  ];
  
  const shared = changedFiles.some(f => 
    sharedPatterns.some(pattern => {
      // Handle directory patterns
      if (pattern.endsWith('/')) {
        return f.startsWith(pattern);
      }
      // Handle exact matches for root-level files
      if (pattern === 'Dockerfile' || pattern === '.dockerignore' || 
          pattern === 'package.json' || pattern === 'package-lock.json') {
        return f === pattern;
      }
      // Handle prefix matches (e.g., docker-compose matches docker-compose.yml, docker-compose.ghcr.yml)
      if (pattern === 'docker-compose') {
        return f.startsWith('docker-compose');
      }
      return false;
    })
  );
  
  return { backend, frontend, shared };
}

/**
 * Determines if backend tests should run based on filter outputs
 * @param {{ backend: boolean, frontend: boolean, shared: boolean }} filterOutputs
 * @returns {boolean} True if backend tests should run
 */
function shouldRunBackendTests(filterOutputs) {
  return filterOutputs.backend || filterOutputs.shared;
}

/**
 * Determines if frontend tests should run based on filter outputs
 * @param {{ backend: boolean, frontend: boolean, shared: boolean }} filterOutputs
 * @returns {boolean} True if frontend tests should run
 */
function shouldRunFrontendTests(filterOutputs) {
  return filterOutputs.frontend || filterOutputs.shared;
}

/**
 * Determines if the workflow should trigger based on paths-ignore configuration
 * @param {string[]} changedFiles - Array of file paths that changed
 * @returns {boolean} True if workflow should trigger, false if all files are ignored
 */
function shouldWorkflowTrigger(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return true; // Empty PR should trigger workflow
  }

  const ignoredPatterns = [
    'docs/',
    '.md',
    '.kiro/steering/',
    'CHANGELOG.md'
  ];
  
  const allIgnored = changedFiles.every(f =>
    ignoredPatterns.some(pattern => {
      // Exact match for specific files
      if (pattern === f) {
        return true;
      }
      // Directory pattern match
      if (pattern.endsWith('/') && f.startsWith(pattern)) {
        return true;
      }
      // Extension match
      if (pattern.startsWith('.') && !pattern.includes('/') && f.endsWith(pattern)) {
        return true;
      }
      // Partial match for files like CHANGELOG.md
      if (!pattern.includes('/') && !pattern.startsWith('.') && f.includes(pattern)) {
        return true;
      }
      return false;
    })
  );
  
  return !allIgnored;
}

module.exports = {
  evaluatePathFilter,
  shouldRunBackendTests,
  shouldRunFrontendTests,
  shouldWorkflowTrigger
};

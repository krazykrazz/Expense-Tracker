/**
 * Centralized test constants to avoid magic numbers
 */

// Detect CI environment
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

module.exports = {
  // Environment detection
  isCI,
  
  // Year ranges for testing
  YEAR_RANGE: {
    MIN: 2020,
    MAX: 2030
  },
  
  // Future year range for testing (to avoid conflicts with real data)
  FUTURE_YEAR_RANGE: {
    MIN: 2090,
    MAX: 2099
  },
  
  // Valid year range for validation
  VALID_YEAR_RANGE: {
    MIN: 1900,
    MAX: 2100
  },
  
  // Property-based test configuration
  PBT: {
    TIMEOUT: isCI ? 60000 : 30000,  // Longer in CI
    NUM_RUNS: isCI ? 10 : 20,       // Fewer runs in CI for speed
    SEED: isCI ? 12345 : undefined  // Fixed seed in CI for reproducibility
  },
  
  // Month range
  MONTH_RANGE: {
    MIN: 1,
    MAX: 12
  },
  
  // Test timeouts
  TIMEOUTS: {
    DEFAULT: isCI ? 30000 : 15000,
    ASYNC: isCI ? 45000 : 25000,
    DATABASE: isCI ? 60000 : 30000,
    INTEGRATION: isCI ? 90000 : 45000
  }
};

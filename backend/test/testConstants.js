/**
 * Centralized test constants to avoid magic numbers
 */

module.exports = {
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
    TIMEOUT: 60000,  // 60 seconds
    NUM_RUNS: 100    // Number of test iterations
  },
  
  // Month range
  MONTH_RANGE: {
    MIN: 1,
    MAX: 12
  }
};

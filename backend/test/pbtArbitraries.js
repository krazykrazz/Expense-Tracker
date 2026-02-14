/**
 * Shared Property-Based Testing Arbitraries
 * 
 * This module provides pre-configured fast-check arbitraries that are safe
 * for CI environments. They filter out edge cases that can cause flaky tests
 * like invalid dates, NaN values, and other problematic inputs.
 * 
 * Usage:
 *   const { safeDate, safeAmount, safeString, pbtOptions } = require('../test/pbtArbitraries');
 *   
 *   await fc.assert(
 *     fc.asyncProperty(safeDate, safeAmount, async (date, amount) => {
 *       // test logic
 *     }),
 *     pbtOptions()
 *   );
 */

const fc = require('fast-check');

// Detect CI environment
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

// Fixed seed for reproducible tests in CI
const CI_SEED = 12345;

/**
 * Safe date arbitrary that handles invalid date edge cases
 * Returns date string in YYYY-MM-DD format
 */
const safeDate = (options = {}) => {
  const min = options.min || new Date('2020-01-01');
  const max = options.max || new Date('2025-12-31');
  
  return fc.date({ min, max }).map(d => {
    try {
      return d.toISOString().split('T')[0];
    } catch (e) {
      // Fallback for invalid dates
      return '2024-01-01';
    }
  });
};

/**
 * Safe date object arbitrary (returns Date object, not string)
 */
const safeDateObject = (options = {}) => {
  const min = options.min || new Date('2020-01-01');
  const max = options.max || new Date('2025-12-31');
  
  return fc.date({ min, max }).filter(d => {
    try {
      d.toISOString();
      return true;
    } catch (e) {
      return false;
    }
  });
};

/**
 * Safe ISO date string arbitrary
 */
const safeISODate = (options = {}) => {
  const min = options.min || new Date('2020-01-01');
  const max = options.max || new Date('2025-12-31');
  
  return fc.date({ min, max }).map(d => {
    try {
      return d.toISOString();
    } catch (e) {
      return '2024-01-01T00:00:00.000Z';
    }
  });
};

/**
 * Safe amount arbitrary that filters out NaN, Infinity, and negative values
 */
const safeAmount = (options = {}) => {
  const min = options.min !== undefined ? Math.fround(options.min) : Math.fround(0.01);
  const max = options.max !== undefined ? Math.fround(options.max) : Math.fround(10000);
  
  return fc.float({ min, max, noNaN: true })
    .filter(n => !isNaN(n) && isFinite(n) && n > 0);
};

/**
 * Safe integer amount (for cents or whole numbers)
 */
const safeIntAmount = (options = {}) => {
  const min = options.min !== undefined ? options.min : 1;
  const max = options.max !== undefined ? options.max : 1000000;
  
  return fc.integer({ min, max });
};

/**
 * Safe string arbitrary that ensures non-empty, trimmed strings
 */
const safeString = (options = {}) => {
  const minLength = options.minLength || 1;
  const maxLength = options.maxLength || 100;
  
  return fc.string({ minLength, maxLength })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());
};

/**
 * Safe place name arbitrary
 */
const safePlaceName = (options = {}) => {
  const minLength = options.minLength || 1;
  const maxLength = options.maxLength || 50;
  
  return fc.string({ minLength, maxLength })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim().replace(/[<>:"/\\|?*]/g, '_'));
};

/**
 * Safe filename arbitrary
 */
const safeFilename = (options = {}) => {
  const extension = options.extension || '.pdf';
  const minLength = options.minLength || 1;
  const maxLength = options.maxLength || 50;
  
  return fc.string({ minLength, maxLength })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim().replace(/[<>:"/\\|?*\s]/g, '_') + extension);
};

/**
 * Expense type arbitrary
 */
const expenseType = fc.constantFrom(
  'Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing',
  'Gifts', 'Housing', 'Insurance', 'Personal Care', 'Pet Care',
  'Recreation Activities', 'Subscriptions', 'Utilities', 'Automotive',
  'Other', 'Tax - Medical', 'Tax - Donation'
);

/**
 * Tax-deductible expense type arbitrary
 */
const taxDeductibleType = fc.constantFrom('Tax - Medical', 'Tax - Donation');

/**
 * Non-tax-deductible expense type arbitrary
 */
const nonTaxDeductibleType = fc.constantFrom(
  'Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing',
  'Gifts', 'Housing', 'Insurance', 'Personal Care', 'Pet Care',
  'Recreation Activities', 'Subscriptions', 'Utilities', 'Automotive', 'Other'
);

/**
 * Payment method arbitrary
 */
const paymentMethod = fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'VISA', 'Cheque');

/**
 * Week number arbitrary (1-5)
 */
const weekNumber = fc.integer({ min: 1, max: 5 });

/**
 * Month number arbitrary (1-12)
 */
const monthNumber = fc.integer({ min: 1, max: 12 });

/**
 * Year arbitrary
 */
const year = (options = {}) => {
  const min = options.min || 2020;
  const max = options.max || 2025;
  return fc.integer({ min, max });
};

/**
 * Safe expense record arbitrary
 */
const safeExpense = (options = {}) => fc.record({
  date: safeDate(options.dateOptions),
  place: safePlaceName(options.placeOptions),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: '' }),
  amount: safeAmount(options.amountOptions),
  type: options.taxDeductibleOnly ? taxDeductibleType : expenseType,
  week: weekNumber,
  method: paymentMethod
});

/**
 * Safe expense with ID arbitrary
 */
const safeExpenseWithId = (options = {}) => fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  ...safeExpense(options).generator
});

/**
 * Get PBT options with CI-aware configuration
 * @param {Object} options - Override options
 * @returns {Object} fast-check options
 */
const pbtOptions = (options = {}) => {
  // Allow environment variable to override numRuns for fast testing
  const envNumRuns = process.env.FAST_CHECK_NUM_RUNS 
    ? parseInt(process.env.FAST_CHECK_NUM_RUNS, 10) 
    : null;
  
  const defaultNumRuns = isCI ? 25 : 50;
  const numRuns = envNumRuns || options.numRuns || defaultNumRuns;
  
  const defaults = {
    numRuns,
    timeout: isCI ? 30000 : 15000,
    // Use fixed seed in CI for reproducibility
    seed: isCI ? CI_SEED : undefined,
    // Increase path depth for better shrinking
    endOnFailure: true,
    // Report failures with full details
    verbose: isCI
  };
  
  return { ...defaults, ...options };
};

/**
 * Get async PBT options (longer timeouts)
 */
const asyncPbtOptions = (options = {}) => {
  return pbtOptions({
    timeout: isCI ? 45000 : 25000,
    ...options
  });
};

/**
 * Get database PBT options (even longer timeouts for DB operations)
 */
const dbPbtOptions = (options = {}) => {
  // Allow environment variable to override numRuns for fast testing
  const envNumRuns = process.env.FAST_CHECK_NUM_RUNS 
    ? parseInt(process.env.FAST_CHECK_NUM_RUNS, 10) 
    : null;
  
  return pbtOptions({
    timeout: isCI ? 60000 : 30000,
    numRuns: envNumRuns || (isCI ? 10 : 15),
    ...options
  });
};

module.exports = {
  // Environment detection
  isCI,
  CI_SEED,
  
  // Date arbitraries
  safeDate,
  safeDateObject,
  safeISODate,
  
  // Amount arbitraries
  safeAmount,
  safeIntAmount,
  
  // String arbitraries
  safeString,
  safePlaceName,
  safeFilename,
  
  // Domain-specific arbitraries
  expenseType,
  taxDeductibleType,
  nonTaxDeductibleType,
  paymentMethod,
  weekNumber,
  monthNumber,
  year,
  
  // Composite arbitraries
  safeExpense,
  safeExpenseWithId,
  
  // PBT options
  pbtOptions,
  asyncPbtOptions,
  dbPbtOptions,
  
  // Billing cycle helpers
  /**
   * Calculate previous billing cycle dates using statementBalanceService
   * This is the single source of truth for cycle date calculations.
   * Use this in tests instead of duplicating the calculation logic.
   * 
   * @param {number} billingCycleDay - Day of month when statement closes (1-31)
   * @param {Date|string} referenceDate - Reference date
   * @returns {Object} { startDate, endDate } in YYYY-MM-DD format
   */
  calculatePreviousCycleDates: (billingCycleDay, referenceDate) => {
    const statementBalanceService = require('../services/statementBalanceService');
    return statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
  }
};

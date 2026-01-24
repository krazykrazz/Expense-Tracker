/**
 * Shared Property-Based Testing Arbitraries for Frontend
 * 
 * This module provides pre-configured fast-check arbitraries that are safe
 * for CI environments. They filter out edge cases that can cause flaky tests.
 * 
 * Usage:
 *   import { safeDate, safeAmount, safeString, pbtOptions } from '../test/pbtArbitraries';
 *   
 *   await fc.assert(
 *     fc.asyncProperty(safeDate(), safeAmount(), async (date, amount) => {
 *       // test logic
 *     }),
 *     pbtOptions()
 *   );
 */

import fc from 'fast-check';

// Detect CI environment
export const isCI = import.meta.env?.CI === 'true' || 
                    import.meta.env?.GITHUB_ACTIONS === 'true' ||
                    typeof process !== 'undefined' && (
                      process.env?.CI === 'true' || 
                      process.env?.GITHUB_ACTIONS === 'true'
                    );

// Fixed seed for reproducible tests in CI
export const CI_SEED = 12345;

/**
 * Safe date arbitrary that handles invalid date edge cases
 * Returns date string in YYYY-MM-DD format
 */
export const safeDate = (options = {}) => {
  const min = options.min || new Date('2020-01-01');
  const max = options.max || new Date('2025-12-31');
  
  return fc.date({ min, max }).map(d => {
    try {
      return d.toISOString().split('T')[0];
    } catch (e) {
      return '2024-01-01';
    }
  });
};

/**
 * Safe date object arbitrary (returns Date object, not string)
 */
export const safeDateObject = (options = {}) => {
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
 * Safe amount arbitrary that filters out NaN, Infinity, and negative values
 */
export const safeAmount = (options = {}) => {
  const min = options.min !== undefined ? Math.fround(options.min) : Math.fround(0.01);
  const max = options.max !== undefined ? Math.fround(options.max) : Math.fround(10000);
  
  return fc.float({ min, max, noNaN: true })
    .filter(n => !isNaN(n) && isFinite(n) && n > 0);
};

/**
 * Safe integer amount (for cents or whole numbers)
 */
export const safeIntAmount = (options = {}) => {
  const min = options.min !== undefined ? options.min : 1;
  const max = options.max !== undefined ? options.max : 1000000;
  
  return fc.integer({ min, max });
};

/**
 * Safe string arbitrary that ensures non-empty, trimmed strings
 */
export const safeString = (options = {}) => {
  const minLength = options.minLength || 1;
  const maxLength = options.maxLength || 100;
  
  return fc.string({ minLength, maxLength })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());
};

/**
 * Safe place name arbitrary
 */
export const safePlaceName = (options = {}) => {
  const minLength = options.minLength || 1;
  const maxLength = options.maxLength || 50;
  
  return fc.string({ minLength, maxLength })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim().replace(/[<>:"/\\|?*]/g, '_'));
};

/**
 * Expense type arbitrary
 */
export const expenseType = fc.constantFrom(
  'Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing',
  'Gifts', 'Housing', 'Insurance', 'Personal Care', 'Pet Care',
  'Recreation Activities', 'Subscriptions', 'Utilities', 'Vehicle Maintenance',
  'Other', 'Tax - Medical', 'Tax - Donation'
);

/**
 * Tax-deductible expense type arbitrary
 */
export const taxDeductibleType = fc.constantFrom('Tax - Medical', 'Tax - Donation');

/**
 * Payment method arbitrary
 */
export const paymentMethod = fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'VISA', 'Cheque');

/**
 * Week number arbitrary (1-5)
 */
export const weekNumber = fc.integer({ min: 1, max: 5 });

/**
 * Month number arbitrary (1-12)
 */
export const monthNumber = fc.integer({ min: 1, max: 12 });

/**
 * Year arbitrary
 */
export const year = (options = {}) => {
  const min = options.min || 2020;
  const max = options.max || 2025;
  return fc.integer({ min, max });
};

/**
 * Safe expense record arbitrary for form testing
 */
export const safeExpenseFormData = (options = {}) => fc.record({
  date: safeDate(options.dateOptions),
  place: safePlaceName(options.placeOptions),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: '' }),
  amount: safeAmount(options.amountOptions).map(n => n.toFixed(2)),
  type: options.taxDeductibleOnly ? taxDeductibleType : expenseType,
  method: paymentMethod
});

/**
 * Get PBT options with CI-aware configuration
 * @param {Object} options - Override options
 * @returns {Object} fast-check options
 */
export const pbtOptions = (options = {}) => {
  const defaults = {
    numRuns: isCI ? (options.numRuns || 10) : (options.numRuns || 20),
    timeout: isCI ? 30000 : 15000,
    // Use fixed seed in CI for reproducibility
    seed: isCI ? CI_SEED : undefined,
    endOnFailure: true,
    verbose: isCI
  };
  
  return { ...defaults, ...options };
};

/**
 * Get async PBT options (longer timeouts for async operations)
 */
export const asyncPbtOptions = (options = {}) => {
  return pbtOptions({
    timeout: isCI ? 45000 : 25000,
    ...options
  });
};

/**
 * Get UI PBT options (longer timeouts for React rendering)
 */
export const uiPbtOptions = (options = {}) => {
  return pbtOptions({
    timeout: isCI ? 60000 : 30000,
    numRuns: isCI ? 5 : 10,
    ...options
  });
};

export default {
  isCI,
  CI_SEED,
  safeDate,
  safeDateObject,
  safeAmount,
  safeIntAmount,
  safeString,
  safePlaceName,
  expenseType,
  taxDeductibleType,
  paymentMethod,
  weekNumber,
  monthNumber,
  year,
  safeExpenseFormData,
  pbtOptions,
  asyncPbtOptions,
  uiPbtOptions
};

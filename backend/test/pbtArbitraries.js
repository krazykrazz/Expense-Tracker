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
    timeout: isCI ? 90000 : 60000,  // Increased from 60s/30s to 90s/60s
    numRuns: envNumRuns || (isCI ? 10 : 15),
    ...options
  });
};

// --- Anomaly Detection PBT Generators ---

const {
  ANOMALY_CLASSIFICATIONS,
  BEHAVIOR_PATTERNS,
  CONFIDENCE_LEVELS: CONF_LEVELS,
  SEVERITY_LEVELS: SEV_LEVELS,
  CLUSTER_LABELS
} = require('../utils/analyticsConstants');

const ANOMALY_CLASSIFICATION_VALUES = Object.values(ANOMALY_CLASSIFICATIONS);
const BEHAVIOR_PATTERN_VALUES = Object.values(BEHAVIOR_PATTERNS);
const CONFIDENCE_LEVEL_VALUES = Object.values(CONF_LEVELS);
const SEVERITY_LEVEL_VALUES = Object.values(SEV_LEVELS);
const CLUSTER_LABEL_VALUES = Object.values(CLUSTER_LABELS);

/**
 * Generate a YYYY-MM-DD string for a given year, month, day
 */
function formatDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Arbitrary: expense dataset with controlled properties.
 *
 * @param {Object} options
 * @param {string[]} [options.categories] - Categories to use (defaults to common set)
 * @param {string[]} [options.merchants] - Merchants to use
 * @param {number} [options.minSize=1] - Minimum array length
 * @param {number} [options.maxSize=30] - Maximum array length
 * @param {Date} [options.minDate] - Earliest date
 * @param {Date} [options.maxDate] - Latest date
 * @param {number} [options.minAmount=1] - Minimum amount
 * @param {number} [options.maxAmount=5000] - Maximum amount
 * @returns {fc.Arbitrary<Array>} Array of expense objects
 */
const arbExpenseDataset = (options = {}) => {
  const categories = options.categories || ['Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing'];
  const merchants = options.merchants || ['Costco', 'Walmart', 'Amazon', 'Starbucks', 'Shell', 'Netflix', 'Target', 'Home Depot'];
  const minSize = options.minSize !== undefined ? options.minSize : 1;
  const maxSize = options.maxSize !== undefined ? options.maxSize : 30;
  const minAmt = options.minAmount !== undefined ? options.minAmount : 1;
  const maxAmt = options.maxAmount !== undefined ? options.maxAmount : 5000;

  const dateArb = safeDate({
    min: options.minDate || new Date('2023-01-01'),
    max: options.maxDate || new Date('2025-06-30')
  });

  const expenseArb = fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    date: dateArb,
    place: fc.constantFrom(...merchants),
    amount: fc.float({ min: Math.fround(minAmt), max: Math.fround(maxAmt), noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n >= minAmt),
    type: fc.constantFrom(...categories),
    week: fc.integer({ min: 1, max: 5 }),
    method: paymentMethod
  });

  return fc.array(expenseArb, { minLength: minSize, maxLength: maxSize });
};

/**
 * Arbitrary: enriched anomaly array for testing filtering/throttling.
 *
 * @param {Object} options
 * @param {string[]} [options.categories] - Categories to use
 * @param {number} [options.minSize=1] - Minimum array length
 * @param {number} [options.maxSize=20] - Maximum array length
 * @param {Date} [options.minDate] - Earliest date
 * @param {Date} [options.maxDate] - Latest date
 * @returns {fc.Arbitrary<Array>} Array of enriched anomaly objects
 */
const arbAnomalyArray = (options = {}) => {
  const categories = options.categories || ['Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing'];
  const merchants = options.merchants || ['Costco', 'Walmart', 'Amazon', 'Starbucks', 'Shell'];
  const minSize = options.minSize !== undefined ? options.minSize : 1;
  const maxSize = options.maxSize !== undefined ? options.maxSize : 20;

  const dateArb = safeDate({
    min: options.minDate || new Date('2024-01-01'),
    max: options.maxDate || new Date('2025-06-30')
  });

  const anomalyArb = fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    expenseId: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: null }),
    date: dateArb,
    place: fc.constantFrom(...merchants),
    amount: fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n >= 1),
    category: fc.constantFrom(...categories),
    anomalyType: fc.constantFrom('amount', 'daily_total', 'new_merchant'),
    classification: fc.constantFrom(...ANOMALY_CLASSIFICATION_VALUES),
    explanation: fc.record({
      typeLabel: fc.constantFrom('Large Transaction', 'Category Spending Spike', 'New Merchant', 'Frequency Spike', 'Recurring Expense Increase', 'Seasonal Deviation', 'Emerging Behavior Trend'),
      observedValue: fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }).filter(n => isFinite(n) && n >= 1),
      expectedRange: fc.record({
        min: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 0),
        max: fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 1)
      }),
      deviationPercent: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 0),
      comparisonPeriod: fc.constantFrom('last 12 months', 'all available data (6 months)', 'all available data (3 months)')
    }),
    historicalContext: fc.record({
      purchaseRank: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
      purchaseRankTotal: fc.option(fc.integer({ min: 1, max: 500 }), { nil: null }),
      percentile: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
      deviationFromAverage: fc.float({ min: Math.fround(-100), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n)),
      frequency: fc.option(fc.constantFrom('approximately once every 2 months', 'approximately once every 9 months', 'weekly'), { nil: null })
    }),
    impactEstimate: fc.record({
      annualizedChange: fc.float({ min: Math.fround(-10000), max: Math.fround(50000), noNaN: true }).filter(n => isFinite(n)),
      savingsRateChange: fc.option(fc.float({ min: Math.fround(-50), max: Math.fround(50), noNaN: true }).filter(n => isFinite(n)), { nil: null }),
      budgetImpact: fc.option(fc.record({
        budgetLimit: fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 100),
        currentSpent: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 0),
        projectedMonthEnd: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }).filter(n => isFinite(n) && n >= 0),
        projectedOverage: fc.float({ min: Math.fround(-5000), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n))
      }), { nil: null })
    }),
    behaviorPattern: fc.constantFrom(...BEHAVIOR_PATTERN_VALUES),
    confidence: fc.constantFrom(...CONFIDENCE_LEVEL_VALUES),
    cluster: fc.constant(null),
    severity: fc.constantFrom(...SEVERITY_LEVEL_VALUES),
    dismissed: fc.boolean(),
    budgetSuggestion: fc.option(fc.record({
      action: fc.constantFrom('create_budget', 'adjust_budget'),
      category: fc.constantFrom(...categories),
      suggestedLimit: fc.integer({ min: 50, max: 10000 }).map(n => Math.ceil(n / 50) * 50),
      currentLimit: fc.option(fc.integer({ min: 50, max: 10000 }), { nil: null })
    }), { nil: null })
  });

  return fc.array(anomalyArb, { minLength: minSize, maxLength: maxSize });
};

/**
 * Arbitrary: budget data with controlled categories and limits.
 *
 * @param {Object} options
 * @param {string[]} [options.categories] - Categories to generate budgets for
 * @param {number} [options.year] - Budget year (random if not specified)
 * @param {number} [options.month] - Budget month (random if not specified)
 * @param {number} [options.minLimit=50] - Minimum budget limit
 * @param {number} [options.maxLimit=5000] - Maximum budget limit
 * @returns {fc.Arbitrary<Object>} Budget data object { budgets, byCategory }
 */
const arbBudgetData = (options = {}) => {
  const categories = options.categories || ['Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing'];
  const minLimit = options.minLimit !== undefined ? options.minLimit : 50;
  const maxLimit = options.maxLimit !== undefined ? options.maxLimit : 5000;

  const budgetEntryArb = (cat) => fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    year: options.year !== undefined ? fc.constant(options.year) : fc.integer({ min: 2023, max: 2025 }),
    month: options.month !== undefined ? fc.constant(options.month) : fc.integer({ min: 1, max: 12 }),
    category: fc.constant(cat),
    limit: fc.integer({ min: minLimit, max: maxLimit }),
    spent: fc.integer({ min: 0, max: maxLimit })
  });

  // Generate a subset of categories that have budgets
  return fc.subarray(categories, { minLength: 1, maxLength: categories.length }).chain(selectedCats => {
    const entryArbs = selectedCats.map(cat => budgetEntryArb(cat));
    return fc.tuple(...entryArbs).map(entries => {
      const budgets = entries;
      const byCategory = {};
      for (const b of budgets) {
        const progress = b.limit > 0 ? (b.spent / b.limit) * 100 : 0;
        let severity = null;
        if (progress >= 100) severity = 'critical';
        else if (progress >= 90) severity = 'danger';
        else if (progress >= 80) severity = 'warning';
        byCategory[b.category] = {
          limit: b.limit,
          spent: b.spent,
          progress: parseFloat(progress.toFixed(2)),
          severity
        };
      }
      return { budgets, byCategory };
    });
  });
};

/**
 * Arbitrary: category baseline with controlled statistical properties.
 *
 * @param {Object} options
 * @param {string} [options.category] - Category name (random if not specified)
 * @param {number} [options.minMonths=0] - Minimum months with data
 * @param {number} [options.maxMonths=24] - Maximum months with data
 * @param {number} [options.minCount=0] - Minimum transaction count
 * @param {number} [options.maxCount=100] - Maximum transaction count
 * @param {boolean} [options.forceValid] - Force hasValidBaseline to true
 * @returns {fc.Arbitrary<Object>} Category baseline object
 */
const arbCategoryBaseline = (options = {}) => {
  const categories = ['Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing', 'Gifts', 'Housing'];
  const minMonths = options.minMonths !== undefined ? options.minMonths : 0;
  const maxMonths = options.maxMonths !== undefined ? options.maxMonths : 24;
  const minCount = options.minCount !== undefined ? options.minCount : 0;
  const maxCount = options.maxCount !== undefined ? options.maxCount : 100;

  return fc.record({
    category: options.category ? fc.constant(options.category) : fc.constantFrom(...categories),
    mean: fc.float({ min: Math.fround(0), max: Math.fround(2000), noNaN: true }).filter(n => isFinite(n) && n >= 0),
    stdDev: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 0),
    count: fc.integer({ min: minCount, max: maxCount }),
    monthsWithData: fc.integer({ min: minMonths, max: maxMonths })
  }).chain(base => {
    const hasValidBaseline = options.forceValid ? true : base.count >= 3;
    // Generate monthlyAverages and transactionCounts keyed by YYYY-MM
    const numMonths = base.monthsWithData;
    if (numMonths === 0) {
      return fc.constant({
        ...base,
        hasValidBaseline,
        monthlyAverages: {},
        transactionCounts: {}
      });
    }
    return fc.array(
      fc.record({
        total: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 0),
        txCount: fc.integer({ min: 1, max: 30 })
      }),
      { minLength: numMonths, maxLength: numMonths }
    ).map(monthData => {
      const monthlyAverages = {};
      const transactionCounts = {};
      // Generate sequential month keys starting from 2023-01
      for (let i = 0; i < monthData.length; i++) {
        const y = 2023 + Math.floor(i / 12);
        const m = (i % 12) + 1;
        const key = `${y}-${String(m).padStart(2, '0')}`;
        monthlyAverages[key] = parseFloat(monthData[i].total.toFixed(2));
        transactionCounts[key] = monthData[i].txCount;
      }
      return {
        ...base,
        hasValidBaseline,
        monthlyAverages,
        transactionCounts
      };
    });
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
  
  // Anomaly detection arbitraries
  arbExpenseDataset,
  arbAnomalyArray,
  arbBudgetData,
  arbCategoryBaseline,
  
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

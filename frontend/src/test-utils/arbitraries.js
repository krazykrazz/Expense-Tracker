/**
 * Reusable fast-check arbitrary generators for common domain objects.
 * Reduces boilerplate in PBT tests by providing pre-built generators.
 */
import fc from 'fast-check';

// ── Date Generators ──

/**
 * Generate a safe date string in YYYY-MM-DD format.
 * @param {Object} options - { minYear, maxYear }
 */
export const safeDate = ({ minYear = 2020, maxYear = 2030 } = {}) =>
  fc.record({
    year: fc.integer({ min: minYear, max: maxYear }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }) // 28 avoids invalid month-end dates
  }).map(({ year, month, day }) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  );

/**
 * Generate a safe Date object.
 */
export const safeDateObject = (options = {}) =>
  safeDate(options).map(s => new Date(s + 'T00:00:00'));

/**
 * Generate a date range { start, end } where start <= end.
 */
export const dateRange = (options = {}) =>
  fc.tuple(safeDate(options), safeDate(options))
    .map(([a, b]) => a <= b ? { start: a, end: b } : { start: b, end: a });

// ── Amount Generators ──

/**
 * Generate a safe positive dollar amount (0.01 – 99999.99).
 */
export const safeAmount = ({ min = 0.01, max = 99999.99 } = {}) =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100)
    .filter(v => v >= min);

export const positiveAmount = () => safeAmount({ min: 0.01 });

export const amountWithCents = () =>
  fc.tuple(fc.integer({ min: 0, max: 99999 }), fc.integer({ min: 0, max: 99 }))
    .map(([dollars, cents]) => dollars + cents / 100);

// ── String Generators ──

export const safeString = ({ minLength = 1, maxLength = 50 } = {}) =>
  fc.string({ minLength, maxLength }).filter(s => s.trim().length > 0);

export const nonEmptyString = (options = {}) => safeString(options);

export const placeName = () =>
  fc.string({ minLength: 2, maxLength: 40 })
    .map(s => s.replace(/[^a-zA-Z0-9 ]/g, 'a'))
    .filter(s => s.trim().length >= 2);

// ── Domain-Specific Generators ──

const EXPENSE_CATEGORIES = [
  'Groceries', 'Dining', 'Transportation', 'Entertainment', 'Shopping',
  'Utilities', 'Healthcare', 'Tax - Medical', 'Tax - Donation', 'Education',
  'Travel', 'Personal Care', 'Home', 'Gifts', 'Other'
];

const TAX_DEDUCTIBLE_CATEGORIES = ['Tax - Medical', 'Tax - Donation'];

const PAYMENT_METHODS = ['cash', 'cheque', 'debit', 'credit_card'];

const INSURANCE_STATUSES = ['', 'pending', 'submitted', 'approved', 'denied'];

export const expenseCategory = () => fc.constantFrom(...EXPENSE_CATEGORIES);
export const taxDeductibleCategory = () => fc.constantFrom(...TAX_DEDUCTIBLE_CATEGORIES);
export const paymentMethod = () => fc.constantFrom(...PAYMENT_METHODS);
export const insuranceStatus = () => fc.constantFrom(...INSURANCE_STATUSES);

// ── Composite Generators ──

export const expenseRecord = (overrides = {}) =>
  fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    date: safeDate(),
    place: placeName(),
    amount: positiveAmount(),
    category: expenseCategory(),
    payment_type: paymentMethod(),
    payment_method: fc.constant(''),
    week: fc.integer({ min: 1, max: 5 }),
    notes: fc.constant(''),
    tax_deductible: fc.constant(0),
    insurance_status: fc.constant(''),
    reimbursement_status: fc.constant('none'),
    ...overrides
  });

export const personRecord = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 1000 }),
    name: safeString({ minLength: 2, maxLength: 30 }),
    relationship: fc.constantFrom('self', 'spouse', 'child', 'parent', 'other')
  });

export const budgetRecord = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 1000 }),
    category: expenseCategory(),
    amount: positiveAmount(),
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 })
  });

// ── Sequence Generators ──

export const modalOperationSequence = ({ minLength = 1, maxLength = 20 } = {}) =>
  fc.array(fc.constantFrom('open', 'close'), { minLength, maxLength });

export const stateTransitionSequence = (states) =>
  fc.array(fc.constantFrom(...states), { minLength: 1, maxLength: 20 });

// ── Anomaly Detection Generators ──

const ANOMALY_CLASSIFICATION_VALUES = [
  'Large_Transaction', 'Category_Spending_Spike', 'New_Merchant',
  'Frequency_Spike', 'Recurring_Expense_Increase', 'Seasonal_Deviation',
  'Emerging_Behavior_Trend'
];

const BEHAVIOR_PATTERN_VALUES = ['One_Time_Event', 'Recurring_Change', 'Emerging_Trend'];
const CONFIDENCE_VALUES = ['high', 'medium', 'low'];
const SEVERITY_VALUES = ['low', 'medium', 'high'];
const LEGACY_ANOMALY_TYPES = ['amount', 'daily_total', 'new_merchant'];

const CLUSTER_LABEL_VALUES = [
  'Travel_Event', 'Moving_Event', 'Home_Renovation', 'Holiday_Spending'
];

const CLASSIFICATION_LABELS = {
  Large_Transaction: 'Large Transaction',
  Category_Spending_Spike: 'Category Spending Spike',
  New_Merchant: 'New Merchant',
  Frequency_Spike: 'Frequency Spike',
  Recurring_Expense_Increase: 'Recurring Expense Increase',
  Seasonal_Deviation: 'Seasonal Deviation',
  Emerging_Behavior_Trend: 'Emerging Behavior Trend'
};

/**
 * Generate a fully enriched anomaly object with all fields.
 * @param {Object} options - Override specific fields
 * @returns {fc.Arbitrary<Object>}
 */
export const arbEnrichedAnomaly = (options = {}) => {
  const classificationArb = options.classification
    ? fc.constant(options.classification)
    : fc.constantFrom(...ANOMALY_CLASSIFICATION_VALUES);

  return classificationArb.chain(classification => {
    const typeLabel = CLASSIFICATION_LABELS[classification] || classification;

    return fc.record({
      expenseId: options.expenseId !== undefined
        ? fc.constant(options.expenseId)
        : fc.integer({ min: 1, max: 100000 }),
      date: options.date ? fc.constant(options.date) : safeDate(),
      place: options.place ? fc.constant(options.place) : placeName(),
      amount: options.amount !== undefined
        ? fc.constant(options.amount)
        : positiveAmount(),
      category: options.category
        ? fc.constant(options.category)
        : expenseCategory(),
      anomalyType: fc.constantFrom(...LEGACY_ANOMALY_TYPES),
      classification: fc.constant(classification),
      severity: options.severity
        ? fc.constant(options.severity)
        : fc.constantFrom(...SEVERITY_VALUES),
      explanation: fc.record({
        typeLabel: fc.constant(typeLabel),
        observedValue: safeAmount({ min: 1, max: 10000 }),
        expectedRange: fc.record({
          min: safeAmount({ min: 0.01, max: 3000 }),
          max: safeAmount({ min: 1, max: 5000 })
        }),
        deviationPercent: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true })
          .map(v => Math.round(v * 10) / 10),
        comparisonPeriod: fc.constantFrom(
          'last 12 months',
          'all available data (6 months)',
          'all available data (3 months)'
        )
      }),
      historicalContext: fc.record({
        purchaseRank: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
        purchaseRankTotal: fc.option(fc.integer({ min: 1, max: 500 }), { nil: null }),
        percentile: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
        deviationFromAverage: fc.double({ min: -100, max: 500, noNaN: true, noDefaultInfinity: true })
          .map(v => Math.round(v * 10) / 10),
        frequency: fc.option(
          fc.constantFrom(
            'approximately once every 2 months',
            'approximately once every 9 months',
            'weekly'
          ),
          { nil: null }
        )
      }),
      impactEstimate: fc.record({
        annualizedChange: fc.double({ min: -10000, max: 50000, noNaN: true, noDefaultInfinity: true })
          .map(v => Math.round(v * 100) / 100),
        savingsRateChange: fc.option(
          fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true })
            .map(v => Math.round(v * 10) / 10),
          { nil: null }
        ),
        budgetImpact: fc.option(fc.record({
          budgetLimit: safeAmount({ min: 100, max: 5000 }),
          currentSpent: safeAmount({ min: 0.01, max: 5000 }),
          projectedMonthEnd: safeAmount({ min: 0.01, max: 10000 }),
          projectedOverage: fc.double({ min: -5000, max: 5000, noNaN: true, noDefaultInfinity: true })
            .map(v => Math.round(v * 100) / 100)
        }), { nil: null })
      }),
      behaviorPattern: options.behaviorPattern
        ? fc.constant(options.behaviorPattern)
        : fc.constantFrom(...BEHAVIOR_PATTERN_VALUES),
      confidence: options.confidence
        ? fc.constant(options.confidence)
        : fc.constantFrom(...CONFIDENCE_VALUES),
      reason: fc.option(fc.constantFrom(
        'Amount is unusually high',
        'New merchant detected',
        'Daily total exceeded threshold'
      ), { nil: undefined })
    });
  });
};

/**
 * Generate a cluster alert anomaly object.
 * @param {Object} options - Override specific fields
 * @returns {fc.Arbitrary<Object>}
 */
export const arbClusterAnomaly = (options = {}) => {
  const txCountArb = options.transactionCount
    ? fc.constant(options.transactionCount)
    : fc.integer({ min: 3, max: 10 });

  return txCountArb.chain(txCount => {
    const txArb = fc.array(
      fc.record({
        expenseId: fc.integer({ min: 1, max: 100000 }),
        place: placeName(),
        amount: positiveAmount(),
        date: safeDate()
      }),
      { minLength: txCount, maxLength: txCount }
    );

    return fc.tuple(txArb, dateRange()).chain(([transactions, range]) => {
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

      return fc.record({
        expenseId: fc.constant(null),
        date: fc.constant(range.start),
        place: fc.constant('Multiple'),
        amount: fc.constant(Math.round(totalAmount * 100) / 100),
        category: options.category
          ? fc.constant(options.category)
          : expenseCategory(),
        anomalyType: fc.constant('daily_total'),
        classification: options.classification
          ? fc.constant(options.classification)
          : fc.constantFrom(...ANOMALY_CLASSIFICATION_VALUES),
        severity: options.severity
          ? fc.constant(options.severity)
          : fc.constantFrom(...SEVERITY_VALUES),
        explanation: fc.record({
          typeLabel: fc.constant('Transaction Cluster'),
          observedValue: fc.constant(Math.round(totalAmount * 100) / 100),
          expectedRange: fc.record({
            min: safeAmount({ min: 0.01, max: 1000 }),
            max: safeAmount({ min: 1, max: 3000 })
          }),
          deviationPercent: fc.double({ min: 0, max: 300, noNaN: true, noDefaultInfinity: true })
            .map(v => Math.round(v * 10) / 10),
          comparisonPeriod: fc.constantFrom('last 12 months', 'all available data (6 months)')
        }),
        historicalContext: fc.record({
          purchaseRank: fc.constant(null),
          purchaseRankTotal: fc.constant(null),
          percentile: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
          deviationFromAverage: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true })
            .map(v => Math.round(v * 10) / 10),
          frequency: fc.constant(null)
        }),
        impactEstimate: fc.record({
          annualizedChange: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
            .map(v => Math.round(v * 100) / 100),
          savingsRateChange: fc.option(
            fc.double({ min: -50, max: 0, noNaN: true, noDefaultInfinity: true })
              .map(v => Math.round(v * 10) / 10),
            { nil: null }
          ),
          budgetImpact: fc.constant(null)
        }),
        behaviorPattern: fc.constant('One_Time_Event'),
        confidence: fc.constantFrom(...CONFIDENCE_VALUES),
        cluster: fc.constantFrom(...CLUSTER_LABEL_VALUES).map(label => ({
          label: options.clusterLabel || label,
          totalAmount: Math.round(totalAmount * 100) / 100,
          transactionCount: txCount,
          dateRange: range,
          transactions
        }))
      });
    });
  });
};

/**
 * Generate a drift alert anomaly object.
 * @param {Object} options - Override specific fields
 * @returns {fc.Arbitrary<Object>}
 */
export const arbDriftAnomaly = (options = {}) =>
  fc.record({
    expenseId: fc.constant(null),
    date: safeDate(),
    place: fc.constant(''),
    amount: fc.constant(0),
    category: options.category
      ? fc.constant(options.category)
      : expenseCategory(),
    anomalyType: fc.constant('daily_total'),
    classification: fc.constant('Emerging_Behavior_Trend'),
    severity: options.severity
      ? fc.constant(options.severity)
      : fc.constantFrom(...SEVERITY_VALUES),
    explanation: fc.record({
      typeLabel: fc.constant('Emerging Behavior Trend'),
      observedValue: safeAmount({ min: 100, max: 5000 }),
      expectedRange: fc.record({
        min: safeAmount({ min: 0.01, max: 2000 }),
        max: safeAmount({ min: 1, max: 3000 })
      }),
      deviationPercent: fc.double({ min: 25, max: 300, noNaN: true, noDefaultInfinity: true })
        .map(v => Math.round(v * 10) / 10),
      comparisonPeriod: fc.constant('last 6 months')
    }),
    historicalContext: fc.record({
      purchaseRank: fc.constant(null),
      purchaseRankTotal: fc.constant(null),
      percentile: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
      deviationFromAverage: fc.double({ min: 25, max: 500, noNaN: true, noDefaultInfinity: true })
        .map(v => Math.round(v * 10) / 10),
      frequency: fc.constant(null)
    }),
    impactEstimate: fc.record({
      annualizedChange: fc.double({ min: 100, max: 50000, noNaN: true, noDefaultInfinity: true })
        .map(v => Math.round(v * 100) / 100),
      savingsRateChange: fc.option(
        fc.double({ min: -50, max: 0, noNaN: true, noDefaultInfinity: true })
          .map(v => Math.round(v * 10) / 10),
        { nil: null }
      ),
      budgetImpact: fc.constant(null)
    }),
    behaviorPattern: fc.constant('Emerging_Trend'),
    confidence: fc.constantFrom(...CONFIDENCE_VALUES),
    _driftData: fc.record({
      recentAvg: safeAmount({ min: 100, max: 5000 }),
      precedingAvg: safeAmount({ min: 50, max: 4000 }),
      percentageIncrease: fc.double({ min: 25, max: 300, noNaN: true, noDefaultInfinity: true })
        .map(v => Math.round(v * 10) / 10)
    }),
    budgetSuggestion: options.includeBudgetSuggestion === false
      ? fc.constant(null)
      : fc.option(fc.record({
          type: fc.constantFrom('create_budget', 'adjust_budget'),
          category: options.category
            ? fc.constant(options.category)
            : expenseCategory(),
          suggestedLimit: fc.integer({ min: 50, max: 10000 })
            .map(n => Math.ceil(n / 50) * 50),
          currentLimit: fc.option(fc.integer({ min: 50, max: 10000 }), { nil: null })
        }), { nil: null })
  });

/**
 * Generate a legacy anomaly object (no classification/explanation).
 * @param {Object} options - Override specific fields
 * @returns {fc.Arbitrary<Object>}
 */
export const arbLegacyAnomaly = (options = {}) =>
  fc.record({
    expenseId: options.expenseId !== undefined
      ? fc.constant(options.expenseId)
      : fc.integer({ min: 1, max: 100000 }),
    date: options.date ? fc.constant(options.date) : safeDate(),
    place: options.place ? fc.constant(options.place) : placeName(),
    amount: options.amount !== undefined
      ? fc.constant(options.amount)
      : positiveAmount(),
    category: options.category
      ? fc.constant(options.category)
      : expenseCategory(),
    anomalyType: options.anomalyType
      ? fc.constant(options.anomalyType)
      : fc.constantFrom(...LEGACY_ANOMALY_TYPES),
    reason: fc.constantFrom(
      'Amount is unusually high compared to category average',
      'New merchant detected with above-average amount',
      'Daily total exceeded historical threshold'
    ),
    severity: options.severity
      ? fc.constant(options.severity)
      : fc.constantFrom(...SEVERITY_VALUES)
  });

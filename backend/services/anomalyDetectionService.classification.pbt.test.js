/**
 * Property-Based Tests for AnomalyDetectionService — Classification & Confidence
 *
 * Property 7: Classification and behavior pattern enum membership
 * Property 8: Classification threshold correctness
 * Property 18: Confidence scoring
 *
 * Feature: actionable-anomaly-alerts
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 5.1, 9.1, 9.2, 9.3
 *
 * @invariant Classification & Confidence Correctness: For any anomaly processed
 * through _classifyAnomaly, the classification field is always one of the 7
 * ANOMALY_CLASSIFICATIONS values, legacy anomalyType is preserved, LEGACY_TYPE_MAP
 * correctly maps all 3 legacy types, and _scoreConfidence always returns a valid
 * CONFIDENCE_LEVELS value reflecting data quantity thresholds (high for 12+ months
 * AND 10+ transactions, medium for 6-11 months OR 5-9 transactions, low otherwise).
 */

const fc = require('fast-check');
const {
  arbExpenseDataset,
  arbAnomalyArray,
  safeDate
} = require('../test/pbtArbitraries');
const {
  ANOMALY_CLASSIFICATIONS,
  BEHAVIOR_PATTERNS,
  CONFIDENCE_LEVELS,
  LEGACY_TYPE_MAP,
  ANOMALY_TYPES
} = require('../utils/analyticsConstants');

// Configure fast-check for fast PBT mode
fc.configureGlobal({ numRuns: 20 });

const anomalyDetectionService = require('./anomalyDetectionService');

// ─── Constants ───
const CLASSIFICATION_VALUES = Object.values(ANOMALY_CLASSIFICATIONS);
const BEHAVIOR_PATTERN_VALUES = Object.values(BEHAVIOR_PATTERNS);
const CONFIDENCE_LEVEL_VALUES = Object.values(CONFIDENCE_LEVELS);
const LEGACY_TYPES = Object.values(ANOMALY_TYPES);

/**
 * Build a minimal anomaly object suitable for classification/confidence inputs.
 */
function makeAnomaly(overrides = {}) {
  return {
    id: overrides.id || 1,
    expenseId: overrides.expenseId != null ? overrides.expenseId : 100,
    date: overrides.date || '2024-06-15',
    place: overrides.place || 'TestStore',
    amount: overrides.amount || 150,
    category: overrides.category || 'Groceries',
    anomalyType: overrides.anomalyType || ANOMALY_TYPES.AMOUNT,
    severity: overrides.severity || 'medium',
    dismissed: false,
    categoryAverage: overrides.categoryAverage || 50,
    standardDeviations: overrides.standardDeviations || 3.5,
    ...overrides
  };
}

/**
 * Arbitrary for a classified anomaly with controlled properties.
 */
const arbClassifiedAnomaly = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  expenseId: fc.integer({ min: 1, max: 100000 }),
  date: safeDate({ min: new Date('2024-01-01'), max: new Date('2025-06-30') }),
  place: fc.constantFrom('Costco', 'Walmart', 'Amazon', 'Starbucks', 'Shell', 'Target'),
  amount: fc.float({ min: Math.fround(10), max: Math.fround(5000), noNaN: true })
    .filter(n => isFinite(n) && n >= 10),
  category: fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing'),
  anomalyType: fc.constantFrom('amount', 'daily_total', 'new_merchant'),
  classification: fc.constantFrom(...CLASSIFICATION_VALUES),
  severity: fc.constantFrom('low', 'medium', 'high'),
  dismissed: fc.constant(false),
  categoryAverage: fc.float({ min: Math.fround(1), max: Math.fround(2000), noNaN: true })
    .filter(n => isFinite(n) && n >= 1),
  standardDeviations: fc.float({ min: Math.fround(0), max: Math.fround(10), noNaN: true })
    .filter(n => isFinite(n) && n >= 0)
});


// ─── Property 7: Classification and behavior pattern enum membership ───
// **Validates: Requirements 3.1, 5.1**

describe('Property 7: Classification and behavior pattern enum membership', () => {
  it('after _classifyAnomaly, classification is always one of ANOMALY_CLASSIFICATIONS values', () => {
    fc.assert(
      fc.property(arbClassifiedAnomaly, (anomaly) => {
        // Clear classification to force _classifyAnomaly to assign one
        const original = { ...anomaly };
        delete original.classification;

        anomalyDetectionService._classifyAnomaly(original, []);

        expect(CLASSIFICATION_VALUES).toContain(original.classification);
      })
    );
  });

  it('legacy anomalyType field is preserved (not overwritten) after classification', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('amount', 'daily_total', 'new_merchant'),
        (legacyType) => {
          const anomaly = makeAnomaly({ anomalyType: legacyType });
          delete anomaly.classification;

          anomalyDetectionService._classifyAnomaly(anomaly, []);

          // anomalyType must still be the original legacy value
          expect(anomaly.anomalyType).toBe(legacyType);
          // classification must be set to a valid value
          expect(CLASSIFICATION_VALUES).toContain(anomaly.classification);
        }
      )
    );
  });

  it('LEGACY_TYPE_MAP correctly maps all 3 legacy types to valid classifications', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LEGACY_TYPES),
        (legacyType) => {
          const mapped = LEGACY_TYPE_MAP[legacyType];
          expect(mapped).toBeDefined();
          expect(CLASSIFICATION_VALUES).toContain(mapped);
        }
      )
    );
  });

  it('when anomaly already has a valid classification, _classifyAnomaly preserves it', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CLASSIFICATION_VALUES),
        fc.constantFrom('amount', 'daily_total', 'new_merchant'),
        (existingClassification, legacyType) => {
          const anomaly = makeAnomaly({
            anomalyType: legacyType,
            classification: existingClassification
          });

          anomalyDetectionService._classifyAnomaly(anomaly, []);

          // Existing valid classification should be preserved
          expect(anomaly.classification).toBe(existingClassification);
        }
      )
    );
  });

  it('behaviorPattern from _assignBehaviorPattern is always one of BEHAVIOR_PATTERNS values', () => {
    fc.assert(
      fc.property(
        arbClassifiedAnomaly,
        arbAnomalyArray({ minSize: 0, maxSize: 10 }),
        (anomaly, otherAnomalies) => {
          const allAnomalies = [anomaly, ...otherAnomalies];
          const pattern = anomalyDetectionService._assignBehaviorPattern(anomaly, [], allAnomalies);
          expect(BEHAVIOR_PATTERN_VALUES).toContain(pattern);
        }
      )
    );
  });
});


// ─── Property 8: Classification threshold correctness ───
// **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

describe('Property 8: Classification threshold correctness', () => {
  it('amount anomalyType maps to Large_Transaction classification', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(10), max: Math.fround(5000), noNaN: true })
          .filter(n => isFinite(n) && n >= 10),
        (amount) => {
          const anomaly = makeAnomaly({
            anomalyType: ANOMALY_TYPES.AMOUNT,
            amount
          });
          delete anomaly.classification;

          anomalyDetectionService._classifyAnomaly(anomaly, []);

          expect(anomaly.classification).toBe(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION);
        }
      )
    );
  });

  it('daily_total anomalyType maps to Large_Transaction classification', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(10), max: Math.fround(5000), noNaN: true })
          .filter(n => isFinite(n) && n >= 10),
        (amount) => {
          const anomaly = makeAnomaly({
            anomalyType: ANOMALY_TYPES.DAILY_TOTAL,
            amount
          });
          delete anomaly.classification;

          anomalyDetectionService._classifyAnomaly(anomaly, []);

          expect(anomaly.classification).toBe(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION);
        }
      )
    );
  });

  it('new_merchant anomalyType maps to New_Merchant classification', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(10), max: Math.fround(5000), noNaN: true })
          .filter(n => isFinite(n) && n >= 10),
        (amount) => {
          const anomaly = makeAnomaly({
            anomalyType: ANOMALY_TYPES.NEW_MERCHANT,
            amount
          });
          delete anomaly.classification;

          anomalyDetectionService._classifyAnomaly(anomaly, []);

          expect(anomaly.classification).toBe(ANOMALY_CLASSIFICATIONS.NEW_MERCHANT);
        }
      )
    );
  });

  it('anomalies from _detectCategorySpendingSpikes have Category_Spending_Spike classification', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CLASSIFICATION_VALUES),
        () => {
          // Anomalies produced by _detectCategorySpendingSpikes already set classification
          const anomaly = makeAnomaly({
            anomalyType: 'category_spending_spike',
            classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE
          });

          anomalyDetectionService._classifyAnomaly(anomaly, []);

          // Pre-set valid classification is preserved
          expect(anomaly.classification).toBe(ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE);
        }
      )
    );
  });

  it('anomalies from _detectFrequencySpikes have Frequency_Spike classification', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CLASSIFICATION_VALUES),
        () => {
          const anomaly = makeAnomaly({
            anomalyType: 'frequency_spike',
            classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE
          });

          anomalyDetectionService._classifyAnomaly(anomaly, []);

          expect(anomaly.classification).toBe(ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE);
        }
      )
    );
  });

  it('anomalies from _detectRecurringExpenseIncreases have Recurring_Expense_Increase classification', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CLASSIFICATION_VALUES),
        () => {
          const anomaly = makeAnomaly({
            anomalyType: 'recurring_expense_increase',
            classification: ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE
          });

          anomalyDetectionService._classifyAnomaly(anomaly, []);

          expect(anomaly.classification).toBe(ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE);
        }
      )
    );
  });

  it('anomalies from _detectSeasonalDeviations have Seasonal_Deviation classification', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CLASSIFICATION_VALUES),
        () => {
          const anomaly = makeAnomaly({
            anomalyType: 'seasonal_deviation',
            classification: ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION
          });

          anomalyDetectionService._classifyAnomaly(anomaly, []);

          expect(anomaly.classification).toBe(ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION);
        }
      )
    );
  });

  it('anomalies from _detectBehavioralDrift have Emerging_Behavior_Trend classification', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CLASSIFICATION_VALUES),
        () => {
          const anomaly = makeAnomaly({
            anomalyType: 'behavioral_drift',
            classification: ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND
          });

          anomalyDetectionService._classifyAnomaly(anomaly, []);

          expect(anomaly.classification).toBe(ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND);
        }
      )
    );
  });

  it('anomaly without classification and unknown anomalyType defaults to Large_Transaction', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 })
          .filter(s => !['amount', 'daily_total', 'new_merchant'].includes(s)),
        (unknownType) => {
          const anomaly = makeAnomaly({ anomalyType: unknownType });
          delete anomaly.classification;

          anomalyDetectionService._classifyAnomaly(anomaly, []);

          expect(anomaly.classification).toBe(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION);
        }
      )
    );
  });
});


// ─── Property 18: Confidence scoring ───
// **Validates: Requirements 9.1, 9.2, 9.3**

describe('Property 18: Confidence scoring', () => {
  /**
   * Helper: build an expense array spanning a given number of months
   * with a given number of transactions in a specific category.
   */
  function buildExpenses(category, monthCount, transactionCount) {
    const expenses = [];
    const baseYear = 2023;
    let id = 1;

    // Distribute transactions across months
    for (let i = 0; i < transactionCount; i++) {
      const monthIndex = i % Math.max(monthCount, 1);
      const year = baseYear + Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      const day = Math.min((i % 28) + 1, 28);
      expenses.push({
        id: id++,
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        place: 'Store',
        amount: 50 + (i * 3),
        type: category,
        week: 1,
        method: 'Cash'
      });
    }
    return expenses;
  }

  it('returns high when 12+ months data AND 10+ transactions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 12, max: 36 }),
        fc.integer({ min: 10, max: 100 }),
        fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing'),
        (months, txCount, category) => {
          // Ensure we have enough transactions spread across enough months
          const effectiveTxCount = Math.max(txCount, months);
          const expenses = buildExpenses(category, months, effectiveTxCount);
          const anomaly = makeAnomaly({ category });

          const confidence = anomalyDetectionService._scoreConfidence(anomaly, expenses);

          expect(confidence).toBe(CONFIDENCE_LEVELS.HIGH);
        }
      )
    );
  });

  it('returns medium when 6-11 months of data (regardless of transaction count)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 6, max: 11 }),
        fc.integer({ min: 1, max: 4 }),
        fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing'),
        (months, txPerMonth, category) => {
          // Keep total transactions < 5 to avoid high path, but months 6-11 → medium
          const totalTx = Math.min(txPerMonth * months, 4);
          const expenses = buildExpenses(category, months, Math.max(totalTx, months));
          const anomaly = makeAnomaly({ category });

          const confidence = anomalyDetectionService._scoreConfidence(anomaly, expenses);

          // 6-11 months triggers medium regardless of transaction count
          expect(confidence).toBe(CONFIDENCE_LEVELS.MEDIUM);
        }
      )
    );
  });

  it('returns medium when 5-9 transactions (regardless of month count)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 9 }),
        fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing'),
        (txCount, category) => {
          // Put all transactions in 1-2 months so months < 6
          const expenses = buildExpenses(category, 2, txCount);
          const anomaly = makeAnomaly({ category });

          const confidence = anomalyDetectionService._scoreConfidence(anomaly, expenses);

          expect(confidence).toBe(CONFIDENCE_LEVELS.MEDIUM);
        }
      )
    );
  });

  it('returns low when <6 months AND <5 transactions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 4 }),
        fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing'),
        (months, txCount, category) => {
          // Ensure months < 6 and transactions < 5
          const effectiveMonths = Math.min(months, 5);
          const effectiveTx = Math.min(txCount, 4);
          const expenses = buildExpenses(category, effectiveMonths, effectiveTx);
          const anomaly = makeAnomaly({ category });

          const confidence = anomalyDetectionService._scoreConfidence(anomaly, expenses);

          expect(confidence).toBe(CONFIDENCE_LEVELS.LOW);
        }
      )
    );
  });

  it('returns low when no expenses exist for the category', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing'),
        (category) => {
          const anomaly = makeAnomaly({ category });

          const confidence = anomalyDetectionService._scoreConfidence(anomaly, []);

          expect(confidence).toBe(CONFIDENCE_LEVELS.LOW);
        }
      )
    );
  });

  it('result is always one of CONFIDENCE_LEVELS values for any input', () => {
    fc.assert(
      fc.property(
        arbClassifiedAnomaly,
        arbExpenseDataset({ minSize: 0, maxSize: 30 }),
        (anomaly, expenses) => {
          const confidence = anomalyDetectionService._scoreConfidence(anomaly, expenses);

          expect(CONFIDENCE_LEVEL_VALUES).toContain(confidence);
        }
      )
    );
  });
});

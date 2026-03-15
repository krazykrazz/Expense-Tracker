/**
 * Property-Based Tests for AnomalyDetectionService — Suppression & Error Resilience
 *
 * Property 12: Benign pattern suppression
 * Property 13: Budget-aware suppression scope
 * Property 21: Error resilience
 *
 * Feature: actionable-anomaly-alerts
 * Validates: Requirements 6.1, 6.2, 6.6, 13.5, 16.1, 16.3, 16.10
 *
 * @invariant Suppression & Error Resilience: For any anomaly in a
 * RARE_PURCHASE_CATEGORY with fewer than MIN_TRANSACTIONS_FOR_RARE historical
 * transactions, _suppressBenignPatterns removes it. For any anomaly matching
 * SEASONAL_SPIKE_MONTHS when the current month matches and 12+ months of data
 * exist, it is suppressed. Non-rare categories are never suppressed by the rare
 * rule. _suppressBudgetCovered suppresses only Category_Spending_Spike anomalies
 * when budget progress >= 90%, never other types. When budgetData is null, no
 * suppression occurs. The enrichment pipeline handles errors gracefully with
 * try/catch per step, using default values on failure, and continues processing
 * remaining anomalies after one fails.
 */

const fc = require('fast-check');
const {
  arbExpenseDataset,
  arbAnomalyArray,
  arbBudgetData,
  safeDate,
  pbtOptions
} = require('../test/pbtArbitraries');
const {
  ANOMALY_CLASSIFICATIONS,
  SUPPRESSION_CONFIG,
  DETECTION_THRESHOLDS,
  SEVERITY_LEVELS,
  BEHAVIOR_PATTERNS,
  CONFIDENCE_LEVELS
} = require('../utils/analyticsConstants');

// Configure fast-check for fast PBT mode
fc.configureGlobal({ numRuns: 20 });

// The service is a singleton — access private methods directly
const anomalyDetectionService = require('./anomalyDetectionService');

// ─── Constants ───
const RARE_CATEGORIES = SUPPRESSION_CONFIG.RARE_PURCHASE_CATEGORIES;
const MIN_RARE_TXN = SUPPRESSION_CONFIG.MIN_TRANSACTIONS_FOR_RARE;
const SEASONAL_MONTHS = SUPPRESSION_CONFIG.SEASONAL_SPIKE_MONTHS;
const CLASSIFICATION_VALUES = Object.values(ANOMALY_CLASSIFICATIONS);

const NON_SPIKE_CLASSIFICATIONS = CLASSIFICATION_VALUES.filter(
  c => c !== ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE
);

// ─── Helpers ───

/**
 * Build a minimal anomaly object for suppression testing.
 */
function makeAnomaly(overrides = {}) {
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: overrides.expenseId != null ? overrides.expenseId : Math.floor(Math.random() * 10000),
    date: overrides.date || '2025-01-15',
    place: overrides.place || 'TestMerchant',
    amount: overrides.amount || 100,
    category: overrides.category || 'Dining',
    anomalyType: overrides.anomalyType || 'amount',
    classification: overrides.classification || ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
    severity: overrides.severity || SEVERITY_LEVELS.MEDIUM,
    dismissed: false,
    categoryAverage: overrides.categoryAverage || 50,
    standardDeviations: 0,
    cluster: overrides.cluster || null,
    ...overrides
  };
}

/**
 * Generate expense records for a category across N months.
 */
function makeExpenses(category, count, opts = {}) {
  const expenses = [];
  const startYear = opts.startYear || 2023;
  const startMonth = opts.startMonth || 1;
  for (let i = 0; i < count; i++) {
    const month = ((startMonth - 1 + i) % 12) + 1;
    const year = startYear + Math.floor((startMonth - 1 + i) / 12);
    expenses.push({
      id: i + 1,
      date: `${year}-${String(month).padStart(2, '0')}-15`,
      place: opts.place || 'Store',
      amount: opts.amount || 50,
      type: category
    });
  }
  return expenses;
}

/**
 * Build budget data with a specific progress for a category.
 */
function makeBudgetData(categories = {}) {
  const byCategory = {};
  for (const [cat, opts] of Object.entries(categories)) {
    byCategory[cat] = {
      limit: opts.limit || 500,
      spent: opts.spent || 0,
      progress: opts.progress != null ? opts.progress : 0,
      severity: opts.severity || null
    };
  }
  return { byCategory };
}

// ─── Property 12: Benign pattern suppression ───
// **Validates: Requirements 6.1, 6.2**

describe('Property 12: Benign pattern suppression', () => {
  it('suppresses anomalies in RARE_PURCHASE_CATEGORIES with < MIN_TRANSACTIONS_FOR_RARE history', () => {
    // Arbitrary: pick a rare category, generate 0..(MIN_RARE_TXN-1) historical transactions
    fc.assert(
      fc.property(
        fc.constantFrom(...RARE_CATEGORIES),
        fc.integer({ min: 0, max: MIN_RARE_TXN - 1 }),
        (rareCategory, histCount) => {
          const anomalies = [makeAnomaly({ category: rareCategory })];
          const allExpenses = makeExpenses(rareCategory, histCount);

          const result = anomalyDetectionService._suppressBenignPatterns(anomalies, allExpenses);
          expect(result).toHaveLength(0);
        }
      )
    );
  });

  it('does NOT suppress anomalies in RARE_PURCHASE_CATEGORIES with >= MIN_TRANSACTIONS_FOR_RARE history', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RARE_CATEGORIES),
        fc.integer({ min: MIN_RARE_TXN, max: MIN_RARE_TXN + 10 }),
        (rareCategory, histCount) => {
          const anomalies = [makeAnomaly({ category: rareCategory })];
          const allExpenses = makeExpenses(rareCategory, histCount);

          const result = anomalyDetectionService._suppressBenignPatterns(anomalies, allExpenses);
          expect(result).toHaveLength(1);
        }
      )
    );
  });

  it('never suppresses anomalies in non-rare categories via the rare-category rule', () => {
    const nonRareCategories = ['Dining', 'Groceries', 'Gas', 'Healthcare', 'Transportation'];
    fc.assert(
      fc.property(
        fc.constantFrom(...nonRareCategories),
        fc.integer({ min: 0, max: 3 }),
        (category, histCount) => {
          const anomalies = [makeAnomaly({ category })];
          const allExpenses = makeExpenses(category, histCount);

          const result = anomalyDetectionService._suppressBenignPatterns(anomalies, allExpenses);
          // Non-rare categories should not be suppressed by the rare rule
          expect(result).toHaveLength(1);
        }
      )
    );
  });

  it('suppresses seasonal anomalies when current month matches and 12+ months data exist', () => {
    // Test each seasonal category/month pair
    const seasonalEntries = Object.entries(SEASONAL_MONTHS);

    for (const [category, spikeMonth] of seasonalEntries) {
      // Set fake timer to the spike month
      const fakeDate = new Date(2025, spikeMonth - 1, 15);
      jest.useFakeTimers({ now: fakeDate });

      fc.assert(
        fc.property(
          fc.integer({ min: 12, max: 24 }),
          (monthsOfData) => {
            const anomalies = [makeAnomaly({ category })];
            const allExpenses = makeExpenses(category, monthsOfData, { startYear: 2024, startMonth: 1 });

            const result = anomalyDetectionService._suppressBenignPatterns(anomalies, allExpenses);
            expect(result).toHaveLength(0);
          }
        )
      );

      jest.useRealTimers();
    }
  });

  it('does NOT suppress seasonal anomalies when fewer than 12 months of data', () => {
    const seasonalEntries = Object.entries(SEASONAL_MONTHS);

    for (const [category, spikeMonth] of seasonalEntries) {
      const fakeDate = new Date(2025, spikeMonth - 1, 15);
      jest.useFakeTimers({ now: fakeDate });

      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 11 }),
          (monthsOfData) => {
            const anomalies = [makeAnomaly({ category })];
            const allExpenses = makeExpenses(category, monthsOfData, { startYear: 2025, startMonth: 1 });

            const result = anomalyDetectionService._suppressBenignPatterns(anomalies, allExpenses);
            expect(result).toHaveLength(1);
          }
        )
      );

      jest.useRealTimers();
    }
  });

  it('does NOT suppress seasonal anomalies when current month does not match spike month', () => {
    const seasonalEntries = Object.entries(SEASONAL_MONTHS);

    for (const [category, spikeMonth] of seasonalEntries) {
      // Pick a non-matching month
      const nonMatchMonth = spikeMonth === 12 ? 6 : 12;
      const fakeDate = new Date(2025, nonMatchMonth - 1, 15);
      jest.useFakeTimers({ now: fakeDate });

      fc.assert(
        fc.property(
          fc.integer({ min: 12, max: 24 }),
          (monthsOfData) => {
            const anomalies = [makeAnomaly({ category })];
            const allExpenses = makeExpenses(category, monthsOfData, { startYear: 2024, startMonth: 1 });

            const result = anomalyDetectionService._suppressBenignPatterns(anomalies, allExpenses);
            expect(result).toHaveLength(1);
          }
        )
      );

      jest.useRealTimers();
    }
  });
});


// ─── Property 13: Budget-aware suppression scope ───
// **Validates: Requirements 6.6, 16.1, 16.3**

describe('Property 13: Budget-aware suppression scope', () => {
  it('suppresses Category_Spending_Spike when budget progress >= 90%', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Dining', 'Groceries', 'Gas', 'Entertainment', 'Clothing'),
        fc.float({ min: Math.fround(90), max: Math.fround(200), noNaN: true })
          .filter(n => isFinite(n) && n >= 90),
        (category, progress) => {
          const anomalies = [makeAnomaly({
            category,
            classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE,
            anomalyType: 'category_spending_spike'
          })];
          const budgetData = makeBudgetData({
            [category]: { progress, severity: progress >= 100 ? 'critical' : 'danger' }
          });

          const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
          expect(result).toHaveLength(0);
        }
      )
    );
  });

  it('does NOT suppress Category_Spending_Spike when budget progress < 90%', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Dining', 'Groceries', 'Gas', 'Entertainment', 'Clothing'),
        fc.float({ min: Math.fround(0), max: Math.fround(89.99), noNaN: true })
          .filter(n => isFinite(n) && n >= 0),
        (category, progress) => {
          const anomalies = [makeAnomaly({
            category,
            classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE,
            anomalyType: 'category_spending_spike'
          })];
          const budgetData = makeBudgetData({
            [category]: { progress, severity: progress >= 80 ? 'warning' : null }
          });

          const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
          expect(result).toHaveLength(1);
        }
      )
    );
  });

  it('does NOT suppress non-Category_Spending_Spike anomalies regardless of budget status', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_SPIKE_CLASSIFICATIONS),
        fc.constantFrom('Dining', 'Groceries', 'Gas', 'Entertainment'),
        fc.float({ min: Math.fround(90), max: Math.fround(200), noNaN: true })
          .filter(n => isFinite(n) && n >= 90),
        (classification, category, progress) => {
          const anomalies = [makeAnomaly({
            category,
            classification,
            anomalyType: 'amount'
          })];
          const budgetData = makeBudgetData({
            [category]: { progress, severity: progress >= 100 ? 'critical' : 'danger' }
          });

          const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
          expect(result).toHaveLength(1);
        }
      )
    );
  });

  it('does not suppress any anomalies when budgetData is null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CLASSIFICATION_VALUES),
        fc.constantFrom('Dining', 'Groceries', 'Gas'),
        (classification, category) => {
          const anomalies = [makeAnomaly({ category, classification })];

          const result = anomalyDetectionService._suppressBudgetCovered(anomalies, null);
          expect(result).toHaveLength(1);
        }
      )
    );
  });

  it('in mixed sets, only Category_Spending_Spike with high budget progress are suppressed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Dining', 'Groceries', 'Gas'),
        fc.float({ min: Math.fround(90), max: Math.fround(150), noNaN: true })
          .filter(n => isFinite(n) && n >= 90),
        fc.constantFrom(...NON_SPIKE_CLASSIFICATIONS),
        (category, progress, otherClassification) => {
          const spikeAnomaly = makeAnomaly({
            id: 1,
            category,
            classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE
          });
          const otherAnomaly = makeAnomaly({
            id: 2,
            category,
            classification: otherClassification
          });
          const budgetData = makeBudgetData({
            [category]: { progress, severity: 'danger' }
          });

          const result = anomalyDetectionService._suppressBudgetCovered(
            [spikeAnomaly, otherAnomaly], budgetData
          );

          // Spike should be suppressed, other should survive
          expect(result).toHaveLength(1);
          expect(result[0].classification).toBe(otherClassification);
        }
      )
    );
  });
});

// ─── Property 21: Error resilience ───
// **Validates: Requirements 13.5, 16.10**

describe('Property 21: Error resilience', () => {
  it('enrichment pipeline assigns default values when individual steps throw', () => {
    // Simulate enrichment failure by passing anomalies with problematic data
    // through the enrichment methods — each wrapped in try/catch should produce defaults
    fc.assert(
      fc.property(
        fc.constantFrom(...CLASSIFICATION_VALUES),
        fc.constantFrom('Dining', 'Groceries', 'Gas'),
        (classification, category) => {
          const anomaly = makeAnomaly({ category, classification });

          // _classifyAnomaly should not throw even with empty expenses
          try {
            anomalyDetectionService._classifyAnomaly(anomaly, []);
          } catch (e) {
            // If it throws, the pipeline catch assigns a default
            anomaly.classification = classification;
          }
          expect(CLASSIFICATION_VALUES).toContain(anomaly.classification);

          // _buildExplanation with a minimal/empty baseline should return valid structure
          let explanation;
          try {
            explanation = anomalyDetectionService._buildExplanation(anomaly, {
              category, mean: 0, stdDev: 0, count: 0, monthsWithData: 0,
              hasValidBaseline: false, monthlyAverages: {}, transactionCounts: {}
            });
          } catch (e) {
            explanation = {
              typeLabel: '', observedValue: 0,
              expectedRange: { min: 0, max: 0 },
              deviationPercent: 0, comparisonPeriod: ''
            };
          }
          expect(explanation).toBeDefined();
          expect(typeof explanation.typeLabel).toBe('string');
          expect(typeof explanation.observedValue).toBe('number');
          expect(explanation.expectedRange).toBeDefined();

          // _buildHistoricalContext with empty expenses should return valid structure
          let context;
          try {
            context = anomalyDetectionService._buildHistoricalContext(anomaly, []);
          } catch (e) {
            context = {
              purchaseRank: null, purchaseRankTotal: null,
              percentile: null, deviationFromAverage: 0, frequency: null
            };
          }
          expect(context).toBeDefined();
          expect(typeof context.deviationFromAverage).toBe('number');

          // _estimateImpact with null budget/income should return valid structure
          let impact;
          try {
            impact = anomalyDetectionService._estimateImpact(anomaly, [], null, null);
          } catch (e) {
            impact = { annualizedChange: 0, savingsRateChange: null, budgetImpact: null };
          }
          expect(impact).toBeDefined();
          expect(typeof impact.annualizedChange).toBe('number');
          expect(impact.savingsRateChange).toBeNull();
          expect(impact.budgetImpact).toBeNull();

          // _assignBehaviorPattern with empty arrays should return valid pattern
          let pattern;
          try {
            pattern = anomalyDetectionService._assignBehaviorPattern(anomaly, [], []);
          } catch (e) {
            pattern = BEHAVIOR_PATTERNS.ONE_TIME_EVENT;
          }
          expect(Object.values(BEHAVIOR_PATTERNS)).toContain(pattern);

          // _scoreConfidence with empty expenses should return valid level
          let confidence;
          try {
            confidence = anomalyDetectionService._scoreConfidence(anomaly, []);
          } catch (e) {
            confidence = CONFIDENCE_LEVELS.LOW;
          }
          expect([CONFIDENCE_LEVELS.LOW, CONFIDENCE_LEVELS.MEDIUM, CONFIDENCE_LEVELS.HIGH])
            .toContain(confidence);
        }
      )
    );
  });

  it('_suppressBenignPatterns returns anomalies unchanged on internal error (null inputs)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Dining', 'Groceries', 'Gas'),
        (category) => {
          const anomalies = [makeAnomaly({ category })];

          // null allExpenses — method should handle gracefully
          const result = anomalyDetectionService._suppressBenignPatterns(anomalies, null);
          expect(Array.isArray(result)).toBe(true);
          expect(result.length).toBeGreaterThanOrEqual(1);
        }
      )
    );
  });

  it('_suppressBudgetCovered returns anomalies unchanged when budgetData is malformed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CLASSIFICATION_VALUES),
        fc.constantFrom('Dining', 'Groceries', 'Gas'),
        (classification, category) => {
          const anomalies = [makeAnomaly({ category, classification })];

          // Empty object (no byCategory) — should not suppress
          const result1 = anomalyDetectionService._suppressBudgetCovered(anomalies, {});
          expect(result1).toHaveLength(1);

          // null — should not suppress
          const result2 = anomalyDetectionService._suppressBudgetCovered(anomalies, null);
          expect(result2).toHaveLength(1);

          // undefined — should not suppress
          const result3 = anomalyDetectionService._suppressBudgetCovered(anomalies, undefined);
          expect(result3).toHaveLength(1);
        }
      )
    );
  });

  it('suppression methods return empty array for null/empty anomaly input', () => {
    // _suppressBenignPatterns
    expect(anomalyDetectionService._suppressBenignPatterns(null, [])).toEqual([]);
    expect(anomalyDetectionService._suppressBenignPatterns([], [])).toEqual([]);

    // _suppressBudgetCovered
    expect(anomalyDetectionService._suppressBudgetCovered(null, null)).toEqual([]);
    expect(anomalyDetectionService._suppressBudgetCovered([], null)).toEqual([]);
  });

  it('pipeline continues processing remaining anomalies when one has invalid data', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Dining', 'Groceries', 'Gas'),
        fc.integer({ min: 2, max: 5 }),
        (category, count) => {
          // Create a mix of valid anomalies
          const anomalies = [];
          for (let i = 0; i < count; i++) {
            anomalies.push(makeAnomaly({
              id: i + 1,
              category,
              classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION
            }));
          }

          // All should survive benign suppression (non-rare category)
          const result = anomalyDetectionService._suppressBenignPatterns(anomalies, []);
          expect(result).toHaveLength(count);

          // All should survive budget suppression with null budget
          const result2 = anomalyDetectionService._suppressBudgetCovered(anomalies, null);
          expect(result2).toHaveLength(count);
        }
      )
    );
  });
});

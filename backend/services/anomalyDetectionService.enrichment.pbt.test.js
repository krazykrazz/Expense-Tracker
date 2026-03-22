/**
 * Property-Based Tests for AnomalyDetectionService — Enrichment Pipeline
 *
 * Property 1: Enriched anomaly structure completeness
 * Property 2: Explanation expected range and deviation correctness
 * Property 3: Comparison time window selection
 * Property 4: Purchase rank correctness
 * Property 5: Category spending percentile correctness
 * Property 6: Merchant/category frequency computation
 * Property 9: Impact estimate computation
 * Property 10: Budget impact projection
 * Property 11: Behavior pattern assignment
 *
 * Feature: actionable-anomaly-alerts
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5,
 *            4.1, 4.2, 4.3, 4.5, 5.2, 5.3, 5.4, 11.1, 11.2, 16.4
 *
 * @invariant Enrichment Completeness & Correctness: For any anomaly processed
 * through the enrichment pipeline, the output contains all required fields with
 * correct types, explanation ranges satisfy min<=max, deviation is finite,
 * comparison period reflects data availability, purchase rank is bounded,
 * percentile is 0-100, frequency is string|null, annualized impact equals
 * monthly deviation * 12, budget impact is present iff budget exists, and
 * behavior pattern is a valid BEHAVIOR_PATTERNS value.
 */

const fc = require('fast-check');
const {
  arbExpenseDataset,
  arbCategoryBaseline,
  arbBudgetData,
  arbAnomalyArray,
  pbtOptions,
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

// The service is a singleton — we call private methods directly
const anomalyDetectionService = require('./anomalyDetectionService');

// ─── Helpers ───

const CLASSIFICATION_VALUES = Object.values(ANOMALY_CLASSIFICATIONS);
const BEHAVIOR_PATTERN_VALUES = Object.values(BEHAVIOR_PATTERNS);

/**
 * Build a minimal anomaly object suitable for enrichment method inputs.
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
    classification: overrides.classification || ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
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

// ─── Property 1: Enriched anomaly structure completeness ───
// **Validates: Requirements 1.1, 2.5, 4.4, 9.4, 11.1, 11.2**

describe('Property 1: Enriched anomaly structure completeness', () => {
  it('every enriched anomaly has all required fields after full enrichment', () => {
    fc.assert(
      fc.property(arbClassifiedAnomaly, arbCategoryBaseline({ forceValid: true }), (anomaly, baseline) => {
        // Classify
        anomalyDetectionService._classifyAnomaly(anomaly, []);

        // Build explanation
        const explanation = anomalyDetectionService._buildExplanation(anomaly, baseline);

        // Build historical context
        const historicalContext = anomalyDetectionService._buildHistoricalContext(anomaly, []);

        // Estimate impact
        const impactEstimate = anomalyDetectionService._estimateImpact(anomaly, [], null, null);

        // Assign behavior pattern
        const behaviorPattern = anomalyDetectionService._assignBehaviorPattern(anomaly, [], []);

        // Score confidence
        const confidence = anomalyDetectionService._scoreConfidence(anomaly, []);

        // classification must be a valid enum value
        expect(CLASSIFICATION_VALUES).toContain(anomaly.classification);

        // explanation structure
        expect(explanation).toBeDefined();
        expect(typeof explanation.typeLabel).toBe('string');
        expect(typeof explanation.observedValue).toBe('number');
        expect(explanation.expectedRange).toBeDefined();
        expect(typeof explanation.expectedRange.min).toBe('number');
        expect(typeof explanation.expectedRange.max).toBe('number');
        expect(typeof explanation.deviationPercent).toBe('number');
        expect(typeof explanation.comparisonPeriod).toBe('string');

        // historicalContext structure
        expect(historicalContext).toBeDefined();
        expect(typeof historicalContext.deviationFromAverage).toBe('number');

        // impactEstimate structure
        expect(impactEstimate).toBeDefined();
        expect(typeof impactEstimate.annualizedChange).toBe('number');

        // behaviorPattern must be a valid enum value
        expect(BEHAVIOR_PATTERN_VALUES).toContain(behaviorPattern);

        // confidence must be a valid level
        expect([CONFIDENCE_LEVELS.LOW, CONFIDENCE_LEVELS.MEDIUM, CONFIDENCE_LEVELS.HIGH]).toContain(confidence);

        // legacy anomalyType must still be present
        expect(anomaly.anomalyType).toBeDefined();
      })
    );
  });
});

// ─── Property 2: Explanation expected range and deviation correctness ───
// **Validates: Requirements 1.2, 1.3, 2.3**

describe('Property 2: Explanation expected range and deviation correctness', () => {
  it('expectedRange.min <= expectedRange.max and deviationPercent is finite', () => {
    fc.assert(
      fc.property(arbClassifiedAnomaly, arbCategoryBaseline({ forceValid: true }), (anomaly, baseline) => {
        anomalyDetectionService._classifyAnomaly(anomaly, []);
        const explanation = anomalyDetectionService._buildExplanation(anomaly, baseline);

        // min <= max always
        expect(explanation.expectedRange.min).toBeLessThanOrEqual(explanation.expectedRange.max);

        // min is floored at 0
        expect(explanation.expectedRange.min).toBeGreaterThanOrEqual(0);

        // deviationPercent is a finite number
        expect(isFinite(explanation.deviationPercent)).toBe(true);

        // Verify range computation: min = max(0, mean - stdDev), max = mean + stdDev
        // The service rounds min/max with toFixed(2) for the returned object
        const rawMin = Math.max(0, baseline.mean - baseline.stdDev);
        const rawMax = baseline.mean + baseline.stdDev;
        expect(explanation.expectedRange.min).toBe(parseFloat(rawMin.toFixed(2)));
        expect(explanation.expectedRange.max).toBe(parseFloat(rawMax.toFixed(2)));

        // The service computes deviationPercent from the UNROUNDED max, then rounds the result
        if (rawMax > 0) {
          const expectedDeviation = parseFloat((((anomaly.amount - rawMax) / rawMax) * 100).toFixed(2));
          expect(explanation.deviationPercent).toBe(expectedDeviation);
        }
      })
    );
  });
});

// ─── Property 3: Comparison time window selection ───
// **Validates: Requirements 1.4**

describe('Property 3: Comparison time window selection', () => {
  it('uses "last 12 months" when monthsWithData >= 12, else "all available data (N months)"', () => {
    fc.assert(
      fc.property(
        arbClassifiedAnomaly,
        fc.integer({ min: 0, max: 36 }),
        (anomaly, months) => {
          anomalyDetectionService._classifyAnomaly(anomaly, []);
          const baseline = {
            category: anomaly.category,
            mean: 100,
            stdDev: 20,
            count: 10,
            monthsWithData: months,
            hasValidBaseline: true,
            monthlyAverages: {},
            transactionCounts: {}
          };

          const explanation = anomalyDetectionService._buildExplanation(anomaly, baseline);

          if (months >= 12) {
            expect(explanation.comparisonPeriod).toBe('last 12 months');
          } else if (months > 0) {
            expect(explanation.comparisonPeriod).toBe('all available data (' + months + ' months)');
          } else {
            // 0 months → empty string
            expect(explanation.comparisonPeriod).toBe('');
          }
        }
      )
    );
  });
});

// ─── Property 4: Purchase rank correctness ───
// **Validates: Requirements 2.1**

describe('Property 4: Purchase rank correctness', () => {
  it('purchaseRank is between 0 and purchaseRankTotal for amount/new_merchant types', () => {
    const arbAmounts = fc.array(
      fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 1),
      { minLength: 1, maxLength: 30 }
    );

    fc.assert(
      fc.property(
        fc.constantFrom(
          ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
          ANOMALY_CLASSIFICATIONS.NEW_MERCHANT
        ),
        arbAmounts,
        fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 1),
        (classification, historicalAmounts, anomalyAmount) => {
          // Build expenses within last 24 months
          const now = new Date();
          const expenses = historicalAmounts.map((amt, i) => ({
            id: i + 1,
            date: new Date(now.getFullYear(), now.getMonth() - (i % 23), 15).toISOString().split('T')[0],
            place: 'TestStore',
            amount: amt,
            type: 'Groceries'
          }));

          const anomaly = makeAnomaly({
            classification,
            amount: anomalyAmount,
            category: 'Groceries',
            place: 'TestStore'
          });

          const context = anomalyDetectionService._buildHistoricalContext(anomaly, expenses);

          if (context.purchaseRank !== null) {
            // Rank is 0 when anomaly amount is below all historical amounts (findIndex returns -1 → +1 = 0)
            // Otherwise rank is 1-based position in descending order
            expect(context.purchaseRank).toBeGreaterThanOrEqual(0);
            expect(context.purchaseRankTotal).toBeGreaterThanOrEqual(1);
            expect(context.purchaseRank).toBeLessThanOrEqual(context.purchaseRankTotal);

            // When rank > 0, verify it matches the sorted position
            if (context.purchaseRank > 0) {
              const sortedDesc = expenses.map(e => e.amount).sort((a, b) => b - a);
              const expectedRank = sortedDesc.findIndex(a => a <= anomalyAmount) + 1;
              expect(context.purchaseRank).toBe(expectedRank);
            }
          }
        }
      )
    );
  });
});

// ─── Property 5: Category spending percentile correctness ───
// **Validates: Requirements 2.2**

describe('Property 5: Category spending percentile correctness', () => {
  it('percentile is between 0 and 100 for category_spending_spike anomalies', () => {
    const arbMonthlyTotals = fc.array(
      fc.float({ min: Math.fround(10), max: Math.fround(3000), noNaN: true }).filter(n => isFinite(n) && n >= 10),
      { minLength: 2, maxLength: 24 }
    );

    fc.assert(
      fc.property(
        arbMonthlyTotals,
        fc.float({ min: Math.fround(10), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 10),
        (monthlyTotals, currentAmount) => {
          // Build expenses: one per month with the given totals
          const expenses = [];
          let idCounter = 1;
          monthlyTotals.forEach((total, i) => {
            const year = 2023 + Math.floor(i / 12);
            const month = (i % 12) + 1;
            expenses.push({
              id: idCounter++,
              date: `${year}-${String(month).padStart(2, '0')}-15`,
              place: 'Store',
              amount: total,
              type: 'Dining Out'
            });
          });

          const anomaly = makeAnomaly({
            classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE,
            category: 'Dining Out',
            amount: currentAmount
          });

          const context = anomalyDetectionService._buildHistoricalContext(anomaly, expenses);

          if (context.percentile !== null) {
            expect(context.percentile).toBeGreaterThanOrEqual(0);
            expect(context.percentile).toBeLessThanOrEqual(100);
          }
        }
      )
    );
  });
});

// ─── Property 6: Merchant/category frequency computation ───
// **Validates: Requirements 2.4**

describe('Property 6: Merchant/category frequency computation', () => {
  it('frequency is a string or null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
          ANOMALY_CLASSIFICATIONS.NEW_MERCHANT,
          ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE,
          ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE,
          ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE
        ),
        arbExpenseDataset({ minSize: 0, maxSize: 20, categories: ['Groceries'] }),
        (classification, expenses) => {
          const anomaly = makeAnomaly({
            classification,
            category: 'Groceries',
            place: 'Costco'
          });

          const context = anomalyDetectionService._buildHistoricalContext(anomaly, expenses);

          // frequency is either null or a non-empty string
          if (context.frequency !== null) {
            expect(typeof context.frequency).toBe('string');
            expect(context.frequency.length).toBeGreaterThan(0);
          }
        }
      )
    );
  });

  it('frequency is null when fewer than 2 relevant purchases exist', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
          ANOMALY_CLASSIFICATIONS.NEW_MERCHANT
        ),
        (classification) => {
          // Only 1 expense — not enough for frequency
          const expenses = [{
            id: 1, date: '2024-06-15', place: 'UniqueStore',
            amount: 100, type: 'Groceries'
          }];

          const anomaly = makeAnomaly({
            classification,
            category: 'Groceries',
            place: 'UniqueStore'
          });

          const context = anomalyDetectionService._buildHistoricalContext(anomaly, expenses);

          // With only 1 merchant match and 1 category expense, frequency depends on category fallback
          // If category has < 2 expenses, frequency must be null
          if (expenses.filter(e => e.type === anomaly.category).length < 2) {
            expect(context.frequency).toBeNull();
          }
        }
      )
    );
  });
});

// ─── Property 9: Impact estimate computation ───
// **Validates: Requirements 4.1, 4.2, 4.3**

describe('Property 9: Impact estimate computation', () => {
  it('annualizedChange equals monthlyDeviation * 12 approximately', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(10), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 10),
        fc.float({ min: Math.fround(1), max: Math.fround(2000), noNaN: true }).filter(n => isFinite(n) && n >= 1),
        (amount, categoryAverage) => {
          const anomaly = makeAnomaly({ amount, categoryAverage });

          const impact = anomalyDetectionService._estimateImpact(anomaly, [], null, null);

          const monthlyDeviation = amount - categoryAverage;
          const expectedAnnualized = parseFloat((monthlyDeviation * 12).toFixed(2));

          expect(impact.annualizedChange).toBeCloseTo(expectedAnnualized, 1);
        }
      )
    );
  });

  it('savingsRateChange is null when no income data provided', () => {
    fc.assert(
      fc.property(arbClassifiedAnomaly, (anomaly) => {
        const impact = anomalyDetectionService._estimateImpact(anomaly, [], null, null);
        expect(impact.savingsRateChange).toBeNull();
      })
    );
  });

  it('savingsRateChange is a finite number when income data is provided', () => {
    fc.assert(
      fc.property(
        arbClassifiedAnomaly,
        fc.float({ min: Math.fround(2000), max: Math.fround(10000), noNaN: true }).filter(n => isFinite(n) && n >= 2000),
        (anomaly, monthlyIncome) => {
          const incomeData = { monthlyIncome };
          const impact = anomalyDetectionService._estimateImpact(anomaly, [], null, incomeData);

          if (impact.savingsRateChange !== null) {
            expect(isFinite(impact.savingsRateChange)).toBe(true);
          }
        }
      )
    );
  });
});

// ─── Property 10: Budget impact projection ───
// **Validates: Requirements 4.5, 16.4**

describe('Property 10: Budget impact projection', () => {
  it('budgetImpact is non-null with correct fields when budget exists for category', () => {
    fc.assert(
      fc.property(
        arbClassifiedAnomaly,
        arbBudgetData({ categories: ['Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing'] }),
        (anomaly, budgetData) => {
          const impact = anomalyDetectionService._estimateImpact(anomaly, [], budgetData, null);

          if (budgetData.byCategory[anomaly.category]) {
            // Budget exists → budgetImpact must be non-null
            expect(impact.budgetImpact).not.toBeNull();
            expect(typeof impact.budgetImpact.budgetLimit).toBe('number');
            expect(typeof impact.budgetImpact.currentSpent).toBe('number');
            expect(typeof impact.budgetImpact.projectedMonthEnd).toBe('number');
            expect(typeof impact.budgetImpact.projectedOverage).toBe('number');

            // budgetLimit matches the budget's limit
            expect(impact.budgetImpact.budgetLimit).toBe(budgetData.byCategory[anomaly.category].limit);
            // currentSpent matches the budget's spent
            expect(impact.budgetImpact.currentSpent).toBe(budgetData.byCategory[anomaly.category].spent);
            // projectedOverage = projectedMonthEnd - budgetLimit
            expect(impact.budgetImpact.projectedOverage).toBeCloseTo(
              impact.budgetImpact.projectedMonthEnd - impact.budgetImpact.budgetLimit, 1
            );
          } else {
            // No budget → budgetImpact must be null
            expect(impact.budgetImpact).toBeNull();
          }
        }
      )
    );
  });

  it('budgetImpact is null when no budget data provided', () => {
    fc.assert(
      fc.property(arbClassifiedAnomaly, (anomaly) => {
        const impact = anomalyDetectionService._estimateImpact(anomaly, [], null, null);
        expect(impact.budgetImpact).toBeNull();
      })
    );
  });
});

// ─── Property 11: Behavior pattern assignment ───
// **Validates: Requirements 5.2, 5.3, 5.4**

describe('Property 11: Behavior pattern assignment', () => {
  it('returns One_Time_Event when no similar anomalies and no drift', () => {
    fc.assert(
      fc.property(arbClassifiedAnomaly, (anomaly) => {
        // No other anomalies → One_Time_Event
        const pattern = anomalyDetectionService._assignBehaviorPattern(anomaly, [], []);
        expect(pattern).toBe(BEHAVIOR_PATTERNS.ONE_TIME_EVENT);
      })
    );
  });

  it('returns Recurring_Change when 2+ similar anomalies in last 3 months', () => {
    fc.assert(
      fc.property(
        arbClassifiedAnomaly,
        fc.integer({ min: 2, max: 5 }),
        (anomaly, count) => {
          // Build similar anomalies (same category + classification) within last 3 months
          const now = new Date();
          const recentAnomalies = [anomaly];
          for (let i = 0; i < count; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - (i * 10 + 1)); // spread within 3 months
            recentAnomalies.push({
              ...anomaly,
              id: anomaly.id + i + 1,
              date: d.toISOString().split('T')[0]
            });
          }

          const pattern = anomalyDetectionService._assignBehaviorPattern(anomaly, [], recentAnomalies);
          expect(pattern).toBe(BEHAVIOR_PATTERNS.RECURRING_CHANGE);
        }
      )
    );
  });

  it('returns Emerging_Trend when anomaly has _driftData', () => {
    fc.assert(
      fc.property(arbClassifiedAnomaly, (anomaly) => {
        anomaly._driftData = { recentAvg: 500, precedingAvg: 300 };
        const pattern = anomalyDetectionService._assignBehaviorPattern(anomaly, [], []);
        expect(pattern).toBe(BEHAVIOR_PATTERNS.EMERGING_TREND);
      })
    );
  });

  it('returns Emerging_Trend when a drift anomaly exists for same category', () => {
    fc.assert(
      fc.property(arbClassifiedAnomaly, (anomaly) => {
        const driftAnomaly = {
          ...anomaly,
          id: anomaly.id + 999,
          classification: ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND,
          date: anomaly.date
        };

        const pattern = anomalyDetectionService._assignBehaviorPattern(anomaly, [], [anomaly, driftAnomaly]);
        expect(pattern).toBe(BEHAVIOR_PATTERNS.EMERGING_TREND);
      })
    );
  });

  it('behaviorPattern is always one of BEHAVIOR_PATTERNS values', () => {
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

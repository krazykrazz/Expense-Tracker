/**
 * Property-Based Tests for AnomalyDetectionService — Drift Detection & Budget Suggestions
 *
 * Property 16: Behavioral drift detection
 * Property 17: Budget suggestions on drift alerts
 *
 * Feature: actionable-anomaly-alerts
 * Validates: Requirements 8.1, 8.2, 8.5, 8.6, 8.7, 16.5, 16.6
 *
 * @invariant Drift Detection & Budget Suggestion Correctness: For any expense
 * dataset with 6+ months of data per category, _detectBehavioralDrift produces
 * at most one drift alert per category, only when the recent 3-month avg exceeds
 * the preceding 3-month avg by more than DRIFT_THRESHOLD (25%). Each drift alert
 * has classification = Emerging_Behavior_Trend and _driftData with recentAvg and
 * precedingAvg. _attachBudgetSuggestions attaches create_budget when no budget
 * exists, adjust_budget when Critical for 2+ of last 3 months, and never modifies
 * non-drift anomalies. suggestedLimit is always rounded up to nearest $50.
 */

const fc = require('fast-check');
const { safeDate } = require('../test/pbtArbitraries');
const {
  ANOMALY_CLASSIFICATIONS,
  DETECTION_THRESHOLDS,
  SEVERITY_LEVELS
} = require('../utils/analyticsConstants');

// Configure fast-check for fast PBT mode
fc.configureGlobal({ numRuns: 20 });

const anomalyDetectionService = require('./anomalyDetectionService');

// ─── Helpers ───

const DRIFT_THRESHOLD = DETECTION_THRESHOLDS.DRIFT_THRESHOLD; // 0.25
const MIN_MONTHS = DETECTION_THRESHOLDS.MIN_MONTHS_FOR_DRIFT;  // 6
const PERIOD = DETECTION_THRESHOLDS.DRIFT_PERIOD_MONTHS;       // 3

/**
 * Generate expenses for a single category across N months.
 * monthlyAmounts[i] is the total for month i (starting from startYear/startMonth).
 */
function generateMonthlyExpenses(category, monthlyAmounts, startYear, startMonth) {
  const expenses = [];
  let id = 1;
  for (let i = 0; i < monthlyAmounts.length; i++) {
    const m = ((startMonth - 1 + i) % 12) + 1;
    const y = startYear + Math.floor((startMonth - 1 + i) / 12);
    const dateStr = `${y}-${String(m).padStart(2, '0')}-15`;
    expenses.push({
      id: id++,
      date: dateStr,
      place: category + 'Store',
      amount: monthlyAmounts[i],
      type: category,
      week: 3,
      method: 'Cash'
    });
  }
  return expenses;
}

/**
 * Build a drift anomaly object matching the shape produced by _detectBehavioralDrift.
 */
function makeDriftAnomaly(overrides = {}) {
  const recentAvg = overrides.recentPeriodAvg != null ? overrides.recentPeriodAvg : 200;
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: null,
    date: '2025-06-01',
    place: overrides.category || 'Dining',
    amount: recentAvg,
    category: overrides.category || 'Dining',
    anomalyType: 'behavioral_drift',
    classification: ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND,
    severity: SEVERITY_LEVELS.LOW,
    dismissed: false,
    categoryAverage: overrides.precedingPeriodAvg || 100,
    standardDeviations: 0,
    _driftData: {
      recentPeriodAvg: recentAvg,
      precedingPeriodAvg: overrides.precedingPeriodAvg || 100,
      percentageIncrease: 100,
      recentPeriod: { start: '2025-04', end: '2025-06' },
      precedingPeriod: { start: '2025-01', end: '2025-03' }
    }
  };
}

/**
 * Build a non-drift anomaly.
 */
function makeNonDriftAnomaly(overrides = {}) {
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: 123,
    date: '2025-06-15',
    place: 'TestStore',
    amount: 500,
    category: overrides.category || 'Dining',
    anomalyType: 'amount',
    classification: overrides.classification || ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
    severity: SEVERITY_LEVELS.MEDIUM,
    dismissed: false,
    categoryAverage: 100,
    standardDeviations: 4
  };
}

// ─── Arbitraries ───

/**
 * Arbitrary for a positive amount (> 0, finite).
 */
const arbPositiveAmount = fc.float({ min: Math.fround(10), max: Math.fround(5000), noNaN: true })
  .filter(n => isFinite(n) && n >= 10);

/**
 * Arbitrary for a category name.
 */
const arbCategory = fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing');

/**
 * Arbitrary: 6 monthly amounts where recent 3-month avg > preceding 3-month avg * (1 + DRIFT_THRESHOLD).
 * Returns { preceding: [a,b,c], recent: [d,e,f] } where avg(recent) > avg(preceding) * 1.25.
 */
const arbDriftingAmounts = fc.tuple(
  // Preceding 3 months: positive amounts
  fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 50),
  fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 50),
  fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 50),
  // Multiplier above threshold: 1.26 to 3.0
  fc.float({ min: Math.fround(1.26), max: Math.fround(3.0), noNaN: true }).filter(n => isFinite(n) && n >= 1.26)
).map(([a, b, c, multiplier]) => {
  const precedingAvg = (a + b + c) / 3;
  const recentTarget = precedingAvg * multiplier;
  return {
    preceding: [a, b, c],
    recent: [recentTarget, recentTarget, recentTarget]
  };
});

/**
 * Arbitrary: 6 monthly amounts where recent 3-month avg <= preceding 3-month avg * (1 + DRIFT_THRESHOLD).
 * Returns { preceding: [a,b,c], recent: [d,e,f] }.
 */
const arbNonDriftingAmounts = fc.tuple(
  fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 50),
  fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 50),
  fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 50),
  // Multiplier at or below threshold: 0.5 to 1.24 (buffer below 1.25 to avoid FP boundary)
  fc.float({ min: Math.fround(0.5), max: Math.fround(1.24), noNaN: true }).filter(n => isFinite(n) && n >= 0.5)
).map(([a, b, c, multiplier]) => {
  const precedingAvg = (a + b + c) / 3;
  const recentTarget = precedingAvg * multiplier;
  return {
    preceding: [a, b, c],
    recent: [recentTarget, recentTarget, recentTarget]
  };
});


// ─── Property 16: Behavioral drift detection ───
// **Validates: Requirements 8.1, 8.2, 8.5**

describe('Property 16: Behavioral drift detection', () => {
  it('produces a drift alert when recent 3-month avg exceeds preceding by > DRIFT_THRESHOLD with 6+ months', async () => {
    await fc.assert(
      fc.asyncProperty(arbCategory, arbDriftingAmounts, async (category, amounts) => {
        const allAmounts = [...amounts.preceding, ...amounts.recent];
        const expenses = generateMonthlyExpenses(category, allAmounts, 2024, 1);

        const result = await anomalyDetectionService._detectBehavioralDrift(expenses);

        // Should produce exactly one drift alert for this category
        const categoryAlerts = result.filter(a => a.category === category);
        expect(categoryAlerts.length).toBe(1);

        const alert = categoryAlerts[0];
        expect(alert.classification).toBe(ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND);
        expect(alert.anomalyType).toBe('behavioral_drift');
        expect(alert._driftData).toBeDefined();
        expect(typeof alert._driftData.recentPeriodAvg).toBe('number');
        expect(typeof alert._driftData.precedingPeriodAvg).toBe('number');
        expect(alert._driftData.recentPeriodAvg).toBeGreaterThan(
          alert._driftData.precedingPeriodAvg * (1 + DRIFT_THRESHOLD)
        );
      })
    );
  });

  it('does NOT produce a drift alert when recent avg is NOT > preceding avg * (1 + DRIFT_THRESHOLD)', async () => {
    await fc.assert(
      fc.asyncProperty(arbCategory, arbNonDriftingAmounts, async (category, amounts) => {
        const allAmounts = [...amounts.preceding, ...amounts.recent];
        const expenses = generateMonthlyExpenses(category, allAmounts, 2024, 1);

        const result = await anomalyDetectionService._detectBehavioralDrift(expenses);

        const categoryAlerts = result.filter(a => a.category === category);
        expect(categoryAlerts.length).toBe(0);
      })
    );
  });

  it('does NOT produce drift alerts when fewer than 6 months of data exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCategory,
        fc.integer({ min: 1, max: 5 }),
        arbPositiveAmount,
        async (category, numMonths, amount) => {
          const amounts = Array(numMonths).fill(amount);
          const expenses = generateMonthlyExpenses(category, amounts, 2024, 1);

          const result = await anomalyDetectionService._detectBehavioralDrift(expenses);

          expect(result.length).toBe(0);
        }
      )
    );
  });

  it('produces at most one drift alert per category per detection run', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCategory,
        fc.integer({ min: 6, max: 18 }),
        async (category, numMonths) => {
          // Generate expenses with increasing amounts to maximize drift chance
          const amounts = [];
          for (let i = 0; i < numMonths; i++) {
            amounts.push(100 + i * 50);
          }
          const expenses = generateMonthlyExpenses(category, amounts, 2024, 1);

          const result = await anomalyDetectionService._detectBehavioralDrift(expenses);

          const categoryAlerts = result.filter(a => a.category === category);
          expect(categoryAlerts.length).toBeLessThanOrEqual(1);
        }
      )
    );
  });

  it('each drift alert has classification = Emerging_Behavior_Trend and valid _driftData', async () => {
    await fc.assert(
      fc.asyncProperty(arbCategory, arbDriftingAmounts, async (category, amounts) => {
        const allAmounts = [...amounts.preceding, ...amounts.recent];
        const expenses = generateMonthlyExpenses(category, allAmounts, 2024, 1);

        const result = await anomalyDetectionService._detectBehavioralDrift(expenses);

        for (const alert of result) {
          expect(alert.classification).toBe(ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND);
          expect(alert._driftData).toBeDefined();
          expect(typeof alert._driftData.recentPeriodAvg).toBe('number');
          expect(typeof alert._driftData.precedingPeriodAvg).toBe('number');
          expect(typeof alert._driftData.percentageIncrease).toBe('number');
          expect(alert._driftData.recentPeriod).toBeDefined();
          expect(alert._driftData.precedingPeriod).toBeDefined();
          expect(alert.expenseId).toBeNull();
          expect(alert.dismissed).toBe(false);
        }
      })
    );
  });

  it('handles multiple categories independently', async () => {
    await fc.assert(
      fc.asyncProperty(arbDriftingAmounts, arbNonDriftingAmounts, async (drifting, nonDrifting) => {
        const cat1 = 'Groceries';
        const cat2 = 'Gas';
        const driftExpenses = generateMonthlyExpenses(cat1, [...drifting.preceding, ...drifting.recent], 2024, 1);
        const noDriftExpenses = generateMonthlyExpenses(cat2, [...nonDrifting.preceding, ...nonDrifting.recent], 2024, 1);
        const allExpenses = [...driftExpenses, ...noDriftExpenses];

        const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);

        const cat1Alerts = result.filter(a => a.category === cat1);
        const cat2Alerts = result.filter(a => a.category === cat2);
        expect(cat1Alerts.length).toBe(1);
        expect(cat2Alerts.length).toBe(0);
      })
    );
  });
});


// ─── Property 17: Budget suggestions on drift alerts ───
// **Validates: Requirements 8.6, 8.7, 16.5, 16.6**

describe('Property 17: Budget suggestions on drift alerts', () => {
  it('attaches create_budget with suggestedLimit rounded up to nearest $50 when no budget exists', () => {
    fc.assert(
      fc.property(
        arbCategory,
        fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 1),
        (category, recentAvg) => {
          const anomalies = [makeDriftAnomaly({ category, recentPeriodAvg: recentAvg })];

          const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

          expect(result).toHaveLength(1);
          expect(result[0].budgetSuggestion).toBeDefined();
          expect(result[0].budgetSuggestion.type).toBe('create_budget');
          expect(result[0].budgetSuggestion.currentLimit).toBeNull();

          // suggestedLimit = Math.ceil(recentAvg / 50) * 50
          const expected = Math.ceil(recentAvg / 50) * 50;
          expect(result[0].budgetSuggestion.suggestedLimit).toBe(expected);

          // Must be a multiple of 50
          expect(result[0].budgetSuggestion.suggestedLimit % 50).toBe(0);
        }
      )
    );
  });

  it('attaches create_budget when budgetData exists but category has no budget entry', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 1),
        (recentAvg) => {
          const anomalies = [makeDriftAnomaly({ category: 'Dining Out', recentPeriodAvg: recentAvg })];
          const budgetData = {
            byCategory: {
              Groceries: { limit: 400, spent: 200, progress: 50, severity: null, criticalMonthsInLast3: 0 }
            }
          };

          const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, budgetData);

          expect(result[0].budgetSuggestion).toBeDefined();
          expect(result[0].budgetSuggestion.type).toBe('create_budget');
          expect(result[0].budgetSuggestion.currentLimit).toBeNull();
        }
      )
    );
  });

  it('attaches adjust_budget when budget is Critical for 2+ of last 3 months', () => {
    fc.assert(
      fc.property(
        arbCategory,
        fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 100),
        fc.integer({ min: 50, max: 2000 }),
        fc.integer({ min: 2, max: 3 }),
        (category, recentAvg, currentLimit, criticalMonths) => {
          const anomalies = [makeDriftAnomaly({ category, recentPeriodAvg: recentAvg })];
          const budgetData = {
            byCategory: {
              [category]: {
                limit: currentLimit,
                spent: currentLimit + 100,
                progress: 110,
                severity: 'critical',
                criticalMonthsInLast3: criticalMonths
              }
            }
          };

          const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, budgetData);

          expect(result[0].budgetSuggestion).toBeDefined();
          expect(result[0].budgetSuggestion.type).toBe('adjust_budget');
          expect(result[0].budgetSuggestion.currentLimit).toBe(currentLimit);

          const expected = Math.ceil(recentAvg / 50) * 50;
          expect(result[0].budgetSuggestion.suggestedLimit).toBe(expected);
          expect(result[0].budgetSuggestion.suggestedLimit % 50).toBe(0);
        }
      )
    );
  });

  it('does NOT attach suggestion when budget exists but Critical for < 2 months', () => {
    fc.assert(
      fc.property(
        arbCategory,
        fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 100),
        fc.integer({ min: 50, max: 2000 }),
        fc.integer({ min: 0, max: 1 }),
        (category, recentAvg, currentLimit, criticalMonths) => {
          const anomalies = [makeDriftAnomaly({ category, recentPeriodAvg: recentAvg })];
          const budgetData = {
            byCategory: {
              [category]: {
                limit: currentLimit,
                spent: currentLimit * 0.8,
                progress: 80,
                severity: 'warning',
                criticalMonthsInLast3: criticalMonths
              }
            }
          };

          const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, budgetData);

          expect(result[0].budgetSuggestion).toBeUndefined();
        }
      )
    );
  });

  it('non-drift anomalies do NOT get budget suggestions', () => {
    const nonDriftClassifications = [
      ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
      ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE,
      ANOMALY_CLASSIFICATIONS.NEW_MERCHANT,
      ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE,
      ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE,
      ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...nonDriftClassifications),
        arbCategory,
        (classification, category) => {
          const anomalies = [makeNonDriftAnomaly({ classification, category })];

          const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

          expect(result[0].budgetSuggestion).toBeUndefined();
        }
      )
    );
  });

  it('when budgetData is null, no adjust_budget suggestions are attached (only create_budget for drift)', () => {
    fc.assert(
      fc.property(
        arbCategory,
        fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 1),
        (category, recentAvg) => {
          const anomalies = [makeDriftAnomaly({ category, recentPeriodAvg: recentAvg })];

          const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

          // With null budgetData, drift alerts get create_budget (no budget exists)
          expect(result[0].budgetSuggestion).toBeDefined();
          expect(result[0].budgetSuggestion.type).toBe('create_budget');
        }
      )
    );
  });

  it('suggestedLimit is always >= recentPeriodAvg (rounded up)', () => {
    fc.assert(
      fc.property(
        arbCategory,
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).filter(n => isFinite(n) && n > 0),
        (category, recentAvg) => {
          const anomalies = [makeDriftAnomaly({ category, recentPeriodAvg: recentAvg })];

          const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

          if (result[0].budgetSuggestion) {
            expect(result[0].budgetSuggestion.suggestedLimit).toBeGreaterThanOrEqual(recentAvg);
          }
        }
      )
    );
  });
});

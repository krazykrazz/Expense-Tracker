/**
 * Unit tests for AnomalyDetectionService._attachBudgetSuggestions
 *
 * Tests budget suggestion attachment on behavioral drift alerts:
 * - create_budget when category has no budget
 * - adjust_budget when category has Critical budget for 2+ of last 3 months
 * - Rounding up to nearest $50
 * - Non-drift anomalies are not modified
 *
 * Requirements: 8.6, 8.7, 16.5, 16.6
 */

const anomalyDetectionService = require('./anomalyDetectionService');
const {
  ANOMALY_CLASSIFICATIONS,
  SEVERITY_LEVELS
} = require('../utils/analyticsConstants');

// Helper to create a drift anomaly with _driftData
function makeDriftAnomaly(overrides = {}) {
  const recentPeriodAvg = overrides.recentPeriodAvg != null ? overrides.recentPeriodAvg : 200;
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: null,
    date: overrides.date || '2025-06-01',
    place: overrides.category || 'Dining',
    amount: recentPeriodAvg,
    category: overrides.category || 'Dining',
    anomalyType: 'behavioral_drift',
    classification: ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND,
    severity: overrides.severity || SEVERITY_LEVELS.LOW,
    dismissed: false,
    categoryAverage: overrides.precedingPeriodAvg || 100,
    standardDeviations: 0,
    _driftData: {
      recentPeriodAvg: recentPeriodAvg,
      precedingPeriodAvg: overrides.precedingPeriodAvg || 100,
      percentageIncrease: overrides.percentageIncrease || 100,
      recentPeriod: { start: '2025-04', end: '2025-06' },
      precedingPeriod: { start: '2025-01', end: '2025-03' }
    },
    ...overrides
  };
}

// Helper to create a non-drift anomaly
function makeNonDriftAnomaly(overrides = {}) {
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: overrides.expenseId || 123,
    date: overrides.date || '2025-06-15',
    place: overrides.place || 'TestMerchant',
    amount: overrides.amount || 500,
    category: overrides.category || 'Dining',
    anomalyType: overrides.anomalyType || 'amount',
    classification: overrides.classification || ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
    severity: overrides.severity || SEVERITY_LEVELS.MEDIUM,
    dismissed: false,
    categoryAverage: 100,
    standardDeviations: 4,
    ...overrides
  };
}

// Helper to create budget data
function makeBudgetData(categories = {}) {
  const byCategory = {};
  for (const [cat, opts] of Object.entries(categories)) {
    byCategory[cat] = {
      limit: opts.limit || 500,
      spent: opts.spent || 0,
      progress: opts.progress != null ? opts.progress : 0,
      severity: opts.severity || null,
      criticalMonthsInLast3: opts.criticalMonthsInLast3 != null ? opts.criticalMonthsInLast3 : 0
    };
  }
  return { byCategory };
}

describe('AnomalyDetectionService._attachBudgetSuggestions', () => {
  describe('create_budget suggestion (Req 8.6, 16.5)', () => {
    test('should attach create_budget when drift category has no budget (budgetData null)', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 180 })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result).toHaveLength(1);
      expect(result[0].budgetSuggestion).toEqual({
        type: 'create_budget',
        suggestedLimit: 200, // 180 rounded up to nearest $50
        currentLimit: null
      });
    });

    test('should attach create_budget when drift category not in budgetData.byCategory', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 220 })];
      const budgetData = makeBudgetData({
        Groceries: { limit: 400, progress: 50 }
      });

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, budgetData);

      expect(result[0].budgetSuggestion).toEqual({
        type: 'create_budget',
        suggestedLimit: 250, // 220 rounded up to nearest $50
        currentLimit: null
      });
    });

    test('should attach create_budget when budgetData has no byCategory', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 310 })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, {});

      expect(result[0].budgetSuggestion).toEqual({
        type: 'create_budget',
        suggestedLimit: 350, // 310 rounded up to nearest $50
        currentLimit: null
      });
    });
  });

  describe('adjust_budget suggestion (Req 8.7, 16.6)', () => {
    test('should attach adjust_budget when Critical for 2 of last 3 months', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 480 })];
      const budgetData = makeBudgetData({
        Dining: { limit: 300, progress: 110, severity: 'critical', criticalMonthsInLast3: 2 }
      });

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, budgetData);

      expect(result[0].budgetSuggestion).toEqual({
        type: 'adjust_budget',
        suggestedLimit: 500, // 480 rounded up to nearest $50
        currentLimit: 300
      });
    });

    test('should attach adjust_budget when Critical for all 3 of last 3 months', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 550 })];
      const budgetData = makeBudgetData({
        Dining: { limit: 400, progress: 120, severity: 'critical', criticalMonthsInLast3: 3 }
      });

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, budgetData);

      expect(result[0].budgetSuggestion).toEqual({
        type: 'adjust_budget',
        suggestedLimit: 550, // 550 is already a multiple of $50
        currentLimit: 400
      });
    });
  });

  describe('no suggestion when budget exists but not Critical enough', () => {
    test('should NOT attach suggestion when Critical for only 1 of last 3 months', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 300 })];
      const budgetData = makeBudgetData({
        Dining: { limit: 250, progress: 95, severity: 'danger', criticalMonthsInLast3: 1 }
      });

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, budgetData);

      expect(result[0].budgetSuggestion).toBeUndefined();
    });

    test('should NOT attach suggestion when Critical for 0 of last 3 months', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 300 })];
      const budgetData = makeBudgetData({
        Dining: { limit: 500, progress: 60, severity: null, criticalMonthsInLast3: 0 }
      });

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, budgetData);

      expect(result[0].budgetSuggestion).toBeUndefined();
    });
  });

  describe('rounding to nearest $50', () => {
    test('should round $1 up to $50', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 1 })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result[0].budgetSuggestion.suggestedLimit).toBe(50);
    });

    test('should round $50 to $50 (exact multiple)', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 50 })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result[0].budgetSuggestion.suggestedLimit).toBe(50);
    });

    test('should round $51 up to $100', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 51 })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result[0].budgetSuggestion.suggestedLimit).toBe(100);
    });

    test('should round $99.99 up to $100', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 99.99 })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result[0].budgetSuggestion.suggestedLimit).toBe(100);
    });

    test('should round $250 to $250 (exact multiple)', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 250 })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result[0].budgetSuggestion.suggestedLimit).toBe(250);
    });

    test('should round $251 up to $300', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 251 })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result[0].budgetSuggestion.suggestedLimit).toBe(300);
    });

    test('should handle $0 recentPeriodAvg (suggestedLimit = 0)', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 0 })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result[0].budgetSuggestion.suggestedLimit).toBe(0);
    });
  });

  describe('non-drift anomalies are not modified', () => {
    test('should NOT attach budgetSuggestion to Large_Transaction anomalies', () => {
      const anomalies = [makeNonDriftAnomaly({
        classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION
      })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result[0].budgetSuggestion).toBeUndefined();
    });

    test('should NOT attach budgetSuggestion to Category_Spending_Spike anomalies', () => {
      const anomalies = [makeNonDriftAnomaly({
        classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE
      })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result[0].budgetSuggestion).toBeUndefined();
    });

    test('should NOT attach budgetSuggestion to Frequency_Spike anomalies', () => {
      const anomalies = [makeNonDriftAnomaly({
        classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE
      })];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result[0].budgetSuggestion).toBeUndefined();
    });
  });

  describe('mixed anomaly arrays', () => {
    test('should only attach suggestions to drift anomalies in a mixed set', () => {
      const anomalies = [
        makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 200 }),
        makeNonDriftAnomaly({ category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeDriftAnomaly({ category: 'Transport', recentPeriodAvg: 150 })
      ];

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(result[0].budgetSuggestion).toBeDefined();
      expect(result[0].budgetSuggestion.type).toBe('create_budget');
      expect(result[1].budgetSuggestion).toBeUndefined();
      expect(result[2].budgetSuggestion).toBeDefined();
      expect(result[2].budgetSuggestion.type).toBe('create_budget');
    });

    test('should handle different suggestion types per category', () => {
      const anomalies = [
        makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 200 }),
        makeDriftAnomaly({ category: 'Groceries', recentPeriodAvg: 600 })
      ];
      const budgetData = makeBudgetData({
        // Dining has no budget → create_budget
        Groceries: { limit: 400, progress: 120, severity: 'critical', criticalMonthsInLast3: 3 }
      });

      const result = anomalyDetectionService._attachBudgetSuggestions(anomalies, budgetData);

      expect(result[0].budgetSuggestion.type).toBe('create_budget');
      expect(result[0].budgetSuggestion.suggestedLimit).toBe(200);
      expect(result[1].budgetSuggestion.type).toBe('adjust_budget');
      expect(result[1].budgetSuggestion.currentLimit).toBe(400);
      expect(result[1].budgetSuggestion.suggestedLimit).toBe(600);
    });
  });

  describe('edge cases and error resilience', () => {
    test('should return empty array for null anomalies', () => {
      const result = anomalyDetectionService._attachBudgetSuggestions(null, null);
      expect(result).toEqual([]);
    });

    test('should return empty array for empty anomalies', () => {
      const result = anomalyDetectionService._attachBudgetSuggestions([], null);
      expect(result).toEqual([]);
    });

    test('should handle drift anomaly with missing _driftData gracefully', () => {
      const anomaly = makeDriftAnomaly({ category: 'Dining' });
      delete anomaly._driftData;

      const result = anomalyDetectionService._attachBudgetSuggestions([anomaly], null);

      expect(result).toHaveLength(1);
      expect(result[0].budgetSuggestion).toBeDefined();
      expect(result[0].budgetSuggestion.suggestedLimit).toBe(0); // recentPeriodAvg defaults to 0
    });

    test('should handle drift anomaly with _driftData but missing recentPeriodAvg', () => {
      const anomaly = makeDriftAnomaly({ category: 'Dining' });
      anomaly._driftData = { precedingPeriodAvg: 100 };

      const result = anomalyDetectionService._attachBudgetSuggestions([anomaly], null);

      expect(result[0].budgetSuggestion.suggestedLimit).toBe(0);
    });

    test('should mutate anomalies in-place', () => {
      const anomalies = [makeDriftAnomaly({ category: 'Dining', recentPeriodAvg: 200 })];
      const original = anomalies[0];

      anomalyDetectionService._attachBudgetSuggestions(anomalies, null);

      expect(original.budgetSuggestion).toBeDefined();
      expect(original.budgetSuggestion.type).toBe('create_budget');
    });

    test('should return anomalies unchanged if an internal error occurs', () => {
      // Force an error by passing a non-iterable anomalies value that passes the length check
      const fakeAnomalies = { length: 1, [Symbol.iterator]: () => { throw new Error('test'); } };

      // The try/catch should handle this gracefully
      const result = anomalyDetectionService._attachBudgetSuggestions(fakeAnomalies, null);
      expect(result).toBe(fakeAnomalies);
    });
  });
});

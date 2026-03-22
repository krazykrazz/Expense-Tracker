/**
 * Unit tests for _suppressBudgetCovered method in AnomalyDetectionService.
 * Tests budget-aware suppression of Category_Spending_Spike anomalies
 * when budget progress >= 90% (Danger/Critical severity).
 *
 * Requirements: 6.6, 16.1, 16.3
 */

const anomalyDetectionService = require('./anomalyDetectionService');
const {
  ANOMALY_CLASSIFICATIONS,
  SEVERITY_LEVELS
} = require('../utils/analyticsConstants');

// Helper to create a mock anomaly
function makeAnomaly(overrides = {}) {
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: overrides.expenseId != null ? overrides.expenseId : Math.floor(Math.random() * 10000),
    date: overrides.date || '2025-01-15',
    place: overrides.place || 'TestMerchant',
    amount: overrides.amount || 100,
    category: overrides.category || 'Dining',
    anomalyType: overrides.anomalyType || 'category_spending_spike',
    classification: overrides.classification || ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE,
    severity: overrides.severity || SEVERITY_LEVELS.MEDIUM,
    dismissed: false,
    categoryAverage: overrides.categoryAverage || 50,
    standardDeviations: 0,
    cluster: null,
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
      severity: opts.severity || null
    };
  }
  return { byCategory };
}

describe('AnomalyDetectionService._suppressBudgetCovered', () => {
  describe('Category_Spending_Spike suppression (Req 6.6, 16.1)', () => {
    test('should suppress Category_Spending_Spike when budget progress >= 90% (Danger)', () => {
      const anomalies = [makeAnomaly({ category: 'Dining' })];
      const budgetData = makeBudgetData({
        Dining: { progress: 92, severity: 'Danger' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(0);
    });

    test('should suppress Category_Spending_Spike when budget progress >= 100% (Critical)', () => {
      const anomalies = [makeAnomaly({ category: 'Dining' })];
      const budgetData = makeBudgetData({
        Dining: { progress: 105, severity: 'Critical' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(0);
    });

    test('should suppress Category_Spending_Spike at exactly 90% progress', () => {
      const anomalies = [makeAnomaly({ category: 'Dining' })];
      const budgetData = makeBudgetData({
        Dining: { progress: 90, severity: 'Danger' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(0);
    });

    test('should NOT suppress Category_Spending_Spike when budget progress < 90% (Warning)', () => {
      const anomalies = [makeAnomaly({ category: 'Dining' })];
      const budgetData = makeBudgetData({
        Dining: { progress: 85, severity: 'Warning' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(1);
    });

    test('should NOT suppress Category_Spending_Spike when no budget exists for category', () => {
      const anomalies = [makeAnomaly({ category: 'Dining' })];
      const budgetData = makeBudgetData({
        Groceries: { progress: 95, severity: 'Danger' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(1);
    });
  });

  describe('non-spike anomaly types NOT suppressed (Req 16.3)', () => {
    test('should NOT suppress Large_Transaction even when budget is Danger', () => {
      const anomalies = [makeAnomaly({
        category: 'Dining',
        classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
        anomalyType: 'amount'
      })];
      const budgetData = makeBudgetData({
        Dining: { progress: 95, severity: 'Danger' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(1);
    });

    test('should NOT suppress Frequency_Spike even when budget is Critical', () => {
      const anomalies = [makeAnomaly({
        category: 'Dining',
        classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE,
        anomalyType: 'frequency_spike'
      })];
      const budgetData = makeBudgetData({
        Dining: { progress: 110, severity: 'Critical' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(1);
    });

    test('should NOT suppress Recurring_Expense_Increase even when budget is Danger', () => {
      const anomalies = [makeAnomaly({
        category: 'Dining',
        classification: ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE,
        anomalyType: 'recurring_expense_increase'
      })];
      const budgetData = makeBudgetData({
        Dining: { progress: 92, severity: 'Danger' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(1);
    });

    test('should NOT suppress New_Merchant even when budget is Critical', () => {
      const anomalies = [makeAnomaly({
        category: 'Dining',
        classification: ANOMALY_CLASSIFICATIONS.NEW_MERCHANT,
        anomalyType: 'new_merchant'
      })];
      const budgetData = makeBudgetData({
        Dining: { progress: 100, severity: 'Critical' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(1);
    });

    test('should NOT suppress Seasonal_Deviation even when budget is Danger', () => {
      const anomalies = [makeAnomaly({
        category: 'Dining',
        classification: ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION,
        anomalyType: 'seasonal_deviation'
      })];
      const budgetData = makeBudgetData({
        Dining: { progress: 95, severity: 'Danger' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(1);
    });

    test('should NOT suppress Emerging_Behavior_Trend even when budget is Critical', () => {
      const anomalies = [makeAnomaly({
        category: 'Dining',
        classification: ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND,
        anomalyType: 'behavioral_drift'
      })];
      const budgetData = makeBudgetData({
        Dining: { progress: 120, severity: 'Critical' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(1);
    });
  });

  describe('mixed anomaly filtering', () => {
    test('should only suppress Category_Spending_Spike in a mixed set', () => {
      const anomalies = [
        makeAnomaly({ category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE }),
        makeAnomaly({ category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE })
      ];
      const budgetData = makeBudgetData({
        Dining: { progress: 95, severity: 'Danger' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(2);
      expect(result.every(a => a.classification !== ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE)).toBe(true);
    });

    test('should suppress spikes in multiple categories independently', () => {
      const anomalies = [
        makeAnomaly({ category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE }),
        makeAnomaly({ category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE }),
        makeAnomaly({ category: 'Transport', classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE })
      ];
      const budgetData = makeBudgetData({
        Dining: { progress: 95, severity: 'Danger' },
        Groceries: { progress: 50, severity: null },
        Transport: { progress: 100, severity: 'Critical' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Groceries');
    });
  });

  describe('null/missing budgetData handling', () => {
    test('should return anomalies unchanged when budgetData is null', () => {
      const anomalies = [makeAnomaly({ category: 'Dining' })];

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, null);
      expect(result).toHaveLength(1);
    });

    test('should return anomalies unchanged when budgetData is undefined', () => {
      const anomalies = [makeAnomaly({ category: 'Dining' })];

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, undefined);
      expect(result).toHaveLength(1);
    });

    test('should return anomalies unchanged when budgetData.byCategory is missing', () => {
      const anomalies = [makeAnomaly({ category: 'Dining' })];

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, {});
      expect(result).toHaveLength(1);
    });
  });

  describe('edge cases and error resilience', () => {
    test('should return empty array for null anomalies input', () => {
      const budgetData = makeBudgetData({ Dining: { progress: 95 } });
      const result = anomalyDetectionService._suppressBudgetCovered(null, budgetData);
      expect(result).toEqual([]);
    });

    test('should return empty array for empty anomalies input', () => {
      const budgetData = makeBudgetData({ Dining: { progress: 95 } });
      const result = anomalyDetectionService._suppressBudgetCovered([], budgetData);
      expect(result).toEqual([]);
    });

    test('should not mutate the original anomaly objects', () => {
      const anomaly = makeAnomaly({ category: 'Dining' });
      const original = { ...anomaly };
      const budgetData = makeBudgetData({
        Dining: { progress: 95, severity: 'Danger' }
      });

      anomalyDetectionService._suppressBudgetCovered([anomaly], budgetData);
      expect(anomaly.category).toBe(original.category);
      expect(anomaly.classification).toBe(original.classification);
    });

    test('should handle anomaly with undefined classification gracefully', () => {
      const anomalies = [makeAnomaly({ classification: undefined })];
      const budgetData = makeBudgetData({
        Dining: { progress: 95, severity: 'Danger' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(1);
    });

    test('should handle budget progress at boundary value 89.99 (not suppressed)', () => {
      const anomalies = [makeAnomaly({ category: 'Dining' })];
      const budgetData = makeBudgetData({
        Dining: { progress: 89.99, severity: 'Warning' }
      });

      const result = anomalyDetectionService._suppressBudgetCovered(anomalies, budgetData);
      expect(result).toHaveLength(1);
    });
  });
});

/**
 * Unit tests for _applyFrequencyControls method in AnomalyDetectionService.
 * Tests per-category cap, repeat alert suppression, and related alert merging.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

const anomalyDetectionService = require('./anomalyDetectionService');
const {
  ANOMALY_CLASSIFICATIONS,
  SEVERITY_LEVELS,
  THROTTLE_CONFIG
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
    anomalyType: overrides.anomalyType || 'amount',
    classification: overrides.classification || ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
    severity: overrides.severity || SEVERITY_LEVELS.LOW,
    dismissed: false,
    categoryAverage: overrides.categoryAverage || 50,
    standardDeviations: 3.5,
    cluster: overrides.cluster || null,
    ...overrides
  };
}

describe('AnomalyDetectionService._applyFrequencyControls', () => {
  describe('null/empty input handling', () => {
    test('should return empty array for null input', () => {
      const result = anomalyDetectionService._applyFrequencyControls(null);
      expect(result).toEqual([]);
    });

    test('should return empty array for empty input', () => {
      const result = anomalyDetectionService._applyFrequencyControls([]);
      expect(result).toEqual([]);
    });

    test('should return single anomaly unchanged', () => {
      const anomalies = [makeAnomaly()];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      expect(result).toHaveLength(1);
    });
  });

  describe('per-category cap (Req 10.1)', () => {
    test('should enforce MAX_ALERTS_PER_CATEGORY_PER_MONTH per category', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-01', category: 'Dining', severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-05', category: 'Dining', severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE }),
        makeAnomaly({ date: '2025-01-10', category: 'Dining', severity: SEVERITY_LEVELS.HIGH, classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE }),
        makeAnomaly({ date: '2025-01-15', category: 'Dining', severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      const diningAlerts = result.filter(a => a.category === 'Dining');
      expect(diningAlerts.length).toBeLessThanOrEqual(THROTTLE_CONFIG.MAX_ALERTS_PER_CATEGORY_PER_MONTH);
    });

    test('should keep higher severity alerts when capping', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-01', category: 'Dining', severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-05', category: 'Dining', severity: SEVERITY_LEVELS.HIGH, classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE }),
        makeAnomaly({ date: '2025-01-10', category: 'Dining', severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE }),
        makeAnomaly({ date: '2025-01-15', category: 'Dining', severity: SEVERITY_LEVELS.HIGH, classification: ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      const diningAlerts = result.filter(a => a.category === 'Dining');
      // Should keep the two HIGH and one MEDIUM, dropping the LOW
      const severities = diningAlerts.map(a => a.severity);
      expect(severities).not.toContain(SEVERITY_LEVELS.LOW);
    });

    test('should not cap when alerts are within limit', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-01', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-10', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE }),
        makeAnomaly({ date: '2025-01-20', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    test('should cap independently per category', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-01', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-05', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE }),
        makeAnomaly({ date: '2025-01-10', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE }),
        makeAnomaly({ date: '2025-01-15', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE }),
        makeAnomaly({ date: '2025-01-01', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-10', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      const diningAlerts = result.filter(a => a.category === 'Dining');
      const groceryAlerts = result.filter(a => a.category === 'Groceries');
      expect(diningAlerts.length).toBeLessThanOrEqual(THROTTLE_CONFIG.MAX_ALERTS_PER_CATEGORY_PER_MONTH);
      expect(groceryAlerts.length).toBeLessThanOrEqual(2);
    });

    test('should cap per calendar month independently', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-01', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-05', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE }),
        makeAnomaly({ date: '2025-01-10', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE }),
        makeAnomaly({ date: '2025-01-15', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE }),
        makeAnomaly({ date: '2025-02-01', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-02-10', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      const janAlerts = result.filter(a => a.category === 'Dining' && a.date.startsWith('2025-01'));
      const febAlerts = result.filter(a => a.category === 'Dining' && a.date.startsWith('2025-02'));
      expect(janAlerts.length).toBeLessThanOrEqual(THROTTLE_CONFIG.MAX_ALERTS_PER_CATEGORY_PER_MONTH);
      expect(febAlerts.length).toBeLessThanOrEqual(2);
    });
  });

  describe('repeat alert suppression (Req 10.2)', () => {
    test('should suppress repeat alerts (same category + classification) within 30-day window', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-05', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-20', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      const diningLarge = result.filter(a => a.category === 'Dining' && a.classification === ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION);
      expect(diningLarge).toHaveLength(1);
      // Should keep the most recent
      expect(diningLarge[0].date).toBe('2025-01-20');
    });

    test('should not suppress alerts with different classifications in same category', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-05', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-20', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      expect(result).toHaveLength(2);
    });

    test('should not suppress alerts outside the 30-day window', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-01', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-03-15', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      const diningLarge = result.filter(a => a.category === 'Dining' && a.classification === ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION);
      expect(diningLarge).toHaveLength(2);
    });

    test('should keep most recent when multiple repeats exist', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-01', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-10', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-20', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      const diningLarge = result.filter(a => a.category === 'Dining' && a.classification === ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION);
      expect(diningLarge).toHaveLength(1);
      expect(diningLarge[0].date).toBe('2025-01-20');
    });
  });

  describe('related alert merging (Req 10.3)', () => {
    test('should merge same-category alerts within 7-day window into consolidated alert', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-10', category: 'Dining', amount: 100, classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-12', category: 'Dining', amount: 200, classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      const diningAlerts = result.filter(a => a.category === 'Dining');
      expect(diningAlerts).toHaveLength(1);
      expect(diningAlerts[0].amount).toBe(300);
      expect(diningAlerts[0].mergedAlertCount).toBe(2);
    });

    test('should not merge alerts from different categories', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-10', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-12', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      expect(result).toHaveLength(2);
    });

    test('should not merge alerts outside 7-day window', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-01', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-20', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      // These have different classifications so repeat suppression won't apply,
      // and they're outside the 7-day merge window
      const diningAlerts = result.filter(a => a.category === 'Dining');
      expect(diningAlerts).toHaveLength(2);
    });

    test('should not merge cluster alerts into non-cluster alerts', () => {
      const clusterData = {
        label: 'Travel_Event',
        totalAmount: 500,
        transactionCount: 3,
        dateRange: { start: '2025-01-10', end: '2025-01-12' },
        transactions: []
      };
      const anomalies = [
        makeAnomaly({ date: '2025-01-10', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE, cluster: clusterData }),
        makeAnomaly({ date: '2025-01-11', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      // Cluster alert should pass through unchanged
      const clusterAlerts = result.filter(a => a.cluster != null);
      expect(clusterAlerts).toHaveLength(1);
      expect(clusterAlerts[0].cluster.label).toBe('Travel_Event');
      // Non-cluster alert should also be present
      const nonCluster = result.filter(a => a.cluster == null);
      expect(nonCluster).toHaveLength(1);
    });

    test('should set mergedDateRange on consolidated alert', () => {
      const anomalies = [
        makeAnomaly({ date: '2025-01-10', category: 'Dining', amount: 50, classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ date: '2025-01-13', category: 'Dining', amount: 75, classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      const diningAlerts = result.filter(a => a.category === 'Dining');
      expect(diningAlerts).toHaveLength(1);
      expect(diningAlerts[0].mergedDateRange).toEqual({
        start: '2025-01-10',
        end: '2025-01-13'
      });
    });
  });

  describe('pipeline ordering (Req 10.4)', () => {
    test('should apply repeat suppression before merge and cap', () => {
      // 4 alerts: 2 are repeats (same category+classification), 2 are different
      // After repeat suppression: 3 alerts remain
      // After merge: depends on dates
      // After cap: max 3
      const anomalies = [
        makeAnomaly({ date: '2025-01-05', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ date: '2025-01-15', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.MEDIUM }),
        makeAnomaly({ date: '2025-01-20', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE, severity: SEVERITY_LEVELS.HIGH }),
        makeAnomaly({ date: '2025-01-25', category: 'Dining', classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE, severity: SEVERITY_LEVELS.MEDIUM })
      ];
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      const diningAlerts = result.filter(a => a.category === 'Dining');
      expect(diningAlerts.length).toBeLessThanOrEqual(THROTTLE_CONFIG.MAX_ALERTS_PER_CATEGORY_PER_MONTH);
    });
  });

  describe('error resilience', () => {
    test('should return original anomalies if internal error occurs', () => {
      // Pass anomalies with invalid date to trigger potential errors
      const anomalies = [
        makeAnomaly({ date: 'invalid-date', category: 'Dining' })
      ];
      // Should not throw
      const result = anomalyDetectionService._applyFrequencyControls(anomalies);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

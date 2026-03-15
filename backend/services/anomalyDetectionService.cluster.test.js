/**
 * Unit tests for _aggregateClusters method in AnomalyDetectionService.
 * Tests cluster detection, label assignment, mutual exclusivity, and error resilience.
 */

const anomalyDetectionService = require('./anomalyDetectionService');
const { CLUSTER_LABELS, SEVERITY_LEVELS, ANOMALY_CLASSIFICATIONS, THROTTLE_CONFIG } = require('../utils/analyticsConstants');

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
    explanation: overrides.explanation || null,
    historicalContext: overrides.historicalContext || null,
    impactEstimate: overrides.impactEstimate || null,
    behaviorPattern: overrides.behaviorPattern || null,
    confidence: overrides.confidence || null,
    ...overrides
  };
}

describe('AnomalyDetectionService._aggregateClusters', () => {
  describe('basic clustering', () => {
    test('should return anomalies unchanged when fewer than MIN_CLUSTER_SIZE', () => {
      const anomalies = [
        makeAnomaly({ expenseId: 1, date: '2025-01-10' }),
        makeAnomaly({ expenseId: 2, date: '2025-01-11' })
      ];
      const result = anomalyDetectionService._aggregateClusters(anomalies);
      expect(result).toHaveLength(2);
      expect(result[0].cluster).toBeUndefined();
    });

    test('should return anomalies unchanged when null or empty', () => {
      expect(anomalyDetectionService._aggregateClusters(null)).toBeNull();
      expect(anomalyDetectionService._aggregateClusters([])).toEqual([]);
    });

    test('should cluster 3+ anomalies within 7-day window sharing category theme', () => {
      const anomalies = [
        makeAnomaly({ expenseId: 1, date: '2025-01-10', category: 'Dining', amount: 50 }),
        makeAnomaly({ expenseId: 2, date: '2025-01-12', category: 'Entertainment', amount: 75 }),
        makeAnomaly({ expenseId: 3, date: '2025-01-14', category: 'Gifts', amount: 100 })
      ];
      // These are all Holiday_Spending theme categories — but need December for holiday
      // Let's use December dates
      const decAnomalies = [
        makeAnomaly({ expenseId: 1, date: '2025-12-20', category: 'Gifts', amount: 50 }),
        makeAnomaly({ expenseId: 2, date: '2025-12-22', category: 'Dining', amount: 75 }),
        makeAnomaly({ expenseId: 3, date: '2025-12-24', category: 'Entertainment', amount: 100 })
      ];
      const result = anomalyDetectionService._aggregateClusters(decAnomalies);

      const clusterAlerts = result.filter(a => a.cluster != null);
      expect(clusterAlerts).toHaveLength(1);

      const cluster = clusterAlerts[0].cluster;
      expect(cluster.label).toBe(CLUSTER_LABELS.HOLIDAY_SPENDING);
      expect(cluster.transactionCount).toBe(3);
      expect(cluster.totalAmount).toBe(225);
      expect(cluster.dateRange.start).toBe('2025-12-20');
      expect(cluster.dateRange.end).toBe('2025-12-24');
      expect(cluster.transactions).toHaveLength(3);
    });

    test('should NOT cluster anomalies outside 7-day window', () => {
      const anomalies = [
        makeAnomaly({ expenseId: 1, date: '2025-12-01', category: 'Gifts', amount: 50 }),
        makeAnomaly({ expenseId: 2, date: '2025-12-05', category: 'Dining', amount: 75 }),
        makeAnomaly({ expenseId: 3, date: '2025-12-20', category: 'Entertainment', amount: 100 })
      ];
      const result = anomalyDetectionService._aggregateClusters(anomalies);
      const clusterAlerts = result.filter(a => a.cluster != null);
      expect(clusterAlerts).toHaveLength(0);
    });
  });

  describe('cluster labels', () => {
    test('should assign Travel_Event for transportation-related categories', () => {
      const anomalies = [
        makeAnomaly({ expenseId: 1, date: '2025-06-10', category: 'Transportation', amount: 200 }),
        makeAnomaly({ expenseId: 2, date: '2025-06-11', category: 'Hotels', amount: 300 }),
        makeAnomaly({ expenseId: 3, date: '2025-06-12', category: 'Gas', amount: 50 })
      ];
      const result = anomalyDetectionService._aggregateClusters(anomalies);
      const clusterAlerts = result.filter(a => a.cluster != null);
      expect(clusterAlerts).toHaveLength(1);
      expect(clusterAlerts[0].cluster.label).toBe(CLUSTER_LABELS.TRAVEL_EVENT);
    });

    test('should assign Moving_Event for home/furniture/utilities categories', () => {
      const anomalies = [
        makeAnomaly({ expenseId: 1, date: '2025-03-10', category: 'Furniture', amount: 500 }),
        makeAnomaly({ expenseId: 2, date: '2025-03-11', category: 'Home', amount: 200 }),
        makeAnomaly({ expenseId: 3, date: '2025-03-12', category: 'Utilities', amount: 150 })
      ];
      const result = anomalyDetectionService._aggregateClusters(anomalies);
      const clusterAlerts = result.filter(a => a.cluster != null);
      expect(clusterAlerts).toHaveLength(1);
      expect(clusterAlerts[0].cluster.label).toBe(CLUSTER_LABELS.MOVING_EVENT);
    });

    test('should assign Home_Renovation for improvement/appliance categories', () => {
      const anomalies = [
        makeAnomaly({ expenseId: 1, date: '2025-05-10', category: 'Home Improvement', amount: 800 }),
        makeAnomaly({ expenseId: 2, date: '2025-05-11', category: 'Appliances', amount: 600 }),
        makeAnomaly({ expenseId: 3, date: '2025-05-12', category: 'Hardware', amount: 100 })
      ];
      const result = anomalyDetectionService._aggregateClusters(anomalies);
      const clusterAlerts = result.filter(a => a.cluster != null);
      expect(clusterAlerts).toHaveLength(1);
      expect(clusterAlerts[0].cluster.label).toBe(CLUSTER_LABELS.HOME_RENOVATION);
    });
  });

  describe('mutual exclusivity (Req 7.5)', () => {
    test('clustered transactions should NOT appear as individual alerts', () => {
      const anomalies = [
        makeAnomaly({ expenseId: 1, date: '2025-06-10', category: 'Transportation', amount: 200 }),
        makeAnomaly({ expenseId: 2, date: '2025-06-11', category: 'Hotels', amount: 300 }),
        makeAnomaly({ expenseId: 3, date: '2025-06-12', category: 'Gas', amount: 50 }),
        makeAnomaly({ expenseId: 4, date: '2025-08-01', category: 'Dining', amount: 100 }) // not in cluster
      ];
      const result = anomalyDetectionService._aggregateClusters(anomalies);

      const clusterAlerts = result.filter(a => a.cluster != null);
      const individualAlerts = result.filter(a => a.cluster == null);

      // Cluster should contain expenseIds 1, 2, 3
      const clusteredIds = new Set();
      for (const ca of clusterAlerts) {
        for (const t of ca.cluster.transactions) {
          clusteredIds.add(t.expenseId);
        }
      }

      // Individual alerts should not contain any clustered expenseIds
      for (const ia of individualAlerts) {
        if (ia.expenseId != null) {
          expect(clusteredIds.has(ia.expenseId)).toBe(false);
        }
      }

      // ExpenseId 4 should still be individual
      expect(individualAlerts.some(a => a.expenseId === 4)).toBe(true);
    });
  });

  describe('cluster alert structure', () => {
    test('cluster alert should have correct totalAmount, transactionCount, dateRange, transactions', () => {
      const anomalies = [
        makeAnomaly({ expenseId: 10, date: '2025-06-10', category: 'Transportation', place: 'Airline', amount: 500 }),
        makeAnomaly({ expenseId: 11, date: '2025-06-12', category: 'Hotels', place: 'Hilton', amount: 300 }),
        makeAnomaly({ expenseId: 12, date: '2025-06-14', category: 'Gas', place: 'Shell', amount: 60 })
      ];
      const result = anomalyDetectionService._aggregateClusters(anomalies);
      const clusterAlerts = result.filter(a => a.cluster != null);
      expect(clusterAlerts).toHaveLength(1);

      const cluster = clusterAlerts[0].cluster;
      expect(cluster.totalAmount).toBe(860);
      expect(cluster.transactionCount).toBe(3);
      expect(cluster.dateRange.start).toBe('2025-06-10');
      expect(cluster.dateRange.end).toBe('2025-06-14');
      expect(cluster.transactions).toEqual(expect.arrayContaining([
        expect.objectContaining({ expenseId: 10, place: 'Airline', amount: 500, date: '2025-06-10' }),
        expect.objectContaining({ expenseId: 11, place: 'Hilton', amount: 300, date: '2025-06-12' }),
        expect.objectContaining({ expenseId: 12, place: 'Shell', amount: 60, date: '2025-06-14' })
      ]));

      // Cluster alert itself should have expenseId null
      expect(clusterAlerts[0].expenseId).toBeNull();
    });

    test('cluster alert should use highest severity from constituent anomalies', () => {
      const anomalies = [
        makeAnomaly({ expenseId: 1, date: '2025-06-10', category: 'Transportation', severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ expenseId: 2, date: '2025-06-11', category: 'Hotels', severity: SEVERITY_LEVELS.HIGH }),
        makeAnomaly({ expenseId: 3, date: '2025-06-12', category: 'Gas', severity: SEVERITY_LEVELS.MEDIUM })
      ];
      const result = anomalyDetectionService._aggregateClusters(anomalies);
      const clusterAlerts = result.filter(a => a.cluster != null);
      expect(clusterAlerts[0].severity).toBe(SEVERITY_LEVELS.HIGH);
    });
  });

  describe('non-transaction anomalies', () => {
    test('should preserve category-level anomalies (expenseId null) as-is', () => {
      const anomalies = [
        makeAnomaly({ expenseId: null, date: '2025-06-10', category: 'Dining', anomalyType: 'category_spending_spike' }),
        makeAnomaly({ expenseId: null, date: '2025-06-11', category: 'Dining', anomalyType: 'behavioral_drift' }),
        makeAnomaly({ expenseId: 1, date: '2025-06-10', category: 'Dining', amount: 100 })
      ];
      const result = anomalyDetectionService._aggregateClusters(anomalies);
      // Category-level anomalies should pass through unchanged
      const nullExpenseAlerts = result.filter(a => a.expenseId === null && !a.cluster);
      expect(nullExpenseAlerts).toHaveLength(2);
    });
  });

  describe('error resilience', () => {
    test('should return anomalies unchanged if internal error occurs', () => {
      // Pass anomalies with bad date to trigger potential error
      const anomalies = [
        makeAnomaly({ expenseId: 1, date: 'invalid-date', category: 'Transportation' }),
        makeAnomaly({ expenseId: 2, date: 'invalid-date', category: 'Hotels' }),
        makeAnomaly({ expenseId: 3, date: 'invalid-date', category: 'Gas' })
      ];
      // Should not throw, should return anomalies
      const result = anomalyDetectionService._aggregateClusters(anomalies);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

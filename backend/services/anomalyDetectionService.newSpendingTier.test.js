/**
 * Unit tests for New Spending Tier detector (_detectNewSpendingTier).
 * Tests detection threshold, severity assignment, and independence from Large_Transaction.
 *
 * Requirements: 10.4
 */

const service = require('./anomalyDetectionService');
const {
  DETECTION_THRESHOLDS,
  ANOMALY_CLASSIFICATIONS,
  SEVERITY_LEVELS
} = require('../utils/analyticsConstants');

// Helper: create expenses for a vendor
function makeExpenses(place, amounts, opts = {}) {
  return amounts.map((amount, i) => {
    const d = new Date(opts.startDate || '2024-01-15');
    d.setDate(d.getDate() + i * (opts.intervalDays || 30));
    return {
      id: opts.idStart ? opts.idStart + i : i + 1,
      place,
      amount,
      type: opts.type || 'Dining',
      date: d.toISOString().split('T')[0]
    };
  });
}

describe('AnomalyDetectionService._detectNewSpendingTier', () => {
  describe('detection when amount > 3× vendor max', () => {
    test('should detect when amount exceeds 3× historical max', () => {
      const history = makeExpenses('Cafe', [10, 20, 30]); // max = 30
      const recentExpense = {
        id: 999, place: 'Cafe', amount: 100, // 100 > 3*30=90
        type: 'Dining', date: '2025-01-15'
      };

      const anomalies = service._detectNewSpendingTier([recentExpense], [...history, recentExpense]);

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].expenseId).toBe(999);
      expect(anomalies[0].classification).toBe(ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER);
      expect(anomalies[0].anomalyType).toBe('new_spending_tier');
    });

    test('should detect at just above 3× threshold (3.01×)', () => {
      const history = makeExpenses('Shop', [50, 100]); // max = 100
      const recentExpense = {
        id: 999, place: 'Shop', amount: 301, // 301 > 3*100=300
        type: 'Shopping', date: '2025-01-15'
      };

      const anomalies = service._detectNewSpendingTier([recentExpense], [...history, recentExpense]);
      expect(anomalies).toHaveLength(1);
    });
  });

  describe('no detection when amount ≤ 3× vendor max', () => {
    test('should NOT detect when amount equals exactly 3× max', () => {
      const history = makeExpenses('Cafe', [10, 20, 30]); // max = 30
      const recentExpense = {
        id: 999, place: 'Cafe', amount: 90, // 90 = 3*30, not > 3*30
        type: 'Dining', date: '2025-01-15'
      };

      const anomalies = service._detectNewSpendingTier([recentExpense], [...history, recentExpense]);
      expect(anomalies).toHaveLength(0);
    });

    test('should NOT detect when amount is below 3× max', () => {
      const history = makeExpenses('Cafe', [10, 20, 30]); // max = 30
      const recentExpense = {
        id: 999, place: 'Cafe', amount: 80, // 80 < 90
        type: 'Dining', date: '2025-01-15'
      };

      const anomalies = service._detectNewSpendingTier([recentExpense], [...history, recentExpense]);
      expect(anomalies).toHaveLength(0);
    });
  });

  describe('no detection with < 2 historical transactions', () => {
    test('should NOT detect with only 1 historical transaction', () => {
      const history = makeExpenses('NewPlace', [10]);
      const recentExpense = {
        id: 999, place: 'NewPlace', amount: 500,
        type: 'Dining', date: '2025-01-15'
      };

      const anomalies = service._detectNewSpendingTier([recentExpense], [...history, recentExpense]);
      expect(anomalies).toHaveLength(0);
    });

    test('should NOT detect with 0 historical transactions (only current)', () => {
      const recentExpense = {
        id: 999, place: 'BrandNew', amount: 500,
        type: 'Dining', date: '2025-01-15'
      };

      const anomalies = service._detectNewSpendingTier([recentExpense], [recentExpense]);
      expect(anomalies).toHaveLength(0);
    });
  });

  describe('severity assignment at ratio boundaries', () => {
    test('should assign LOW severity when ratio ≤ 5', () => {
      const history = makeExpenses('Sev', [10, 20]); // max = 20
      const recentExpense = {
        id: 999, place: 'Sev', amount: 100, // ratio = 5.0, not > 5
        type: 'Dining', date: '2025-01-15'
      };

      const anomalies = service._detectNewSpendingTier([recentExpense], [...history, recentExpense]);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].severity).toBe(SEVERITY_LEVELS.LOW);
    });

    test('should assign MEDIUM severity when ratio > 5 and ≤ 10', () => {
      const history = makeExpenses('Sev', [10, 20]); // max = 20
      const recentExpense = {
        id: 999, place: 'Sev', amount: 150, // ratio = 7.5
        type: 'Dining', date: '2025-01-15'
      };

      const anomalies = service._detectNewSpendingTier([recentExpense], [...history, recentExpense]);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].severity).toBe(SEVERITY_LEVELS.MEDIUM);
    });

    test('should assign MEDIUM severity at ratio exactly 10 (not > 10)', () => {
      const history = makeExpenses('Sev', [10, 20]); // max = 20
      const recentExpense = {
        id: 999, place: 'Sev', amount: 200, // ratio = 10.0, not > 10
        type: 'Dining', date: '2025-01-15'
      };

      const anomalies = service._detectNewSpendingTier([recentExpense], [...history, recentExpense]);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].severity).toBe(SEVERITY_LEVELS.MEDIUM);
    });

    test('should assign HIGH severity when ratio > 10', () => {
      const history = makeExpenses('Sev', [10, 20]); // max = 20
      const recentExpense = {
        id: 999, place: 'Sev', amount: 210, // ratio = 10.5
        type: 'Dining', date: '2025-01-15'
      };

      const anomalies = service._detectNewSpendingTier([recentExpense], [...history, recentExpense]);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].severity).toBe(SEVERITY_LEVELS.HIGH);
    });
  });

  describe('independence from Large_Transaction detection (both can fire)', () => {
    test('should produce New_Spending_Tier independently — does not prevent Large_Transaction', () => {
      // Build enough history for vendor-percentile path (≥10 transactions)
      const amounts = [10, 12, 11, 13, 14, 15, 10, 12, 11, 13]; // max = 15
      const history = makeExpenses('DualStore', amounts);

      // Amount that triggers both: > 3× max (45) AND > p95
      const recentExpense = {
        id: 999, place: 'DualStore', amount: 200,
        type: 'Dining', date: '2025-01-15'
      };

      const allExpenses = [...history, recentExpense];

      // New Spending Tier fires independently
      const tierAnomalies = service._detectNewSpendingTier([recentExpense], allExpenses);
      expect(tierAnomalies).toHaveLength(1);
      expect(tierAnomalies[0].classification).toBe(ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER);

      // Verify the anomaly object has the right fields
      expect(tierAnomalies[0].anomalyType).toBe('new_spending_tier');
      expect(tierAnomalies[0].expenseId).toBe(999);
    });
  });
});

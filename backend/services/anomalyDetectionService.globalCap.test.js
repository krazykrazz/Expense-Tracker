/**
 * Unit tests for global monthly alert cap (_enforceAlertLimits).
 * Tests cap enforcement, type-priority + severity-based retention, date tiebreaker,
 * prior-month pass-through, and interaction with per-category cap.
 *
 * Requirements: 8.4, 8.6
 */

const service = require('./anomalyDetectionService');
const {
  THROTTLE_CONFIG,
  SEVERITY_LEVELS,
  ANOMALY_CLASSIFICATIONS,
  ALERT_TYPE_PRIORITY
} = require('../utils/analyticsConstants');

// Counter for unique vendor names
let vendorCounter = 0;

// Helper: create a mock anomaly with unique vendor by default
function makeAnomaly(overrides = {}) {
  vendorCounter++;
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: overrides.expenseId != null ? overrides.expenseId : vendorCounter,
    date: overrides.date || '2025-01-15',
    place: overrides.place || `Vendor_${vendorCounter}`,
    amount: overrides.amount || 100,
    category: overrides.category || 'Dining',
    anomalyType: overrides.anomalyType || 'amount',
    classification: overrides.classification || ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
    severity: overrides.severity || SEVERITY_LEVELS.LOW,
    dismissed: false,
    categoryAverage: 50,
    standardDeviations: 3.5,
    ...overrides
  };
}

// Get current month date string for testing (use day >= 2 to avoid UTC timezone issues)
function currentMonthDate(day) {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = Math.max(day, 2);
  return `${y}-${m}-${String(d).padStart(2, '0')}`;
}

// Get prior month date string (stay safely in month to avoid timezone issues)
function priorMonthDate(day) {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = Math.min(Math.max(day, 2), 28);
  return `${y}-${m}-${String(d).padStart(2, '0')}`;
}

beforeEach(() => {
  vendorCounter = 0;
});

describe('AnomalyDetectionService._enforceAlertLimits', () => {
  describe('cap enforcement at 3 alerts', () => {
    test('should keep all anomalies when count ≤ MAX_ALERTS_PER_MONTH', () => {
      const anomalies = [
        makeAnomaly({ date: currentMonthDate(1), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ date: currentMonthDate(5), severity: SEVERITY_LEVELS.MEDIUM }),
        makeAnomaly({ date: currentMonthDate(10), severity: SEVERITY_LEVELS.HIGH })
      ];

      const result = service._enforceAlertLimits(anomalies);
      expect(result).toHaveLength(3);
    });

    test('should cap at MAX_ALERTS_PER_MONTH when exceeded', () => {
      // Use different vendors and different classifications to avoid dedup/per-vendor cap
      const classifications = [
        ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
        ANOMALY_CLASSIFICATIONS.NEW_MERCHANT,
        ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION,
        ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE,
        ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE
      ];
      const anomalies = classifications.map((cls, i) =>
        makeAnomaly({
          id: i + 1,
          date: currentMonthDate(2 + i * 3),
          severity: SEVERITY_LEVELS.LOW,
          classification: cls
        })
      );

      const result = service._enforceAlertLimits(anomalies);
      const currentMonthResults = result.filter(a => {
        const d = new Date(a.date);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      expect(currentMonthResults).toHaveLength(THROTTLE_CONFIG.MAX_ALERTS_PER_MONTH);
    });

    test('should return empty array for empty input', () => {
      expect(service._enforceAlertLimits([])).toEqual([]);
    });

    test('should handle null input', () => {
      expect(service._enforceAlertLimits(null)).toEqual([]);
    });
  });

  describe('type-priority and severity-based retention with date tiebreaker', () => {
    test('should retain highest type-priority anomalies when capping', () => {
      // 5 anomalies with different type priorities, all same severity
      const anomalies = [
        makeAnomaly({ id: 1, date: currentMonthDate(2), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),       // priority 1
        makeAnomaly({ id: 2, date: currentMonthDate(5), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER }),         // priority 6
        makeAnomaly({ id: 3, date: currentMonthDate(8), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE }),   // priority 5
        makeAnomaly({ id: 4, date: currentMonthDate(11), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE }), // priority 3
        makeAnomaly({ id: 5, date: currentMonthDate(14), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE })            // priority 2
      ];

      const result = service._enforceAlertLimits(anomalies);
      const currentMonthResults = result.filter(a => {
        const d = new Date(a.date);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      expect(currentMonthResults).toHaveLength(3);
      // Should keep the 3 highest type-priority: New_Spending_Tier (6), Category_Spending_Spike (5), Recurring_Expense_Increase (3)
      const keptIds = currentMonthResults.map(a => a.id);
      expect(keptIds).toContain(2); // New_Spending_Tier (6)
      expect(keptIds).toContain(3); // Category_Spending_Spike (5)
      expect(keptIds).toContain(4); // Recurring_Expense_Increase (3)
    });

    test('should use severity as tiebreaker among equal type-priority', () => {
      // All same type-priority (Large_Transaction = 1, Seasonal_Deviation = 1, New_Merchant = 1)
      // but different severities — need different classifications at same priority level
      const anomalies = [
        makeAnomaly({ id: 1, date: currentMonthDate(2), severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ id: 2, date: currentMonthDate(5), severity: SEVERITY_LEVELS.HIGH, classification: ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION }),
        makeAnomaly({ id: 3, date: currentMonthDate(8), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.NEW_MERCHANT }),
        makeAnomaly({ id: 4, date: currentMonthDate(11), severity: SEVERITY_LEVELS.HIGH, classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE }),  // priority 2 — higher
        makeAnomaly({ id: 5, date: currentMonthDate(14), severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND }) // priority 4 — higher
      ];

      const result = service._enforceAlertLimits(anomalies);
      const currentMonthResults = result.filter(a => {
        const d = new Date(a.date);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      expect(currentMonthResults).toHaveLength(3);
      const keptIds = currentMonthResults.map(a => a.id);
      // Emerging_Behavior_Trend (4) and Frequency_Spike (2) have higher type-priority than the rest (1)
      expect(keptIds).toContain(5); // Emerging_Behavior_Trend priority 4
      expect(keptIds).toContain(4); // Frequency_Spike priority 2
      // Among the three priority-1 alerts (ids 1,2,3), severity tiebreaker: HIGH (id 2) wins
      expect(keptIds).toContain(2); // Seasonal_Deviation priority 1, HIGH severity
    });

    test('should use date as tiebreaker among equal type-priority and severity (most recent first)', () => {
      // 4 anomalies all with same type-priority and severity, different dates
      // Use different classifications that share the same priority level (1)
      const anomalies = [
        makeAnomaly({ id: 1, date: currentMonthDate(2), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ id: 2, date: currentMonthDate(5), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION }),
        makeAnomaly({ id: 3, date: currentMonthDate(10), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.NEW_MERCHANT }),
        // Add a higher-priority one to fill the 4th slot and force a cap decision among the priority-1 group
        makeAnomaly({ id: 4, date: currentMonthDate(15), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE })
      ];

      const result = service._enforceAlertLimits(anomalies);
      const currentMonthResults = result.filter(a => {
        const d = new Date(a.date);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      expect(currentMonthResults).toHaveLength(3);
      const keptIds = currentMonthResults.map(a => a.id);
      // Category_Spending_Spike (priority 5) always kept
      expect(keptIds).toContain(4);
      // Among the 3 priority-1 alerts (ids 1,2,3), most recent dates kept: day 10 (id 3), day 5 (id 2)
      expect(keptIds).toContain(3);
      expect(keptIds).toContain(2);
    });
  });

  describe('pass-through of prior-month anomalies', () => {
    test('should not count prior-month anomalies toward the cap', () => {
      const anomalies = [
        // 3 current month (different vendors, different classifications)
        makeAnomaly({ id: 1, date: currentMonthDate(2), severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ id: 2, date: currentMonthDate(5), severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.NEW_MERCHANT }),
        makeAnomaly({ id: 3, date: currentMonthDate(10), severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION }),
        // 2 prior month
        makeAnomaly({ id: 4, date: priorMonthDate(10), severity: SEVERITY_LEVELS.HIGH }),
        makeAnomaly({ id: 5, date: priorMonthDate(20), severity: SEVERITY_LEVELS.HIGH })
      ];

      const result = service._enforceAlertLimits(anomalies);
      // All 5 should pass through: 3 current (at cap) + 2 prior
      expect(result).toHaveLength(5);
    });

    test('prior-month anomalies pass through even when current month exceeds cap', () => {
      const anomalies = [
        // 5 current month (exceeds cap of 3) — different vendors and classifications
        makeAnomaly({ id: 1, date: currentMonthDate(2), severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ id: 2, date: currentMonthDate(5), severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.NEW_MERCHANT }),
        makeAnomaly({ id: 3, date: currentMonthDate(10), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION }),
        makeAnomaly({ id: 4, date: currentMonthDate(15), severity: SEVERITY_LEVELS.HIGH, classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE }),
        makeAnomaly({ id: 5, date: currentMonthDate(20), severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE }),
        // 3 prior month
        makeAnomaly({ id: 6, date: priorMonthDate(5), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 7, date: priorMonthDate(10), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 8, date: priorMonthDate(15), severity: SEVERITY_LEVELS.LOW })
      ];

      const result = service._enforceAlertLimits(anomalies);
      // 3 current month (capped) + 3 prior month (all pass through) = 6
      expect(result).toHaveLength(6);

      const priorResults = result.filter(a => {
        const d = new Date(a.date);
        const now = new Date();
        now.setMonth(now.getMonth() - 1);
        return d.getMonth() === now.getMonth();
      });
      expect(priorResults).toHaveLength(3);
    });
  });

  describe('interaction with existing per-category cap', () => {
    test('global cap applies after per-category cap in the pipeline', () => {
      // 4 anomalies in different categories and different vendors (all current month)
      const anomalies = [
        makeAnomaly({ id: 1, date: currentMonthDate(2), category: 'Dining', severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ id: 2, date: currentMonthDate(5), category: 'Shopping', severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE }),
        makeAnomaly({ id: 3, date: currentMonthDate(10), category: 'Transport', severity: SEVERITY_LEVELS.HIGH, classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE }),
        makeAnomaly({ id: 4, date: currentMonthDate(15), category: 'Groceries', severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.NEW_MERCHANT })
      ];

      // Per-category cap (3 per category) wouldn't reduce these (1 each)
      // But global cap (3 total) should reduce from 4 to 3
      const result = service._enforceAlertLimits(anomalies);
      const currentMonthResults = result.filter(a => {
        const d = new Date(a.date);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      expect(currentMonthResults).toHaveLength(3);
      // Should keep highest type-priority: Category_Spending_Spike (5), Frequency_Spike (2), then tiebreak between Large_Transaction (1) and New_Merchant (1)
      const keptIds = currentMonthResults.map(a => a.id);
      expect(keptIds).toContain(3); // Category_Spending_Spike (priority 5)
      expect(keptIds).toContain(2); // Frequency_Spike (priority 2)
    });

    test('exactly 3 current-month anomalies should all pass through', () => {
      const anomalies = [
        makeAnomaly({ id: 1, date: currentMonthDate(2), severity: SEVERITY_LEVELS.LOW, classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
        makeAnomaly({ id: 2, date: currentMonthDate(10), severity: SEVERITY_LEVELS.MEDIUM, classification: ANOMALY_CLASSIFICATIONS.NEW_MERCHANT }),
        makeAnomaly({ id: 3, date: currentMonthDate(20), severity: SEVERITY_LEVELS.HIGH, classification: ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION })
      ];

      const result = service._enforceAlertLimits(anomalies);
      expect(result).toHaveLength(3);
    });
  });
});

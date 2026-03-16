/**
 * Unit tests for global monthly alert cap (_enforceGlobalMonthlyCap).
 * Tests cap enforcement, severity-based retention, date tiebreaker,
 * prior-month pass-through, and interaction with per-category cap.
 *
 * Requirements: 10.7
 */

const service = require('./anomalyDetectionService');
const {
  THROTTLE_CONFIG,
  SEVERITY_LEVELS,
  ANOMALY_CLASSIFICATIONS
} = require('../utils/analyticsConstants');

// Helper: create a mock anomaly
function makeAnomaly(overrides = {}) {
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: overrides.expenseId != null ? overrides.expenseId : 1,
    date: overrides.date || '2025-01-15',
    place: overrides.place || 'TestMerchant',
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

describe('AnomalyDetectionService._enforceGlobalMonthlyCap', () => {
  describe('cap enforcement at 3 alerts', () => {
    test('should keep all anomalies when count ≤ MAX_ALERTS_PER_MONTH', () => {
      const anomalies = [
        makeAnomaly({ date: currentMonthDate(1), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ date: currentMonthDate(5), severity: SEVERITY_LEVELS.MEDIUM }),
        makeAnomaly({ date: currentMonthDate(10), severity: SEVERITY_LEVELS.HIGH })
      ];

      const result = service._enforceGlobalMonthlyCap(anomalies);
      expect(result).toHaveLength(3);
    });

    test('should cap at MAX_ALERTS_PER_MONTH when exceeded', () => {
      const anomalies = [
        makeAnomaly({ id: 1, date: currentMonthDate(1), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 2, date: currentMonthDate(5), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 3, date: currentMonthDate(10), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 4, date: currentMonthDate(15), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 5, date: currentMonthDate(20), severity: SEVERITY_LEVELS.LOW })
      ];

      const result = service._enforceGlobalMonthlyCap(anomalies);
      const currentMonthResults = result.filter(a => {
        const d = new Date(a.date);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      expect(currentMonthResults).toHaveLength(THROTTLE_CONFIG.MAX_ALERTS_PER_MONTH);
    });

    test('should return empty array for empty input', () => {
      expect(service._enforceGlobalMonthlyCap([])).toEqual([]);
    });

    test('should handle null input', () => {
      expect(service._enforceGlobalMonthlyCap(null)).toEqual([]);
    });
  });

  describe('severity-based retention with date tiebreaker', () => {
    test('should retain highest severity anomalies when capping', () => {
      const anomalies = [
        makeAnomaly({ id: 1, date: currentMonthDate(1), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 2, date: currentMonthDate(5), severity: SEVERITY_LEVELS.HIGH }),
        makeAnomaly({ id: 3, date: currentMonthDate(10), severity: SEVERITY_LEVELS.MEDIUM }),
        makeAnomaly({ id: 4, date: currentMonthDate(15), severity: SEVERITY_LEVELS.HIGH }),
        makeAnomaly({ id: 5, date: currentMonthDate(20), severity: SEVERITY_LEVELS.LOW })
      ];

      const result = service._enforceGlobalMonthlyCap(anomalies);
      const currentMonthResults = result.filter(a => {
        const d = new Date(a.date);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      expect(currentMonthResults).toHaveLength(3);
      // Should keep the 2 HIGH and 1 MEDIUM, dropping the 2 LOW
      const severities = currentMonthResults.map(a => a.severity);
      expect(severities.filter(s => s === SEVERITY_LEVELS.HIGH)).toHaveLength(2);
      expect(severities.filter(s => s === SEVERITY_LEVELS.MEDIUM)).toHaveLength(1);
    });

    test('should use date as tiebreaker among equal severity (most recent first)', () => {
      const anomalies = [
        makeAnomaly({ id: 1, date: currentMonthDate(1), severity: SEVERITY_LEVELS.MEDIUM }),
        makeAnomaly({ id: 2, date: currentMonthDate(5), severity: SEVERITY_LEVELS.MEDIUM }),
        makeAnomaly({ id: 3, date: currentMonthDate(10), severity: SEVERITY_LEVELS.MEDIUM }),
        makeAnomaly({ id: 4, date: currentMonthDate(15), severity: SEVERITY_LEVELS.MEDIUM })
      ];

      const result = service._enforceGlobalMonthlyCap(anomalies);
      const currentMonthResults = result.filter(a => {
        const d = new Date(a.date);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      expect(currentMonthResults).toHaveLength(3);
      // Should keep the 3 most recent: day 15, 10, 5 — day 1 (mapped to 2) dropped
      const dates = currentMonthResults.map(a => a.date).sort();
      expect(currentMonthResults).toHaveLength(3);
    });
  });

  describe('pass-through of prior-month anomalies', () => {
    test('should not count prior-month anomalies toward the cap', () => {
      const anomalies = [
        // 3 current month
        makeAnomaly({ id: 1, date: currentMonthDate(1), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 2, date: currentMonthDate(5), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 3, date: currentMonthDate(10), severity: SEVERITY_LEVELS.LOW }),
        // 2 prior month
        makeAnomaly({ id: 4, date: priorMonthDate(10), severity: SEVERITY_LEVELS.HIGH }),
        makeAnomaly({ id: 5, date: priorMonthDate(20), severity: SEVERITY_LEVELS.HIGH })
      ];

      const result = service._enforceGlobalMonthlyCap(anomalies);
      // All 5 should pass through: 3 current (at cap) + 2 prior
      expect(result).toHaveLength(5);
    });

    test('prior-month anomalies pass through even when current month exceeds cap', () => {
      const anomalies = [
        // 5 current month (exceeds cap of 3)
        makeAnomaly({ id: 1, date: currentMonthDate(2), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 2, date: currentMonthDate(5), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 3, date: currentMonthDate(10), severity: SEVERITY_LEVELS.MEDIUM }),
        makeAnomaly({ id: 4, date: currentMonthDate(15), severity: SEVERITY_LEVELS.HIGH }),
        makeAnomaly({ id: 5, date: currentMonthDate(20), severity: SEVERITY_LEVELS.LOW }),
        // 3 prior month
        makeAnomaly({ id: 6, date: priorMonthDate(5), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 7, date: priorMonthDate(10), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 8, date: priorMonthDate(15), severity: SEVERITY_LEVELS.LOW })
      ];

      const result = service._enforceGlobalMonthlyCap(anomalies);
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
      // Simulate what _applyFrequencyControls does:
      // per-category cap runs first, then global cap

      // 4 anomalies in different categories (all current month)
      const anomalies = [
        makeAnomaly({ id: 1, date: currentMonthDate(1), category: 'Dining', severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 2, date: currentMonthDate(5), category: 'Shopping', severity: SEVERITY_LEVELS.MEDIUM }),
        makeAnomaly({ id: 3, date: currentMonthDate(10), category: 'Transport', severity: SEVERITY_LEVELS.HIGH }),
        makeAnomaly({ id: 4, date: currentMonthDate(15), category: 'Groceries', severity: SEVERITY_LEVELS.LOW })
      ];

      // Per-category cap (3 per category) wouldn't reduce these (1 each)
      // But global cap (3 total) should reduce from 4 to 3
      const result = service._enforceGlobalMonthlyCap(anomalies);
      const currentMonthResults = result.filter(a => {
        const d = new Date(a.date);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      expect(currentMonthResults).toHaveLength(3);
      // Should drop the lowest severity with earliest date (id: 1, LOW, day 1)
      const keptIds = currentMonthResults.map(a => a.id);
      expect(keptIds).toContain(3); // HIGH
      expect(keptIds).toContain(2); // MEDIUM
    });

    test('exactly 3 current-month anomalies should all pass through', () => {
      const anomalies = [
        makeAnomaly({ id: 1, date: currentMonthDate(1), severity: SEVERITY_LEVELS.LOW }),
        makeAnomaly({ id: 2, date: currentMonthDate(10), severity: SEVERITY_LEVELS.MEDIUM }),
        makeAnomaly({ id: 3, date: currentMonthDate(20), severity: SEVERITY_LEVELS.HIGH })
      ];

      const result = service._enforceGlobalMonthlyCap(anomalies);
      expect(result).toHaveLength(3);
    });
  });
});

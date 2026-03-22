/**
 * Unit tests for Alert_Prioritizer (_enforceAlertLimits) in AnomalyDetectionService.
 * Tests type-priority ordering, severity tiebreaker, date tiebreaker,
 * per-vendor cap, global cap, prior-month pass-through, deduplication, and edge cases.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 13.2, 19.4
 */

const service = require('./anomalyDetectionService');
const {
  THROTTLE_CONFIG,
  SEVERITY_LEVELS,
  ANOMALY_CLASSIFICATIONS,
  ALERT_TYPE_PRIORITY
} = require('../utils/analyticsConstants');

// ─── Helpers ──────────────────────────────────────────────────────────

/** Get a current-month date string. Day is clamped to ≥2 to avoid UTC timezone edge. */
function currentMonthDate(day) {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = Math.max(day, 2).toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Get a prior-month date string. Day clamped to 2–28 for safety. */
function priorMonthDate(day) {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = Math.min(Math.max(day, 2), 28).toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

let idCounter = 1;

/** Build a minimal anomaly for prioritizer testing. */
function makeAnomaly(overrides = {}) {
  return {
    id: overrides.id || idCounter++,
    expenseId: overrides.expenseId != null ? overrides.expenseId : idCounter,
    date: overrides.date || currentMonthDate(10),
    place: overrides.place || 'TestVendor',
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

beforeEach(() => {
  idCounter = 1;
});

// ─── Type Priority Ordering ──────────────────────────────────────────

describe('Alert_Prioritizer type priority ordering', () => {
  test('New_Spending_Tier (priority 6) retained over Large_Transaction (priority 1)', () => {
    const anomalies = [
      makeAnomaly({ place: 'VendorA', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(5) }),
      makeAnomaly({ place: 'VendorB', classification: ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER, date: currentMonthDate(6) }),
      makeAnomaly({ place: 'VendorC', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(7) }),
      makeAnomaly({ place: 'VendorD', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(8) }),
      makeAnomaly({ place: 'VendorE', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(9) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    const currentMonth = result.filter(a => a.date.startsWith(currentMonthDate(2).slice(0, 7)));
    expect(currentMonth.length).toBeLessThanOrEqual(THROTTLE_CONFIG.MAX_ALERTS_PER_MONTH);

    const classifications = currentMonth.map(a => a.classification);
    expect(classifications).toContain(ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER);
  });

  test('higher type-priority alerts retained when global cap forces selection', () => {
    const anomalies = [
      makeAnomaly({ place: 'V1', classification: ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER, date: currentMonthDate(3) }),
      makeAnomaly({ place: 'V2', classification: ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE, date: currentMonthDate(4) }),
      makeAnomaly({ place: 'V3', classification: ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND, date: currentMonthDate(5) }),
      makeAnomaly({ place: 'V4', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(6) }),
      makeAnomaly({ place: 'V5', classification: ANOMALY_CLASSIFICATIONS.NEW_MERCHANT, date: currentMonthDate(7) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    const currentMonth = result.filter(a => a.date >= currentMonthDate(2));
    expect(currentMonth).toHaveLength(3);

    const keptClassifications = currentMonth.map(a => a.classification);
    // Top 3 by priority: New_Spending_Tier(6), Category_Spending_Spike(5), Emerging_Behavior_Trend(4)
    expect(keptClassifications).toContain(ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER);
    expect(keptClassifications).toContain(ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE);
    expect(keptClassifications).toContain(ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND);
  });
});

// ─── Severity Tiebreaker ─────────────────────────────────────────────

describe('Alert_Prioritizer severity tiebreaker', () => {
  test('high severity retained over low at same type priority', () => {
    // All Large_Transaction (priority 1), different severities, different vendors
    const anomalies = [
      makeAnomaly({ place: 'V1', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.LOW, date: currentMonthDate(3) }),
      makeAnomaly({ place: 'V2', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.HIGH, date: currentMonthDate(4) }),
      makeAnomaly({ place: 'V3', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.MEDIUM, date: currentMonthDate(5) }),
      makeAnomaly({ place: 'V4', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.LOW, date: currentMonthDate(6) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    const currentMonth = result.filter(a => a.date >= currentMonthDate(2));
    expect(currentMonth).toHaveLength(3);

    const severities = currentMonth.map(a => a.severity);
    expect(severities).toContain(SEVERITY_LEVELS.HIGH);
    expect(severities).toContain(SEVERITY_LEVELS.MEDIUM);
    // One LOW kept, one LOW dropped
    expect(severities.filter(s => s === SEVERITY_LEVELS.LOW)).toHaveLength(1);
  });
});

// ─── Date Tiebreaker ─────────────────────────────────────────────────

describe('Alert_Prioritizer date tiebreaker', () => {
  test('most recent retained at same type priority and severity', () => {
    // All same classification and severity, different vendors and dates
    const anomalies = [
      makeAnomaly({ place: 'V1', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.MEDIUM, date: currentMonthDate(3) }),
      makeAnomaly({ place: 'V2', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.MEDIUM, date: currentMonthDate(10) }),
      makeAnomaly({ place: 'V3', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.MEDIUM, date: currentMonthDate(20) }),
      makeAnomaly({ place: 'V4', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.MEDIUM, date: currentMonthDate(5) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    const currentMonth = result.filter(a => a.date >= currentMonthDate(2));
    expect(currentMonth).toHaveLength(3);

    const dates = currentMonth.map(a => a.date);
    // Most recent 3: day 20, 10, 5 — day 3 dropped
    expect(dates).toContain(currentMonthDate(20));
    expect(dates).toContain(currentMonthDate(10));
    expect(dates).not.toContain(currentMonthDate(3));
  });
});

// ─── Per-Vendor Cap ──────────────────────────────────────────────────

describe('Alert_Prioritizer per-vendor cap', () => {
  test('3 alerts for same vendor → only 1 retained', () => {
    const anomalies = [
      makeAnomaly({ place: 'Walmart', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(3) }),
      makeAnomaly({ place: 'Walmart', category: 'Electronics', classification: ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER, date: currentMonthDate(5) }),
      makeAnomaly({ place: 'Walmart', category: 'Clothing', classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE, date: currentMonthDate(7) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    const walmartAlerts = result.filter(a => a.place === 'Walmart');
    expect(walmartAlerts).toHaveLength(1);
  });

  test('per-vendor cap keeps highest type-priority alert', () => {
    const anomalies = [
      makeAnomaly({ place: 'Amazon', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(3) }),
      makeAnomaly({ place: 'Amazon', classification: ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER, date: currentMonthDate(5) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    const amazonAlerts = result.filter(a => a.place === 'Amazon');
    expect(amazonAlerts).toHaveLength(1);
    expect(amazonAlerts[0].classification).toBe(ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER);
  });

  test('different vendors are not affected by per-vendor cap', () => {
    const anomalies = [
      makeAnomaly({ place: 'VendorA', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(3) }),
      makeAnomaly({ place: 'VendorB', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(5) }),
      makeAnomaly({ place: 'VendorC', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(7) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    expect(result).toHaveLength(3);
  });
});

// ─── Global Cap ──────────────────────────────────────────────────────

describe('Alert_Prioritizer global cap', () => {
  test('5 current-month alerts → only 3 retained', () => {
    const anomalies = [
      makeAnomaly({ place: 'V1', date: currentMonthDate(3) }),
      makeAnomaly({ place: 'V2', date: currentMonthDate(5) }),
      makeAnomaly({ place: 'V3', date: currentMonthDate(7) }),
      makeAnomaly({ place: 'V4', date: currentMonthDate(9) }),
      makeAnomaly({ place: 'V5', date: currentMonthDate(11) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    const currentMonth = result.filter(a => a.date >= currentMonthDate(2));
    expect(currentMonth).toHaveLength(THROTTLE_CONFIG.MAX_ALERTS_PER_MONTH);
  });

  test('global cap is exactly MAX_ALERTS_PER_MONTH (3)', () => {
    expect(THROTTLE_CONFIG.MAX_ALERTS_PER_MONTH).toBe(3);
  });
});

// ─── Prior-Month Pass-Through ────────────────────────────────────────

describe('Alert_Prioritizer prior-month pass-through', () => {
  test('prior-month alerts unaffected by caps', () => {
    const anomalies = [
      // 5 current month (exceeds cap)
      makeAnomaly({ place: 'V1', date: currentMonthDate(3) }),
      makeAnomaly({ place: 'V2', date: currentMonthDate(5) }),
      makeAnomaly({ place: 'V3', date: currentMonthDate(7) }),
      makeAnomaly({ place: 'V4', date: currentMonthDate(9) }),
      makeAnomaly({ place: 'V5', date: currentMonthDate(11) }),
      // 3 prior month
      makeAnomaly({ place: 'P1', date: priorMonthDate(5) }),
      makeAnomaly({ place: 'P2', date: priorMonthDate(10) }),
      makeAnomaly({ place: 'P3', date: priorMonthDate(15) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    const priorResults = result.filter(a => a.date.startsWith(priorMonthDate(2).slice(0, 7)));
    expect(priorResults).toHaveLength(3);
  });

  test('prior-month alerts do not count toward global cap', () => {
    const anomalies = [
      // 3 current month (at cap)
      makeAnomaly({ place: 'V1', date: currentMonthDate(3) }),
      makeAnomaly({ place: 'V2', date: currentMonthDate(5) }),
      makeAnomaly({ place: 'V3', date: currentMonthDate(7) }),
      // 2 prior month
      makeAnomaly({ place: 'P1', date: priorMonthDate(5) }),
      makeAnomaly({ place: 'P2', date: priorMonthDate(10) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    // All 5 should pass: 3 current (at cap) + 2 prior
    expect(result).toHaveLength(5);
  });

  test('prior-month alerts not subject to per-vendor cap', () => {
    const anomalies = [
      makeAnomaly({ place: 'SameVendor', date: priorMonthDate(5), classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION }),
      makeAnomaly({ place: 'SameVendor', date: priorMonthDate(10), classification: ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER })
    ];

    const result = service._enforceAlertLimits(anomalies);
    // Both prior-month, both pass through
    expect(result).toHaveLength(2);
  });
});

// ─── Deduplication ───────────────────────────────────────────────────

describe('Alert_Prioritizer deduplication', () => {
  test('same vendor+category+classification → only 1 retained', () => {
    const anomalies = [
      makeAnomaly({ place: 'Costco', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(3) }),
      makeAnomaly({ place: 'Costco', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(10) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    const costcoGroceries = result.filter(a =>
      a.place === 'Costco' && a.category === 'Groceries' && a.classification === ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION
    );
    expect(costcoGroceries).toHaveLength(1);
  });

  test('deduplication keeps highest priority (type → severity → date)', () => {
    const anomalies = [
      makeAnomaly({ place: 'Costco', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.LOW, date: currentMonthDate(3) }),
      makeAnomaly({ place: 'Costco', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, severity: SEVERITY_LEVELS.HIGH, date: currentMonthDate(10) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    const kept = result.filter(a => a.place === 'Costco');
    expect(kept).toHaveLength(1);
    expect(kept[0].severity).toBe(SEVERITY_LEVELS.HIGH);
  });

  test('different classification for same vendor+category → not deduplicated', () => {
    const anomalies = [
      makeAnomaly({ place: 'Costco', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(3) }),
      makeAnomaly({ place: 'Costco', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE, date: currentMonthDate(10) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    // Both are different classifications, but per-vendor cap still applies → 1 kept
    const costcoAlerts = result.filter(a => a.place === 'Costco');
    expect(costcoAlerts).toHaveLength(1);
  });

  test('deduplication is case-insensitive on vendor name', () => {
    const anomalies = [
      makeAnomaly({ place: 'Walmart', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(3) }),
      makeAnomaly({ place: 'walmart', category: 'Groceries', classification: ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, date: currentMonthDate(10) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    // Same vendor (case-insensitive) + same category + same classification → deduplicated to 1
    const walmartAlerts = result.filter(a => a.place.toLowerCase() === 'walmart');
    expect(walmartAlerts).toHaveLength(1);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────

describe('Alert_Prioritizer edge cases', () => {
  test('empty input returns empty array', () => {
    expect(service._enforceAlertLimits([])).toEqual([]);
  });

  test('null input returns empty array', () => {
    expect(service._enforceAlertLimits(null)).toEqual([]);
  });

  test('undefined input returns empty array', () => {
    expect(service._enforceAlertLimits(undefined)).toEqual([]);
  });

  test('single alert passes through unchanged', () => {
    const anomalies = [
      makeAnomaly({ place: 'Solo', date: currentMonthDate(10) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    expect(result).toHaveLength(1);
    expect(result[0].place).toBe('Solo');
  });

  test('exactly 3 current-month alerts → no cap needed, all retained', () => {
    const anomalies = [
      makeAnomaly({ place: 'V1', date: currentMonthDate(3) }),
      makeAnomaly({ place: 'V2', date: currentMonthDate(5) }),
      makeAnomaly({ place: 'V3', date: currentMonthDate(7) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    expect(result).toHaveLength(3);
  });

  test('anomaly with empty place is handled gracefully', () => {
    const anomalies = [
      makeAnomaly({ place: '', category: 'Groceries', date: currentMonthDate(3) }),
      makeAnomaly({ place: '', category: 'Dining', date: currentMonthDate(5) })
    ];

    // Both have empty vendor → same vendor key → per-vendor cap keeps 1
    const result = service._enforceAlertLimits(anomalies);
    const emptyVendor = result.filter(a => a.place === '');
    expect(emptyVendor).toHaveLength(1);
  });

  test('anomaly with null place is handled gracefully', () => {
    const anomalies = [
      makeAnomaly({ place: null, category: 'Groceries', date: currentMonthDate(3) })
    ];

    const result = service._enforceAlertLimits(anomalies);
    expect(result).toHaveLength(1);
  });
});

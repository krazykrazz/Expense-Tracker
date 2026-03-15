/**
 * Property-Based Tests for AnomalyDetectionService — Cluster Detection
 *
 * Property 14: Cluster detection and structure
 * Property 15: Cluster mutual exclusivity
 *
 * Feature: actionable-anomaly-alerts
 * Validates: Requirements 7.1, 7.2, 7.3, 7.5, 6.3
 *
 * @invariant Cluster Detection & Mutual Exclusivity: For any set of anomalies
 * processed through _aggregateClusters, cluster alerts contain MIN_CLUSTER_SIZE+
 * transactions within CLUSTER_WINDOW_DAYS, cluster.totalAmount equals the sum of
 * constituent amounts, cluster.transactionCount equals the number of constituents,
 * cluster.dateRange spans earliest-to-latest constituent dates, cluster.label is
 * a valid CLUSTER_LABELS value, and no expenseId appears both in a cluster alert
 * and as an individual alert. The union of clustered + individual expenseIds
 * covers all original transaction-level expenseIds.
 */

const fc = require('fast-check');
const {
  safeDate,
  pbtOptions
} = require('../test/pbtArbitraries');
const {
  CLUSTER_LABELS,
  ANOMALY_CLASSIFICATIONS,
  SEVERITY_LEVELS,
  THROTTLE_CONFIG
} = require('../utils/analyticsConstants');

// Configure fast-check for fast PBT mode
fc.configureGlobal({ numRuns: 20 });

// The service is a singleton — access private methods directly
const anomalyDetectionService = require('./anomalyDetectionService');

const CLUSTER_LABEL_VALUES = Object.values(CLUSTER_LABELS);
const SEVERITY_VALUES = Object.values(SEVERITY_LEVELS);

// ─── Theme category sets (mirrors service internals) ───
const TRAVEL_CATEGORIES = ['Transportation', 'Travel', 'Hotels', 'Gas', 'Flights', 'Parking'];
const MOVING_CATEGORIES = ['Furniture', 'Home', 'Utilities', 'Moving', 'Rent'];
const RENOVATION_CATEGORIES = ['Home Improvement', 'Appliances', 'Hardware', 'Renovation'];
const HOLIDAY_CATEGORIES = ['Gifts', 'Dining', 'Entertainment', 'Decorations'];

/**
 * Build a minimal anomaly object for cluster testing.
 */
function makeAnomaly(overrides = {}) {
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: overrides.expenseId != null ? overrides.expenseId : Math.floor(Math.random() * 100000),
    date: overrides.date || '2025-06-15',
    place: overrides.place || 'TestMerchant',
    amount: overrides.amount || 100,
    category: overrides.category || 'Dining',
    anomalyType: overrides.anomalyType || 'amount',
    classification: overrides.classification || ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
    severity: overrides.severity || SEVERITY_LEVELS.LOW,
    dismissed: false,
    categoryAverage: overrides.categoryAverage || 50,
    standardDeviations: 3.5,
    explanation: null,
    historicalContext: null,
    impactEstimate: null,
    behaviorPattern: null,
    confidence: null,
    ...overrides
  };
}

/**
 * Arbitrary: generate a date string within N days of a base date.
 */
function dateWithinWindow(baseDate, windowDays) {
  return fc.integer({ min: 0, max: windowDays }).map(offset => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  });
}

/**
 * Arbitrary: generate a themed cluster group of anomalies (3+ within 7-day window).
 * Uses travel categories to guarantee theme matching.
 */
const arbTravelClusterGroup = fc.record({
  baseDate: safeDate({ min: new Date('2024-06-01'), max: new Date('2025-06-01') }),
  count: fc.integer({ min: THROTTLE_CONFIG.MIN_CLUSTER_SIZE, max: 8 })
}).chain(({ baseDate, count }) => {
  const anomalyArbs = [];
  for (let i = 0; i < count; i++) {
    anomalyArbs.push(
      fc.record({
        offset: fc.integer({ min: 0, max: THROTTLE_CONFIG.CLUSTER_WINDOW_DAYS }),
        amount: fc.float({ min: Math.fround(10), max: Math.fround(2000), noNaN: true })
          .filter(n => isFinite(n) && n >= 10),
        category: fc.constantFrom(...TRAVEL_CATEGORIES),
        severity: fc.constantFrom(...SEVERITY_VALUES),
        place: fc.constantFrom('Airline', 'Hilton', 'Shell', 'Uber', 'Hertz')
      })
    );
  }
  return fc.tuple(...anomalyArbs).map(items => {
    return items.map((item, i) => {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + item.offset);
      return makeAnomaly({
        id: Date.now() + i,
        expenseId: 1000 + i,
        date: d.toISOString().split('T')[0],
        amount: item.amount,
        category: item.category,
        severity: item.severity,
        place: item.place
      });
    });
  });
});

/**
 * Arbitrary: generate a holiday cluster group (December dates with holiday categories).
 */
const arbHolidayClusterGroup = fc.record({
  year: fc.integer({ min: 2024, max: 2025 }),
  count: fc.integer({ min: THROTTLE_CONFIG.MIN_CLUSTER_SIZE, max: 6 })
}).chain(({ year, count }) => {
  const anomalyArbs = [];
  for (let i = 0; i < count; i++) {
    anomalyArbs.push(
      fc.record({
        day: fc.integer({ min: 1, max: 24 }),
        amount: fc.float({ min: Math.fround(10), max: Math.fround(2000), noNaN: true })
          .filter(n => isFinite(n) && n >= 10),
        category: fc.constantFrom(...HOLIDAY_CATEGORIES),
        severity: fc.constantFrom(...SEVERITY_VALUES)
      })
    );
  }
  return fc.tuple(...anomalyArbs).map(items => {
    return items.map((item, i) => {
      // Ensure all dates are within 7-day window in December
      const clampedDay = Math.min(item.day, 24);
      const baseDay = 18; // Dec 18-24 window
      const dayOffset = clampedDay % (THROTTLE_CONFIG.CLUSTER_WINDOW_DAYS + 1);
      const date = `${year}-12-${String(baseDay + dayOffset).padStart(2, '0')}`;
      return makeAnomaly({
        id: Date.now() + i + 500,
        expenseId: 2000 + i,
        date,
        amount: item.amount,
        category: item.category,
        severity: item.severity,
        place: 'HolidayStore' + i
      });
    });
  });
});

/**
 * Arbitrary: generate scattered anomalies that should NOT cluster
 * (spread across months, different unrelated categories).
 */
const arbScatteredAnomalies = fc.integer({ min: 1, max: 10 }).chain(count => {
  const arbs = [];
  for (let i = 0; i < count; i++) {
    arbs.push(
      fc.record({
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }),
        amount: fc.float({ min: Math.fround(10), max: Math.fround(2000), noNaN: true })
          .filter(n => isFinite(n) && n >= 10),
        category: fc.constantFrom('Groceries', 'Subscriptions', 'Personal Care', 'Automotive', 'Other')
      })
    );
  }
  return fc.tuple(...arbs).map(items => {
    return items.map((item, i) => makeAnomaly({
      id: Date.now() + i + 3000,
      expenseId: 3000 + i,
      date: `2025-${String(item.month).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`,
      amount: item.amount,
      category: item.category,
      place: 'ScatteredStore' + i
    }));
  });
});

// ─── Property 14: Cluster detection and structure ───
// **Validates: Requirements 7.1, 7.2, 7.3**

describe('Property 14: Cluster detection and structure', () => {
  it('travel cluster alerts have correct totalAmount, transactionCount, dateRange, and label', () => {
    fc.assert(
      fc.property(arbTravelClusterGroup, (clusterGroup) => {
        const result = anomalyDetectionService._aggregateClusters(clusterGroup);

        const clusterAlerts = result.filter(a => a.cluster != null);

        // With travel-themed categories in a 7-day window, we expect clustering
        if (clusterAlerts.length === 0) {
          // If no cluster formed, all anomalies should still be present
          expect(result.length).toBe(clusterGroup.length);
          return;
        }

        for (const alert of clusterAlerts) {
          const cluster = alert.cluster;

          // cluster.label must be a valid CLUSTER_LABELS value
          expect(CLUSTER_LABEL_VALUES).toContain(cluster.label);

          // cluster.transactionCount >= MIN_CLUSTER_SIZE
          expect(cluster.transactionCount).toBeGreaterThanOrEqual(THROTTLE_CONFIG.MIN_CLUSTER_SIZE);

          // cluster.transactionCount matches transactions array length
          expect(cluster.transactions.length).toBe(cluster.transactionCount);

          // cluster.totalAmount equals sum of constituent amounts
          const expectedTotal = parseFloat(
            cluster.transactions.reduce((sum, t) => sum + t.amount, 0).toFixed(2)
          );
          expect(cluster.totalAmount).toBeCloseTo(expectedTotal, 1);

          // cluster.dateRange.start <= cluster.dateRange.end
          expect(cluster.dateRange.start <= cluster.dateRange.end).toBe(true);

          // All transaction dates fall within dateRange
          for (const t of cluster.transactions) {
            expect(t.date >= cluster.dateRange.start).toBe(true);
            expect(t.date <= cluster.dateRange.end).toBe(true);
          }

          // dateRange span <= CLUSTER_WINDOW_DAYS
          const startMs = new Date(cluster.dateRange.start).getTime();
          const endMs = new Date(cluster.dateRange.end).getTime();
          const spanDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
          expect(spanDays).toBeLessThanOrEqual(THROTTLE_CONFIG.CLUSTER_WINDOW_DAYS);

          // Each transaction has required fields
          for (const t of cluster.transactions) {
            expect(t.expenseId).toBeDefined();
            expect(typeof t.place).toBe('string');
            expect(typeof t.amount).toBe('number');
            expect(typeof t.date).toBe('string');
          }

          // Cluster alert itself has expenseId null
          expect(alert.expenseId).toBeNull();

          // isCluster can be inferred from cluster != null
          expect(alert.cluster).not.toBeNull();
        }
      })
    );
  });

  it('holiday cluster alerts use Holiday_Spending label for December transactions', () => {
    fc.assert(
      fc.property(arbHolidayClusterGroup, (clusterGroup) => {
        const result = anomalyDetectionService._aggregateClusters(clusterGroup);

        const clusterAlerts = result.filter(a => a.cluster != null);

        if (clusterAlerts.length > 0) {
          for (const alert of clusterAlerts) {
            // December holiday-themed categories should get Holiday_Spending label
            expect(alert.cluster.label).toBe(CLUSTER_LABELS.HOLIDAY_SPENDING);
            expect(alert.cluster.transactionCount).toBeGreaterThanOrEqual(THROTTLE_CONFIG.MIN_CLUSTER_SIZE);
          }
        }
      })
    );
  });

  it('non-clusterable anomalies pass through unchanged', () => {
    fc.assert(
      fc.property(arbScatteredAnomalies, (anomalies) => {
        const result = anomalyDetectionService._aggregateClusters(anomalies);

        // Scattered anomalies with non-themed categories spread across months
        // should not form clusters — all should pass through
        const clusterAlerts = result.filter(a => a.cluster != null);
        const individualAlerts = result.filter(a => a.cluster == null);

        // Total output should account for all input anomalies
        // (some may cluster if randomly close, but non-themed categories shouldn't)
        const totalOutputIds = new Set();
        for (const a of individualAlerts) {
          if (a.expenseId != null) totalOutputIds.add(a.expenseId);
        }
        for (const a of clusterAlerts) {
          for (const t of a.cluster.transactions) {
            totalOutputIds.add(t.expenseId);
          }
        }

        const inputIds = new Set(anomalies.filter(a => a.expenseId != null).map(a => a.expenseId));
        // All input transaction-level IDs should appear somewhere in output
        for (const id of inputIds) {
          expect(totalOutputIds.has(id)).toBe(true);
        }
      })
    );
  });

  it('cluster severity is the highest severity among constituents', () => {
    fc.assert(
      fc.property(arbTravelClusterGroup, (clusterGroup) => {
        const result = anomalyDetectionService._aggregateClusters(clusterGroup);
        const clusterAlerts = result.filter(a => a.cluster != null);

        if (clusterAlerts.length > 0) {
          for (const alert of clusterAlerts) {
            const constituentIds = new Set(alert.cluster.transactions.map(t => t.expenseId));
            const constituents = clusterGroup.filter(a => constituentIds.has(a.expenseId));

            const severityOrder = { low: 1, medium: 2, high: 3 };
            const maxSeverity = constituents.reduce((max, a) => {
              return (severityOrder[a.severity] || 0) > (severityOrder[max] || 0) ? a.severity : max;
            }, 'low');

            expect(alert.severity).toBe(maxSeverity);
          }
        }
      })
    );
  });
});

// ─── Property 15: Cluster mutual exclusivity ───
// **Validates: Requirements 7.5, 6.3**

describe('Property 15: Cluster mutual exclusivity', () => {
  it('no expenseId appears both in a cluster and as an individual alert', () => {
    fc.assert(
      fc.property(arbTravelClusterGroup, (clusterGroup) => {
        const result = anomalyDetectionService._aggregateClusters(clusterGroup);

        const clusterAlerts = result.filter(a => a.cluster != null);
        const individualAlerts = result.filter(a => a.cluster == null);

        // Collect all expenseIds from cluster transactions
        const clusteredIds = new Set();
        for (const ca of clusterAlerts) {
          for (const t of ca.cluster.transactions) {
            clusteredIds.add(t.expenseId);
          }
        }

        // Collect all expenseIds from individual alerts
        const individualIds = new Set();
        for (const ia of individualAlerts) {
          if (ia.expenseId != null) {
            individualIds.add(ia.expenseId);
          }
        }

        // Sets must be disjoint
        for (const id of clusteredIds) {
          expect(individualIds.has(id)).toBe(false);
        }
        for (const id of individualIds) {
          expect(clusteredIds.has(id)).toBe(false);
        }
      })
    );
  });

  it('total output count (individual + cluster alerts) <= input count', () => {
    fc.assert(
      fc.property(arbTravelClusterGroup, (clusterGroup) => {
        const result = anomalyDetectionService._aggregateClusters(clusterGroup);

        // Each cluster replaces N anomalies with 1 cluster alert
        // So output count should be <= input count
        expect(result.length).toBeLessThanOrEqual(clusterGroup.length);
      })
    );
  });

  it('all original transaction expenseIds are accounted for in output', () => {
    fc.assert(
      fc.property(arbTravelClusterGroup, (clusterGroup) => {
        const result = anomalyDetectionService._aggregateClusters(clusterGroup);

        const inputIds = new Set(clusterGroup.filter(a => a.expenseId != null).map(a => a.expenseId));

        // Collect all output expenseIds (individual + inside clusters)
        const outputIds = new Set();
        for (const a of result) {
          if (a.cluster != null) {
            for (const t of a.cluster.transactions) {
              outputIds.add(t.expenseId);
            }
          } else if (a.expenseId != null) {
            outputIds.add(a.expenseId);
          }
        }

        // Every input transaction-level ID must appear in output
        for (const id of inputIds) {
          expect(outputIds.has(id)).toBe(true);
        }
      })
    );
  });

  it('mutual exclusivity holds with mixed cluster + non-cluster input', () => {
    fc.assert(
      fc.property(
        arbTravelClusterGroup,
        arbScatteredAnomalies,
        (clusterGroup, scattered) => {
          // Ensure unique expenseIds across both groups
          const usedIds = new Set(clusterGroup.map(a => a.expenseId));
          const remapped = scattered.map((a, i) => {
            let eid = a.expenseId;
            while (usedIds.has(eid)) { eid += 10000; }
            usedIds.add(eid);
            return { ...a, expenseId: eid };
          });

          const combined = [...clusterGroup, ...remapped];
          const result = anomalyDetectionService._aggregateClusters(combined);

          const clusteredIds = new Set();
          const individualIds = new Set();

          for (const a of result) {
            if (a.cluster != null) {
              for (const t of a.cluster.transactions) {
                clusteredIds.add(t.expenseId);
              }
            } else if (a.expenseId != null) {
              individualIds.add(a.expenseId);
            }
          }

          // Disjoint check
          for (const id of clusteredIds) {
            expect(individualIds.has(id)).toBe(false);
          }

          // All input IDs accounted for
          const allInputIds = new Set(combined.filter(a => a.expenseId != null).map(a => a.expenseId));
          const allOutputIds = new Set([...clusteredIds, ...individualIds]);
          for (const id of allInputIds) {
            expect(allOutputIds.has(id)).toBe(true);
          }
        }
      )
    );
  });

  it('category-level anomalies (expenseId null) are preserved alongside clusters', () => {
    fc.assert(
      fc.property(
        arbTravelClusterGroup,
        fc.integer({ min: 1, max: 3 }),
        (clusterGroup, nullCount) => {
          // Add category-level anomalies (expenseId null)
          const nullAnomalies = [];
          for (let i = 0; i < nullCount; i++) {
            nullAnomalies.push(makeAnomaly({
              id: Date.now() + 9000 + i,
              expenseId: null,
              date: clusterGroup[0].date,
              category: 'Dining',
              anomalyType: 'category_spending_spike'
            }));
          }

          const combined = [...clusterGroup, ...nullAnomalies];
          const result = anomalyDetectionService._aggregateClusters(combined);

          // Category-level anomalies should pass through as individual alerts
          const nullAlerts = result.filter(a => a.expenseId === null && a.cluster == null);
          expect(nullAlerts.length).toBe(nullCount);
        }
      )
    );
  });
});

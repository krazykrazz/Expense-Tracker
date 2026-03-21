/**
 * Property-Based Tests for AnomalyDetectionService — Global Monthly Cap
 *
 * Property 13: Global monthly cap with type-priority-based retention
 * Property 14: Global cap prior-month pass-through
 *
 * Feature: anomaly-alert-ux
 * Validates: Requirements 8.4, 8.6
 *
 * @invariant Global Monthly Cap Correctness: For any set of anomalies within
 * the current calendar month, _enforceAlertLimits outputs at most
 * MAX_ALERTS_PER_MONTH (3) current-month anomalies. When the input exceeds
 * the cap, retained anomalies have the highest type-priority (from
 * ALERT_TYPE_PRIORITY), with severity as tiebreaker and most recent date as
 * final tiebreaker. Prior-month anomalies pass through unaffected regardless
 * of the current month's count.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const {
  THROTTLE_CONFIG,
  SEVERITY_LEVELS,
  ANOMALY_CLASSIFICATIONS,
  ALERT_TYPE_PRIORITY
} = require('../utils/analyticsConstants');

const anomalyDetectionService = require('./anomalyDetectionService');

const MAX_CAP = THROTTLE_CONFIG.MAX_ALERTS_PER_MONTH; // 3
const SEVERITIES = [SEVERITY_LEVELS.LOW, SEVERITY_LEVELS.MEDIUM, SEVERITY_LEVELS.HIGH];
const SEVERITY_ORDER = { [SEVERITY_LEVELS.HIGH]: 3, [SEVERITY_LEVELS.MEDIUM]: 2, [SEVERITY_LEVELS.LOW]: 1 };
const ALL_CLASSIFICATIONS = Object.values(ANOMALY_CLASSIFICATIONS);

// ─── Helpers ───

/** Build a YYYY-MM-DD string for the current calendar month at a given day. */
function currentMonthDate(day) {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = Math.max(day, 2); // avoid day 1 UTC timezone edge
  return `${y}-${m}-${String(d).padStart(2, '0')}`;
}

/** Build a YYYY-MM-DD string for a prior month (monthsBack >= 1). */
function priorMonthDate(day, monthsBack = 1) {
  const now = new Date();
  now.setMonth(now.getMonth() - monthsBack);
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = Math.min(Math.max(day, 2), 28);
  return `${y}-${m}-${String(d).padStart(2, '0')}`;
}

/** Create a minimal anomaly object. */
function makeAnomaly(overrides = {}) {
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: overrides.expenseId != null ? overrides.expenseId : 1,
    date: overrides.date || currentMonthDate(15),
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

/** Get type priority for a classification. */
function getTypePriority(classification) {
  return ALERT_TYPE_PRIORITY[classification] || 0;
}

// ─── Arbitraries ───

const arbSeverity = fc.constantFrom(...SEVERITIES);
const arbDay = fc.integer({ min: 2, max: 28 });
const arbClassification = fc.constantFrom(...ALL_CLASSIFICATIONS);

/**
 * Arbitrary: a single current-month anomaly with random severity, day, and classification.
 * Vendor and category are assigned later via .map() for uniqueness.
 */
const arbCurrentMonthAnomaly = fc.record({
  severity: arbSeverity,
  day: arbDay,
  classification: arbClassification,
  id: fc.integer({ min: 1, max: 100000 })
}).map(({ severity, day, classification, id }) =>
  makeAnomaly({ id, severity, date: currentMonthDate(day), classification })
);

/** Arbitrary: a single prior-month anomaly (1-6 months back). */
const arbPriorMonthAnomaly = fc.record({
  severity: arbSeverity,
  day: arbDay,
  classification: arbClassification,
  id: fc.integer({ min: 100001, max: 200000 }),
  monthsBack: fc.integer({ min: 1, max: 6 })
}).map(({ severity, day, classification, id, monthsBack }) =>
  makeAnomaly({ id, severity, date: priorMonthDate(day, monthsBack), classification, place: `PriorVendor_${id}`, category: `PriorCat_${id}` })
);

/**
 * Arbitrary: array of 1-10 current-month anomalies with unique vendors and
 * unique categories to avoid being collapsed by dedup or per-vendor cap.
 */
const arbCurrentMonthAnomalies = fc.array(arbCurrentMonthAnomaly, { minLength: 1, maxLength: 10 })
  .map(anomalies => anomalies.map((a, i) => ({
    ...a,
    place: `Vendor_${i}`,
    category: `Category_${i}`
  })));

/**
 * Arbitrary: mixed array with current + prior month anomalies.
 * Current-month anomalies get unique vendors/categories.
 * Prior-month anomalies already have unique vendors from the generator.
 */
const arbMixedAnomalies = fc.tuple(
  fc.array(arbCurrentMonthAnomaly, { minLength: 1, maxLength: 8 }),
  fc.array(arbPriorMonthAnomaly, { minLength: 1, maxLength: 6 })
).map(([current, prior]) => {
  // Ensure unique vendors/categories for current-month and unique IDs across both
  let nextId = 1;
  const uniqueCurrent = current.map((a, i) => ({ ...a, id: nextId++, place: `Vendor_${i}`, category: `Category_${i}` }));
  const uniquePrior = prior.map(a => ({ ...a, id: nextId++ + 100000 }));
  return { current: uniqueCurrent, prior: uniquePrior, all: [...uniqueCurrent, ...uniquePrior] };
});


// ─── Property 13: Global monthly cap with type-priority-based retention ───
// Feature: anomaly-alert-ux, Property 13: Global monthly cap with type-priority-based retention
// **Validates: Requirements 8.4, 8.6**

describe('Feature: anomaly-alert-ux, Property 13: Global monthly cap with type-priority-based retention', () => {

  it('output contains at most MAX_ALERTS_PER_MONTH current-month anomalies', () => {
    fc.assert(
      fc.property(arbCurrentMonthAnomalies, (anomalies) => {
        const result = anomalyDetectionService._enforceAlertLimits(anomalies);

        // All input anomalies are current-month, so result should be capped
        expect(result.length).toBeLessThanOrEqual(MAX_CAP);
      }),
      pbtOptions()
    );
  });

  it('when input ≤ cap, all anomalies pass through unchanged', () => {
    const arbSmallSet = fc.array(arbCurrentMonthAnomaly, { minLength: 1, maxLength: MAX_CAP })
      .map(anomalies => anomalies.map((a, i) => ({
        ...a,
        place: `Vendor_${i}`,
        category: `Category_${i}`
      })));

    fc.assert(
      fc.property(arbSmallSet, (anomalies) => {
        const result = anomalyDetectionService._enforceAlertLimits(anomalies);

        expect(result.length).toBe(anomalies.length);
        // Every input anomaly should be in the output
        const resultIds = new Set(result.map(a => a.id));
        for (const a of anomalies) {
          expect(resultIds.has(a.id)).toBe(true);
        }
      }),
      pbtOptions()
    );
  });

  it('when input exceeds cap, retained anomalies have highest type-priority', () => {
    const arbOverCap = fc.array(arbCurrentMonthAnomaly, { minLength: MAX_CAP + 1, maxLength: 10 })
      .map(anomalies => anomalies.map((a, i) => ({
        ...a,
        place: `Vendor_${i}`,
        category: `Category_${i}`
      })));

    fc.assert(
      fc.property(arbOverCap, (anomalies) => {
        const result = anomalyDetectionService._enforceAlertLimits(anomalies);

        expect(result.length).toBe(MAX_CAP);

        // The minimum type-priority in the kept set should be ≥ the maximum type-priority in the dropped set
        const keptIds = new Set(result.map(a => a.id));
        const dropped = anomalies.filter(a => !keptIds.has(a.id));

        if (dropped.length > 0) {
          const minKeptPriority = Math.min(...result.map(a => getTypePriority(a.classification)));
          const maxDroppedPriority = Math.max(...dropped.map(a => getTypePriority(a.classification)));
          expect(minKeptPriority).toBeGreaterThanOrEqual(maxDroppedPriority);
        }
      }),
      pbtOptions()
    );
  });

  it('type-priority ordering preserved: type-priority desc → severity desc → date desc', () => {
    const arbOverCap = fc.array(arbCurrentMonthAnomaly, { minLength: MAX_CAP + 1, maxLength: 10 })
      .map(anomalies => anomalies.map((a, i) => ({
        ...a,
        place: `Vendor_${i}`,
        category: `Category_${i}`
      })));

    fc.assert(
      fc.property(arbOverCap, (anomalies) => {
        const result = anomalyDetectionService._enforceAlertLimits(anomalies);

        // Sort the input the same way the implementation does:
        // type-priority desc → severity desc → date desc
        const sorted = [...anomalies].sort((a, b) => {
          const typeDiff = getTypePriority(b.classification) - getTypePriority(a.classification);
          if (typeDiff !== 0) return typeDiff;
          const sevDiff = (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
          if (sevDiff !== 0) return sevDiff;
          return new Date(b.date) - new Date(a.date);
        });

        const expectedKeptIds = new Set(sorted.slice(0, MAX_CAP).map(a => a.id));
        const actualKeptIds = new Set(result.map(a => a.id));

        expect(actualKeptIds).toEqual(expectedKeptIds);
      }),
      pbtOptions()
    );
  });
});


// ─── Property 14: Global cap prior-month pass-through ───
// Feature: anomaly-alert-ux, Property 14: Global cap prior-month pass-through
// **Validates: Requirements 8.6**

describe('Feature: anomaly-alert-ux, Property 14: Global cap prior-month pass-through', () => {

  it('all prior-month anomalies pass through regardless of current-month count', () => {
    fc.assert(
      fc.property(arbMixedAnomalies, ({ current, prior, all }) => {
        const result = anomalyDetectionService._enforceAlertLimits(all);

        // Every prior-month anomaly must be in the output
        const resultIds = new Set(result.map(a => a.id));
        for (const p of prior) {
          expect(resultIds.has(p.id)).toBe(true);
        }
      }),
      pbtOptions()
    );
  });

  it('current-month anomalies are capped while prior-month count is unaffected', () => {
    fc.assert(
      fc.property(arbMixedAnomalies, ({ current, prior, all }) => {
        const result = anomalyDetectionService._enforceAlertLimits(all);

        // Partition result into current and prior month
        const now = new Date();
        const currentMonthKey = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0');

        const resultCurrent = result.filter(a => {
          const d = new Date(a.date);
          const key = d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0');
          return key === currentMonthKey;
        });
        const resultPrior = result.filter(a => {
          const d = new Date(a.date);
          const key = d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0');
          return key !== currentMonthKey;
        });

        // Current month capped at MAX_CAP
        expect(resultCurrent.length).toBeLessThanOrEqual(MAX_CAP);
        // Prior month all pass through
        expect(resultPrior.length).toBe(prior.length);
      }),
      pbtOptions()
    );
  });

  it('total output = min(currentCount, cap) + priorCount', () => {
    fc.assert(
      fc.property(arbMixedAnomalies, ({ current, prior, all }) => {
        const result = anomalyDetectionService._enforceAlertLimits(all);

        // Since all current-month anomalies have unique vendors and unique
        // vendor+category+classification combos, dedup and per-vendor cap
        // won't reduce the count. The formula stays the same.
        const expectedCurrentKept = Math.min(current.length, MAX_CAP);
        const expectedTotal = expectedCurrentKept + prior.length;

        expect(result.length).toBe(expectedTotal);
      }),
      pbtOptions()
    );
  });

  it('prior-month anomalies are identical (not modified) in output', () => {
    fc.assert(
      fc.property(arbMixedAnomalies, ({ prior, all }) => {
        const result = anomalyDetectionService._enforceAlertLimits(all);

        const resultById = new Map(result.map(a => [a.id, a]));
        for (const p of prior) {
          const found = resultById.get(p.id);
          expect(found).toBeDefined();
          expect(found.date).toBe(p.date);
          expect(found.severity).toBe(p.severity);
          expect(found.category).toBe(p.category);
        }
      }),
      pbtOptions()
    );
  });
});

/**
 * Property-Based Tests for AnomalyDetectionService — Alert_Prioritizer
 *
 * Property 6: Alert_Prioritizer global monthly cap
 * Property 7: Alert_Prioritizer per-vendor monthly cap
 * Property 8: Alert_Prioritizer type-priority selection
 *
 * Feature: anomaly-alert-ux, Property 6: Alert_Prioritizer global monthly cap
 * Feature: anomaly-alert-ux, Property 7: Alert_Prioritizer per-vendor monthly cap
 * Feature: anomaly-alert-ux, Property 8: Alert_Prioritizer type-priority selection
 *
 * @invariant Alert_Prioritizer Correctness: For any set of candidate anomalies,
 * _enforceAlertLimits outputs ≤3 current-month alerts (global cap), ≤1 per vendor
 * per month (per-vendor cap, highest type-priority retained), and when the global
 * cap forces selection, retained alerts have ≥ type priority of dropped alerts
 * (severity tiebreaker, then date tiebreaker). Prior-month anomalies pass through
 * unaffected by all caps.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const {
  THROTTLE_CONFIG,
  SEVERITY_LEVELS,
  ANOMALY_CLASSIFICATIONS,
  ALERT_TYPE_PRIORITY
} = require('../utils/analyticsConstants');

const service = require('./anomalyDetectionService');

// ─── Constants ───
const ALL_CLASSIFICATIONS = Object.values(ANOMALY_CLASSIFICATIONS);
const ALL_SEVERITIES = Object.values(SEVERITY_LEVELS);
const MAX_ALERTS = THROTTLE_CONFIG.MAX_ALERTS_PER_MONTH; // 3
const SEVERITY_ORDER = { [SEVERITY_LEVELS.HIGH]: 3, [SEVERITY_LEVELS.MEDIUM]: 2, [SEVERITY_LEVELS.LOW]: 1 };

// ─── Date Helpers ───

function currentMonthDate(day) {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = Math.max(day, 2);
  return `${y}-${m}-${String(d).padStart(2, '0')}`;
}

function priorMonthDate(day, monthsBack = 1) {
  const now = new Date();
  now.setMonth(now.getMonth() - monthsBack);
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = Math.min(Math.max(day, 2), 28);
  return `${y}-${m}-${String(d).padStart(2, '0')}`;
}

// ─── Generators ───

let idCounter = 1;
beforeEach(() => { idCounter = 1; });

/** Arbitrary classification from the 8 types */
const arbClassification = fc.constantFrom(...ALL_CLASSIFICATIONS);

/** Arbitrary severity */
const arbSeverity = fc.constantFrom(...ALL_SEVERITIES);

/** Arbitrary day of month (2–28 to avoid edge cases) */
const arbDay = fc.integer({ min: 2, max: 28 });

/** Arbitrary single current-month anomaly (vendor assigned later for uniqueness) */
const arbCurrentMonthAnomaly = fc.record({
  classification: arbClassification,
  severity: arbSeverity,
  day: arbDay,
  category: fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing', 'Gifts', 'Housing', 'Utilities')
}).map(({ classification, severity, day, category }) => ({
  id: idCounter++,
  expenseId: idCounter,
  date: currentMonthDate(day),
  place: '', // assigned later for uniqueness
  amount: 100,
  category,
  anomalyType: 'amount',
  classification,
  severity,
  dismissed: false,
  categoryAverage: 50,
  standardDeviations: 3.5
}));

/**
 * Generate array of current-month anomalies with unique vendors and different
 * classifications to avoid being collapsed by deduplication or per-vendor cap
 * before reaching the global cap test.
 */
const arbCurrentMonthAnomalies = fc.array(arbCurrentMonthAnomaly, { minLength: 1, maxLength: 10 })
  .map(anomalies => anomalies.map((a, i) => ({
    ...a,
    place: `Vendor_${i}`,
    // Use different classifications to avoid dedup (same vendor+category+classification)
    category: `Category_${i}`
  })));

/** Arbitrary single prior-month anomaly */
const arbPriorMonthAnomaly = fc.record({
  classification: arbClassification,
  severity: arbSeverity,
  day: arbDay,
  category: fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment')
}).map(({ classification, severity, day, category }) => ({
  id: idCounter++,
  expenseId: idCounter,
  date: priorMonthDate(day),
  place: `PriorVendor_${idCounter}`,
  amount: 100,
  category,
  anomalyType: 'amount',
  classification,
  severity,
  dismissed: false,
  categoryAverage: 50,
  standardDeviations: 3.5
}));

/** Arbitrary array of prior-month anomalies */
const arbPriorMonthAnomalies = fc.array(arbPriorMonthAnomaly, { minLength: 0, maxLength: 5 });

/**
 * Generate anomalies for per-vendor cap testing: multiple anomalies sharing the
 * same vendor but with different categories/classifications.
 */
const arbSameVendorAnomalies = fc.array(
  fc.record({
    classification: arbClassification,
    severity: arbSeverity,
    day: arbDay
  }),
  { minLength: 2, maxLength: 6 }
).map(items => items.map((item, i) => ({
  id: idCounter++,
  expenseId: idCounter,
  date: currentMonthDate(item.day),
  place: 'SharedVendor',
  amount: 100,
  category: `Category_${i}`,
  anomalyType: 'amount',
  classification: item.classification,
  severity: item.severity,
  dismissed: false,
  categoryAverage: 50,
  standardDeviations: 3.5
})));

// ─── Helpers ───

function getCurrentMonthPrefix() {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

function isCurrentMonth(dateStr) {
  return dateStr.startsWith(getCurrentMonthPrefix());
}

function getTypePriority(classification) {
  return ALERT_TYPE_PRIORITY[classification] || 0;
}

function getSeverityOrder(severity) {
  return SEVERITY_ORDER[severity] || 0;
}

// ─── Property 6: Alert_Prioritizer global monthly cap ───
// **Validates: Requirements 8.1, 8.6**

describe('Property 6: Alert_Prioritizer global monthly cap', () => {
  it('output ≤ 3 current-month alerts for any set of candidate anomalies', () => {
    fc.assert(
      fc.property(arbCurrentMonthAnomalies, (anomalies) => {
        const result = service._enforceAlertLimits(anomalies);
        const currentMonthResults = result.filter(a => isCurrentMonth(a.date));
        expect(currentMonthResults.length).toBeLessThanOrEqual(MAX_ALERTS);
      }),
      pbtOptions()
    );
  });

  it('prior-month anomalies pass through unaffected regardless of current-month count', () => {
    fc.assert(
      fc.property(arbCurrentMonthAnomalies, arbPriorMonthAnomalies, (current, prior) => {
        const combined = [...current, ...prior];
        const result = service._enforceAlertLimits(combined);

        // All prior-month anomalies should be in the output
        const priorMonthPrefix = (() => {
          const now = new Date();
          now.setMonth(now.getMonth() - 1);
          const y = now.getFullYear();
          const m = (now.getMonth() + 1).toString().padStart(2, '0');
          return `${y}-${m}`;
        })();

        const priorInResult = result.filter(a => a.date.startsWith(priorMonthPrefix));
        const priorInInput = prior.filter(a => a.date.startsWith(priorMonthPrefix));
        expect(priorInResult.length).toBe(priorInInput.length);

        // Current-month still capped
        const currentInResult = result.filter(a => isCurrentMonth(a.date));
        expect(currentInResult.length).toBeLessThanOrEqual(MAX_ALERTS);
      }),
      pbtOptions()
    );
  });
});

// ─── Property 7: Alert_Prioritizer per-vendor monthly cap ───
// **Validates: Requirements 8.2, 8.3**

describe('Property 7: Alert_Prioritizer per-vendor monthly cap', () => {
  it('output ≤ 1 per vendor per month in current-month results', () => {
    fc.assert(
      fc.property(arbCurrentMonthAnomalies, (anomalies) => {
        const result = service._enforceAlertLimits(anomalies);
        const currentMonthResults = result.filter(a => isCurrentMonth(a.date));

        // Count per vendor (case-insensitive)
        const vendorCounts = {};
        for (const a of currentMonthResults) {
          const vendor = (a.place || '').toLowerCase();
          vendorCounts[vendor] = (vendorCounts[vendor] || 0) + 1;
        }

        for (const [vendor, count] of Object.entries(vendorCounts)) {
          expect(count).toBeLessThanOrEqual(1);
        }
      }),
      pbtOptions()
    );
  });

  it('highest type-priority alert retained when multiple exist for same vendor', () => {
    fc.assert(
      fc.property(arbSameVendorAnomalies, (anomalies) => {
        const result = service._enforceAlertLimits(anomalies);
        const vendorResults = result.filter(a =>
          (a.place || '').toLowerCase() === 'sharedvendor' && isCurrentMonth(a.date)
        );

        // At most 1 per vendor
        expect(vendorResults.length).toBeLessThanOrEqual(1);

        if (vendorResults.length === 1) {
          const kept = vendorResults[0];
          const keptPriority = getTypePriority(kept.classification);

          // The kept alert should have priority ≥ all dropped alerts for this vendor
          const currentMonthInput = anomalies.filter(a => isCurrentMonth(a.date));
          for (const a of currentMonthInput) {
            const aPriority = getTypePriority(a.classification);
            if (aPriority > keptPriority) {
              // If a dropped alert has higher type priority, that's a violation
              // But it could have been deduped — only check non-deduped
              // The kept one should be >= all others after dedup
              // This is a soft check: the kept priority should be the max
            }
            // The kept priority should be >= all input priorities (after dedup picks best)
          }

          // Stronger check: kept priority is the maximum among all input anomalies for this vendor
          const maxPriority = Math.max(...currentMonthInput.map(a => getTypePriority(a.classification)));
          expect(keptPriority).toBe(maxPriority);
        }
      }),
      pbtOptions()
    );
  });
});

// ─── Property 8: Alert_Prioritizer type-priority selection ───
// **Validates: Requirements 8.4, 8.5**

describe('Property 8: Alert_Prioritizer type-priority selection', () => {
  it('retained alerts have ≥ type priority of dropped when global cap forces selection', () => {
    // Generate enough unique-vendor anomalies to exceed the global cap
    const arbExceedingCap = fc.array(
      fc.record({
        classification: arbClassification,
        severity: arbSeverity,
        day: arbDay
      }),
      { minLength: 4, maxLength: 10 }
    ).map(items => items.map((item, i) => ({
      id: i + 1,
      expenseId: i + 100,
      date: currentMonthDate(item.day),
      place: `UniqueVendor_${i}`,
      amount: 100,
      category: `Cat_${i}`,
      anomalyType: 'amount',
      classification: item.classification,
      severity: item.severity,
      dismissed: false,
      categoryAverage: 50,
      standardDeviations: 3.5
    })));

    fc.assert(
      fc.property(arbExceedingCap, (anomalies) => {
        const result = service._enforceAlertLimits(anomalies);
        const retained = result.filter(a => isCurrentMonth(a.date));
        const retainedIds = new Set(retained.map(a => a.id));
        const dropped = anomalies.filter(a => isCurrentMonth(a.date) && !retainedIds.has(a.id));

        if (dropped.length === 0) return; // No selection needed

        // For every retained/dropped pair, retained should have >= priority
        for (const r of retained) {
          for (const d of dropped) {
            const rPriority = getTypePriority(r.classification);
            const dPriority = getTypePriority(d.classification);

            if (rPriority > dPriority) continue; // Clearly correct

            if (rPriority === dPriority) {
              const rSev = getSeverityOrder(r.severity);
              const dSev = getSeverityOrder(d.severity);

              if (rSev > dSev) continue; // Severity tiebreaker correct

              if (rSev === dSev) {
                // Date tiebreaker: retained should be more recent or equal
                expect(new Date(r.date).getTime()).toBeGreaterThanOrEqual(new Date(d.date).getTime());
                continue;
              }

              // rSev < dSev at same type priority — this is allowed because
              // the sort is global, not pairwise. A retained alert with lower
              // severity but higher type priority than SOME dropped alert is fine.
              // But if rPriority === dPriority and rSev < dSev, the dropped one
              // should have been preferred. This means the sort is wrong.
              // However, this can happen when the retained alert was kept due to
              // being higher priority than OTHER dropped alerts.
              // The correct invariant: min priority of retained >= max priority of dropped
            }

            // rPriority < dPriority would be a violation
            // But we need to check the aggregate invariant, not pairwise
          }
        }

        // Aggregate invariant: the minimum type-priority among retained
        // should be >= the maximum type-priority among dropped
        if (retained.length > 0 && dropped.length > 0) {
          const minRetainedPriority = Math.min(...retained.map(a => getTypePriority(a.classification)));
          const maxDroppedPriority = Math.max(...dropped.map(a => getTypePriority(a.classification)));

          // If min retained > max dropped, clearly correct
          if (minRetainedPriority > maxDroppedPriority) return;

          // If equal, check severity tiebreaker at the boundary
          if (minRetainedPriority === maxDroppedPriority) {
            const retainedAtBoundary = retained.filter(a => getTypePriority(a.classification) === minRetainedPriority);
            const droppedAtBoundary = dropped.filter(a => getTypePriority(a.classification) === maxDroppedPriority);

            const minRetainedSev = Math.min(...retainedAtBoundary.map(a => getSeverityOrder(a.severity)));
            const maxDroppedSev = Math.max(...droppedAtBoundary.map(a => getSeverityOrder(a.severity)));

            if (minRetainedSev > maxDroppedSev) return;

            if (minRetainedSev === maxDroppedSev) {
              // Date tiebreaker: min retained date >= max dropped date at same priority+severity
              const retainedAtSevBoundary = retainedAtBoundary.filter(a => getSeverityOrder(a.severity) === minRetainedSev);
              const droppedAtSevBoundary = droppedAtBoundary.filter(a => getSeverityOrder(a.severity) === maxDroppedSev);

              const minRetainedDate = Math.min(...retainedAtSevBoundary.map(a => new Date(a.date).getTime()));
              const maxDroppedDate = Math.max(...droppedAtSevBoundary.map(a => new Date(a.date).getTime()));

              expect(minRetainedDate).toBeGreaterThanOrEqual(maxDroppedDate);
              return;
            }

            // minRetainedSev < maxDroppedSev at same type priority — violation
            expect(minRetainedSev).toBeGreaterThanOrEqual(maxDroppedSev);
          }

          // minRetainedPriority < maxDroppedPriority — violation
          expect(minRetainedPriority).toBeGreaterThanOrEqual(maxDroppedPriority);
        }
      }),
      pbtOptions()
    );
  });
});

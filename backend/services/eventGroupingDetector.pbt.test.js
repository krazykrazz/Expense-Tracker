/**
 * Property-Based Tests for Event_Grouping_Detector (detectEventGroups)
 *
 * Property 9: Event group mutual exclusivity
 * Property 10: Event group 48-hour window constraint
 * Property 11: Event group alert structure correctness
 *
 * Feature: anomaly-alert-ux, Property 9: Event group mutual exclusivity
 * Feature: anomaly-alert-ux, Property 10: Event group 48-hour window constraint
 * Feature: anomaly-alert-ux, Property 11: Event group alert structure correctness
 *
 * @invariant Event_Grouping_Detector Correctness: For any set of anomalies,
 * detectEventGroups produces event groups and ungrouped alerts where (1) no
 * expenseId appears in both a group and ungrouped, (2) all anomalies within
 * a group have dates within a 48-hour window, and (3) each group's totalAmount,
 * transactionCount, and dateRange are correctly derived from its constituents.
 * Theme is one of the defined event theme labels.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { detectEventGroups } = require('./eventGroupingDetector');
const { EVENT_GROUPING_CONFIG } = require('../utils/analyticsConstants');

// ─── Constants ───

const WINDOW_MS = EVENT_GROUPING_CONFIG.WINDOW_HOURS * 60 * 60 * 1000; // 48h in ms
const VALID_THEME_LABELS = Object.values(EVENT_GROUPING_CONFIG.THEMES).map(t => t.label);
const ALL_THEME_CATEGORIES = Object.values(EVENT_GROUPING_CONFIG.THEMES)
  .flatMap(t => t.categories);

// Categories that don't match any theme (for generating ungroupable anomalies)
const NON_THEME_CATEGORIES = ['Electronics', 'Clothing', 'Automotive', 'Subscriptions', 'Pet Care'];

// ─── Generators ───

let idCounter = 1;
beforeEach(() => { idCounter = 1; });

/**
 * Generate a single anomaly with a random category (mix of theme and non-theme).
 * Dates are ISO strings within a reasonable range.
 */
const arbAnomaly = fc.record({
  category: fc.constantFrom(...ALL_THEME_CATEGORIES, ...NON_THEME_CATEGORIES),
  amount: fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true })
    .filter(n => isFinite(n) && n >= 1),
  severity: fc.constantFrom('low', 'medium', 'high'),
  dayOffset: fc.integer({ min: 0, max: 365 }),
  hourOffset: fc.integer({ min: 0, max: 23 }),
  place: fc.constantFrom('Walmart', 'Amazon', 'Uber', 'Hilton', 'IKEA', 'Home Depot', 'Shell', 'Target')
}).map(({ category, amount, severity, dayOffset, hourOffset, place }) => {
  const id = idCounter++;
  // Base date: 2024-01-01 + dayOffset days + hourOffset hours
  const base = new Date('2024-01-01T00:00:00.000Z');
  base.setDate(base.getDate() + dayOffset);
  base.setHours(hourOffset);
  return {
    id,
    expenseId: id,
    date: base.toISOString(),
    place,
    amount,
    category,
    severity,
    classification: 'Large_Transaction',
    anomalyType: 'amount',
    dismissed: false
  };
});

/** Array of random anomalies (general-purpose) */
const arbAnomalyArray = fc.array(arbAnomaly, { minLength: 0, maxLength: 15 });

/**
 * Generator biased toward forming groups: generates anomalies with theme-matching
 * categories within tight date windows. Useful for Property 10 and 11.
 */
const arbGroupableAnomalies = fc.record({
  themeKey: fc.constantFrom(...Object.keys(EVENT_GROUPING_CONFIG.THEMES)),
  count: fc.integer({ min: 2, max: 6 }),
  baseDay: fc.integer({ min: 0, max: 300 }),
  baseHour: fc.integer({ min: 0, max: 23 })
}).chain(({ themeKey, count, baseDay, baseHour }) => {
  const theme = EVENT_GROUPING_CONFIG.THEMES[themeKey];
  const categories = theme.categories;

  return fc.array(
    fc.record({
      catIdx: fc.integer({ min: 0, max: categories.length - 1 }),
      hourDelta: fc.integer({ min: 0, max: 47 }), // within 48h window
      amount: fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true })
        .filter(n => isFinite(n) && n >= 1),
      severity: fc.constantFrom('low', 'medium', 'high'),
      place: fc.constantFrom('Walmart', 'Amazon', 'Uber', 'Hilton', 'IKEA', 'Home Depot')
    }),
    { minLength: count, maxLength: count }
  ).map(items => {
    // For HOLIDAY theme, force December dates
    let adjustedBaseDay = baseDay;
    if (theme.monthConstraint === 12) {
      // Force into December: day 335-365 of 2024 is December
      adjustedBaseDay = 335 + (baseDay % 25); // Dec 1-25
    }

    return items.map((item, i) => {
      const id = idCounter++;
      const base = new Date('2024-01-01T00:00:00.000Z');
      base.setDate(base.getDate() + adjustedBaseDay);
      base.setHours(baseHour + item.hourDelta);
      return {
        id,
        expenseId: id,
        date: base.toISOString(),
        place: item.place,
        amount: item.amount,
        category: categories[item.catIdx],
        severity: item.severity,
        classification: 'Large_Transaction',
        anomalyType: 'amount',
        dismissed: false
      };
    });
  });
});

/**
 * Mix of groupable anomalies + random ungroupable ones for realistic scenarios.
 */
const arbMixedAnomalies = fc.tuple(arbGroupableAnomalies, arbAnomalyArray)
  .map(([groupable, random]) => [...groupable, ...random]);

// ─── Property 9: Event group mutual exclusivity ───
// **Validates: Requirements 9.4, 10.4**

describe('Property 9: Event group mutual exclusivity', () => {
  it('no expenseId appears in both event groups and ungrouped alerts', () => {
    fc.assert(
      fc.property(arbAnomalyArray, (anomalies) => {
        const { eventGroups, ungrouped } = detectEventGroups(anomalies);

        // Collect all expenseIds from event groups
        const groupedIds = new Set();
        for (const group of eventGroups) {
          for (const a of group.anomalies) {
            groupedIds.add(a.expenseId);
          }
        }

        // Collect all expenseIds from ungrouped
        const ungroupedIds = new Set(ungrouped.map(a => a.expenseId));

        // The two sets must be disjoint
        for (const id of groupedIds) {
          expect(ungroupedIds.has(id)).toBe(false);
        }
      }),
      pbtOptions()
    );
  });

  it('every input anomaly appears in exactly one of groups or ungrouped', () => {
    fc.assert(
      fc.property(arbMixedAnomalies, (anomalies) => {
        const { eventGroups, ungrouped } = detectEventGroups(anomalies);

        const groupedIds = new Set();
        for (const group of eventGroups) {
          for (const a of group.anomalies) {
            groupedIds.add(a.expenseId);
          }
        }
        const ungroupedIds = new Set(ungrouped.map(a => a.expenseId));

        const inputIds = new Set(anomalies.map(a => a.expenseId));

        // Every input id is in exactly one set
        for (const id of inputIds) {
          const inGrouped = groupedIds.has(id);
          const inUngrouped = ungroupedIds.has(id);
          // Must be in at least one
          expect(inGrouped || inUngrouped).toBe(true);
          // Must not be in both
          expect(inGrouped && inUngrouped).toBe(false);
        }
      }),
      pbtOptions()
    );
  });
});

// ─── Property 10: Event group 48-hour window constraint ───
// **Validates: Requirements 10.1, 10.5**

describe('Property 10: Event group 48-hour window constraint', () => {
  it('all anomalies in a group have dates within a 48-hour window', () => {
    fc.assert(
      fc.property(arbMixedAnomalies, (anomalies) => {
        const { eventGroups } = detectEventGroups(anomalies);

        for (const group of eventGroups) {
          const timestamps = group.anomalies.map(a => new Date(a.date).getTime());
          const earliest = Math.min(...timestamps);
          const latest = Math.max(...timestamps);
          const span = latest - earliest;

          expect(span).toBeLessThanOrEqual(WINDOW_MS);
        }
      }),
      pbtOptions()
    );
  });

  it('groups formed from biased groupable input still respect 48h window', () => {
    fc.assert(
      fc.property(arbGroupableAnomalies, (anomalies) => {
        const { eventGroups } = detectEventGroups(anomalies);

        for (const group of eventGroups) {
          const timestamps = group.anomalies.map(a => new Date(a.date).getTime());
          const earliest = Math.min(...timestamps);
          const latest = Math.max(...timestamps);

          expect(latest - earliest).toBeLessThanOrEqual(WINDOW_MS);
        }
      }),
      pbtOptions()
    );
  });
});

// ─── Property 11: Event group alert structure correctness ───
// **Validates: Requirements 10.3**

describe('Property 11: Event group alert structure correctness', () => {
  it('totalAmount = sum of constituent amounts, transactionCount = count, dateRange correct, theme valid', () => {
    fc.assert(
      fc.property(arbMixedAnomalies, (anomalies) => {
        const { eventGroups } = detectEventGroups(anomalies);

        for (const group of eventGroups) {
          // totalAmount = sum of constituent amounts
          const expectedTotal = group.anomalies.reduce((sum, a) => sum + (a.amount || 0), 0);
          expect(group.totalAmount).toBeCloseTo(expectedTotal, 2);

          // transactionCount = number of constituents
          expect(group.transactionCount).toBe(group.anomalies.length);

          // dateRange.start = earliest date, dateRange.end = latest date
          const dates = group.anomalies.map(a => a.date).sort();
          expect(group.dateRange.start).toBe(dates[0]);
          expect(group.dateRange.end).toBe(dates[dates.length - 1]);

          // Theme is one of the defined labels
          expect(VALID_THEME_LABELS).toContain(group.theme);
        }
      }),
      pbtOptions()
    );
  });

  it('alert object mirrors group structure fields', () => {
    fc.assert(
      fc.property(arbGroupableAnomalies, (anomalies) => {
        const { eventGroups } = detectEventGroups(anomalies);

        for (const group of eventGroups) {
          const alert = group.alert;

          // alert.eventGroup should mirror group-level fields
          expect(alert.eventGroup.totalAmount).toBeCloseTo(group.totalAmount, 2);
          expect(alert.eventGroup.transactionCount).toBe(group.transactionCount);
          expect(alert.eventGroup.dateRange.start).toBe(group.dateRange.start);
          expect(alert.eventGroup.dateRange.end).toBe(group.dateRange.end);
          expect(alert.eventGroup.theme).toBe(group.theme);

          // alert.amount should equal totalAmount
          expect(alert.amount).toBeCloseTo(group.totalAmount, 2);

          // alert.anomalyType should be 'event_group'
          expect(alert.anomalyType).toBe('event_group');
        }
      }),
      pbtOptions()
    );
  });
});

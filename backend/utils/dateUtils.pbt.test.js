'use strict';

/**
 * Property-Based Tests: dateUtils UTC correctness
 *
 * @invariant
 * Property 9: calculateDaysUntilDue backward compatibility
 * For any valid paymentDueDay (1-28) and any UTC reference date, the result
 * equals the number of days from UTC-midnight of referenceDate to the next
 * occurrence of that day-of-month, and is always >= 0.
 *
 * Property 10: calculatePreviousCycleDates backward compatibility
 * For any billingCycleDay (1-28) and reference date, the returned cycle
 * [startDate, endDate] contains exactly one occurrence of billingCycleDay
 * as the endDate day, and startDate is the day after the previous cycle end.
 *
 * Property 11: calculateWeek UTC consistency
 * For any YYYY-MM-DD string, calculateWeek returns the same value as
 * Math.ceil(day / 7) where day is parsed directly from the string.
 *
 * Validates: Requirements 7.4, 7.5, 7.6, 10.2, 10.3, 10.4
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { calculateWeek, calculateDaysUntilDue } = require('./dateUtils');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a UTC-midnight Date from year/month(1-based)/day */
function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d));
}

/** Days in a given UTC month */
function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ── Property 9: calculateDaysUntilDue backward compatibility ─────────────────

describe('Property 9: calculateDaysUntilDue backward compatibility', () => {

  it('returns null for invalid due days', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(0),
          fc.constant(32),
          fc.integer({ min: 33, max: 100 }),
          fc.integer({ min: -100, max: -1 }),
          fc.constant(null),
          fc.constant(undefined)
        ),
        (invalidDay) => {
          expect(calculateDaysUntilDue(invalidDay, new Date())).toBeNull();
        }
      ),
      pbtOptions()
    );
  });

  it('result is always >= 0 for valid inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 2020, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (dueDay, year, month, day) => {
          const ref = utcDate(year, month, day);
          const result = calculateDaysUntilDue(dueDay, ref);
          expect(result).not.toBeNull();
          expect(result).toBeGreaterThanOrEqual(0);
        }
      ),
      pbtOptions()
    );
  });

  it('result is <= 31 for any valid input (never more than one month away)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 2020, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (dueDay, year, month, day) => {
          const ref = utcDate(year, month, day);
          const result = calculateDaysUntilDue(dueDay, ref);
          expect(result).toBeLessThanOrEqual(31);
        }
      ),
      pbtOptions()
    );
  });

  it('when referenceDate day equals dueDay, result is 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 2020, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        (dueDay, year, month) => {
          // Only test if dueDay is valid for this month
          if (dueDay > daysInMonth(year, month)) return;
          const ref = utcDate(year, month, dueDay);
          const result = calculateDaysUntilDue(dueDay, ref);
          expect(result).toBe(0);
        }
      ),
      pbtOptions()
    );
  });

  it('result is consistent regardless of local time-of-day on the reference date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 2020, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 0, max: 23 }),
        (dueDay, year, month, day, hour) => {
          // Two references: UTC midnight vs UTC noon — same UTC date, different time
          const refMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
          const refNoon = new Date(Date.UTC(year, month - 1, day, hour, 30, 0));
          const r1 = calculateDaysUntilDue(dueDay, refMidnight);
          const r2 = calculateDaysUntilDue(dueDay, refNoon);
          expect(r1).toBe(r2);
        }
      ),
      pbtOptions()
    );
  });
});

// ── Property 11: calculateWeek UTC consistency ────────────────────────────────

describe('Property 11: calculateWeek UTC consistency', () => {

  it('for YYYY-MM-DD strings, result equals Math.ceil(day/7)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (year, month, day) => {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const result = calculateWeek(dateStr);
          expect(result).toBe(Math.ceil(day / 7));
        }
      ),
      pbtOptions()
    );
  });

  it('for Date objects, result equals Math.ceil(getUTCDate()/7)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 0, max: 23 }),
        (year, month, day, hour) => {
          // Use a UTC date with a specific hour to test that getUTCDate is used
          const dateObj = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
          const result = calculateWeek(dateObj);
          expect(result).toBe(Math.ceil(dateObj.getUTCDate() / 7));
        }
      ),
      pbtOptions()
    );
  });

  it('result is always between 1 and 5', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 31 }),
        (day) => {
          const dateStr = `2024-01-${String(day).padStart(2, '0')}`;
          const result = calculateWeek(dateStr);
          expect(result).toBeGreaterThanOrEqual(1);
          expect(result).toBeLessThanOrEqual(5);
        }
      ),
      pbtOptions()
    );
  });
});

// ── Property 10: calculatePreviousCycleDates backward compatibility ───────────

describe('Property 10: calculatePreviousCycleDates backward compatibility', () => {
  const { calculatePreviousCycleDates } = require('../test/pbtArbitraries');

  it('endDate day always equals billingCycleDay (clamped to month length)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 2020, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (billingCycleDay, year, month, day) => {
          const ref = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const { endDate } = calculatePreviousCycleDates(billingCycleDay, ref);
          const endDay = parseInt(endDate.split('-')[2], 10);
          const endMonth = parseInt(endDate.split('-')[1], 10);
          const endYear = parseInt(endDate.split('-')[0], 10);
          const maxDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
          expect(endDay).toBe(Math.min(billingCycleDay, maxDay));
        }
      ),
      pbtOptions()
    );
  });

  it('startDate is always strictly before endDate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 2020, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (billingCycleDay, year, month, day) => {
          const ref = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const { startDate, endDate } = calculatePreviousCycleDates(billingCycleDay, ref);
          expect(startDate < endDate).toBe(true);
        }
      ),
      pbtOptions()
    );
  });

  it('cycle spans approximately one month (20-32 days)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 2020, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (billingCycleDay, year, month, day) => {
          const ref = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const { startDate, endDate } = calculatePreviousCycleDates(billingCycleDay, ref);
          const start = new Date(startDate + 'T00:00:00Z');
          const end = new Date(endDate + 'T00:00:00Z');
          const diffDays = (end - start) / (1000 * 60 * 60 * 24);
          expect(diffDays).toBeGreaterThanOrEqual(20);
          expect(diffDays).toBeLessThanOrEqual(32);
        }
      ),
      pbtOptions()
    );
  });

  it('produces valid YYYY-MM-DD strings', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 2020, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (billingCycleDay, year, month, day) => {
          const ref = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const { startDate, endDate } = calculatePreviousCycleDates(billingCycleDay, ref);
          expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(new Date(startDate + 'T00:00:00Z').toString()).not.toBe('Invalid Date');
          expect(new Date(endDate + 'T00:00:00Z').toString()).not.toBe('Invalid Date');
        }
      ),
      pbtOptions()
    );
  });
});

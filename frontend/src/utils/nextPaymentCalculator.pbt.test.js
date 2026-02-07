/**
 * Property-Based Tests for Next Payment Date Calculator
 * 
 * Feature: mortgage-payment-date-tracking, Property 1: Next payment date calculation
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { calculateNextPaymentDate, getLastDayOfMonth, classifyPaymentUrgency } from './nextPaymentCalculator';

// Smart generators constrained to the valid input space

/** Valid payment due day (1-31) */
const paymentDueDay = fc.integer({ min: 1, max: 31 });

/** Reference date spanning a wide range including leap years and short months.
 *  Filters out invalid dates (NaN) that fc.date() can occasionally produce. */
const referenceDate = fc.date({
  min: new Date(2020, 0, 1),
  max: new Date(2030, 11, 31)
}).filter(d => !isNaN(d.getTime()));

/**
 * Helper: get the effective due day for a given month, clamped to the last day.
 */
function effectiveDueDay(dueDay, year, month) {
  const lastDay = getLastDayOfMonth(year, month);
  return Math.min(dueDay, lastDay);
}

describe('Next Payment Date Calculator Property-Based Tests', () => {
  /**
   * **Feature: mortgage-payment-date-tracking, Property 1: Next payment date calculation**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
   *
   * For any valid paymentDueDay (1-31) and any reference date, the calculated
   * next payment date SHALL satisfy:
   * 1. The result date is >= the reference date (normalized to midnight)
   * 2. If referenceDate.getDate() <= effectiveDueDay for current month,
   *    the result is in the same month
   * 3. If referenceDate.getDate() > effectiveDueDay for current month,
   *    the result is in the following month
   * 4. The day of the result equals Math.min(paymentDueDay, lastDayOfTargetMonth)
   */
  test('Property 1: Next payment date is always >= reference date', () => {
    fc.assert(
      fc.property(
        paymentDueDay,
        referenceDate,
        (dueDay, refDate) => {
          const result = calculateNextPaymentDate(dueDay, refDate);
          expect(result).not.toBeNull();

          // Normalize reference to midnight for comparison
          const refMidnight = new Date(refDate);
          refMidnight.setHours(0, 0, 0, 0);

          expect(result.nextDate.getTime()).toBeGreaterThanOrEqual(refMidnight.getTime());
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 1: Same-month selection when current day <= effective due day', () => {
    fc.assert(
      fc.property(
        paymentDueDay,
        referenceDate,
        (dueDay, refDate) => {
          const refMidnight = new Date(refDate);
          refMidnight.setHours(0, 0, 0, 0);

          const currentDay = refMidnight.getDate();
          const currentMonth = refMidnight.getMonth();
          const currentYear = refMidnight.getFullYear();

          const effectiveDay = effectiveDueDay(dueDay, currentYear, currentMonth);

          // Only test the same-month case
          if (currentDay > effectiveDay) return;

          const result = calculateNextPaymentDate(dueDay, refDate);
          expect(result).not.toBeNull();

          // Result should be in the same month as the reference date
          expect(result.nextDate.getMonth()).toBe(currentMonth);
          expect(result.nextDate.getFullYear()).toBe(currentYear);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 1: Next-month selection when current day > effective due day', () => {
    fc.assert(
      fc.property(
        paymentDueDay,
        referenceDate,
        (dueDay, refDate) => {
          const refMidnight = new Date(refDate);
          refMidnight.setHours(0, 0, 0, 0);

          const currentDay = refMidnight.getDate();
          const currentMonth = refMidnight.getMonth();
          const currentYear = refMidnight.getFullYear();

          const effectiveDay = effectiveDueDay(dueDay, currentYear, currentMonth);

          // Only test the next-month case
          if (currentDay <= effectiveDay) return;

          const result = calculateNextPaymentDate(dueDay, refDate);
          expect(result).not.toBeNull();

          // Result should be in the following month
          const expectedMonth = (currentMonth + 1) % 12;
          const expectedYear = currentMonth === 11 ? currentYear + 1 : currentYear;

          expect(result.nextDate.getMonth()).toBe(expectedMonth);
          expect(result.nextDate.getFullYear()).toBe(expectedYear);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 1: Result day equals min(paymentDueDay, lastDayOfTargetMonth)', () => {
    fc.assert(
      fc.property(
        paymentDueDay,
        referenceDate,
        (dueDay, refDate) => {
          const result = calculateNextPaymentDate(dueDay, refDate);
          expect(result).not.toBeNull();

          const targetYear = result.nextDate.getFullYear();
          const targetMonth = result.nextDate.getMonth();
          const lastDay = getLastDayOfMonth(targetYear, targetMonth);

          const expectedDay = Math.min(dueDay, lastDay);
          expect(result.nextDate.getDate()).toBe(expectedDay);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 1: daysUntil is non-negative and consistent with dates', () => {
    fc.assert(
      fc.property(
        paymentDueDay,
        referenceDate,
        (dueDay, refDate) => {
          const result = calculateNextPaymentDate(dueDay, refDate);
          expect(result).not.toBeNull();

          // daysUntil should be non-negative
          expect(result.daysUntil).toBeGreaterThanOrEqual(0);

          // daysUntil should be consistent with the date difference
          const refMidnight = new Date(refDate);
          refMidnight.setHours(0, 0, 0, 0);
          const diffMs = result.nextDate.getTime() - refMidnight.getTime();
          const expectedDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

          expect(result.daysUntil).toBe(expectedDays);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 1: Invalid paymentDueDay returns null', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -100, max: 0 }),
          fc.integer({ min: 32, max: 100 })
        ),
        referenceDate,
        (invalidDay, refDate) => {
          const result = calculateNextPaymentDate(invalidDay, refDate);
          expect(result).toBeNull();
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });
});

/**
 * Property 2: Payment Urgency Indicator
 * 
 * Feature: mortgage-payment-date-tracking, Property 2: Payment urgency indicator
 * 
 * **Validates: Requirements 3.2, 3.3**
 * 
 * For any daysUntil value (integer >= 0), the urgency classification SHALL satisfy:
 * 1. daysUntil === 0 → "today" state (isPaymentToday = true)
 * 2. 1 <= daysUntil <= 7 → "soon" state (isPaymentSoon = true, isPaymentToday = false)
 * 3. daysUntil > 7 → "normal" state (no indicator)
 */
describe('Payment Urgency Indicator Property-Based Tests', () => {
  /** daysUntil value: non-negative integer covering realistic range (0 to 365) */
  const daysUntilArb = fc.integer({ min: 0, max: 365 });

  /**
   * **Feature: mortgage-payment-date-tracking, Property 2: Payment urgency indicator**
   * **Validates: Requirements 3.2, 3.3**
   */
  test('Property 2: daysUntil === 0 always classifies as "today"', () => {
    // Requirement 3.3: Payment due today with emphasis styling
    const result = classifyPaymentUrgency(0);
    expect(result.isPaymentToday).toBe(true);
    expect(result.isPaymentSoon).toBe(true); // today is also "soon"
    expect(result.urgency).toBe('today');
  });

  test('Property 2: daysUntil 1-7 always classifies as "soon"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        (daysUntil) => {
          const result = classifyPaymentUrgency(daysUntil);

          // Requirement 3.2: "Due soon" visual indicator within 7 days
          expect(result.isPaymentToday).toBe(false);
          expect(result.isPaymentSoon).toBe(true);
          expect(result.urgency).toBe('soon');
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 2: daysUntil > 7 always classifies as "normal"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 365 }),
        (daysUntil) => {
          const result = classifyPaymentUrgency(daysUntil);

          // No visual indicator when payment is more than 7 days away
          expect(result.isPaymentToday).toBe(false);
          expect(result.isPaymentSoon).toBe(false);
          expect(result.urgency).toBe('normal');
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 2: Urgency classification is exhaustive and mutually exclusive for all non-negative integers', () => {
    fc.assert(
      fc.property(
        daysUntilArb,
        (daysUntil) => {
          const result = classifyPaymentUrgency(daysUntil);

          // Exactly one urgency state must be active
          const states = ['today', 'soon', 'normal'];
          expect(states).toContain(result.urgency);

          // Verify consistency between boolean flags and urgency string
          if (result.urgency === 'today') {
            expect(result.isPaymentToday).toBe(true);
            expect(result.isPaymentSoon).toBe(true);
            expect(daysUntil).toBe(0);
          } else if (result.urgency === 'soon') {
            expect(result.isPaymentToday).toBe(false);
            expect(result.isPaymentSoon).toBe(true);
            expect(daysUntil).toBeGreaterThanOrEqual(1);
            expect(daysUntil).toBeLessThanOrEqual(7);
          } else {
            expect(result.isPaymentToday).toBe(false);
            expect(result.isPaymentSoon).toBe(false);
            expect(daysUntil).toBeGreaterThan(7);
          }
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });
});

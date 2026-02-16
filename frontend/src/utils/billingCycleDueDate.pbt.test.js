/**
 * @invariant Due Date Derivation: For any billing cycle day (1-31) and cycle end date, the derived due date is always after the cycle end date and handles month-end boundaries correctly. Randomization covers diverse day-of-month values and date combinations.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { deriveDueDate } from './billingCycleDueDate';

/**
 * Helper: get the number of days in a given month (1-indexed).
 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Arbitrary: generate a valid YYYY-MM-DD date string and its components.
 */
const cycleDateArb = () =>
  fc.record({
    year: fc.integer({ min: 2000, max: 2099 }),
    month: fc.integer({ min: 1, max: 12 }),
  }).chain(({ year, month }) => {
    const maxDay = daysInMonth(year, month);
    return fc.record({
      year: fc.constant(year),
      month: fc.constant(month),
      day: fc.integer({ min: 1, max: maxDay }),
    });
  }).map(({ year, month, day }) => ({
    dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    year,
    month,
    day,
  }));

const paymentDueDayArb = fc.integer({ min: 1, max: 31 });

describe('deriveDueDate - Property-Based Tests', () => {
  /**
   * Property 3: Due date derivation correctness
   * Feature: credit-card-billing-fixes, Property 3: Due date derivation correctness
   *
   * For any valid cycle_end_date (YYYY-MM-DD) and payment_due_day (1-31),
   * the derived due date should be payment_due_day of the month following
   * cycle_end_date, clamped to the last day of that month.
   *
   * **Validates: Requirements 2.6**
   */
  it('Property 3: derived due date is always in the month following cycle_end_date', () => {
    fc.assert(
      fc.property(
        cycleDateArb(),
        paymentDueDayArb,
        (cycleEnd, paymentDueDay) => {
          const result = deriveDueDate(cycleEnd.dateStr, paymentDueDay);

          // Parse the result
          const [resultYear, resultMonth] = result.split('-').map(Number);

          // Compute expected next month/year
          let expectedYear = cycleEnd.year;
          let expectedMonth = cycleEnd.month + 1;
          if (expectedMonth > 12) {
            expectedMonth = 1;
            expectedYear += 1;
          }

          expect(resultYear).toBe(expectedYear);
          expect(resultMonth).toBe(expectedMonth);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Property 3: day is clamped to last day of month when payment_due_day exceeds month length', () => {
    fc.assert(
      fc.property(
        cycleDateArb(),
        paymentDueDayArb,
        (cycleEnd, paymentDueDay) => {
          const result = deriveDueDate(cycleEnd.dateStr, paymentDueDay);
          const resultDay = parseInt(result.split('-')[2], 10);

          // Compute next month
          let nextYear = cycleEnd.year;
          let nextMonth = cycleEnd.month + 1;
          if (nextMonth > 12) {
            nextMonth = 1;
            nextYear += 1;
          }

          const maxDays = daysInMonth(nextYear, nextMonth);

          if (paymentDueDay > maxDays) {
            // Day should be clamped to last day of month
            expect(resultDay).toBe(maxDays);
          } else {
            // Day should match exactly
            expect(resultDay).toBe(paymentDueDay);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Property 3: when payment_due_day fits within the month, the day matches exactly', () => {
    // Use months that always have 31 days (Jan, Mar, May, Jul, Aug, Oct, Dec)
    // so any payment_due_day 1-31 fits
    const month31Arb = fc.constantFrom(1, 3, 5, 7, 8, 10, 12);

    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2099 }),
        month31Arb,
        paymentDueDayArb,
        (year, monthBefore31, paymentDueDay) => {
          // We need the NEXT month to have 31 days.
          // If monthBefore31 is the month before a 31-day month:
          // Months with 31 days: 1,3,5,7,8,10,12
          // Month before them: 12,2,4,6,7,9,11
          // Instead, pick cycle_end in a month where the FOLLOWING month has 31 days
          const monthsWhere31Follows = [12, 2, 4, 6, 7, 9, 11]; // next months: 1,3,5,7,8,10,12
          const cycleMonth = monthsWhere31Follows[monthBefore31 % monthsWhere31Follows.length];
          const maxDay = daysInMonth(year, cycleMonth);
          const cycleDay = Math.min(15, maxDay); // safe day
          const dateStr = `${year}-${String(cycleMonth).padStart(2, '0')}-${String(cycleDay).padStart(2, '0')}`;

          const result = deriveDueDate(dateStr, paymentDueDay);
          const resultDay = parseInt(result.split('-')[2], 10);

          // The next month has 31 days, so any paymentDueDay 1-31 should match exactly
          expect(resultDay).toBe(paymentDueDay);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Property 3: result is always a valid YYYY-MM-DD date string', () => {
    fc.assert(
      fc.property(
        cycleDateArb(),
        paymentDueDayArb,
        (cycleEnd, paymentDueDay) => {
          const result = deriveDueDate(cycleEnd.dateStr, paymentDueDay);

          // Should match YYYY-MM-DD format
          expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

          // Should be a valid date (parsing it back should give the same components)
          const [y, m, d] = result.split('-').map(Number);
          const parsed = new Date(y, m - 1, d);
          expect(parsed.getFullYear()).toBe(y);
          expect(parsed.getMonth() + 1).toBe(m);
          expect(parsed.getDate()).toBe(d);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Property 3: February clamping for day 29/30/31', () => {
    // Cycle end in January → due date in February
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2099 }),
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 29, max: 31 }),
        (year, janDay, paymentDueDay) => {
          const safeDay = Math.min(janDay, 31);
          const dateStr = `${year}-01-${String(safeDay).padStart(2, '0')}`;
          const result = deriveDueDate(dateStr, paymentDueDay);

          const [resultYear, resultMonth, resultDay] = result.split('-').map(Number);
          const febDays = daysInMonth(year, 2);

          expect(resultYear).toBe(year);
          expect(resultMonth).toBe(2);
          expect(resultDay).toBe(Math.min(paymentDueDay, febDays));
          expect(resultDay).toBeLessThanOrEqual(febDays);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Property 3: December cycle end rolls over to January of next year', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2098 }),
        fc.integer({ min: 1, max: 31 }),
        paymentDueDayArb,
        (year, decDay, paymentDueDay) => {
          const dateStr = `${year}-12-${String(decDay).padStart(2, '0')}`;
          const result = deriveDueDate(dateStr, paymentDueDay);

          const [resultYear, resultMonth, resultDay] = result.split('-').map(Number);

          expect(resultYear).toBe(year + 1);
          expect(resultMonth).toBe(1);
          // January has 31 days, so any paymentDueDay 1-31 fits
          expect(resultDay).toBe(paymentDueDay);
        }
      ),
      { numRuns: 200 }
    );
  });
});

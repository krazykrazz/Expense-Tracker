/**
 * @invariant Statement close date: for any date and close day 1-31, the statement a date falls in is the first
 * close date on or after it, where each month's close date is the close day clamped to the month length. A date
 * and the next day are in the same statement unless the date is a close date itself, and the close date is at
 * most 31 days away. Randomizing dates across month, year and leap-year boundaries and every close day checks
 * the clamping rule against an oracle that walks forward a day at a time, independent of the arithmetic used.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { statementCloseDate } from './statementCycle';

const DAY_MS = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const daysInMonthOf = (ms) => {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
};

/** Walk forward from the date to the first day that is its month's (clamped) close day. */
function oracleClose(dateMs, closeDay) {
  let ms = dateMs;
  for (let steps = 0; steps < 40; steps++, ms += DAY_MS) {
    if (new Date(ms).getUTCDate() === Math.min(closeDay, daysInMonthOf(ms))) return ms;
  }
  throw new Error('no close date found');
}

const arbDate = fc.date({ min: new Date('2019-12-20T00:00:00Z'), max: new Date('2032-01-10T00:00:00Z'), noInvalidDate: true });
const arbCloseDay = fc.integer({ min: 1, max: 31 });

describe('statementCloseDate', () => {
  it('is the first close date on or after the date', () => {
    fc.assert(
      fc.property(arbDate, arbCloseDay, (date, closeDay) => {
        const day = iso(date.getTime());
        const close = statementCloseDate(day, closeDay);
        expect(close).toBe(iso(oracleClose(Date.parse(`${day}T00:00:00Z`), closeDay)));
        expect(close >= day).toBe(true);
      }),
      pbtOptions()
    );
  });

  it('keeps a date and the next day in one statement unless the date is a close date', () => {
    fc.assert(
      fc.property(arbDate, arbCloseDay, (date, closeDay) => {
        const day = iso(date.getTime());
        const next = iso(date.getTime() + DAY_MS);
        const close = statementCloseDate(day, closeDay);
        if (close === day) {
          expect(statementCloseDate(next, closeDay) > close).toBe(true);
        } else {
          expect(statementCloseDate(next, closeDay)).toBe(close);
        }
      }),
      pbtOptions()
    );
  });
});

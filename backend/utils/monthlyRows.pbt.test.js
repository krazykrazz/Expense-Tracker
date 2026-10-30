/**
 * @invariant previousMonth steps back exactly one calendar month for every year/month,
 * including the January rollover. Randomizing the year/month space covers boundaries
 * that hand-picked examples would miss.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { previousMonth } = require('./monthlyRows');

describe('previousMonth (PBT)', () => {
  test('is one month earlier on the month index scale and stays in 1-12', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1900, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        (year, month) => {
          const prev = previousMonth(year, month);
          const index = (y, m) => y * 12 + (m - 1);

          expect(index(prev.year, prev.month)).toBe(index(year, month) - 1);
          expect(prev.month).toBeGreaterThanOrEqual(1);
          expect(prev.month).toBeLessThanOrEqual(12);
        }
      ),
      pbtOptions()
    );
  });
});

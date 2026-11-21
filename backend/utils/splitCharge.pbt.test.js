/**
 * @invariant Split combinations: every combination combinationsAdding returns adds up to exactly the target in
 * cents, has between minSize and MAX_PARTS distinct expenses, and uses each expense at most once; suggestParts
 * returns a combination only when it is the only one. Randomised over amounts in cents and targets built from them.
 */

const fc = require('fast-check');
const { combinationsAdding, suggestParts, MAX_PARTS } = require('./splitCharge');
const { pbtOptions } = require('../test/pbtArbitraries');

const arbAmounts = fc.array(fc.integer({ min: 1, max: 100000 }), { minLength: 1, maxLength: 9 });

describe('splitCharge properties', () => {
  test('every combination adds up exactly to the target and respects the size limits', () => {
    fc.assert(
      fc.property(arbAmounts, fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 2 }), (cents, take, minSize) => {
        const list = cents.map((c, i) => ({ id: i + 1, chargedAmount: c / 100 }));
        const n = Math.min(take, cents.length);
        const target = cents.slice(0, n).reduce((sum, c) => sum + c, 0);

        const found = combinationsAdding(list, target, minSize);

        for (const ids of found) {
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids.length).toBeGreaterThanOrEqual(minSize);
          expect(ids.length).toBeLessThanOrEqual(MAX_PARTS);
          expect(ids.reduce((sum, id) => sum + cents[id - 1], 0)).toBe(target);
        }
        // A combination that exists is found: the first n expenses add up to the target
        if (n >= minSize) expect(found.some(ids => ids.length === n && ids.every((id, i) => id === i + 1))).toBe(true);
      }),
      pbtOptions()
    );
  });

  test('a suggestion is only made when exactly one combination adds up', () => {
    fc.assert(
      fc.property(arbAmounts, fc.integer({ min: 1, max: 4 }), (cents, take) => {
        const list = cents.map((c, i) => ({ id: i + 1, chargedAmount: c / 100 }));
        const target = cents.slice(0, take).reduce((sum, c) => sum + c, 0);

        const found = combinationsAdding(list, target, 1);
        const suggestion = suggestParts(list, target, 1);

        expect(suggestion).toEqual(found.length === 1 ? found[0] : null);
      }),
      pbtOptions()
    );
  });
});

/**
 * Property-based tests for the insurance reimbursement split (spec 3.7).
 *
 * @invariant Amounts add up exactly: for any deposit and any set of picked claims, the pre-filled amounts add up to
 * the deposit to the cent; for any people allocation and any reimbursement up to the claim's original cost, the
 * people's shares add up to the reimbursement and each person's out-of-pocket stays between $0 and their original
 * amount. Randomization covers arbitrary cent amounts, rounding remainders and ties that fixed examples miss.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { prefillSplit, peopleAfter } = require('./insuranceReimbursement');

const cents = (dollars) => Math.round(dollars * 100);
const centsArb = (min, max) => fc.integer({ min, max }).map(c => c / 100);

const claimArb = fc.record({
  originalCost: centsArb(1, 500000),
  outOfPocket: centsArb(0, 50000),
  claimStatus: fc.constantFrom('in_progress', 'not_claimed', 'paid'),
  reimbursed: centsArb(0, 10000)
});

describe('insuranceReimbursement - property-based', () => {
  test('pre-filled amounts always add up to the deposit', () => {
    fc.assert(
      fc.property(centsArb(1, 1000000), fc.array(claimArb, { minLength: 1, maxLength: 8 }), (deposit, claims) => {
        const picked = claims.map((claim, i) => ({ ...claim, expenseId: i + 1 }));
        const split = prefillSplit(deposit, picked);
        expect(split.map(s => s.expenseId)).toEqual(picked.map(c => c.expenseId));
        expect(split.reduce((sum, s) => sum + cents(s.amount), 0)).toBe(cents(deposit));
        expect(split.every(s => s.amount >= 0)).toBe(true);
      }),
      pbtOptions()
    );
  });

  test('people shares add up to the reimbursement and stay within 0..original', () => {
    const peopleArb = fc.array(
      fc.record({ originalAmount: fc.option(centsArb(0, 200000), { nil: null }), amount: centsArb(0, 200000) }),
      { minLength: 1, maxLength: 6 }
    );
    fc.assert(
      fc.property(peopleArb, fc.double({ min: 0, max: 1, noNaN: true }), (rawPeople, fraction) => {
        const people = rawPeople.map((person, i) => ({ ...person, personId: i + 1 }));
        const originals = people.map(p => cents(p.originalAmount ?? p.amount));
        const originalCost = originals.reduce((sum, c) => sum + c, 0) / 100;
        const reimbursed = Math.floor(cents(originalCost) * fraction) / 100;

        const result = peopleAfter(people, originalCost, reimbursed);
        expect(result.reduce((sum, p) => sum + cents(p.reimbursed), 0)).toBe(cents(reimbursed));
        result.forEach((p, i) => {
          expect(cents(p.amount)).toBeGreaterThanOrEqual(0);
          expect(cents(p.amount)).toBeLessThanOrEqual(originals[i]);
          expect(cents(p.amount) + cents(p.reimbursed)).toBe(originals[i]);
        });
      }),
      pbtOptions()
    );
  });
});

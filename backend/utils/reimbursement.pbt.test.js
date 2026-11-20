/**
 * @invariant Applying a bank amount to an expense conserves money in whole cents: what the expense costs out of
 * pocket afterwards plus what the bank row took off it equals what it cost before; the result is never negative; a
 * request for more than is left is refused (never clamped); and an expense already entered by hand is never changed.
 * Ranking never lists an expense with nothing left to reimburse and orders candidates by non-increasing fit.
 * Randomizing cents (float noise around cent boundaries), original costs and bank amounts exercises edges a few
 * examples miss.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { planApply, enteredPoolCents, rankDeposit, rankRefund } = require('./reimbursement');

const cents = (n) => Math.round(n * 100);
const arbCents = fc.integer({ min: 0, max: 5_000_000 });

describe('planApply', () => {
  test('conserves cents, never goes negative, and refuses more than is left', () => {
    fc.assert(
      fc.property(arbCents, fc.integer({ min: 1, max: 5_000_000 }), fc.option(arbCents, { nil: null }), (outOfPocket, applied, originalExtra) => {
        const expense = {
          amount: outOfPocket / 100 + 0.0000001,
          originalCost: originalExtra === null ? null : (outOfPocket + originalExtra) / 100
        };
        const plan = planApply(expense, applied);

        if (applied > outOfPocket) {
          expect(plan).toEqual({ error: 'over', leftCents: outOfPocket });
        } else {
          expect(plan.appliedCents).toBe(applied);
          expect(cents(plan.amount) + plan.appliedCents).toBe(outOfPocket);
          expect(plan.amount).toBeGreaterThanOrEqual(0);
          // The charge is remembered: the original cost is kept when set, else it is what the expense cost
          expect(cents(plan.originalCost)).toBe(originalExtra === null ? outOfPocket : cents(expense.originalCost));
        }
      }),
      pbtOptions()
    );
  });

  test('an expense already entered by hand is never changed, and only when the entered amount covers the bank amount', () => {
    fc.assert(
      fc.property(arbCents, arbCents, fc.integer({ min: 1, max: 5_000_000 }), fc.integer({ min: 0, max: 5_000_000 }), (outOfPocket, entered, bankAmount, appliedByBank) => {
        const original = outOfPocket + entered + appliedByBank;
        const expense = { amount: outOfPocket / 100, originalCost: original / 100, appliedByBank: appliedByBank / 100 };
        const plan = planApply(expense, bankAmount, true);

        expect(enteredPoolCents(expense)).toBe(entered);
        if (bankAmount > entered) {
          expect(plan).toEqual({ error: 'notEntered', leftCents: entered });
        } else {
          expect(plan).toEqual({ appliedCents: 0, amount: expense.amount, originalCost: expense.originalCost });
        }
      }),
      pbtOptions()
    );
  });
});

describe('ranking', () => {
  const arbExpense = fc.record({
    id: fc.integer({ min: 1, max: 1000 }),
    date: fc.constantFrom('2026-10-01', '2026-10-15', '2026-11-01', '2026-11-10'),
    place: fc.constantFrom('Dinner', 'Jordan lunch', 'Gift', 'Hockey', null),
    amount: arbCents.map(n => n / 100),
    originalCost: fc.constantFrom(null, 100, 250)
  });

  test('a deposit never lists an expense with nothing left, and orders by non-increasing fit', () => {
    fc.assert(
      fc.property(fc.array(arbExpense, { maxLength: 25 }), fc.integer({ min: 1, max: 10_000 }), (expenses, depositCents) => {
        const unique = expenses.map((e, i) => ({ ...e, id: i + 1 }));
        const ranked = rankDeposit(unique, depositCents, { name: 'Interac e-Transfer from Jordan', merchantName: null }, new Set(['hockey']));

        expect(ranked.every(e => cents(e.amount) > 0)).toBe(true);
        expect(ranked).toHaveLength(unique.filter(e => cents(e.amount) > 0).length);
        const weight = { learned: 16, entered: 8, exact: 4, half: 2, name: 1 };
        const scores = ranked.map(e => e.tags.reduce((sum, tag) => sum + weight[tag], 0));
        expect(scores).toEqual([...scores].sort((a, b) => b - a));
      }),
      pbtOptions()
    );
  });

  test('a refund never lists a purchase charged less than the refund', () => {
    fc.assert(
      fc.property(fc.array(arbExpense, { maxLength: 25 }), fc.integer({ min: 1, max: 10_000 }), (expenses, refundCents) => {
        const unique = expenses.map((e, i) => ({ ...e, id: i + 1, place: 'HomeSense' }));
        const ranked = rankRefund(unique, refundCents, { name: 'HOMESENSE #12', merchantName: 'HomeSense' }, 'HomeSense');

        for (const e of ranked) expect(cents(e.originalCost ?? e.amount)).toBeGreaterThanOrEqual(refundCents);
        expect(ranked.length).toBe(unique.filter(e => cents(e.originalCost ?? e.amount) >= refundCents).length);
      }),
      pbtOptions()
    );
  });
});

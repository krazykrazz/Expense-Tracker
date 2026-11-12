import { describe, it, expect } from 'vitest';
import { claimAfter, prefillSplit, proportionalCents } from './insuranceSplit';

// The DSF deposit of 2026-11-12: $105.30 for the Carp Chiro claim ($117.00 original, $11.70 co-pay, two people)
const carpChiro = {
  expenseId: 25378, originalCost: 117, outOfPocket: 11.7, reimbursed: 0, expectedPayout: 105.3,
  people: [
    { personId: 1, name: 'Amara', originalAmount: 61, amount: 6.1 },
    { personId: 2, name: 'Joliet', originalAmount: 56, amount: 5.6 }
  ]
};

describe('insuranceSplit', () => {
  it('the DSF deposit leaves the co-pay and each person\'s share as entered', () => {
    expect(prefillSplit(10530, [carpChiro])).toEqual({ 25378: 105.3 });
    expect(claimAfter(carpChiro, 105.3)).toEqual({
      outOfPocket: 11.7,
      over: false,
      people: [{ personId: 1, name: 'Amara', amount: 6.1 }, { personId: 2, name: 'Joliet', amount: 5.6 }]
    });
  });

  it('several claims take their expected payouts when those add up to the deposit, else shares of the original costs', () => {
    const a = { expenseId: 1, originalCost: 100, expectedPayout: 90 };
    const b = { expenseId: 2, originalCost: 50, expectedPayout: 45 };

    expect(prefillSplit(13500, [a, b])).toEqual({ 1: 90, 2: 45 });
    // $100.01 doesn't match the payouts: split 2:1 by original cost (66.6733 / 33.3367), the extra cent to the larger remainder
    expect(prefillSplit(10001, [a, b])).toEqual({ 1: 66.67, 2: 33.34 });
  });

  it('proportional cents always add up, the extra cents going to the largest remainders', () => {
    expect(proportionalCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(proportionalCents(1, [0, 0])).toEqual([1, 0]);
    expect(proportionalCents(0, [5, 5])).toEqual([0, 0]);
    expect(proportionalCents(5, [])).toEqual([]);
  });

  it('a full reimbursement leaves $0.00, and more than is still open is flagged', () => {
    const cheo = { originalCost: 20, reimbursed: 0, people: [] };

    expect(claimAfter(cheo, 20)).toMatchObject({ outOfPocket: 0, over: false });
    expect(claimAfter(cheo, 20.01)).toMatchObject({ over: true });
    expect(claimAfter({ ...cheo, reimbursed: 15 }, 6)).toMatchObject({ over: true });
  });

  it('a second plan paying the co-pay of a claim marked Paid by hand leaves $0.00 (the server sends what is still open)', () => {
    const paid = { originalCost: 117, unreimbursed: 11.7, people: carpChiro.people };

    expect(claimAfter(paid, 11.7)).toEqual({
      outOfPocket: 0, over: false,
      people: [{ personId: 1, name: 'Amara', amount: 0 }, { personId: 2, name: 'Joliet', amount: 0 }]
    });
    expect(claimAfter(paid, 11.71)).toMatchObject({ over: true });
  });

  it('people whose original amounts cover only part of the claim get only that part of the reimbursement', () => {
    // $100 claim, one person allocated $50 of it: half of the $90 reimbursed is theirs
    const partial = { originalCost: 100, unreimbursed: 100, people: [{ personId: 1, name: 'Amara', originalAmount: 50, amount: 5 }] };

    expect(claimAfter(partial, 90).people).toEqual([{ personId: 1, name: 'Amara', amount: 5 }]);
  });
});

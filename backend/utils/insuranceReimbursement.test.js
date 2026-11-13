const {
  expectedPayout, rankClaims, prefillSplit, outOfPocketAfter, claimBaseline, peopleAfter
} = require('./insuranceReimbursement');

const claim = (expenseId, extra = {}) => ({
  expenseId, date: '2026-11-01', claimStatus: 'in_progress', originalCost: 100, outOfPocket: 10, reimbursed: 0, ...extra
});

describe('insuranceReimbursement', () => {
  describe('expectedPayout', () => {
    test.each([
      ['open claim: original − out-of-pocket − reimbursed', { originalCost: 117, outOfPocket: 11.7 }, 105.3],
      ['open claim already partly reimbursed', { originalCost: 100, outOfPocket: 10, reimbursed: 40 }, 50],
      ['paid claim: the remaining out-of-pocket', { claimStatus: 'paid', originalCost: 100, outOfPocket: 10 }, 10],
      ['never below zero', { originalCost: 100, outOfPocket: 100, reimbursed: 5 }, 0],
      ['no original cost: the amount', { originalCost: null, outOfPocket: 20 }, 0]
    ])('%s', (_label, extra, expected) => {
      expect(expectedPayout(claim(1, extra))).toBe(expected);
    });
  });

  describe('rankClaims', () => {
    test('the DSF deposit ranks the Carp Chiro claim exact', () => {
      const ranked = rankClaims(105.3, [
        claim(1, { date: '2026-10-01', claimStatus: 'not_claimed' }),
        claim(2, { date: '2026-11-10', originalCost: 117, outOfPocket: 11.7 })
      ]);
      expect(ranked.map(c => [c.expenseId, c.rank])).toEqual([[2, 'exact'], [1, null]]);
      expect(ranked[0].expectedPayout).toBe(105.3);
    });

    test('ranks the unique combination next, then In progress before Not claimed, oldest first, Paid last', () => {
      const ranked = rankClaims(120, [
        claim(1, { claimStatus: 'paid', date: '2026-01-01' }),
        claim(2, { claimStatus: 'not_claimed', date: '2026-02-01', originalCost: 50, outOfPocket: 5 }),
        claim(3, { claimStatus: 'not_claimed', date: '2026-03-01', originalCost: 80, outOfPocket: 5 }),
        claim(4, { claimStatus: 'in_progress', date: '2026-04-01', originalCost: 50, outOfPocket: 5 }),
        claim(5, { claimStatus: 'in_progress', date: '2026-01-15', originalCost: 20, outOfPocket: 20 })
      ]);
      // payouts: 2 → 45, 3 → 75, 4 → 45, 5 → 0; 45 + 75 = 120 twice (2+3, 4+3): not unique
      expect(ranked.every(c => c.rank === null)).toBe(true);
      expect(ranked.map(c => c.expenseId)).toEqual([5, 4, 2, 3, 1]);

      const unique = rankClaims(120, [
        claim(2, { claimStatus: 'not_claimed', date: '2026-02-01', originalCost: 50, outOfPocket: 5 }),
        claim(3, { claimStatus: 'not_claimed', date: '2026-03-01', originalCost: 80, outOfPocket: 5 }),
        claim(4, { claimStatus: 'in_progress', date: '2026-04-01', originalCost: 60, outOfPocket: 5 })
      ]);
      expect(unique.map(c => [c.expenseId, c.rank])).toEqual([[2, 'combination'], [3, 'combination'], [4, null]]);
    });

    test('no combination is tried over more than 12 open claims', () => {
      const claims = [
        claim(1, { originalCost: 100, outOfPocket: 0 }),
        claim(2, { originalCost: 200, outOfPocket: 0 }),
        ...Array.from({ length: 11 }, (_, i) => claim(i + 3, { originalCost: 1000, outOfPocket: 0 }))
      ];
      expect(rankClaims(300, claims).every(c => c.rank === null)).toBe(true);
      expect(rankClaims(300, claims.slice(0, 12)).filter(c => c.rank === 'combination').map(c => c.expenseId)).toEqual([1, 2]);
    });
  });

  describe('prefillSplit', () => {
    test('one claim takes the whole deposit', () => {
      expect(prefillSplit(105.3, [claim(1)])).toEqual([{ expenseId: 1, amount: 105.3 }]);
    });

    test('payouts that add up to the deposit are used as they are', () => {
      expect(prefillSplit(135, [claim(1), claim(2, { originalCost: 50, outOfPocket: 5 })]))
        .toEqual([{ expenseId: 1, amount: 90 }, { expenseId: 2, amount: 45 }]);
    });

    test('otherwise in proportion to the original costs, leftover cents to the largest', () => {
      expect(prefillSplit(100, [claim(1, { originalCost: 200 }), claim(2, { originalCost: 100 })]))
        .toEqual([{ expenseId: 1, amount: 66.67 }, { expenseId: 2, amount: 33.33 }]);
    });
  });

  describe('outOfPocketAfter and peopleAfter', () => {
    test('claimBaseline: a claim Paid before the bank was reimbursed outside it; an open one was not', () => {
      expect(claimBaseline({ originalCost: 117, outOfPocket: 11.7, claimStatus: 'paid', reimbursed: 0 }))
        .toMatchObject({ original: 117, outsideBank: 105.3, unreimbursed: 11.7 });
      expect(claimBaseline({
        originalCost: 200, outOfPocket: 100, claimStatus: 'paid', reimbursed: 100,
        linkCount: 1, firstPreviousAmount: 20, firstPreviousStatus: 'not_claimed'
      })).toMatchObject({ beforeAmount: 20, beforeStatus: 'not_claimed', outsideBank: 0, unreimbursed: 100 });
    });
    test('DSF: out-of-pocket and people amounts stay as entered', () => {
      expect(outOfPocketAfter(117, 105.3)).toBe(11.7);
      expect(peopleAfter([
        { personId: 1, originalAmount: 61, amount: 6.1 },
        { personId: 2, originalAmount: 56, amount: 5.6 }
      ], 117, 105.3)).toEqual([
        { personId: 1, amount: 6.1, reimbursed: 54.9 },
        { personId: 2, amount: 5.6, reimbursed: 50.4 }
      ]);
    });

    test('a full reimbursement leaves $0.00; an insurer paying less raises the out-of-pocket', () => {
      expect(outOfPocketAfter(20, 20)).toBe(0);
      expect(outOfPocketAfter(117, 90)).toBe(27);
    });

    test('shares add up to the reimbursement, extra cents to the largest remainder; null originals use the amount', () => {
      const result = peopleAfter([
        { personId: 1, originalAmount: null, amount: 10 },
        { personId: 2, originalAmount: 10, amount: 1 },
        { personId: 3, originalAmount: 10, amount: 1 }
      ], 30, 10);
      expect(result.reduce((sum, p) => sum + Math.round(p.reimbursed * 100), 0)).toBe(1000);
      expect(result.map(p => p.amount)).toEqual([6.66, 6.67, 6.67]);
    });
  });
});

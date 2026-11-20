const { sharesName, sameMerchant, rankRefund, rankDeposit, suggestedAmount, enteredPoolCents, chargedOf } = require('./reimbursement');

describe('reimbursement rules', () => {
  test('the charge is the original cost when there is one', () => {
    expect(chargedOf({ amount: 6.1, originalCost: 61 })).toBe(61);
    expect(chargedOf({ amount: 6.1, originalCost: null })).toBe(6.1);
  });

  test('what was entered by hand excludes what bank rows account for', () => {
    expect(enteredPoolCents({ amount: 36.26, originalCost: 50, repaidByBank: 0 })).toBe(1374);
    expect(enteredPoolCents({ amount: 40, originalCost: 100, repaidByBank: 20 })).toBe(4000);
    expect(enteredPoolCents({ amount: 50, originalCost: null })).toBe(0);
    expect(enteredPoolCents({ amount: 80, originalCost: 70 })).toBe(0);
  });

  test.each([
    ['Interac e-Transfer from Jordan Lee', { place: 'Dinner with Jordan', notes: null }, true],
    ['Interac e-Transfer from Jordan Lee', { place: 'Dinner', notes: 'split with jordan' }, true],
    // Generic transfer wording never counts, and short words or numbers neither
    ['Interac e-Transfer from Sam', { place: 'Interac fee', notes: 'transfer' }, false],
    ['E-TRANSFER 4521', { place: 'Order 4521', notes: null }, false],
    ['', { place: 'Dinner', notes: null }, false]
  ])('"%s" shares a name with %j: %s', (bankName, expense, expected) => {
    expect(sharesName(expense, { name: bankName })).toBe(expected);
  });

  test('the same merchant by id, by the place the description maps to, or by its first word', () => {
    const txn = { name: 'HOMESENSE #123 KANATA', merchantName: 'HomeSense', merchantEntityId: 'ent-1' };
    expect(sameMerchant({ place: 'Anything', merchantEntityId: 'ent-1' }, txn, 'HomeSense')).toBe(true);
    expect(sameMerchant({ place: 'Home Sense', merchantEntityId: null }, txn, 'HomeSense')).toBe(true);
    expect(sameMerchant({ place: 'HomeSense Kanata', merchantEntityId: null }, txn, 'Somewhere')).toBe(true);
    expect(sameMerchant({ place: 'Sobeys', merchantEntityId: 'ent-2' }, txn, 'HomeSense')).toBe(false);
    expect(sameMerchant({ place: null, merchantEntityId: null }, txn, 'HomeSense')).toBe(false);
  });

  test('refunds: the entered reimbursement first, then the merchant, then the newest; other merchants only on request', () => {
    const txn = { name: 'HOMESENSE #1', merchantName: 'HomeSense' };
    const expenses = [
      { id: 1, date: '2026-11-10', place: 'HomeSense', amount: 50, originalCost: null },
      { id: 2, date: '2026-11-01', place: 'HomeSense', amount: 36.26, originalCost: 50 },
      { id: 3, date: '2026-11-12', place: 'Sobeys', amount: 80, originalCost: null },
      { id: 4, date: '2026-11-11', place: 'HomeSense', amount: 5, originalCost: null }
    ];

    expect(rankRefund(expenses, 1374, txn, 'HomeSense').map(e => e.id)).toEqual([2, 1]);
    expect(rankRefund(expenses, 1374, txn, 'HomeSense', { all: true }).map(e => e.id)).toEqual([2, 1, 3]);
  });

  test('deposits: a deposit that fits nothing is still ranked, with no tags', () => {
    const [only] = rankDeposit([{ id: 1, date: '2026-11-01', place: 'Groceries', notes: null, amount: 70, originalCost: null }], 2500, { name: 'Interac e-Transfer from Sam' });
    expect(only.tags).toEqual([]);
  });

  test('what to pre-fill: the deposit, or what is left, or the entered amount as it is', () => {
    expect(suggestedAmount({ amount: 80, originalCost: null, tags: [] }, 2500)).toBe(25);
    expect(suggestedAmount({ amount: 10, originalCost: null, tags: [] }, 2500)).toBe(10);
    expect(suggestedAmount({ amount: 75, originalCost: 100, tags: ['entered'] }, 2500)).toBe(25);
  });
});

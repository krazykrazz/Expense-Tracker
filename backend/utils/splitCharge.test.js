const { chargedCents, combinationsAdding, suggestParts, MAX_PARTS } = require('./splitCharge');

const expenses = (...amounts) => amounts.map((amount, i) => ({ id: i + 1, chargedAmount: amount }));

describe('chargedCents', () => {
  test('is the charged amount, else the original cost, else the amount, in cents', () => {
    expect(chargedCents({ chargedAmount: 244.02, amount: 1 })).toBe(24402);
    expect(chargedCents({ originalCost: 60, amount: 20 })).toBe(6000);
    expect(chargedCents({ amount: 82.47 })).toBe(8247);
  });
});

describe('combinationsAdding / suggestParts', () => {
  test('finds the production split: $244.02 + $82.47 = $326.49', () => {
    const list = expenses(244.02, 82.47, 50);
    expect(combinationsAdding(list, 32649, 2)).toEqual([[1, 2]]);
    expect(suggestParts(list, 32649, 2)).toEqual([1, 2]);
  });

  test('suggests only a unique combination', () => {
    expect(suggestParts(expenses(60, 40, 70, 30), 10000, 2)).toBeNull();
    expect(suggestParts(expenses(60, 41), 10000, 2)).toBeNull();
    expect(suggestParts(expenses(60, 40, 5), 10000, 2)).toEqual([1, 2]);
  });

  test('honours the smallest combination size: a single expense is a plain match, not a split', () => {
    expect(suggestParts(expenses(100, 30), 10000, 2)).toBeNull();
    expect(suggestParts(expenses(100, 30), 10000, 1)).toEqual([1]);
  });

  test('adds up cents exactly (no float drift)', () => {
    expect(suggestParts(expenses(0.1, 0.2), 30, 2)).toEqual([1, 2]);
    expect(suggestParts(expenses(0.1, 0.2), 31, 2)).toBeNull();
  });

  test('stops at the largest combination size', () => {
    const five = expenses(10, 10, 10, 10, 10);
    expect(MAX_PARTS).toBe(4);
    expect(combinationsAdding(five, 5000, 2)).toEqual([]);
    expect(combinationsAdding(five, 4000, 2)).toHaveLength(5);
  });
});

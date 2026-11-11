const {
  monthIndex, monthIndexOfDate, monthWindow, descriptionKey, PENDING_AMOUNT_TOLERANCE
} = require('./plaidMatching');
const { toCents, round2 } = require('./money');
const { fail } = require('./httpError');

describe('shared ranking helpers', () => {
  test('month indexes are consecutive across a year end', () => {
    expect(monthIndexOfDate('2026-12-31') + 1).toBe(monthIndexOfDate('2027-01-01'));
    expect(monthIndexOfDate('2026-11-15')).toBe(monthIndex(2026, 11));
  });

  test.each([
    [['2026-11-05'], 0, ['2026-11', '2026-11']],
    [['2026-11-05'], 1, ['2026-10', '2026-12']],
    [['2026-12-30', '2026-11-02', '2027-01-01'], 1, ['2026-10', '2027-02']]
  ])('monthWindow(%j, %i) covers %j', (dates, margin, [from, to]) => {
    const [fromIdx, toIdx] = monthWindow(dates, margin);
    expect(fromIdx).toBe(monthIndexOfDate(`${from}-01`));
    expect(toIdx).toBe(monthIndexOfDate(`${to}-01`));
  });

  test.each([
    [{ merchantName: '  JAT Payroll ', name: 'JAT - Direct deposit' }, 'jat payroll'],
    [{ merchantName: null, name: 'JAT - Direct Deposit ' }, 'jat - direct deposit'],
    [{ merchantName: '', name: 'Spencer' }, 'spencer'],
    [{ merchantName: null, name: null }, '']
  ])('descriptionKey(%j) is %j', (txn, key) => {
    expect(descriptionKey(txn)).toBe(key);
  });

  test('a pending charge may settle within a quarter of its amount (tip, gas hold)', () => {
    expect(PENDING_AMOUNT_TOLERANCE).toBe(0.25);
  });
});

describe('money', () => {
  test('compares in whole cents and rounds to the cent', () => {
    expect(toCents(0.1 + 0.2)).toBe(toCents(0.3));
    expect(toCents('12.345')).toBe(1235);
    expect(round2(10.005 + 0.001)).toBe(10.01);
    expect(round2(-3.456)).toBe(-3.46);
  });
});

describe('httpError', () => {
  test('carries the status code and any extra fields', () => {
    const err = fail('Bank connection not found', 404, { errorCode: 'ITEM_NOT_FOUND' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ message: 'Bank connection not found', statusCode: 404, errorCode: 'ITEM_NOT_FOUND' });
  });
});

const { previousMonth, loadWithCarryForward, copyRows } = require('./monthlyRows');

describe('previousMonth', () => {
  test.each([
    [2025, 6, { year: 2025, month: 5 }],
    [2025, 1, { year: 2024, month: 12 }],
    [2025, 12, { year: 2025, month: 11 }],
  ])('previousMonth(%i, %i)', (year, month, expected) => {
    expect(previousMonth(year, month)).toEqual(expected);
  });
});

describe('loadWithCarryForward', () => {
  const pick = ({ name, amount }) => ({ name, amount });

  test('returns the month\'s own rows without looking at the previous month', async () => {
    const findRows = jest.fn().mockResolvedValue([{ id: 1, name: 'RRSP', amount: 100 }]);

    const rows = await loadWithCarryForward(findRows, 2025, 3, pick);

    expect(rows).toEqual([{ id: 1, name: 'RRSP', amount: 100 }]);
    expect(findRows).toHaveBeenCalledTimes(1);
  });

  test('carries the previous month forward as transient rows without ids', async () => {
    const findRows = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 9, name: 'TFSA', amount: 250, created_at: 'x' }]);

    const rows = await loadWithCarryForward(findRows, 2025, 1, pick);

    expect(findRows).toHaveBeenLastCalledWith(2024, 12);
    expect(rows).toEqual([{ name: 'TFSA', amount: 250, year: 2025, month: 1, carriedForward: true }]);
  });

  test('returns an empty array when neither month has rows', async () => {
    const findRows = jest.fn().mockResolvedValue([]);

    expect(await loadWithCarryForward(findRows, 2025, 5, pick)).toEqual([]);
  });
});

describe('copyRows', () => {
  const keyOf = row => row.name;
  const source = [{ name: 'A', amount: 1 }, { name: 'B', amount: 2 }];

  test('creates rows missing from the target month', async () => {
    const create = jest.fn().mockResolvedValue();
    const update = jest.fn();

    const result = await copyRows({ sourceRows: source, existingRows: [], keyOf, create, update, overwrite: false });

    expect(result).toEqual({ copied: 2, skipped: 0, overwritten: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  test('skips existing rows unless overwrite is set', async () => {
    const create = jest.fn().mockResolvedValue();
    const update = jest.fn().mockResolvedValue();
    const existingRows = [{ id: 5, name: 'A', amount: 9 }];

    const kept = await copyRows({ sourceRows: source, existingRows, keyOf, create, update, overwrite: false });
    expect(kept).toEqual({ copied: 1, skipped: 1, overwritten: 0 });

    const replaced = await copyRows({ sourceRows: source, existingRows, keyOf, create, update, overwrite: true });
    expect(replaced).toEqual({ copied: 1, skipped: 0, overwritten: 1 });
    expect(update).toHaveBeenCalledWith(existingRows[0], source[0]);
  });

  test('counts a failing create as skipped instead of aborting', async () => {
    const create = jest.fn().mockRejectedValueOnce(new Error('UNIQUE')).mockResolvedValue();

    const result = await copyRows({ sourceRows: source, existingRows: [], keyOf, create, update: jest.fn(), overwrite: false });

    expect(result).toEqual({ copied: 1, skipped: 1, overwritten: 0 });
  });
});

/**
 * Integration tests: allocationService -> allocationRepository -> real SQLite.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db');
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const allocationService = require('./allocationService');

let db;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { return err ? reject(err) : resolve(this.lastID); });
});

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM budget_allocations');
  await run('DELETE FROM investments');
});

describe('allocationService', () => {
  describe('createAllocation', () => {
    test('persists a named allocation and logs a budget-entity activity event', async () => {
      const created = await allocationService.createAllocation(2090, 3, { name: ' Emergency Fund ', amount: '250.505' }, 'tab-1');

      expect(created).toMatchObject({ year: 2090, month: 3, name: 'Emergency Fund', amount: 250.51, investmentId: null });
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'budget_allocation_added', 'budget', created.id, expect.stringContaining('Emergency Fund'),
        expect.objectContaining({ tabId: 'tab-1' })
      );
    });

    test('takes the name from a linked investment account when none is given', async () => {
      const investmentId = await run("INSERT INTO investments (name, type, initial_value) VALUES ('My TFSA', 'TFSA', 0)");

      const created = await allocationService.createAllocation(2090, 3, { amount: 100, investmentId });

      expect(created).toMatchObject({ name: 'My TFSA', investmentId });
    });

    test.each([
      [{ name: 'RRSP', amount: 0 }, 'greater than zero'],
      [{ name: 'RRSP', amount: -5 }, 'greater than zero'],
      [{ name: 'RRSP', amount: 'abc' }, 'greater than zero'],
      [{ name: '  ', amount: 10 }, 'name is required'],
      [{ name: 'x'.repeat(101), amount: 10 }, 'at most 100'],
      [{ name: 'RRSP', amount: 10, investmentId: 99999 }, 'investment account not found'],
    ])('rejects invalid input %j with a 400', async (data, message) => {
      await expect(allocationService.createAllocation(2090, 3, data))
        .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining(message) });
    });

    test('rejects an invalid month with a 400', async () => {
      await expect(allocationService.createAllocation(2090, 13, { name: 'RRSP', amount: 10 }))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    test('rejects a duplicate name in the same month with a 409', async () => {
      await allocationService.createAllocation(2090, 3, { name: 'RRSP', amount: 10 });

      await expect(allocationService.createAllocation(2090, 3, { name: 'RRSP', amount: 20 }))
        .rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('updateAllocation / deleteAllocation', () => {
    test('updates amount only, keeping the name, and logs the change', async () => {
      const created = await allocationService.createAllocation(2090, 3, { name: 'RRSP', amount: 100 });

      const updated = await allocationService.updateAllocation(created.id, { amount: 150 }, 'tab-2');

      expect(updated).toMatchObject({ name: 'RRSP', amount: 150 });
      expect(activityLogService.logEvent).toHaveBeenLastCalledWith(
        'budget_allocation_updated', 'budget', created.id, expect.stringContaining('$100.00 → $150.00'),
        expect.objectContaining({ tabId: 'tab-2' })
      );
    });

    test('returns 404 when updating or deleting an unknown id', async () => {
      await expect(allocationService.updateAllocation(12345, { amount: 1 })).rejects.toMatchObject({ statusCode: 404 });
      await expect(allocationService.deleteAllocation(12345)).rejects.toMatchObject({ statusCode: 404 });
    });

    test('deletes an allocation and logs it', async () => {
      const created = await allocationService.createAllocation(2090, 3, { name: 'RRSP', amount: 100 });

      await allocationService.deleteAllocation(created.id);

      expect(await allocationService.getAllocations(2090, 3)).toEqual([]);
      expect(activityLogService.logEvent).toHaveBeenLastCalledWith(
        'budget_allocation_deleted', 'budget', created.id, expect.any(String), expect.any(Object)
      );
    });

    test('unlinks (does not delete) the allocation when its investment is removed', async () => {
      const investmentId = await run("INSERT INTO investments (name, type, initial_value) VALUES ('RRSP Acct', 'RRSP', 0)");
      const created = await allocationService.createAllocation(2090, 3, { amount: 100, investmentId });

      await run('DELETE FROM investments WHERE id = ?', [investmentId]);

      const [allocation] = await allocationService.getAllocations(2090, 3);
      expect(allocation).toMatchObject({ id: created.id, name: 'RRSP Acct', investmentId: null });
    });
  });

  describe('carry-forward', () => {
    test('shows the previous month as transient rows without persisting them', async () => {
      await allocationService.createAllocation(2090, 12, { name: 'TFSA', amount: 300 });

      const carried = await allocationService.getAllocations(2091, 1);

      expect(carried).toEqual([expect.objectContaining({ name: 'TFSA', amount: 300, year: 2091, month: 1, carriedForward: true })]);
      expect(carried[0].id).toBeUndefined();
      expect(await allocationService.getAllocationTotal(2091, 1)).toBe(300);
      expect(await new Promise(resolve => db.get(
        'SELECT COUNT(*) AS cnt FROM budget_allocations WHERE year = 2091', (e, row) => resolve(row.cnt)
      ))).toBe(0);
    });

    test('does not carry forward once the month has its own allocations', async () => {
      await allocationService.createAllocation(2090, 5, { name: 'TFSA', amount: 300 });
      await allocationService.createAllocation(2090, 6, { name: 'RRSP', amount: 50 });

      expect(await allocationService.getAllocationTotal(2090, 6)).toBe(50);
    });
  });

  describe('copyAllocations', () => {
    test('persists carried-forward allocations into the target month', async () => {
      await allocationService.createAllocation(2090, 7, { name: 'TFSA', amount: 300 });
      await allocationService.createAllocation(2090, 7, { name: 'RRSP', amount: 100 });

      const result = await allocationService.copyAllocations(2090, 7, 2090, 8);

      expect(result).toEqual({ copied: 2, skipped: 0, overwritten: 0 });
      const persisted = await allocationService.getAllocations(2090, 8);
      expect(persisted.every(a => a.carriedForward === undefined && a.id)).toBe(true);
      expect(persisted.map(a => a.name).sort()).toEqual(['RRSP', 'TFSA']);
    });

    test('keeps existing target rows unless overwrite is set', async () => {
      await allocationService.createAllocation(2090, 9, { name: 'TFSA', amount: 300 });
      await allocationService.createAllocation(2090, 10, { name: 'TFSA', amount: 10 });

      expect(await allocationService.copyAllocations(2090, 9, 2090, 10, false))
        .toEqual({ copied: 0, skipped: 1, overwritten: 0 });
      expect(await allocationService.getAllocationTotal(2090, 10)).toBe(10);

      expect(await allocationService.copyAllocations(2090, 9, 2090, 10, true))
        .toEqual({ copied: 0, skipped: 0, overwritten: 1 });
      expect(await allocationService.getAllocationTotal(2090, 10)).toBe(300);
    });
  });
});

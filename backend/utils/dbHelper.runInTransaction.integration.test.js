/**
 * Integration tests: dbHelper.runInTransaction on the app's single shared connection.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));

const { getDatabase } = require('../database/db');
const { runInTransaction } = require('./dbHelper');

let db;

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});
const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { return err ? reject(err) : resolve(this.lastID); });
});
// Rows are `settings` entries with a test prefix
const names = async () => (await new Promise((resolve, reject) => {
  db.all("SELECT key FROM settings WHERE key LIKE 'tx-test:%' ORDER BY rowid", (err, rows) => (err ? reject(err) : resolve(rows)));
})).map(row => row.key.slice('tx-test:'.length));
const insert = (tx, name) => tx.run("INSERT INTO settings (key, value) VALUES (?, 'x')", [`tx-test:${name}`]);
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(() => run("DELETE FROM settings WHERE key LIKE 'tx-test:%'"));

describe('runInTransaction', () => {
  test('commits what the callback wrote and returns its result', async () => {
    const result = await runInTransaction(async (tx) => {
      await insert(tx, 'a');
      return 'done';
    });

    expect(result).toBe('done');
    expect(await names()).toEqual(['a']);
  });

  test('rolls back when the callback throws, and the next transaction still runs', async () => {
    await expect(runInTransaction(async (tx) => {
      await insert(tx, 'lost');
      throw new Error('boom');
    })).rejects.toThrow('boom');

    await runInTransaction((tx) => insert(tx, 'kept'));

    expect(await names()).toEqual(['kept']);
  });

  test('transactions that overlap run one after the other instead of failing to begin', async () => {
    const order = [];
    const slow = runInTransaction(async (tx) => {
      order.push('first start');
      await insert(tx, 'first');
      await pause(40);
      await insert(tx, 'first again');
      order.push('first end');
    });
    const quick = runInTransaction(async (tx) => {
      order.push('second start');
      await insert(tx, 'second');
      order.push('second end');
    });

    await Promise.all([slow, quick]);

    expect(order).toEqual(['first start', 'first end', 'second start', 'second end']);
    expect(await names()).toEqual(['first', 'first again', 'second']);
  });

  test('a failing transaction does not take down the one waiting behind it', async () => {
    const failing = runInTransaction(async (tx) => {
      await insert(tx, 'lost');
      await pause(20);
      throw new Error('first failed');
    });
    const waiting = runInTransaction((tx) => insert(tx, 'kept'));

    await expect(failing).rejects.toThrow('first failed');
    await waiting;

    expect(await names()).toEqual(['kept']);
  });

  test('many at once all commit', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => runInTransaction(async (tx) => {
      await insert(tx, `row ${i}`);
      await pause(1);
      await insert(tx, `row ${i} b`);
    })));

    expect(await names()).toHaveLength(24);
  });

  test('a call made inside a running transaction joins it: one commit, one rollback', async () => {
    await runInTransaction(async (tx) => {
      await insert(tx, 'outer');
      await runInTransaction((inner) => insert(inner, 'inner'));
    });
    expect(await names()).toEqual(['outer', 'inner']);

    await expect(runInTransaction(async (tx) => {
      await insert(tx, 'outer 2');
      await runInTransaction((inner) => insert(inner, 'inner 2'));
      throw new Error('outer failed');
    })).rejects.toThrow('outer failed');
    expect(await names()).toEqual(['outer', 'inner']);
  });

  test('work left running after the transaction ended starts a transaction of its own', async () => {
    let late;
    await runInTransaction(async (tx) => {
      await insert(tx, 'main');
      late = (async () => {
        await pause(30);
        await runInTransaction((tx2) => insert(tx2, 'late'));
      })();
    });

    await late;

    expect(await names()).toEqual(['main', 'late']);
    expect((await get("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'tx-test:%'")).n).toBe(2);
  });
});

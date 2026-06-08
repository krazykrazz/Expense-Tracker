const {
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  withTransaction
} = require('./db');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

describe('Database transaction helpers', () => {
  let db;

  beforeAll(async () => {
    db = await createIsolatedTestDb();
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS tx_helper_test (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        value TEXT NOT NULL
      )
    `);
  });

  afterAll(() => {
    cleanupIsolatedTestDb(db);
  });

  beforeEach(async () => {
    await dbRun(db, 'DELETE FROM tx_helper_test');
  });

  test('beginTransaction + commitTransaction persists changes', async () => {
    await beginTransaction(db);
    await dbRun(db, 'INSERT INTO tx_helper_test (value) VALUES (?)', ['committed']);
    await commitTransaction(db);

    const row = await dbGet(db, 'SELECT COUNT(*) AS count FROM tx_helper_test');
    expect(row.count).toBe(1);
  });

  test('beginTransaction + rollbackTransaction discards changes', async () => {
    await beginTransaction(db);
    await dbRun(db, 'INSERT INTO tx_helper_test (value) VALUES (?)', ['rolled-back']);
    await rollbackTransaction(db);

    const row = await dbGet(db, 'SELECT COUNT(*) AS count FROM tx_helper_test');
    expect(row.count).toBe(0);
  });

  test('withTransaction commits on success', async () => {
    const result = await withTransaction(db, async (txDb) => {
      await dbRun(txDb, 'INSERT INTO tx_helper_test (value) VALUES (?)', ['ok']);
      return 'done';
    });

    expect(result).toBe('done');
    const row = await dbGet(db, 'SELECT COUNT(*) AS count FROM tx_helper_test');
    expect(row.count).toBe(1);
  });

  test('withTransaction rolls back when callback throws', async () => {
    await expect(
      withTransaction(db, async (txDb) => {
        await dbRun(txDb, 'INSERT INTO tx_helper_test (value) VALUES (?)', ['should-not-persist']);
        throw new Error('forced failure');
      })
    ).rejects.toThrow('forced failure');

    const row = await dbGet(db, 'SELECT COUNT(*) AS count FROM tx_helper_test');
    expect(row.count).toBe(0);
  });
});

/**
 * Integration tests: expenseRepository.getSummary → real SQLite (isolated database).
 * Inactive payment methods only appear in the month summary when they have spending in the period.
 */
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));

const { getDatabase } = require('../database/db');
const expenseRepository = require('./expenseRepository');

describe('expenseRepository.getSummary - inactive payment methods', () => {
  const NAME = 'InactiveSummaryTest';
  let db;
  let methodId;

  const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });

  beforeAll(async () => {
    db = await createIsolatedTestDb();
    getDatabase.mockResolvedValue(db);
    methodId = await run(
      "INSERT INTO payment_methods (type, display_name, full_name, is_active) VALUES ('cheque', ?, ?, 0)",
      [NAME, NAME]
    );
  });

  afterEach(async () => {
    await run("DELETE FROM expenses WHERE date >= '2091-01-01'");
    await run('UPDATE payment_methods SET is_active = 0 WHERE id = ?', [methodId]);
  });

  afterAll(() => cleanupIsolatedTestDb(db));

  test('inactive method with no spend is excluded from methodTotals', async () => {
    const summary = await expenseRepository.getSummary(2091, 1);
    expect(summary.methodTotals).not.toHaveProperty(NAME);
  });

  test('inactive method with spend in the period is still shown', async () => {
    await run(
      "INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES ('2091-01-10', 'x', '', 20, 'Other', 2, ?)",
      [NAME]
    );
    const summary = await expenseRepository.getSummary(2091, 1);
    expect(summary.methodTotals[NAME]).toBe(20);
  });

  test('reactivated method is shown with 0 when it has no spend', async () => {
    await run('UPDATE payment_methods SET is_active = 1 WHERE id = ?', [methodId]);
    const summary = await expenseRepository.getSummary(2091, 1);
    expect(summary.methodTotals[NAME]).toBe(0);
  });
});

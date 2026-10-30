/**
 * Analytics Monthly Summary must report the same budget totals as the Budgets modal,
 * including budgets carried forward from the previous month.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db');
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const monthlySummaryService = require('./monthlySummaryService');
const budgetService = require('./budgetService');

let db;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  await run('DELETE FROM budgets');
  await run('DELETE FROM expenses');
});

describe('monthlySummaryService budget summary', () => {
  test('is null when no budgets exist in the month or the previous month', async () => {
    const { budgetSummary } = await monthlySummaryService.getMonthlySummary(2094, 6);

    expect(budgetSummary).toBeNull();
  });

  test('uses budgets carried forward from the previous month', async () => {
    await run('INSERT INTO budgets (year, month, category, "limit") VALUES (2094, 5, \'Groceries\', 400)');
    await run("INSERT INTO expenses (date, place, amount, type, week, method) VALUES ('2094-06-03', 'Store', 100, 'Groceries', 1, 'Cash')");

    const { budgetSummary } = await monthlySummaryService.getMonthlySummary(2094, 6);

    expect(budgetSummary).toEqual({ totalBudgeted: 400, totalSpent: 100, utilizationPercentage: 25 });
  });

  test('matches budgetService.getBudgetSummary totals', async () => {
    await run('INSERT INTO budgets (year, month, category, "limit") VALUES (2094, 7, \'Groceries\', 300)');
    await run('INSERT INTO budgets (year, month, category, "limit") VALUES (2094, 7, \'Dining Out\', 200)');
    await run("INSERT INTO expenses (date, place, amount, type, week, method) VALUES ('2094-07-03', 'Store', 120.5, 'Groceries', 1, 'Cash')");
    await run("INSERT INTO expenses (date, place, amount, type, week, method) VALUES ('2094-07-04', 'Misc', 999, 'Gas', 1, 'Cash')");

    const [{ budgetSummary }, summary] = await Promise.all([
      monthlySummaryService.getMonthlySummary(2094, 7),
      budgetService.getBudgetSummary(2094, 7)
    ]);

    expect(budgetSummary.totalBudgeted).toBe(summary.totalBudgeted);
    expect(budgetSummary.totalSpent).toBe(summary.totalSpent);
    expect(budgetSummary.totalSpent).toBe(120.5);
  });
});

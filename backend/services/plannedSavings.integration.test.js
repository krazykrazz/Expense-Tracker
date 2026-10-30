/**
 * Integration tests: planned savings (budget allocations) in Cash Flow, the Annual Summary,
 * Budget History and the main-screen summary, against real SQLite.
 *
 * Past years are used for planned totals because months after the current business month
 * count as 0; a far-future year covers that rule.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db');
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const allocationService = require('./allocationService');
const periodSummaryService = require('./periodSummaryService');
const expenseAggregationService = require('./expenseAggregationService');
const budgetService = require('./budgetService');
const budgetPlanService = require('./budgetPlanService');

let db;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});

const Y = 2001;
const FUTURE_Y = 2095;

const addIncome = (year, month, amount) =>
  run("INSERT INTO income_sources (year, month, name, amount, category) VALUES (?, ?, 'Salary', ?, 'Salary')", [year, month, amount]);
const addFixed = (year, month, amount) =>
  run("INSERT INTO fixed_expenses (year, month, name, amount, category) VALUES (?, ?, 'Rent', ?, 'Housing')", [year, month, amount]);
const addExpense = (date, amount) =>
  run("INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, 'Store', ?, 'Groceries', 1, 'Cash')", [date, amount]);
const addBudget = (year, month, limit) =>
  run('INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, \'Groceries\', ?)', [year, month, limit]);
const addAllocation = (year, month, name, amount) =>
  allocationService.createAllocation(year, month, { name, amount });

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  for (const table of ['expenses', 'fixed_expenses', 'income_sources', 'budgets', 'budget_allocations']) {
    await run(`DELETE FROM ${table}`);
  }
});

describe('allocationService.getPlannedSavingsByMonth', () => {
  test('sums stored allocations and carries the previous month forward into an empty month', async () => {
    await addAllocation(Y - 1, 12, 'TFSA', 100);
    await addAllocation(Y, 2, 'TFSA', 200);
    await addAllocation(Y, 2, 'RRSP', 50.25);

    const months = await allocationService.getPlannedSavingsByMonth({ year: Y, month: 1 }, { year: Y, month: 4 });

    expect(months).toEqual([
      { year: Y, month: 1, planned: 100 },
      { year: Y, month: 2, planned: 250.25 },
      { year: Y, month: 3, planned: 250.25 },
      { year: Y, month: 4, planned: 0 }
    ]);
  });

  test('counts months after the current month as 0', async () => {
    await addAllocation(FUTURE_Y, 5, 'TFSA', 100);

    const months = await allocationService.getPlannedSavingsByMonth({ year: FUTURE_Y, month: 5 }, { year: FUTURE_Y, month: 5 });

    expect(months).toEqual([{ year: FUTURE_Y, month: 5, planned: 0 }]);
  });
});

describe('Cash Flow (periodSummaryService)', () => {
  test('reports planned savings and rate without counting them as spending', async () => {
    await addIncome(Y, 3, 4000);
    await addIncome(Y, 4, 4000);
    await addFixed(Y, 3, 1000);
    await addAllocation(Y, 3, 'TFSA', 400);

    const { totals } = await periodSummaryService.getPeriodSummary({ year: Y, month: 3 }, { year: Y, month: 4 });

    expect(totals).toMatchObject({ income: 8000, expenses: 1000, net: 7000, plannedSavings: 800, plannedSavingsRate: 10 });
  });

  test('has no planned savings rate without income', async () => {
    await addAllocation(Y, 3, 'TFSA', 400);

    const { totals } = await periodSummaryService.getPeriodSummary({ year: Y, month: 3 }, { year: Y, month: 3 });

    expect(totals).toMatchObject({ plannedSavings: 400, plannedSavingsRate: null });
  });
});

describe('Annual Summary (expenseAggregationService.getAnnualSummary)', () => {
  test('adds per-month and yearly planned savings', async () => {
    await addAllocation(Y, 6, 'TFSA', 300);

    const summary = await expenseAggregationService.getAnnualSummary(Y);

    expect(summary.totalPlannedSavings).toBe(600);
    expect(summary.monthlyTotals.map(m => m.plannedSavings)).toEqual([0, 0, 0, 0, 0, 300, 300, 0, 0, 0, 0, 0]);
    expect(summary.netIncome).toBe(0);
  });
});

describe('Budget History (budgetService.getBudgetHistory)', () => {
  test('compares planned savings with the Cash Flow net for each month', async () => {
    await addIncome(Y, 4, 3000);
    await addIncome(Y, 5, 3000);
    await addIncome(Y, 6, 3000);
    await addExpense(`${Y}-05-10`, 2900);
    await addAllocation(Y, 5, 'TFSA', 500);
    await addAllocation(Y, 6, 'TFSA', 500);

    const { plannedSavings } = await budgetService.getBudgetHistory(Y, 6, 3);

    expect(plannedSavings.history).toEqual([
      { year: Y, month: 4, planned: 0, saved: 3000, met: null },
      { year: Y, month: 5, planned: 500, saved: 100, met: false },
      { year: Y, month: 6, planned: 500, saved: 3000, met: true }
    ]);
    expect(plannedSavings).toMatchObject({ totalPlanned: 1000, totalSaved: 3100, successRate: 50 });
  });

  test('has no success rate when nothing was planned', async () => {
    const { plannedSavings } = await budgetService.getBudgetHistory(Y, 6, 3);

    expect(plannedSavings).toMatchObject({ totalPlanned: 0, totalSaved: 0, successRate: null });
  });
});

describe('main-screen summary (expenseAggregationService.getSummary)', () => {
  test('plannedUnassigned matches the Plan tab, including carried-forward rows', async () => {
    await addIncome(Y, 7, 5000);
    await addIncome(Y, 8, 5000);
    await addFixed(Y, 7, 1500);
    await addBudget(Y, 7, 600);
    await addAllocation(Y, 7, 'TFSA', 4000);

    for (const month of [7, 8]) {
      const [summary, plan] = await Promise.all([
        expenseAggregationService.getSummary(Y, month),
        budgetPlanService.getBudgetPlan(Y, month)
      ]);

      expect(summary.plannedBudgets).toBe(plan.budgeted);
      expect(summary.plannedUnassigned).toBe(plan.unassigned);
    }
    expect((await expenseAggregationService.getSummary(Y, 7)).plannedUnassigned).toBe(-1100);
  });
});

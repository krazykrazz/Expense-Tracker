/**
 * Integration tests: budgetPlanService against real SQLite, including consistency with
 * the main-screen summary (expenseAggregationService) and Cash Flow (periodSummaryService).
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db');
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const budgetPlanService = require('./budgetPlanService');
const budgetService = require('./budgetService');
const allocationService = require('./allocationService');
const periodSummaryService = require('./periodSummaryService');
const expenseAggregationService = require('./expenseAggregationService');

let db;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});

const Y = 2092;
const M = 4;

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

const seedMonth = async () => {
  await run("INSERT INTO income_sources (year, month, name, amount, category) VALUES (?, ?, 'Salary', 5000, 'Salary')", [Y, M]);
  await run("INSERT INTO fixed_expenses (year, month, name, amount, category) VALUES (?, ?, 'Rent', 1500, 'Housing')", [Y, M]);
  await run("INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, 'Store', 400, 'Groceries', 1, 'Cash')", [`${Y}-04-05`]);
  await run("INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, 'Cafe', 100, 'Dining Out', 1, 'Cash')", [`${Y}-04-06`]);
  await run('INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, \'Groceries\', 600)', [Y, M]);
  await allocationService.createAllocation(Y, M, { name: 'TFSA', amount: 500 });
  await allocationService.createAllocation(Y, M, { name: 'Emergency Fund', amount: 250 });
};

describe('budgetPlanService.getBudgetPlan', () => {
  test('splits income into fixed, budgeted, allocated and unassigned', async () => {
    await seedMonth();

    const plan = await budgetPlanService.getBudgetPlan(Y, M);

    expect(plan).toMatchObject({
      income: 5000,
      fixedExpenses: 1500,
      budgeted: 600,
      allocated: 750,
      unassigned: 2150,
      variableExpenses: 500,
      balance: 3000,
      balanceAfterPlannedSavings: 2250,
      allocationRate: 15
    });
    expect(plan.allocations.map(a => a.name)).toEqual(['Emergency Fund', 'TFSA']);
  });

  test('reports a negative unassigned amount when the plan exceeds income', async () => {
    await seedMonth();
    await allocationService.createAllocation(Y, M, { name: 'Down Payment', amount: 3000 });

    expect((await budgetPlanService.getBudgetPlan(Y, M)).unassigned).toBe(-850);
  });

  test('has no allocation rate when no income is recorded', async () => {
    await allocationService.createAllocation(Y, M, { name: 'TFSA', amount: 100 });

    const plan = await budgetPlanService.getBudgetPlan(Y, M);

    expect(plan).toMatchObject({ income: 0, allocated: 100, unassigned: -100, allocationRate: null });
  });

  test('includes carried-forward budgets and allocations', async () => {
    await seedMonth();

    const plan = await budgetPlanService.getBudgetPlan(Y, M + 1);

    expect(plan).toMatchObject({ budgeted: 600, allocated: 750 });
    expect(plan.allocations.every(a => a.carriedForward)).toBe(true);
  });

  test('rejects an invalid month with a 400', async () => {
    await expect(budgetPlanService.getBudgetPlan(Y, 0)).rejects.toMatchObject({ statusCode: 400 });
  });

  describe('agrees with the rest of the app', () => {
    test('balance equals the main-screen netBalance and Cash Flow net', async () => {
      await seedMonth();

      const [plan, summary, period] = await Promise.all([
        budgetPlanService.getBudgetPlan(Y, M),
        expenseAggregationService.getSummary(Y, M),
        periodSummaryService.getPeriodSummary({ year: Y, month: M }, { year: Y, month: M })
      ]);

      expect(plan.balance).toBe(summary.netBalance);
      expect(plan.balance).toBe(period.totals.net);
      expect(summary.plannedAllocations).toBe(plan.allocated);
    });

    test('budgeted equals the budget summary used by Budgets and Analytics', async () => {
      await seedMonth();

      const [plan, budgetSummary] = await Promise.all([
        budgetPlanService.getBudgetPlan(Y, M),
        budgetService.getBudgetSummary(Y, M)
      ]);

      expect(plan.budgeted).toBe(budgetSummary.totalBudgeted);
    });
  });
});

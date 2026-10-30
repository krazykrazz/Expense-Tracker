/**
 * @invariant For any income, fixed expense, category budget and allocation amounts (in cents),
 * unassigned = income - fixed - budgeted - allocated and balanceAfterPlannedSavings = balance - allocated,
 * with no floating-point drift. Randomized cents amounts catch rounding errors that fixed
 * examples (round dollar values) cannot.
 */

const fc = require('fast-check');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { dbPbtOptions } = require('../test/pbtArbitraries');

jest.mock('../database/db');
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const budgetPlanService = require('./budgetPlanService');
const allocationService = require('./allocationService');

let db;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, (err) => (err ? reject(err) : resolve()));
});

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

describe('budgetPlanService plan identity (PBT)', () => {
  test('unassigned and balance-after-savings follow from the components exactly', async () => {
    const cents = fc.integer({ min: 1, max: 5_000_000 });

    await fc.assert(
      fc.asyncProperty(cents, cents, cents, cents, async (income, fixed, budget, allocation) => {
        for (const table of ['income_sources', 'fixed_expenses', 'budgets', 'budget_allocations']) {
          await run(`DELETE FROM ${table}`);
        }
        await run("INSERT INTO income_sources (year, month, name, amount, category) VALUES (2093, 2, 'Pay', ?, 'Salary')", [income / 100]);
        await run("INSERT INTO fixed_expenses (year, month, name, amount, category) VALUES (2093, 2, 'Rent', ?, 'Housing')", [fixed / 100]);
        await run('INSERT INTO budgets (year, month, category, "limit") VALUES (2093, 2, \'Groceries\', ?)', [budget / 100]);
        await allocationService.createAllocation(2093, 2, { name: 'TFSA', amount: allocation / 100 });

        const plan = await budgetPlanService.getBudgetPlan(2093, 2);

        expect(Math.round(plan.unassigned * 100)).toBe(income - fixed - budget - allocation);
        expect(Math.round(plan.balanceAfterPlannedSavings * 100)).toBe(income - fixed - allocation);
      }),
      dbPbtOptions()
    );
  }, 120000);
});

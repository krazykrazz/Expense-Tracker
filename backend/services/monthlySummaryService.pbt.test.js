/**
 * @invariant Monthly Summary Aggregation Properties
 *
 * Property 1: Top-5 category ranking correctness
 * Property 2: Top-5 merchant ranking correctness
 * Property 3: Total spending equals sum of all expenses
 * Property 4: Month-over-month comparison correctness
 * Property 5: Budget utilization calculation
 *
 * Feature: analytics-hub-revamp
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 3.4, 3.5, 3.6
 */

const fc = require('fast-check');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { dbPbtOptions, expenseType, safeAmount, paymentMethod } = require('../test/pbtArbitraries');

jest.mock('../database/db');
const { getDatabase } = require('../database/db');

const monthlySummaryService = require('./monthlySummaryService');

let isolatedDb;

beforeAll(async () => {
  isolatedDb = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(isolatedDb);
});

afterAll(() => {
  cleanupIsolatedTestDb(isolatedDb);
});

// ─── DB Helpers ───

function insertExpense(db, { date, place, amount, type, week = 1, method = 'Cash' }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expenses (date, place, notes, amount, type, week, method)
       VALUES (?, ?, '', ?, ?, ?, ?)`,
      [date, place, amount, type, week, method],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function insertBudget(db, { year, month, category, limit }) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)',
      [year, month, category, limit],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function clearTable(db, table) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM ${table}`, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function cleanup(db) {
  await clearTable(db, 'expenses');
  await clearTable(db, 'budgets');
}

// ─── Generators ───

const categories = ['Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing',
  'Gifts', 'Housing', 'Insurance', 'Personal Care', 'Subscriptions', 'Utilities', 'Other'];

const merchants = ['Costco', 'Walmart', 'Amazon', 'Loblaws', 'Shoppers',
  'Tim Hortons', 'Canadian Tire', 'Home Depot', 'Sobeys', 'Metro'];

const arbExpense = fc.record({
  place: fc.constantFrom(...merchants),
  amount: fc.integer({ min: 1, max: 50000 }).map(n => n / 100), // cents → dollars, avoids float issues
  type: fc.constantFrom(...categories),
});

const arbExpenseSet = fc.array(arbExpense, { minLength: 1, maxLength: 20 });

const arbBudget = fc.record({
  category: fc.constantFrom(...categories),
  limit: fc.integer({ min: 100, max: 500000 }).map(n => n / 100),
});

const arbBudgetSet = fc.uniqueArray(arbBudget, {
  minLength: 1,
  maxLength: 6,
  selector: b => b.category,
});

// ─── Tests ───

describe('MonthlySummaryService — PBT', () => {
  const YEAR = 2091;
  const MONTH = 6;
  const DATE_PREFIX = `${YEAR}-06`;

  afterEach(async () => {
    await cleanup(isolatedDb);
  });

  /**
   * Property 1: Top-5 category ranking correctness
   * For any set of expenses, top categories should be sorted by total desc,
   * limited to 5, each total equals sum of expenses with that category.
   *
   * **Validates: Requirements 2.1, 3.3**
   */
  describe('Property 1: Top-5 category ranking correctness', () => {
    it('categories sorted desc by total, limited to 5, totals match sums', async () => {
      await fc.assert(
        fc.asyncProperty(arbExpenseSet, async (expenses) => {
          await cleanup(isolatedDb);

          // Insert expenses
          for (const exp of expenses) {
            await insertExpense(isolatedDb, {
              date: `${DATE_PREFIX}-15`,
              place: exp.place,
              amount: exp.amount,
              type: exp.type,
            });
          }

          const result = await monthlySummaryService.getMonthlySummary(YEAR, MONTH);
          const { topCategories } = result;

          // Limited to 5
          expect(topCategories.length).toBeLessThanOrEqual(5);

          // Compute expected totals per category
          const catTotals = {};
          for (const exp of expenses) {
            catTotals[exp.type] = (catTotals[exp.type] || 0) + exp.amount;
          }

          // Sorted desc by total
          for (let i = 0; i < topCategories.length - 1; i++) {
            expect(topCategories[i].total).toBeGreaterThanOrEqual(topCategories[i + 1].total);
          }

          // Each total matches the sum of expenses for that category
          for (const cat of topCategories) {
            const expected = parseFloat(catTotals[cat.category].toFixed(2));
            expect(cat.total).toBeCloseTo(expected, 1);
          }

          // Top 5 are the highest-total categories
          const sortedCats = Object.entries(catTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name);
          const returnedCats = topCategories.map(c => c.category);
          expect(returnedCats).toEqual(sortedCats);
        }),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 2: Top-5 merchant ranking correctness
   * Same as Property 1 but for merchants.
   *
   * **Validates: Requirements 2.2, 3.4**
   */
  describe('Property 2: Top-5 merchant ranking correctness', () => {
    it('merchants sorted desc by total, limited to 5, totals match sums', async () => {
      await fc.assert(
        fc.asyncProperty(arbExpenseSet, async (expenses) => {
          await cleanup(isolatedDb);

          for (const exp of expenses) {
            await insertExpense(isolatedDb, {
              date: `${DATE_PREFIX}-15`,
              place: exp.place,
              amount: exp.amount,
              type: exp.type,
            });
          }

          const result = await monthlySummaryService.getMonthlySummary(YEAR, MONTH);
          const { topMerchants } = result;

          expect(topMerchants.length).toBeLessThanOrEqual(5);

          // Compute expected totals per merchant
          const merchTotals = {};
          for (const exp of expenses) {
            merchTotals[exp.place] = (merchTotals[exp.place] || 0) + exp.amount;
          }

          // Sorted desc
          for (let i = 0; i < topMerchants.length - 1; i++) {
            expect(topMerchants[i].total).toBeGreaterThanOrEqual(topMerchants[i + 1].total);
          }

          // Each total matches
          for (const m of topMerchants) {
            const expected = parseFloat(merchTotals[m.merchant].toFixed(2));
            expect(m.total).toBeCloseTo(expected, 1);
          }

          // Top 5 are the highest
          const sortedMerch = Object.entries(merchTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name);
          const returnedMerch = topMerchants.map(m => m.merchant);
          expect(returnedMerch).toEqual(sortedMerch);
        }),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 3: Total spending equals sum of all expenses
   * totalSpending must equal sum of all expense amounts.
   *
   * **Validates: Requirements 2.3**
   */
  describe('Property 3: Total spending equals sum of all expenses', () => {
    it('totalSpending equals sum of all expense amounts for the month', async () => {
      await fc.assert(
        fc.asyncProperty(arbExpenseSet, async (expenses) => {
          await cleanup(isolatedDb);

          for (const exp of expenses) {
            await insertExpense(isolatedDb, {
              date: `${DATE_PREFIX}-15`,
              place: exp.place,
              amount: exp.amount,
              type: exp.type,
            });
          }

          const result = await monthlySummaryService.getMonthlySummary(YEAR, MONTH);

          const expectedTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
          expect(result.totalSpending).toBeCloseTo(expectedTotal, 1);
        }),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 4: Month-over-month comparison correctness
   * difference = current - previous, percentageChange = (diff/prev)*100,
   * null when previous month has zero expenses.
   *
   * **Validates: Requirements 2.4, 3.5**
   */
  describe('Property 4: Month-over-month comparison correctness', () => {
    it('monthOverMonth is null when previous month has no expenses', async () => {
      await fc.assert(
        fc.asyncProperty(arbExpenseSet, async (expenses) => {
          await cleanup(isolatedDb);

          // Only insert expenses in the current month — no previous month data
          for (const exp of expenses) {
            await insertExpense(isolatedDb, {
              date: `${DATE_PREFIX}-15`,
              place: exp.place,
              amount: exp.amount,
              type: exp.type,
            });
          }

          const result = await monthlySummaryService.getMonthlySummary(YEAR, MONTH);
          expect(result.monthOverMonth).toBeNull();
        }),
        dbPbtOptions()
      );
    });

    it('difference and percentageChange are correct when both months have data', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbExpenseSet,
          arbExpenseSet,
          async (prevExpenses, currExpenses) => {
            await cleanup(isolatedDb);

            // Insert previous month expenses (month 5)
            for (const exp of prevExpenses) {
              await insertExpense(isolatedDb, {
                date: `${YEAR}-05-15`,
                place: exp.place,
                amount: exp.amount,
                type: exp.type,
              });
            }

            // Insert current month expenses (month 6)
            for (const exp of currExpenses) {
              await insertExpense(isolatedDb, {
                date: `${DATE_PREFIX}-15`,
                place: exp.place,
                amount: exp.amount,
                type: exp.type,
              });
            }

            const result = await monthlySummaryService.getMonthlySummary(YEAR, MONTH);
            expect(result.monthOverMonth).not.toBeNull();

            const prevTotal = prevExpenses.reduce((s, e) => s + e.amount, 0);
            const currTotal = currExpenses.reduce((s, e) => s + e.amount, 0);
            const expectedDiff = currTotal - prevTotal;
            const expectedPct = (expectedDiff / prevTotal) * 100;

            expect(result.monthOverMonth.previousTotal).toBeCloseTo(prevTotal, 1);
            expect(result.monthOverMonth.difference).toBeCloseTo(expectedDiff, 1);
            expect(result.monthOverMonth.percentageChange).toBeCloseTo(expectedPct, 0);
          }
        ),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 5: Budget utilization calculation
   * utilizationPercentage = (totalSpent/totalBudgeted)*100
   *
   * **Validates: Requirements 2.5, 3.6**
   */
  describe('Property 5: Budget utilization calculation', () => {
    it('budgetSummary is null when no budgets exist', async () => {
      await fc.assert(
        fc.asyncProperty(arbExpenseSet, async (expenses) => {
          await cleanup(isolatedDb);

          for (const exp of expenses) {
            await insertExpense(isolatedDb, {
              date: `${DATE_PREFIX}-15`,
              place: exp.place,
              amount: exp.amount,
              type: exp.type,
            });
          }

          const result = await monthlySummaryService.getMonthlySummary(YEAR, MONTH);
          expect(result.budgetSummary).toBeNull();
        }),
        dbPbtOptions()
      );
    });

    it('utilization = (totalSpent / totalBudgeted) * 100', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbExpenseSet,
          arbBudgetSet,
          async (expenses, budgets) => {
            await cleanup(isolatedDb);

            // Insert expenses
            for (const exp of expenses) {
              await insertExpense(isolatedDb, {
                date: `${DATE_PREFIX}-15`,
                place: exp.place,
                amount: exp.amount,
                type: exp.type,
              });
            }

            // Insert budgets for the month
            for (const b of budgets) {
              await insertBudget(isolatedDb, {
                year: YEAR,
                month: MONTH,
                category: b.category,
                limit: b.limit,
              });
            }

            const result = await monthlySummaryService.getMonthlySummary(YEAR, MONTH);
            expect(result.budgetSummary).not.toBeNull();

            // totalBudgeted = sum of all budget limits
            const expectedBudgeted = budgets.reduce((s, b) => s + b.limit, 0);
            expect(result.budgetSummary.totalBudgeted).toBeCloseTo(expectedBudgeted, 1);

            // totalSpent = sum of expenses whose category is in the budget categories
            const budgetedCategories = new Set(budgets.map(b => b.category));
            const expectedSpent = expenses
              .filter(e => budgetedCategories.has(e.type))
              .reduce((s, e) => s + e.amount, 0);
            expect(result.budgetSummary.totalSpent).toBeCloseTo(expectedSpent, 1);

            // utilizationPercentage = (totalSpent / totalBudgeted) * 100
            const expectedUtil = expectedBudgeted > 0
              ? (expectedSpent / expectedBudgeted) * 100
              : 0;
            expect(result.budgetSummary.utilizationPercentage).toBeCloseTo(expectedUtil, 0);
          }
        ),
        dbPbtOptions()
      );
    });
  });
});

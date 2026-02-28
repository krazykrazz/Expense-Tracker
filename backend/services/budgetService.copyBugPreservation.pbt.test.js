/**
 * @invariant Property 2: Preservation — Explicit Budget CRUD, Summary,
 * History averageSpent, successRate, and suggestBudgetAmount
 *
 * These tests capture CORRECT behavior on the UNFIXED code that must not
 * regress when the fix is applied. They exercise months that ALREADY HAVE
 * explicit budget rows (not empty months that trigger auto-carry-forward).
 *
 * Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8
 */

const fc = require('fast-check');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { dbPbtOptions } = require('../test/pbtArbitraries');

jest.mock('../database/db');
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const budgetService = require('./budgetService');

let isolatedDb;

beforeAll(async () => {
  isolatedDb = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(isolatedDb);
});

afterAll(() => {
  cleanupIsolatedTestDb(isolatedDb);
});

// --- DB helpers ---

function insertBudget(db, year, month, category, limit) {
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

function insertExpense(db, date, amount, category) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expenses (date, place, notes, amount, type, week, method)
       VALUES (?, 'TestPlace', '', ?, ?, 1, 'Cash')`,
      [date, amount, category],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function cleanup(db, yearStart, yearEnd) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM budgets WHERE year >= ? AND year <= ?', [yearStart, yearEnd], (err) => {
      if (err) return reject(err);
      db.run(
        `DELETE FROM expenses WHERE date >= ? AND date <= ?`,
        [`${yearStart}-01-01`, `${yearEnd}-12-31`],
        (err2) => {
          if (err2) return reject(err2);
          resolve();
        }
      );
    });
  });
}

// Use a far-future year range to avoid conflicts
const BASE_YEAR = 2080;

// Subset of budgetable categories for test generation
const TEST_CATEGORIES = ['Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing'];

describe('Preservation — Explicit Budget CRUD, Summary, History averageSpent, successRate', () => {
  afterEach(async () => {
    await cleanup(isolatedDb, BASE_YEAR - 1, BASE_YEAR + 2);
  });

  /**
   * Property: For months with explicit budget rows, getBudgets returns
   * those budgets correctly with matching categories and limits.
   *
   * Validates: Requirements 3.1
   */
  it('getBudgets returns explicit budget rows with correct categories and limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 12 }),
        fc.subarray(TEST_CATEGORIES, { minLength: 1, maxLength: 4 }),
        fc.array(fc.integer({ min: 50, max: 2000 }), { minLength: 1, maxLength: 4 }),
        async (month, categories, limits) => {
          // Ensure limits array matches categories length
          const usedCategories = categories.slice(0, Math.min(categories.length, limits.length));
          const usedLimits = limits.slice(0, usedCategories.length);
          if (usedCategories.length === 0) return;

          // Insert explicit budgets
          for (let i = 0; i < usedCategories.length; i++) {
            await insertBudget(isolatedDb, BASE_YEAR, month, usedCategories[i], usedLimits[i]);
          }

          // Act
          const result = await budgetService.getBudgets(BASE_YEAR, month);

          // Assert: all inserted budgets are returned
          expect(result.length).toBe(usedCategories.length);

          for (let i = 0; i < usedCategories.length; i++) {
            const found = result.find(b => b.category === usedCategories[i]);
            expect(found).toBeDefined();
            expect(found.limit).toBe(usedLimits[i]);
            expect(found.year).toBe(BASE_YEAR);
            expect(found.month).toBe(month);
            expect(found.id).toBeDefined();
          }

          await cleanup(isolatedDb, BASE_YEAR - 1, BASE_YEAR + 2);
        }
      ),
      dbPbtOptions({ numRuns: 5 })
    );
  });

  /**
   * Property: For months with explicit budgets, getBudgetSummary totals
   * match the sum of individual budget limits and spent amounts.
   *
   * Validates: Requirements 3.2, 3.4, 3.5
   */
  it('getBudgetSummary totals match sum of individual budget limits and spent amounts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 100, max: 1000 }),
        fc.integer({ min: 200, max: 2000 }),
        fc.integer({ min: 10, max: 500 }),
        fc.integer({ min: 20, max: 800 }),
        async (month, limit1, limit2, spent1, spent2) => {
          const cat1 = 'Groceries';
          const cat2 = 'Gas';
          const monthStr = String(month).padStart(2, '0');

          // Insert explicit budgets
          await insertBudget(isolatedDb, BASE_YEAR, month, cat1, limit1);
          await insertBudget(isolatedDb, BASE_YEAR, month, cat2, limit2);

          // Insert expenses so getSpentAmount returns known values
          await insertExpense(isolatedDb, `${BASE_YEAR}-${monthStr}-15`, spent1, cat1);
          await insertExpense(isolatedDb, `${BASE_YEAR}-${monthStr}-20`, spent2, cat2);

          // Act
          const summary = await budgetService.getBudgetSummary(BASE_YEAR, month);

          // Assert totals
          expect(summary.totalBudgeted).toBe(limit1 + limit2);
          expect(summary.totalSpent).toBe(spent1 + spent2);
          expect(summary.remaining).toBe((limit1 + limit2) - (spent1 + spent2));
          expect(summary.totalBudgets).toBe(2);

          // Assert individual category details
          expect(summary.categories.length).toBe(2);
          for (const catDetail of summary.categories) {
            if (catDetail.budget.category === cat1) {
              expect(catDetail.budget.limit).toBe(limit1);
              expect(catDetail.spent).toBe(spent1);
            } else {
              expect(catDetail.budget.limit).toBe(limit2);
              expect(catDetail.spent).toBe(spent2);
            }
            // Progress should be (spent / limit) * 100 (raw float, not rounded)
            const expectedProgress = catDetail.budget.limit > 0
              ? (catDetail.spent / catDetail.budget.limit) * 100
              : 0;
            expect(catDetail.progress).toBeCloseTo(expectedProgress, 5);
          }

          // Assert budget status thresholds
          for (const catDetail of summary.categories) {
            const p = catDetail.progress;
            if (p >= 100) expect(catDetail.status).toBe('critical');
            else if (p >= 90) expect(catDetail.status).toBe('danger');
            else if (p >= 80) expect(catDetail.status).toBe('warning');
            else expect(catDetail.status).toBe('safe');
          }

          await cleanup(isolatedDb, BASE_YEAR - 1, BASE_YEAR + 2);
        }
      ),
      dbPbtOptions({ numRuns: 5 })
    );
  });

  /**
   * Property: For all periods with explicit budgets, averageSpent = totalSpent / monthCount
   * and successRate = monthsBudgetMet / monthsWithBudget * 100.
   *
   * Validates: Requirements 3.6, 3.7
   */
  it('getBudgetHistory returns correct averageSpent and successRate for explicit budgets', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 800 }),
        fc.integer({ min: 100, max: 800 }),
        fc.integer({ min: 100, max: 800 }),
        fc.integer({ min: 50, max: 600 }),
        fc.integer({ min: 50, max: 600 }),
        fc.integer({ min: 50, max: 600 }),
        async (limit1, limit2, limit3, spent1, spent2, spent3) => {
          const category = 'Groceries';

          // Insert budgets for Jan, Feb, Mar of BASE_YEAR
          await insertBudget(isolatedDb, BASE_YEAR, 1, category, limit1);
          await insertBudget(isolatedDb, BASE_YEAR, 2, category, limit2);
          await insertBudget(isolatedDb, BASE_YEAR, 3, category, limit3);

          // Insert expenses for each month
          await insertExpense(isolatedDb, `${BASE_YEAR}-01-15`, spent1, category);
          await insertExpense(isolatedDb, `${BASE_YEAR}-02-15`, spent2, category);
          await insertExpense(isolatedDb, `${BASE_YEAR}-03-15`, spent3, category);

          // Act: get 3-month history ending March
          const history = await budgetService.getBudgetHistory(BASE_YEAR, 3, 3);
          const catData = history.categories[category];

          expect(catData).toBeDefined();

          // averageSpent = totalSpent / monthCount (3 months in period)
          const expectedAvgSpent = (spent1 + spent2 + spent3) / 3;
          expect(catData.averageSpent).toBeCloseTo(expectedAvgSpent, 2);

          // successRate = monthsBudgetMet / monthsWithBudget * 100
          let monthsMet = 0;
          if (spent1 <= limit1) monthsMet++;
          if (spent2 <= limit2) monthsMet++;
          if (spent3 <= limit3) monthsMet++;
          const expectedSuccessRate = (monthsMet / 3) * 100;
          expect(catData.successRate).toBeCloseTo(expectedSuccessRate, 2);

          // Verify per-month history details
          expect(catData.history.length).toBe(3);
          const monthDetails = catData.history;

          // Month 1 (Jan)
          const jan = monthDetails.find(m => m.month === 1);
          expect(jan.budgeted).toBe(limit1);
          expect(jan.spent).toBe(spent1);
          expect(jan.met).toBe(spent1 <= limit1);

          // Month 2 (Feb)
          const feb = monthDetails.find(m => m.month === 2);
          expect(feb.budgeted).toBe(limit2);
          expect(feb.spent).toBe(spent2);
          expect(feb.met).toBe(spent2 <= limit2);

          // Month 3 (Mar)
          const mar = monthDetails.find(m => m.month === 3);
          expect(mar.budgeted).toBe(limit3);
          expect(mar.spent).toBe(spent3);
          expect(mar.met).toBe(spent3 <= limit3);

          await cleanup(isolatedDb, BASE_YEAR - 1, BASE_YEAR + 2);
        }
      ),
      dbPbtOptions({ numRuns: 5 })
    );
  });

  /**
   * Property: suggestBudgetAmount returns correct suggestions based on
   * 6-month spending history, rounded to nearest $50.
   *
   * Validates: Requirements 3.8
   */
  it('suggestBudgetAmount returns correct suggestion based on 6-month spending history', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 500 }), { minLength: 6, maxLength: 6 }),
        async (monthlySpending) => {
          const category = 'Groceries';
          const targetMonth = 7; // July — so history covers Jan-Jun

          // Insert expenses for the 6 months before target
          for (let i = 0; i < 6; i++) {
            const m = i + 1; // months 1-6
            const monthStr = String(m).padStart(2, '0');
            if (monthlySpending[i] > 0) {
              await insertExpense(
                isolatedDb,
                `${BASE_YEAR}-${monthStr}-15`,
                monthlySpending[i],
                category
              );
            }
          }

          // Act
          const result = await budgetService.suggestBudgetAmount(BASE_YEAR, targetMonth, category);

          // Expected: average of 6 months, rounded to nearest $50
          const totalSpending = monthlySpending.reduce((sum, v) => sum + v, 0);
          const avgSpending = totalSpending / 6;

          if (totalSpending === 0) {
            expect(result.suggestedAmount).toBe(0);
            expect(result.averageSpending).toBe(0);
          } else {
            const expectedSuggestion = Math.round(avgSpending / 50) * 50;
            expect(result.suggestedAmount).toBe(expectedSuggestion);
            expect(result.averageSpending).toBeCloseTo(avgSpending, 2);
          }

          expect(result.basedOnMonths).toBe(6);
          expect(result.category).toBe(category);

          await cleanup(isolatedDb, BASE_YEAR - 1, BASE_YEAR + 2);
        }
      ),
      dbPbtOptions({ numRuns: 5 })
    );
  });
});

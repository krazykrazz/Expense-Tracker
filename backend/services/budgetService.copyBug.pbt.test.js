/**
 * @invariant Property 1: Fault Condition — getBudgets Write Side-Effect,
 * Copy Misreporting, and Missing averageBudgeted
 *
 * Bug Condition Exploration Tests for budget-copy-previous-month bugfix.
 *
 * These tests are EXPECTED TO FAIL on unfixed code — failure confirms the bugs exist.
 * They encode the EXPECTED correct behavior and will pass after the fix is implemented.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

const fc = require('fast-check');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { dbPbtOptions } = require('../test/pbtArbitraries');

// We need to intercept the database module so budgetService and budgetRepository
// use our isolated DB instead of the shared test DB.
jest.mock('../database/db');
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const budgetRepository = require('../repositories/budgetRepository');
const budgetService = require('./budgetService');

let isolatedDb;

beforeAll(async () => {
  isolatedDb = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(isolatedDb);
});

afterAll(() => {
  cleanupIsolatedTestDb(isolatedDb);
});

/**
 * Helper: insert a budget row directly into the isolated DB
 */
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

/**
 * Helper: count budget rows for a given year/month directly in the DB
 */
function countBudgetRows(db, year, month) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT COUNT(*) as cnt FROM budgets WHERE year = ? AND month = ?',
      [year, month],
      (err, row) => {
        if (err) return reject(err);
        resolve(row.cnt);
      }
    );
  });
}

/**
 * Helper: delete all budgets for a given year range
 */
function cleanupBudgets(db, yearStart, yearEnd) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM budgets WHERE year >= ? AND year <= ?',
      [yearStart, yearEnd],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

describe('Bug Condition Exploration — getBudgets Write Side-Effect, Copy Misreporting, Missing averageBudgeted', () => {
  // Use a far-future year range to avoid conflicts with other tests
  const BASE_YEAR = 2090;

  afterEach(async () => {
    await cleanupBudgets(isolatedDb, BASE_YEAR - 1, BASE_YEAR + 10);
  });

  /**
   * Bug 1 — Read purity: getBudgets should NOT create DB rows as a side effect.
   *
   * Call getBudgets(year, month) for a month with no budget rows but where the
   * previous month has budgets. Assert that budgetRepository.findByYearMonth
   * returns 0 rows after the call (no DB rows created as side effect).
   *
   * On unfixed code this will FAIL because getBudgets calls budgetRepository.create()
   * during read.
   *
   * Validates: Requirements 1.1
   */
  it('getBudgets should not create persistent DB rows when reading an empty month (read purity)', async () => {
    // Scoped PBT: use concrete categories with a small property run
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('Groceries', 'Dining Out', 'Gas'),
        fc.integer({ min: 100, max: 900 }),
        async (category, limit) => {
          const prevYear = BASE_YEAR;
          const prevMonth = 2; // February
          const targetYear = BASE_YEAR;
          const targetMonth = 3; // March

          // Setup: insert budget in previous month only
          await insertBudget(isolatedDb, prevYear, prevMonth, category, limit);

          // Verify target month has 0 rows before the call
          const beforeCount = await countBudgetRows(isolatedDb, targetYear, targetMonth);
          expect(beforeCount).toBe(0);

          // Act: call getBudgets for the empty target month
          const result = await budgetService.getBudgets(targetYear, targetMonth);

          // The method should return carried-forward budgets
          expect(result.length).toBeGreaterThan(0);

          // CRITICAL ASSERTION: no rows should have been created in the DB
          const afterCount = await countBudgetRows(isolatedDb, targetYear, targetMonth);
          expect(afterCount).toBe(0);

          // Cleanup for next iteration
          await cleanupBudgets(isolatedDb, BASE_YEAR - 1, BASE_YEAR + 10);
        }
      ),
      dbPbtOptions({ numRuns: 3 })
    );
  });

  /**
   * Bug 1 — Cascade: getBudgets cascades phantom rows across multiple months.
   *
   * Call getBudgets for months April, May, June in sequence when only March has
   * budgets. Assert no rows are created in any of those months.
   *
   * On unfixed code this will FAIL because each call creates rows that then
   * propagate to the next month.
   *
   * Validates: Requirements 1.3
   */
  it('getBudgets should not cascade phantom budget rows across sequential months', async () => {
    const category = 'Groceries';
    const limit = 500;

    // Setup: only March has budgets
    await insertBudget(isolatedDb, BASE_YEAR, 3, category, limit);

    // Act: read April, May, June in sequence
    await budgetService.getBudgets(BASE_YEAR, 4);
    await budgetService.getBudgets(BASE_YEAR, 5);
    await budgetService.getBudgets(BASE_YEAR, 6);

    // CRITICAL ASSERTION: no rows should exist in April, May, or June
    const aprilCount = await countBudgetRows(isolatedDb, BASE_YEAR, 4);
    const mayCount = await countBudgetRows(isolatedDb, BASE_YEAR, 5);
    const juneCount = await countBudgetRows(isolatedDb, BASE_YEAR, 6);

    expect(aprilCount).toBe(0);
    expect(mayCount).toBe(0);
    expect(juneCount).toBe(0);
  });

  /**
   * Bug 2 — Copy success: copyBudgets after auto-carry-forward should have copied > 0.
   *
   * Set up a month with auto-carry-forwarded budgets (by calling getBudgets which
   * creates rows on unfixed code), then call copyBudgets with overwrite=true.
   *
   * On FIXED code (no auto-carry-forward side effect), the target month would have
   * 0 rows, so copyBudgets would create new rows and return copied > 0.
   *
   * On UNFIXED code, getBudgets already created rows, so copyBudgets returns
   * copied === 0 and overwritten > 0. The frontend only checks copied, so it
   * misreports as failure.
   *
   * This test asserts the EXPECTED behavior: after getBudgets (read-only), the
   * target month should still have no persistent rows, so copyBudgets should
   * create new rows (copied > 0).
   *
   * Validates: Requirements 1.2
   */
  it('copyBudgets after reading target month should create new rows (copied > 0), not overwrite', async () => {
    const categories = ['Groceries', 'Dining Out', 'Gas'];
    const limit = 400;

    // Setup: insert budgets in February (source month)
    for (const cat of categories) {
      await insertBudget(isolatedDb, BASE_YEAR, 2, cat, limit);
    }

    // Read March — on fixed code this should NOT create rows
    await budgetService.getBudgets(BASE_YEAR, 3);

    // Act: copy from February to March with overwrite
    const result = await budgetService.copyBudgets(BASE_YEAR, 2, BASE_YEAR, 3, true);

    // EXPECTED on fixed code: rows are newly created (not overwritten)
    // because getBudgets did not persist anything
    expect(result.copied).toBeGreaterThan(0);
  });

  /**
   * Bug 3 — averageBudgeted: getBudgetHistory should return averageBudgeted field.
   *
   * Create budgets for multiple months with known limits, call getBudgetHistory.
   * Assert averageBudgeted field exists and equals SUM(limits) / COUNT(months with budget).
   *
   * On unfixed code averageBudgeted will be undefined.
   *
   * Validates: Requirements 1.4
   */
  it('getBudgetHistory should return averageBudgeted for categories with budgets', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 1000 }),
        fc.integer({ min: 200, max: 2000 }),
        fc.integer({ min: 50, max: 500 }),
        async (limit1, limit2, limit3) => {
          // Setup: create Groceries budgets for Jan, Feb, Mar of BASE_YEAR
          await insertBudget(isolatedDb, BASE_YEAR, 1, 'Groceries', limit1);
          await insertBudget(isolatedDb, BASE_YEAR, 2, 'Groceries', limit2);
          await insertBudget(isolatedDb, BASE_YEAR, 3, 'Groceries', limit3);

          // Act: get budget history for 3-month period ending March
          const history = await budgetService.getBudgetHistory(BASE_YEAR, 3, 3);

          // Assert: averageBudgeted should exist and be correct
          const groceryData = history.categories['Groceries'];
          expect(groceryData).toBeDefined();

          const expectedAvg = (limit1 + limit2 + limit3) / 3;
          expect(groceryData.averageBudgeted).toBeDefined();
          expect(groceryData.averageBudgeted).toBeCloseTo(expectedAvg, 2);

          // Cleanup for next iteration
          await cleanupBudgets(isolatedDb, BASE_YEAR - 1, BASE_YEAR + 10);
        }
      ),
      dbPbtOptions({ numRuns: 3 })
    );
  });
});

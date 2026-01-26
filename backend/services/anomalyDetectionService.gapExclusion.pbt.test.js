/**
 * Property-Based Tests for AnomalyDetectionService - Gap Exclusion in Baselines
 * 
 * **Feature: spending-patterns-predictions, Property 22: Gap Exclusion in Baselines**
 * **Validates: Requirements 6.4**
 * 
 * Property 22: For any baseline calculation, months with zero expenses SHALL be
 * excluded from average calculations to prevent skewing results.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const anomalyDetectionService = require('./anomalyDetectionService');
const { getDatabase } = require('../database/db');

describe('AnomalyDetectionService - Gap Exclusion Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clear expenses table
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Clear dismissed anomalies
    anomalyDetectionService.clearDismissedAnomalies();
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Helper to insert an expense into the database
   */
  const insertExpense = async (expense) => {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO expenses (date, place, notes, amount, type, week, method)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        expense.date,
        expense.place || 'Test Place',
        expense.notes || '',
        expense.amount,
        expense.type,
        expense.week,
        expense.method
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  };

  /**
   * Generate a date string for a specific month offset from a base date
   */
  const generateDateInMonth = (baseYear, baseMonth, monthOffset) => {
    const date = new Date(baseYear, baseMonth + monthOffset, 15);
    return date.toISOString().split('T')[0];
  };

  test('Property 22: Baseline calculation only uses months with data', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate amounts for months with data
        fc.array(safeAmount({ min: 10, max: 500 }), { minLength: 3, maxLength: 10 }),
        // Generate gap months (0-3 gaps)
        fc.integer({ min: 0, max: 3 }),
        async (amounts, gapMonths) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          const category = 'Groceries';
          const baseYear = 2024;
          const baseMonth = 0;

          // Insert expenses with gaps
          let monthOffset = 0;
          for (const amount of amounts) {
            await insertExpense({
              date: generateDateInMonth(baseYear, baseMonth, monthOffset),
              amount,
              type: category,
              method: 'Cash',
              week: 1
            });
            // Skip some months to create gaps
            monthOffset += (monthOffset < gapMonths ? 2 : 1);
          }

          // Calculate baseline
          const baseline = await anomalyDetectionService.calculateCategoryBaseline(category);

          // Property: Mean should be calculated from actual amounts only
          const expectedMean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
          
          // Allow small floating point tolerance
          expect(Math.abs(baseline.mean - expectedMean)).toBeLessThan(0.01);
          
          // Property: Count should match number of expenses, not total months
          expect(baseline.count).toBe(amounts.length);
          
          // Property: monthsWithData should reflect actual months with expenses
          expect(baseline.monthsWithData).toBeLessThanOrEqual(amounts.length);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 22: Empty months do not affect standard deviation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate consistent amounts (low variance)
        fc.float({ min: 100, max: 100.5, noNaN: true }),
        fc.integer({ min: 5, max: 10 }),
        async (baseAmount, count) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          const category = 'Utilities';
          const baseYear = 2024;
          const amounts = [];

          // Insert expenses with gaps (every other month)
          for (let i = 0; i < count; i++) {
            const amount = baseAmount + (i * 0.1); // Small variation
            amounts.push(amount);
            await insertExpense({
              date: generateDateInMonth(baseYear, 0, i * 2), // Skip every other month
              amount,
              type: category,
              method: 'Debit',
              week: 1
            });
          }

          // Calculate baseline
          const baseline = await anomalyDetectionService.calculateCategoryBaseline(category);

          // Calculate expected standard deviation
          const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
          const variance = amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
          const expectedStdDev = Math.sqrt(variance);

          // Property: Standard deviation should be based only on actual expenses
          expect(Math.abs(baseline.stdDev - expectedStdDev)).toBeLessThan(0.1);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 22: Baseline with no expenses returns zero values', async () => {
    // Clear database to ensure empty state
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const baseline = await anomalyDetectionService.calculateCategoryBaseline('Groceries');

    expect(baseline.mean).toBe(0);
    expect(baseline.stdDev).toBe(0);
    expect(baseline.count).toBe(0);
    expect(baseline.monthsWithData).toBe(0);
    expect(baseline.hasValidBaseline).toBe(false);
  });

  test('Property 22: Baseline requires minimum occurrences for validity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 2 }), // Less than MIN_OCCURRENCES_FOR_PATTERN (3)
        safeAmount({ min: 50, max: 200 }),
        async (count, amount) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          const category = 'Entertainment';

          // Insert fewer than minimum required expenses
          for (let i = 0; i < count; i++) {
            await insertExpense({
              date: generateDateInMonth(2024, 0, i),
              amount,
              type: category,
              method: 'VISA',
              week: 1
            });
          }

          // Calculate baseline
          const baseline = await anomalyDetectionService.calculateCategoryBaseline(category);

          // Property: Baseline should not be valid with insufficient data
          expect(baseline.hasValidBaseline).toBe(false);
          expect(baseline.count).toBe(count);
        }
      ),
      pbtOptions()
    );
  });
});

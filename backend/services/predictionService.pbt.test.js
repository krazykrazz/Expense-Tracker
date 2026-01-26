/**
 * Property-Based Tests for PredictionService - Prediction Formula
 * 
 * **Feature: spending-patterns-predictions, Property 5: Prediction Formula Consistency**
 * **Validates: Requirements 2.1, 2.2**
 * 
 * Property 5: For any current month with spending data, the Prediction_Engine SHALL
 * calculate predictedTotal using the formula: `currentSpent + (dailyAverage * daysRemaining)`,
 * where dailyAverage incorporates both current trajectory and historical monthly average.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const predictionService = require('./predictionService');
const { getDatabase } = require('../database/db');
const { ANALYTICS_CONFIG } = require('../utils/analyticsConstants');

describe('PredictionService - Prediction Formula Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
    // Initial cleanup
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  });

  beforeEach(async () => {
    // Clear expenses and income tables with serialize
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM income_sources', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM income_sources', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM income_sources', (err) => {
          if (err) reject(err);
          else resolve();
        });
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
   * Helper to insert income source
   */
  const insertIncome = async (year, month, amount) => {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO income_sources (year, month, name, amount, category)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(sql, [year, month, 'Salary', amount, 'Salary'], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  };

  test('Property 5: Prediction includes current spending plus projected remaining', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate expenses for a past month (to ensure complete data)
        fc.array(
          fc.record({
            day: fc.integer({ min: 1, max: 28 }),
            amount: safeAmount(),
            type: expenseType,
            method: paymentMethod,
            week: weekNumber
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (expenseData) => {
          // Use a past month for predictable testing
          const year = 2024;
          const month = 6; // June 2024 (past month)

          // Clear database with serialize
          await new Promise((resolve, reject) => {
            db.serialize(() => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          });
          await new Promise(resolve => setTimeout(resolve, 5));

          // Insert expenses
          for (const exp of expenseData) {
            const date = `${year}-${String(month).padStart(2, '0')}-${String(exp.day).padStart(2, '0')}`;
            await insertExpense({
              date,
              amount: exp.amount,
              type: exp.type,
              method: exp.method,
              week: exp.week
            });
          }

          // Get prediction
          const prediction = await predictionService.getMonthEndPrediction(year, month);

          // Property: For a past month, predicted total should equal current spent
          // (since all days have elapsed)
          const totalSpent = expenseData.reduce((sum, e) => sum + e.amount, 0);
          
          expect(prediction.currentSpent).toBeCloseTo(totalSpent, 1);
          expect(prediction.predictedTotal).toBeCloseTo(totalSpent, 1);
          expect(prediction.daysRemaining).toBe(0);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 5: Prediction formula uses daily average for projection', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a consistent daily amount
        safeAmount({ min: 10, max: 100 }),
        fc.integer({ min: 5, max: 15 }), // days with expenses
        async (dailyAmount, numDays) => {
          const year = 2024;
          const month = 6; // June 2024

          // Clear database with serialize
          await new Promise((resolve, reject) => {
            db.serialize(() => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          });
          await new Promise(resolve => setTimeout(resolve, 5));

          // Insert one expense per day for numDays
          for (let day = 1; day <= numDays; day++) {
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            await insertExpense({
              date,
              amount: dailyAmount,
              type: 'Groceries',
              method: 'Cash',
              week: Math.ceil(day / 7)
            });
          }

          const prediction = await predictionService.getMonthEndPrediction(year, month);

          // Property: Daily average should be close to the actual daily amount
          const expectedDailyAvg = dailyAmount; // One expense per day
          
          // For a past month, all days elapsed, so dailyAverage = totalSpent / 30
          const totalSpent = dailyAmount * numDays;
          const calculatedDailyAvg = totalSpent / 30; // June has 30 days
          
          expect(prediction.dailyAverage).toBeCloseTo(calculatedDailyAvg, 1);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 5: Prediction is always >= current spending', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            day: fc.integer({ min: 1, max: 28 }),
            amount: safeAmount(),
            type: expenseType,
            method: paymentMethod,
            week: weekNumber
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.integer({ min: 2024, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        async (expenseData, year, month) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Insert expenses
          for (const exp of expenseData) {
            const date = `${year}-${String(month).padStart(2, '0')}-${String(exp.day).padStart(2, '0')}`;
            await insertExpense({
              date,
              amount: exp.amount,
              type: exp.type,
              method: exp.method,
              week: exp.week
            });
          }

          const prediction = await predictionService.getMonthEndPrediction(year, month);

          // Property: Predicted total should always be >= current spent
          expect(prediction.predictedTotal).toBeGreaterThanOrEqual(prediction.currentSpent - 0.01);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 5: Empty month returns zero prediction', async () => {
    // Clear database
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const prediction = await predictionService.getMonthEndPrediction(2024, 6);

    expect(prediction.currentSpent).toBe(0);
    expect(prediction.dailyAverage).toBe(0);
    // With no historical data, prediction should be 0
    expect(prediction.predictedTotal).toBe(0);
  });

  test('Property 5: Category breakdown sums to total current spending', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            day: fc.integer({ min: 1, max: 28 }),
            amount: safeAmount(),
            type: expenseType,
            method: paymentMethod,
            week: weekNumber
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (expenseData) => {
          const year = 2024;
          const month = 6;

          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Insert expenses
          for (const exp of expenseData) {
            const date = `${year}-${String(month).padStart(2, '0')}-${String(exp.day).padStart(2, '0')}`;
            await insertExpense({
              date,
              amount: exp.amount,
              type: exp.type,
              method: exp.method,
              week: exp.week
            });
          }

          const prediction = await predictionService.getMonthEndPrediction(year, month);

          // Property: Sum of category breakdown current spending should equal total
          const categorySum = prediction.categoryBreakdown.reduce(
            (sum, cat) => sum + cat.currentSpent, 0
          );
          
          expect(categorySum).toBeCloseTo(prediction.currentSpent, 1);
        }
      ),
      pbtOptions()
    );
  });
});

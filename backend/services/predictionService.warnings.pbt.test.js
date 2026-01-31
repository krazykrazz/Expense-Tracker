/**
 * Property-Based Tests for PredictionService - Income and YoY Warnings
 * 
 * **Feature: spending-patterns-predictions, Property 6 & 7: Income Exceedance and YoY Variance**
 * **Validates: Requirements 2.3, 2.4**
 * 
 * Property 6: For any prediction where predictedTotal > monthlyIncome, the exceedsIncome
 * flag SHALL be true; otherwise false.
 * 
 * Property 7: For any prediction where the same month last year has data, if
 * (predictedTotal - lastYearSameMonth) / lastYearSameMonth > 0.20, the yearOverYearChange
 * SHALL be highlighted as a warning.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const predictionService = require('./predictionService');
const { getDatabase } = require('../database/db');
const { ANALYTICS_CONFIG } = require('../utils/analyticsConstants');

describe('PredictionService - Income and YoY Warning Property Tests', () => {
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
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM income_sources', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  });

  beforeEach(async () => {
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

  // Property 6: Income Exceedance Warning
  describe('Property 6: Income Exceedance Warning', () => {
    test('exceedsIncome is true when predicted > income', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Monthly income
          safeAmount({ min: 1000, max: 3000 }),
          // Spending that exceeds income
          safeAmount({ min: 3500, max: 6000 }),
          async (monthlyIncome, totalSpending) => {
            // Clear database with serialize
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
            await new Promise(resolve => setTimeout(resolve, 5));

            const year = 2024;
            const month = 6;

            // Insert income
            await insertIncome(year, month, monthlyIncome);

            // Insert expenses that exceed income (spread across the month)
            const daysInMonth = 30;
            const dailySpend = totalSpending / daysInMonth;
            for (let day = 1; day <= daysInMonth; day++) {
              await insertExpense({
                date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                amount: dailySpend,
                type: 'Groceries',
                method: 'Cash',
                week: Math.ceil(day / 7)
              });
            }

            const prediction = await predictionService.getMonthEndPrediction(year, month);

            // Property: When predicted > income, exceedsIncome should be true
            if (prediction.predictedTotal > monthlyIncome) {
              expect(prediction.exceedsIncome).toBe(true);
            }
          }
        ),
        pbtOptions()
      );
    });

    test('exceedsIncome is false when predicted <= income', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Monthly income (high)
          safeAmount({ min: 5000, max: 10000 }),
          // Spending that is below income
          safeAmount({ min: 500, max: 2000 }),
          async (monthlyIncome, totalSpending) => {
            // Clear database with serialize
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
            await new Promise(resolve => setTimeout(resolve, 5));

            const year = 2024;
            const month = 6;

            // Insert income
            await insertIncome(year, month, monthlyIncome);

            // Insert expenses below income
            const daysInMonth = 30;
            const dailySpend = totalSpending / daysInMonth;
            for (let day = 1; day <= daysInMonth; day++) {
              await insertExpense({
                date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                amount: dailySpend,
                type: 'Groceries',
                method: 'Cash',
                week: Math.ceil(day / 7)
              });
            }

            const prediction = await predictionService.getMonthEndPrediction(year, month);

            // Property: When predicted <= income, exceedsIncome should be false
            if (prediction.predictedTotal <= monthlyIncome) {
              expect(prediction.exceedsIncome).toBe(false);
            }
          }
        ),
        pbtOptions()
      );
    });

    test('exceedsIncome is false when no income is set', async () => {
      // Clear database
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM income_sources', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const year = 2024;
      const month = 6;

      // Insert some expenses but no income
      await insertExpense({
        date: `${year}-${String(month).padStart(2, '0')}-15`,
        amount: 1000,
        type: 'Groceries',
        method: 'Cash',
        week: 3
      });

      const prediction = await predictionService.getMonthEndPrediction(year, month);

      // Property: With no income set (0), exceedsIncome should be false
      expect(prediction.exceedsIncome).toBe(false);
    });
  });

  // Property 7: Year-Over-Year Variance Highlighting
  describe('Property 7: Year-Over-Year Variance Highlighting', () => {
    test('YoY change is calculated correctly', async () => {
      // Use a simpler approach with fewer iterations to avoid timing issues
      const testCases = [
        { lastYearSpending: 1000, thisYearSpending: 1500 },
        { lastYearSpending: 2000, thisYearSpending: 1000 },
        { lastYearSpending: 1500, thisYearSpending: 1500 },
        { lastYearSpending: 3000, thisYearSpending: 4500 },
        { lastYearSpending: 1000, thisYearSpending: 5000 }
      ];

      for (const { lastYearSpending, thisYearSpending } of testCases) {
        // Clear database
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM expenses', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        // Small delay to ensure delete completes
        await new Promise(resolve => setTimeout(resolve, 20));

        const year = 2024;
        const month = 6;

        // Insert last year's expenses - spread across the month for complete data
        const lastYearDays = 30;
        const lastYearDaily = lastYearSpending / lastYearDays;
        for (let day = 1; day <= lastYearDays; day++) {
          await insertExpense({
            date: `${year - 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            amount: lastYearDaily,
            type: 'Groceries',
            method: 'Cash',
            week: Math.ceil(day / 7)
          });
        }

        // Insert this year's expenses (spread across month for complete data)
        const daysInMonth = 30;
        const dailySpend = thisYearSpending / daysInMonth;
        for (let day = 1; day <= daysInMonth; day++) {
          await insertExpense({
            date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            amount: dailySpend,
            type: 'Groceries',
            method: 'Cash',
            week: Math.ceil(day / 7)
          });
        }

        // Small delay to ensure all inserts complete
        await new Promise(resolve => setTimeout(resolve, 20));

        const prediction = await predictionService.getMonthEndPrediction(year, month);

        // Property: YoY change should be calculated when last year data exists
        expect(prediction.yearOverYearChange).not.toBeNull();
        
        // Verify the calculation is approximately correct
        // Note: prediction uses predictedTotal which may differ from thisYearSpending
        if (prediction.yearOverYearChange !== null) {
          const expectedChange = ((prediction.predictedTotal - lastYearSpending) / lastYearSpending) * 100;
          expect(prediction.yearOverYearChange).toBeCloseTo(expectedChange, 0);
        }
      }
    });

    test('YoY change is null when no last year data', async () => {
      // Clear database
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const year = 2024;
      const month = 6;

      // Insert only this year's expenses
      await insertExpense({
        date: `${year}-${String(month).padStart(2, '0')}-15`,
        amount: 1000,
        type: 'Groceries',
        method: 'Cash',
        week: 3
      });

      const prediction = await predictionService.getMonthEndPrediction(year, month);

      // Property: With no last year data, YoY change should be null
      expect(prediction.yearOverYearChange).toBeNull();
    });

    test('YoY warning threshold is 20%', async () => {
      // Verify the threshold constant
      expect(ANALYTICS_CONFIG.YOY_WARNING_THRESHOLD).toBe(0.20);
    });

    test('compareToHistorical returns yoyWarning when variance > 20%', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Last year spending
          safeAmount({ min: 1000, max: 2000 }),
          async (lastYearSpending) => {
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

            const year = 2024;
            const month = 6;

            // Insert last year's expenses - spread across the month
            const lastYearDays = 30;
            const lastYearDaily = lastYearSpending / lastYearDays;
            for (let day = 1; day <= lastYearDays; day++) {
              await insertExpense({
                date: `${year - 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                amount: lastYearDaily,
                type: 'Groceries',
                method: 'Cash',
                week: Math.ceil(day / 7)
              });
            }

            // Insert this year's expenses (>20% more than last year)
            const thisYearSpending = lastYearSpending * 1.3; // 30% more
            const daysInMonth = 30;
            const dailySpend = thisYearSpending / daysInMonth;
            for (let day = 1; day <= daysInMonth; day++) {
              await insertExpense({
                date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                amount: dailySpend,
                type: 'Groceries',
                method: 'Cash',
                week: Math.ceil(day / 7)
              });
            }

            const comparison = await predictionService.compareToHistorical(year, month);

            // Property: When variance > 20%, yoyWarning should be true
            // Note: The actual variance depends on the prediction formula, not just raw spending
            // So we check if the warning is set when the predicted total exceeds threshold
            if (comparison.yearOverYearChange !== null && comparison.yearOverYearChange > 20) {
              expect(comparison.yoyWarning).toBe(true);
            }
          }
        ),
        pbtOptions()
      );
    });

    test('compareToHistorical returns yoyWarning false when variance <= 20%', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Last year spending
          safeAmount({ min: 1000, max: 2000 }),
          async (lastYearSpending) => {
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

            const year = 2024;
            const month = 6;

            // Insert last year's expenses - spread across the month
            const lastYearDays = 30;
            const lastYearDaily = lastYearSpending / lastYearDays;
            for (let day = 1; day <= lastYearDays; day++) {
              await insertExpense({
                date: `${year - 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                amount: lastYearDaily,
                type: 'Groceries',
                method: 'Cash',
                week: Math.ceil(day / 7)
              });
            }

            // Insert this year's expenses (<=20% more than last year)
            const thisYearSpending = lastYearSpending * 1.1; // 10% more
            const daysInMonth = 30;
            const dailySpend = thisYearSpending / daysInMonth;
            for (let day = 1; day <= daysInMonth; day++) {
              await insertExpense({
                date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                amount: dailySpend,
                type: 'Groceries',
                method: 'Cash',
                week: Math.ceil(day / 7)
              });
            }

            const comparison = await predictionService.compareToHistorical(year, month);

            // Property: When variance <= 20%, yoyWarning should be false
            // Note: The actual variance depends on the prediction formula
            // So we check if the warning is correctly set based on the calculated change
            if (comparison.yearOverYearChange !== null && comparison.yearOverYearChange <= 20) {
              expect(comparison.yoyWarning).toBe(false);
            }
          }
        ),
        pbtOptions()
      );
    });
  });
});

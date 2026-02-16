/**
 * Property-Based Tests for PredictionService - Edge Cases and Warnings
 * 
 * Consolidates:
 * - predictionService.warnings.pbt.test.js (Income and YoY Warnings)
 * - predictionService.earlyMonth.pbt.test.js (Early Month Historical Weighting)
 * 
 * **Feature: spending-patterns-predictions**
 * **Validates: Requirements 2.3, 2.4, 2.6**
 * 
 * @invariant Income Exceedance and YoY Variance: Predictions flag when spending exceeds
 * income or shows >20% year-over-year variance. Early in the month (<7 days), historical
 * averages receive greater weight than current trajectory in prediction calculations.
 */

const fc = require('fast-check');
const { dbPbtOptions, safeAmount } = require('../test/pbtArbitraries');
const predictionService = require('./predictionService');
const { getDatabase } = require('../database/db');
const { ANALYTICS_CONFIG } = require('../utils/analyticsConstants');

describe('PredictionService - Edge Cases and Warnings Property Tests', () => {
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

  // ============================================================================
  // Income Exceedance Warning Tests
  // ============================================================================

  describe('Income Exceedance Warning', () => {
    test('Property: exceedsIncome is true when predicted > income', async () => {
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
        dbPbtOptions()
      );
    });

    test('Property: exceedsIncome is false when predicted <= income', async () => {
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
        dbPbtOptions()
      );
    });

    test('Property: exceedsIncome is false when no income is set', async () => {
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

  // ============================================================================
  // Year-Over-Year Variance Tests
  // ============================================================================

  describe('Year-Over-Year Variance Highlighting', () => {
    test('Property: YoY change is calculated correctly', async () => {
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

    test('Property: YoY change is null when no last year data', async () => {
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

    test('Property: YoY warning threshold is 20%', async () => {
      // Verify the threshold constant
      expect(ANALYTICS_CONFIG.YOY_WARNING_THRESHOLD).toBe(0.20);
    });

    test('Property: compareToHistorical returns yoyWarning when variance > 20%', async () => {
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
        dbPbtOptions()
      );
    });

    test('Property: compareToHistorical returns yoyWarning false when variance <= 20%', async () => {
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
        dbPbtOptions()
      );
    });
  });

  // ============================================================================
  // Early Month Historical Weighting Tests
  // ============================================================================

  describe('Early Month Historical Weighting', () => {
    test('Property: Early month weighting formula gives historical more weight', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Current spent amount
          safeAmount({ min: 100, max: 500 }),
          // Current daily average (low)
          safeAmount({ min: 10, max: 50 }),
          // Historical monthly average (high - to create contrast)
          safeAmount({ min: 2000, max: 5000 }),
          // Days elapsed in early month (1-6)
          fc.integer({ min: 1, max: ANALYTICS_CONFIG.EARLY_MONTH_DAYS - 1 }),
          async (currentSpent, dailyAverage, historicalAverage, daysElapsed) => {
            const totalDays = 30;
            const daysRemaining = totalDays - daysElapsed;

            // Call the internal calculation method
            const prediction = predictionService._calculatePrediction(
              currentSpent,
              dailyAverage,
              daysRemaining,
              daysElapsed,
              historicalAverage,
              totalDays
            );

            // Calculate pure trajectory and historical predictions
            const trajectoryPrediction = currentSpent + (dailyAverage * daysRemaining);
            const historicalDailyAvg = historicalAverage / totalDays;
            const historicalPrediction = currentSpent + (historicalDailyAvg * daysRemaining);

            // Property: In early month, prediction should be closer to historical than trajectory
            // when there's a significant difference between them
            if (Math.abs(historicalPrediction - trajectoryPrediction) > 100) {
              const distanceToHistorical = Math.abs(prediction - historicalPrediction);
              const distanceToTrajectory = Math.abs(prediction - trajectoryPrediction);
              
              // Historical should have more influence (prediction closer to historical)
              expect(distanceToHistorical).toBeLessThanOrEqual(distanceToTrajectory + 1);
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property: Prediction uses historical average when no current data (daysElapsed=0)', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeAmount({ min: 1000, max: 5000 }),
          async (historicalAverage) => {
            const totalDays = 30;
            const daysElapsed = 0;
            const daysRemaining = totalDays;
            const currentSpent = 0;
            const dailyAverage = 0;

            // Call the internal calculation method
            const prediction = predictionService._calculatePrediction(
              currentSpent,
              dailyAverage,
              daysRemaining,
              daysElapsed,
              historicalAverage,
              totalDays
            );

            // Property: With no current data, prediction should equal historical average
            expect(prediction).toBeCloseTo(historicalAverage, 0);
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property: Later in month, trajectory gets more weight', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Current spent amount
          safeAmount({ min: 1000, max: 3000 }),
          // Current daily average
          safeAmount({ min: 100, max: 200 }),
          // Historical monthly average (different from trajectory)
          safeAmount({ min: 500, max: 1500 }),
          // Days elapsed (after early month period, closer to end)
          fc.integer({ min: 20, max: 28 }),
          async (currentSpent, dailyAverage, historicalAverage, daysElapsed) => {
            const totalDays = 30;
            const daysRemaining = totalDays - daysElapsed;

            // Call the internal calculation method
            const prediction = predictionService._calculatePrediction(
              currentSpent,
              dailyAverage,
              daysRemaining,
              daysElapsed,
              historicalAverage,
              totalDays
            );

            // Calculate pure trajectory and historical predictions
            const trajectoryPrediction = currentSpent + (dailyAverage * daysRemaining);
            const historicalDailyAvg = historicalAverage / totalDays;
            const historicalPrediction = currentSpent + (historicalDailyAvg * daysRemaining);

            // Property: Later in month, prediction should be closer to trajectory
            if (Math.abs(historicalPrediction - trajectoryPrediction) > 50) {
              const distanceToHistorical = Math.abs(prediction - historicalPrediction);
              const distanceToTrajectory = Math.abs(prediction - trajectoryPrediction);
              
              // Trajectory should have more influence later in month
              expect(distanceToTrajectory).toBeLessThanOrEqual(distanceToHistorical + 1);
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property: EARLY_MONTH_DAYS threshold is respected', async () => {
      // Verify the threshold constant is 7
      expect(ANALYTICS_CONFIG.EARLY_MONTH_DAYS).toBe(7);
    });

    test('Property: Prediction equals current spent when month is complete', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeAmount({ min: 1000, max: 5000 }),
          safeAmount({ min: 1000, max: 5000 }),
          async (currentSpent, historicalAverage) => {
            const totalDays = 30;
            const daysElapsed = totalDays;
            const daysRemaining = 0;
            const dailyAverage = currentSpent / totalDays;

            // Call the internal calculation method
            const prediction = predictionService._calculatePrediction(
              currentSpent,
              dailyAverage,
              daysRemaining,
              daysElapsed,
              historicalAverage,
              totalDays
            );

            // Property: When month is complete, prediction should equal current spent
            expect(prediction).toBeCloseTo(currentSpent, 2);
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property: Weighting transitions smoothly from early to late month', async () => {
      // Test that as days progress, trajectory weight increases
      const currentSpent = 500;
      const dailyAverage = 50;
      const historicalAverage = 3000;
      const totalDays = 30;

      const predictions = [];
      for (let daysElapsed = 1; daysElapsed <= 25; daysElapsed++) {
        const daysRemaining = totalDays - daysElapsed;
        const prediction = predictionService._calculatePrediction(
          currentSpent,
          dailyAverage,
          daysRemaining,
          daysElapsed,
          historicalAverage,
          totalDays
        );
        predictions.push({ daysElapsed, prediction });
      }

      // Calculate trajectory and historical predictions for comparison
      const trajectoryPrediction = currentSpent + (dailyAverage * (totalDays - 1));
      const historicalDailyAvg = historicalAverage / totalDays;
      const historicalPrediction = currentSpent + (historicalDailyAvg * (totalDays - 1));

      // Early predictions should be closer to historical
      const earlyPrediction = predictions.find(p => p.daysElapsed === 3).prediction;
      const earlyDistToHist = Math.abs(earlyPrediction - historicalPrediction);
      const earlyDistToTraj = Math.abs(earlyPrediction - trajectoryPrediction);
      
      // Late predictions should be closer to trajectory
      const latePrediction = predictions.find(p => p.daysElapsed === 25).prediction;
      const lateDistToHist = Math.abs(latePrediction - historicalPrediction);
      const lateDistToTraj = Math.abs(latePrediction - trajectoryPrediction);

      // Early month: closer to historical
      expect(earlyDistToHist).toBeLessThan(earlyDistToTraj);
      
      // Late month: closer to trajectory
      expect(lateDistToTraj).toBeLessThan(lateDistToHist);
    });
  });
});

/**
 * Property-Based Tests for PredictionService - Core Prediction Logic
 * 
 * Consolidates:
 * - predictionService.pbt.test.js (Prediction Formula)
 * - predictionService.confidence.pbt.test.js (Confidence Level Assignment)
 * 
 * **Feature: spending-patterns-predictions**
 * **Validates: Requirements 2.1, 2.2, 2.5**
 * 
 * @invariant Prediction Formula Consistency: For any current month with spending data,
 * the predicted total is calculated using current spending plus projected remaining days,
 * with confidence levels determined by historical data availability (12+ months = high,
 * 6-11 months = medium, <6 months = low).
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const predictionService = require('./predictionService');
const { getDatabase } = require('../database/db');
const { CONFIDENCE_LEVELS } = require('../utils/analyticsConstants');

describe('PredictionService - Core Prediction Logic Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
    // Initial cleanup
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  beforeEach(async () => {
    // Clear expenses table
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Clear income_sources table
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM income_sources', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Small delay to ensure cleanup completes
    await new Promise(resolve => setTimeout(resolve, 20));
  });

  afterEach(async () => {
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
  });

  afterAll(async () => {
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

  /**
   * Generate a date string for a specific month offset from a base date
   * Uses Date object for reliable month arithmetic
   */
  const generateDateInMonth = (baseYear, baseMonth, monthOffset) => {
    // Use Date object for reliable month arithmetic
    const date = new Date(baseYear, baseMonth - 1 + monthOffset, 15);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}-15`;
  };

  // ============================================================================
  // Prediction Formula Tests
  // ============================================================================

  describe('Prediction Formula Consistency', () => {
    test('Property: Prediction includes current spending plus projected remaining', async () => {
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

            // Clear database - get fresh connection
            const freshDb = await getDatabase();
            await new Promise((resolve, reject) => {
              freshDb.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            await new Promise(resolve => setTimeout(resolve, 20));

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

    test('Property: Prediction formula uses daily average for projection', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a consistent daily amount
          safeAmount({ min: 10, max: 100 }),
          fc.integer({ min: 5, max: 15 }), // days with expenses
          async (dailyAmount, numDays) => {
            const year = 2024;
            const month = 6; // June 2024

            // Clear database - get fresh connection
            const freshDb = await getDatabase();
            await new Promise((resolve, reject) => {
              freshDb.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            await new Promise(resolve => setTimeout(resolve, 20));

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
            // For a past month, all days elapsed, so dailyAverage = totalSpent / 30
            const totalSpent = dailyAmount * numDays;
            const calculatedDailyAvg = totalSpent / 30; // June has 30 days
            
            expect(prediction.dailyAverage).toBeCloseTo(calculatedDailyAvg, 1);
          }
        ),
        pbtOptions()
      );
    });

    test('Property: Prediction is always >= current spending', async () => {
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

    test('Property: Empty month returns zero prediction', async () => {
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

    test('Property: Category breakdown sums to total current spending', async () => {
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

  // ============================================================================
  // Confidence Level Tests
  // ============================================================================

  describe('Confidence Level Assignment', () => {
    test('Property: Confidence is LOW when fewer than 6 months of data', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 1-5 months of data (low confidence)
          fc.integer({ min: 1, max: 5 }),
          fc.array(
            fc.record({
              amount: safeAmount(),
              type: expenseType,
              method: paymentMethod,
              week: weekNumber
            }),
            { minLength: 1, maxLength: 3 }
          ),
          async (monthsOfData, expenseTemplates) => {
            // Clear database with serialize to ensure completion
            await new Promise((resolve, reject) => {
              db.serialize(() => {
                db.run('DELETE FROM expenses', (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
            });
            await new Promise(resolve => setTimeout(resolve, 5));

            // Insert expenses spanning the specified number of months
            // Use months before the target month (2024-06)
            const targetYear = 2024;
            const targetMonth = 6;

            for (let monthOffset = 1; monthOffset <= monthsOfData; monthOffset++) {
              for (const template of expenseTemplates) {
                await insertExpense({
                  date: generateDateInMonth(targetYear, targetMonth, -monthOffset),
                  amount: template.amount,
                  type: template.type,
                  method: template.method,
                  week: template.week
                });
              }
            }

            // Get confidence level
            const confidence = await predictionService.calculateConfidenceLevel(targetYear, targetMonth);

            // Property: With fewer than 6 months, confidence should be LOW
            expect(confidence).toBe(CONFIDENCE_LEVELS.LOW);
          }
        ),
        pbtOptions()
      );
    });

    test('Property: Confidence is MEDIUM when 6-11 months of data', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 6-11 months of data (medium confidence)
          fc.integer({ min: 6, max: 11 }),
          fc.array(
            fc.record({
              amount: safeAmount(),
              type: expenseType,
              method: paymentMethod,
              week: weekNumber
            }),
            { minLength: 1, maxLength: 2 }
          ),
          async (monthsOfData, expenseTemplates) => {
            // Clear database with serialize to ensure completion
            await new Promise((resolve, reject) => {
              db.serialize(() => {
                db.run('DELETE FROM expenses', (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
            });
            await new Promise(resolve => setTimeout(resolve, 5));

            const targetYear = 2024;
            const targetMonth = 6;

            for (let monthOffset = 1; monthOffset <= monthsOfData; monthOffset++) {
              for (const template of expenseTemplates) {
                await insertExpense({
                  date: generateDateInMonth(targetYear, targetMonth, -monthOffset),
                  amount: template.amount,
                  type: template.type,
                  method: template.method,
                  week: template.week
                });
              }
            }

            const confidence = await predictionService.calculateConfidenceLevel(targetYear, targetMonth);

            // Property: With 6-11 months, confidence should be MEDIUM
            expect(confidence).toBe(CONFIDENCE_LEVELS.MEDIUM);
          }
        ),
        pbtOptions()
      );
    });

    test('Property: Confidence is HIGH when 12+ months of data', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 12-18 months of data (high confidence)
          fc.integer({ min: 12, max: 18 }),
          fc.array(
            fc.record({
              amount: safeAmount(),
              type: expenseType,
              method: paymentMethod,
              week: weekNumber
            }),
            { minLength: 1, maxLength: 2 }
          ),
          async (monthsOfData, expenseTemplates) => {
            // Clear database with serialize to ensure completion
            await new Promise((resolve, reject) => {
              db.serialize(() => {
                db.run('DELETE FROM expenses', (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
            });
            await new Promise(resolve => setTimeout(resolve, 5));

            const targetYear = 2024;
            const targetMonth = 6;

            for (let monthOffset = 1; monthOffset <= monthsOfData; monthOffset++) {
              for (const template of expenseTemplates) {
                await insertExpense({
                  date: generateDateInMonth(targetYear, targetMonth, -monthOffset),
                  amount: template.amount,
                  type: template.type,
                  method: template.method,
                  week: template.week
                });
              }
            }

            const confidence = await predictionService.calculateConfidenceLevel(targetYear, targetMonth);

            // Property: With 12+ months, confidence should be HIGH
            expect(confidence).toBe(CONFIDENCE_LEVELS.HIGH);
          }
        ),
        pbtOptions()
      );
    });

    test('Property: Empty dataset returns LOW confidence', async () => {
      // Clear database
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const confidence = await predictionService.calculateConfidenceLevel(2024, 6);

      expect(confidence).toBe(CONFIDENCE_LEVELS.LOW);
    });

    test('Property: Current month data is excluded from confidence calculation', async () => {
      // Clear database
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const targetYear = 2024;
      const targetMonth = 6;

      // Add expenses only in the target month (should be excluded)
      for (let i = 0; i < 5; i++) {
        await insertExpense({
          date: `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
          amount: 100,
          type: 'Groceries',
          method: 'Cash',
          week: 1
        });
      }

      const confidence = await predictionService.calculateConfidenceLevel(targetYear, targetMonth);

      // Property: Current month should be excluded, so confidence should be LOW
      expect(confidence).toBe(CONFIDENCE_LEVELS.LOW);
    });

    test('Property: Confidence level is included in prediction response', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 15 }),
          async (monthsOfData) => {
            // Clear database
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            const targetYear = 2024;
            const targetMonth = 6;

            for (let monthOffset = 1; monthOffset <= monthsOfData; monthOffset++) {
              await insertExpense({
                date: generateDateInMonth(targetYear, targetMonth, -monthOffset),
                amount: 100,
                type: 'Groceries',
                method: 'Cash',
                week: 1
              });
            }

            const prediction = await predictionService.getMonthEndPrediction(targetYear, targetMonth);

            // Property: Prediction should include confidence level
            expect(prediction.confidenceLevel).toBeDefined();
            expect([CONFIDENCE_LEVELS.LOW, CONFIDENCE_LEVELS.MEDIUM, CONFIDENCE_LEVELS.HIGH])
              .toContain(prediction.confidenceLevel);
          }
        ),
        pbtOptions()
      );
    });
  });
});

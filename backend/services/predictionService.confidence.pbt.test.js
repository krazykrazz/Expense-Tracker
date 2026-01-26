/**
 * Property-Based Tests for PredictionService - Confidence Level Assignment
 * 
 * **Feature: spending-patterns-predictions, Property 8: Confidence Level Assignment**
 * **Validates: Requirements 2.5**
 * 
 * Property 8: For any prediction calculation, confidence level SHALL be 'high' if 12+ months
 * of data exist, 'medium' if 6-11 months exist, and 'low' if fewer than 6 months exist.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const predictionService = require('./predictionService');
const { getDatabase } = require('../database/db');
const { ANALYTICS_CONFIG, CONFIDENCE_LEVELS } = require('../utils/analyticsConstants');

describe('PredictionService - Confidence Level Property Tests', () => {
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
    // Use serialize to ensure sequential execution
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    // Small delay to ensure cleanup is complete
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
   * Uses Date object for reliable month arithmetic
   */
  const generateDateInMonth = (baseYear, baseMonth, monthOffset) => {
    // Use Date object for reliable month arithmetic
    const date = new Date(baseYear, baseMonth - 1 + monthOffset, 15);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}-15`;
  };

  test('Property 8: Confidence is LOW when fewer than 6 months of data', async () => {
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

  test('Property 8: Confidence is MEDIUM when 6-11 months of data', async () => {
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

  test('Property 8: Confidence is HIGH when 12+ months of data', async () => {
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

  test('Property 8: Empty dataset returns LOW confidence', async () => {
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

  test('Property 8: Current month data is excluded from confidence calculation', async () => {
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

  test('Property 8: Confidence level is included in prediction response', async () => {
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

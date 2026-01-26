/**
 * Property-Based Tests for SpendingPatternsService - Data Sufficiency Validation
 * 
 * **Feature: spending-patterns-predictions, Property 3: Data Sufficiency Validation**
 * **Validates: Requirements 1.3, 6.1**
 * 
 * Property 3: For any expense dataset, if the date range spans fewer than 3 months,
 * the System SHALL return hasSufficientData=false and disable pattern analysis features;
 * if 3+ months exist, hasSufficientData=true.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const spendingPatternsService = require('./spendingPatternsService');
const { getDatabase } = require('../database/db');
const { ANALYTICS_CONFIG } = require('../utils/analyticsConstants');

describe('SpendingPatternsService - Data Sufficiency Property Tests', () => {
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

  test('Property 3: Data sufficiency returns false when less than 3 months of data', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-2 months of data (insufficient)
        fc.integer({ min: 1, max: 2 }),
        fc.array(
          fc.record({
            amount: safeAmount(),
            type: expenseType,
            method: paymentMethod,
            week: weekNumber
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (monthsOfData, expenseTemplates) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Insert expenses spanning the specified number of months
          const baseYear = 2024;
          const baseMonth = 0; // January

          for (let monthOffset = 0; monthOffset < monthsOfData; monthOffset++) {
            for (const template of expenseTemplates) {
              await insertExpense({
                date: generateDateInMonth(baseYear, baseMonth, monthOffset),
                amount: template.amount,
                type: template.type,
                method: template.method,
                week: template.week
              });
            }
          }

          // Check data sufficiency
          const result = await spendingPatternsService.checkDataSufficiency();

          // Property: With less than 3 months, hasSufficientData should be false
          expect(result.hasSufficientData).toBe(false);
          expect(result.monthsOfData).toBeLessThan(ANALYTICS_CONFIG.MIN_MONTHS_FOR_PATTERNS);
          expect(result.availableFeatures.recurringPatterns).toBe(false);
          expect(result.missingDataMessage).not.toBeNull();
        }
      ),
      pbtOptions()
    );
  });

  test('Property 3: Data sufficiency returns true when 3+ months of data exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 3-12 months of data (sufficient)
        fc.integer({ min: 3, max: 12 }),
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
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Insert expenses spanning the specified number of months
          const baseYear = 2024;
          const baseMonth = 0; // January

          for (let monthOffset = 0; monthOffset < monthsOfData; monthOffset++) {
            for (const template of expenseTemplates) {
              await insertExpense({
                date: generateDateInMonth(baseYear, baseMonth, monthOffset),
                amount: template.amount,
                type: template.type,
                method: template.method,
                week: template.week
              });
            }
          }

          // Check data sufficiency
          const result = await spendingPatternsService.checkDataSufficiency();

          // Property: With 3+ months, hasSufficientData should be true
          expect(result.hasSufficientData).toBe(true);
          expect(result.monthsOfData).toBeGreaterThanOrEqual(ANALYTICS_CONFIG.MIN_MONTHS_FOR_PATTERNS);
          expect(result.availableFeatures.recurringPatterns).toBe(true);
          expect(result.missingDataMessage).toBeNull();
        }
      ),
      pbtOptions()
    );
  });

  test('Property 3: Empty dataset returns hasSufficientData=false', async () => {
    // Clear database to ensure empty state
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const result = await spendingPatternsService.checkDataSufficiency();

    expect(result.hasSufficientData).toBe(false);
    expect(result.monthsOfData).toBe(0);
    expect(result.oldestExpenseDate).toBeNull();
    expect(result.newestExpenseDate).toBeNull();
    expect(result.dataQualityScore).toBe(0);
    expect(result.availableFeatures.recurringPatterns).toBe(false);
    expect(result.availableFeatures.predictions).toBe(false);
    expect(result.availableFeatures.seasonalAnalysis).toBe(false);
    expect(result.availableFeatures.dayOfWeekAnalysis).toBe(false);
    expect(result.availableFeatures.anomalyDetection).toBe(false);
  });

  test('Property 3: Data quality score is between 0 and 100', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 6 }),
        fc.array(
          fc.record({
            amount: safeAmount(),
            type: expenseType,
            method: paymentMethod,
            week: weekNumber
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (monthsOfData, expenseTemplates) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          const baseYear = 2024;
          const baseMonth = 0;

          for (let monthOffset = 0; monthOffset < monthsOfData; monthOffset++) {
            for (const template of expenseTemplates) {
              await insertExpense({
                date: generateDateInMonth(baseYear, baseMonth, monthOffset),
                amount: template.amount,
                type: template.type,
                method: template.method,
                week: template.week
              });
            }
          }

          const result = await spendingPatternsService.checkDataSufficiency();

          // Property: Data quality score should always be between 0 and 100
          expect(result.dataQualityScore).toBeGreaterThanOrEqual(0);
          expect(result.dataQualityScore).toBeLessThanOrEqual(100);
        }
      ),
      pbtOptions()
    );
  });
});

/**
 * Property-Based Tests for SpendingPatternsService - Data Quality
 * 
 * Consolidated from:
 * - dataSufficiency.pbt.test.js
 * - amountVariance.pbt.test.js
 * 
 * @invariant Data sufficiency validation must return hasSufficientData=false when less than
 * 3 months of data exist, and true when 3+ months exist. Amount variance calculations must
 * compute average as arithmetic mean and variance range as [min, max] of all amounts.
 * 
 * Randomization adds value by testing data sufficiency across varying time ranges and
 * amount variance calculations across different expense distributions to ensure correctness
 * across all input combinations.
 */

const fc = require('fast-check');
const { dbPbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const spendingPatternsService = require('./spendingPatternsService');
const { getDatabase } = require('../database/db');
const { ANALYTICS_CONFIG } = require('../utils/analyticsConstants');

// Safe merchant name that avoids JavaScript reserved properties
const safeMerchantName = () => fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{2,19}$/);

describe('SpendingPatternsService - Data Quality Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
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

  const generateDateInMonth = (baseYear, baseMonth, monthOffset) => {
    const date = new Date(baseYear, baseMonth + monthOffset, 15);
    return date.toISOString().split('T')[0];
  };

  const generateRegularDates = (startDate, intervalDays, count) => {
    const dates = [];
    const start = new Date(startDate);
    
    for (let i = 0; i < count; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + (i * intervalDays));
      dates.push(date.toISOString().split('T')[0]);
    }
    
    return dates;
  };

  const insertFillerExpenses = async () => {
    const months = ['2024-01-15', '2024-02-15', '2024-03-15', '2024-04-15'];
    for (const date of months) {
      await insertExpense({
        date,
        place: 'FillerMerchant',
        amount: 10.00,
        type: 'Other',
        method: 'Cash',
        week: 1
      });
    }
  };

  // ============================================================================
  // Data Sufficiency Validation Tests
  // ============================================================================

  describe('Data Sufficiency Validation', () => {
    /**
     * **Feature: spending-patterns-predictions, Property 3: Data Sufficiency Validation**
     * **Validates: Requirements 1.3, 6.1**
     * 
     * Property 3: For any expense dataset, if the date range spans fewer than 3 months,
     * the System SHALL return hasSufficientData=false and disable pattern analysis features;
     * if 3+ months exist, hasSufficientData=true.
     */

    test('Property 3: Data sufficiency returns false when less than 3 months of data', async () => {
      await fc.assert(
        fc.asyncProperty(
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

            expect(result.hasSufficientData).toBe(false);
            expect(result.monthsOfData).toBeLessThan(ANALYTICS_CONFIG.MIN_MONTHS_FOR_PATTERNS);
            expect(result.availableFeatures.recurringPatterns).toBe(false);
            expect(result.missingDataMessage).not.toBeNull();
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property 3: Data sufficiency returns true when 3+ months of data exist', async () => {
      await fc.assert(
        fc.asyncProperty(
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

            expect(result.hasSufficientData).toBe(true);
            expect(result.monthsOfData).toBeGreaterThanOrEqual(ANALYTICS_CONFIG.MIN_MONTHS_FOR_PATTERNS);
            expect(result.availableFeatures.recurringPatterns).toBe(true);
            expect(result.missingDataMessage).toBeNull();
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property 3: Empty dataset returns hasSufficientData=false', async () => {
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

            expect(result.dataQualityScore).toBeGreaterThanOrEqual(0);
            expect(result.dataQualityScore).toBeLessThanOrEqual(100);
          }
        ),
        dbPbtOptions()
      );
    });
  });

  // ============================================================================
  // Amount Variance Calculation Tests
  // ============================================================================

  describe('Amount Variance Calculation', () => {
    /**
     * **Feature: spending-patterns-predictions, Property 4: Amount Variance Calculation**
     * **Validates: Requirements 1.5**
     * 
     * Property 4: For any set of recurring expenses with varying amounts, the Pattern_Analyzer
     * SHALL calculate the average as the arithmetic mean and the variance range as [min, max]
     * of all amounts in the pattern.
     */

    test('Property 4: Average amount is calculated as arithmetic mean', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeMerchantName(),
          fc.array(safeAmount({ min: 10, max: 500 }), { minLength: 5, maxLength: 10 }),
          expenseType,
          paymentMethod,
          async (merchantName, amounts, type, method) => {
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            await insertFillerExpenses();

            const dates = generateRegularDates('2024-01-01', 7, amounts.length);
            
            for (let i = 0; i < amounts.length; i++) {
              await insertExpense({
                date: dates[i],
                place: merchantName,
                amount: amounts[i],
                type,
                method,
                week: 1
              });
            }

            const patterns = await spendingPatternsService.getRecurringPatterns();
            const merchantPattern = patterns.find(p => p.merchantName === merchantName);
            
            expect(merchantPattern).toBeDefined();

            const expectedAverage = amounts.reduce((a, b) => a + b, 0) / amounts.length;
            
            expect(Math.abs(merchantPattern.averageAmount - expectedAverage)).toBeLessThan(0.01);
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property 4: Variance range contains min and max of all amounts', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeMerchantName(),
          fc.array(safeAmount({ min: 10, max: 500 }), { minLength: 5, maxLength: 10 }),
          expenseType,
          paymentMethod,
          async (merchantName, amounts, type, method) => {
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            await insertFillerExpenses();

            const dates = generateRegularDates('2024-01-01', 7, amounts.length);
            
            for (let i = 0; i < amounts.length; i++) {
              await insertExpense({
                date: dates[i],
                place: merchantName,
                amount: amounts[i],
                type,
                method,
                week: 1
              });
            }

            const patterns = await spendingPatternsService.getRecurringPatterns();
            const merchantPattern = patterns.find(p => p.merchantName === merchantName);
            
            expect(merchantPattern).toBeDefined();

            const expectedMin = Math.min(...amounts);
            const expectedMax = Math.max(...amounts);
            
            expect(Math.abs(merchantPattern.amountVariance.min - expectedMin)).toBeLessThan(0.01);
            expect(Math.abs(merchantPattern.amountVariance.max - expectedMax)).toBeLessThan(0.01);
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property 4: Variance range min <= average <= max', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeMerchantName(),
          fc.array(safeAmount({ min: 10, max: 500 }), { minLength: 5, maxLength: 10 }),
          expenseType,
          paymentMethod,
          async (merchantName, amounts, type, method) => {
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            await insertFillerExpenses();

            const dates = generateRegularDates('2024-01-01', 7, amounts.length);
            
            for (let i = 0; i < amounts.length; i++) {
              await insertExpense({
                date: dates[i],
                place: merchantName,
                amount: amounts[i],
                type,
                method,
                week: 1
              });
            }

            const patterns = await spendingPatternsService.getRecurringPatterns();
            const merchantPattern = patterns.find(p => p.merchantName === merchantName);
            
            expect(merchantPattern).toBeDefined();

            expect(merchantPattern.amountVariance.min).toBeLessThanOrEqual(merchantPattern.averageAmount);
            expect(merchantPattern.averageAmount).toBeLessThanOrEqual(merchantPattern.amountVariance.max);
          }
        ),
        dbPbtOptions()
      );
    });
  });
});

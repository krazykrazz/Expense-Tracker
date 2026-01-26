/**
 * Property-Based Tests for SpendingPatternsService - Amount Variance Calculation
 * 
 * **Feature: spending-patterns-predictions, Property 4: Amount Variance Calculation**
 * **Validates: Requirements 1.5**
 * 
 * Property 4: For any set of recurring expenses with varying amounts, the Pattern_Analyzer
 * SHALL calculate the average as the arithmetic mean and the variance range as [min, max]
 * of all amounts in the pattern.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType } = require('../test/pbtArbitraries');
const spendingPatternsService = require('./spendingPatternsService');
const { getDatabase } = require('../database/db');

// Safe merchant name that avoids JavaScript reserved properties
const safeMerchantName = () => fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{2,19}$/);

describe('SpendingPatternsService - Amount Variance Property Tests', () => {
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
        expense.place,
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

          // Generate weekly expenses with varying amounts
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

          // Calculate expected average
          const expectedAverage = amounts.reduce((a, b) => a + b, 0) / amounts.length;
          
          // Property: Average should be arithmetic mean (within floating point tolerance)
          expect(Math.abs(merchantPattern.averageAmount - expectedAverage)).toBeLessThan(0.01);
        }
      ),
      pbtOptions()
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

          // Calculate expected min and max
          const expectedMin = Math.min(...amounts);
          const expectedMax = Math.max(...amounts);
          
          // Property: Variance range should contain [min, max]
          expect(Math.abs(merchantPattern.amountVariance.min - expectedMin)).toBeLessThan(0.01);
          expect(Math.abs(merchantPattern.amountVariance.max - expectedMax)).toBeLessThan(0.01);
        }
      ),
      pbtOptions()
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

          // Property: min <= average <= max
          expect(merchantPattern.amountVariance.min).toBeLessThanOrEqual(merchantPattern.averageAmount);
          expect(merchantPattern.averageAmount).toBeLessThanOrEqual(merchantPattern.amountVariance.max);
        }
      ),
      pbtOptions()
    );
  });
});

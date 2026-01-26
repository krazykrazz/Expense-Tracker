/**
 * Property-Based Tests for SpendingPatternsService - Day-of-Week Calculations
 * 
 * **Feature: spending-patterns-predictions, Property 13: Day-of-Week Average Calculation**
 * **Feature: spending-patterns-predictions, Property 14: High-Spending Day Identification**
 * **Validates: Requirements 4.1, 4.2**
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType } = require('../test/pbtArbitraries');
const spendingPatternsService = require('./spendingPatternsService');
const { getDatabase } = require('../database/db');
const { ANALYTICS_CONFIG } = require('../utils/analyticsConstants');

// Safe merchant name
const safeMerchantName = () => fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{2,19}$/);

describe('SpendingPatternsService - Day-of-Week Property Tests', () => {
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

  /**
   * Get a date string for a specific day of week
   * Uses UTC to avoid timezone issues
   * @param {number} dayIndex - 0=Sunday, 1=Monday, etc.
   * @param {number} weekOffset - Which week (0=first week)
   */
  const getDateForDayOfWeek = (dayIndex, weekOffset = 0) => {
    // Use a known Sunday: 2024-01-07 is a Sunday in UTC
    // But we need to be careful with timezone issues
    // Let's use explicit date construction
    const year = 2024;
    const month = 0; // January
    // January 7, 2024 is a Sunday
    const baseSunday = 7;
    const targetDay = baseSunday + dayIndex + (weekOffset * 7);
    const date = new Date(Date.UTC(year, month, targetDay));
    return date.toISOString().split('T')[0];
  };

  /**
   * Get a unique date for a specific day of week occurrence
   * @param {number} dayIndex - 0=Sunday, 1=Monday, etc.
   * @param {number} occurrence - Which occurrence (0=first, 1=second, etc.)
   */
  const getUniqueDateForDay = (dayIndex, occurrence = 0) => {
    return getDateForDayOfWeek(dayIndex, occurrence);
  };

  test('Property 13: Day-of-week analysis returns 7 entries (one per day)', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeMerchantName(),
        fc.array(
          fc.record({
            amount: safeAmount({ min: 10, max: 200 }),
            dayIndex: fc.integer({ min: 0, max: 6 }),
            weekOffset: fc.integer({ min: 0, max: 10 })
          }),
          { minLength: 5, maxLength: 20 }
        ),
        expenseType,
        paymentMethod,
        async (merchantName, expenseData, type, method) => {
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Insert expenses on various days
          for (const data of expenseData) {
            await insertExpense({
              date: getDateForDayOfWeek(data.dayIndex, data.weekOffset),
              place: merchantName,
              amount: data.amount,
              type,
              method,
              week: 1
            });
          }

          const analysis = await spendingPatternsService.getDayOfWeekPatterns();

          // Property: Should always return 7 days
          expect(analysis.days).toHaveLength(7);
          
          // Verify day names and indices
          const expectedDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          for (let i = 0; i < 7; i++) {
            expect(analysis.days[i].dayName).toBe(expectedDays[i]);
            expect(analysis.days[i].dayIndex).toBe(i);
          }
        }
      ),
      pbtOptions()
    );
  });

  test('Property 13: Average spend per day is correctly calculated', async () => {
    // Create a controlled test with known amounts per day
    // Each day gets expenses on different weeks to test averaging
    const dayAmounts = {
      0: [100, 200], // Sunday: 2 occurrences on different weeks, total 300, avg 150
      1: [50],       // Monday: 1 occurrence, total 50, avg 50
      2: [],         // Tuesday: no expenses
      3: [75, 25, 100], // Wednesday: 3 occurrences, total 200, avg ~66.67
      4: [150],      // Thursday: 1 occurrence
      5: [80, 120],  // Friday: 2 occurrences, total 200, avg 100
      6: []          // Saturday: no expenses
    };

    for (const [dayIndex, amounts] of Object.entries(dayAmounts)) {
      for (let i = 0; i < amounts.length; i++) {
        const date = getUniqueDateForDay(parseInt(dayIndex), i);
        await insertExpense({
          date,
          place: 'TestMerchant',
          amount: amounts[i],
          type: 'Groceries',
          method: 'Debit',
          week: 1
        });
      }
    }

    const analysis = await spendingPatternsService.getDayOfWeekPatterns();

    // Verify Sunday average (300 / 2 unique dates = 150)
    expect(analysis.days[0].averageSpend).toBeCloseTo(150, 1);
    
    // Verify Monday average (50 / 1 = 50)
    expect(analysis.days[1].averageSpend).toBeCloseTo(50, 1);
    
    // Verify Tuesday has 0 (no expenses)
    expect(analysis.days[2].averageSpend).toBe(0);
    
    // Verify Wednesday average (200 / 3 ≈ 66.67)
    expect(analysis.days[3].averageSpend).toBeCloseTo(66.67, 0);
    
    // Verify transaction counts
    expect(analysis.days[0].transactionCount).toBe(2);
    expect(analysis.days[1].transactionCount).toBe(1);
    expect(analysis.days[2].transactionCount).toBe(0);
    expect(analysis.days[3].transactionCount).toBe(3);
  });

  test('Property 14: High-spending days are correctly identified (>30% above average)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            dayIndex: fc.integer({ min: 0, max: 6 }),
            amount: safeAmount({ min: 10, max: 100 })
          }),
          { minLength: 14, maxLength: 30 }
        ),
        async (expenseData) => {
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Insert expenses
          for (let i = 0; i < expenseData.length; i++) {
            const data = expenseData[i];
            await insertExpense({
              date: getDateForDayOfWeek(data.dayIndex, Math.floor(i / 7)),
              place: 'TestMerchant',
              amount: data.amount,
              type: 'Groceries',
              method: 'Debit',
              week: 1
            });
          }

          const analysis = await spendingPatternsService.getDayOfWeekPatterns();

          // Calculate threshold
          const threshold = analysis.weeklyAverage * (1 + ANALYTICS_CONFIG.HIGH_SPENDING_DAY_THRESHOLD);

          // Property: High-spending days should have average > threshold
          for (const day of analysis.days) {
            if (day.isHighSpendingDay) {
              expect(day.averageSpend).toBeGreaterThan(threshold);
            }
          }
        }
      ),
      pbtOptions()
    );
  });

  test('Property 14: Highest and lowest spending days are correctly identified', async () => {
    // Create controlled data where we know which day should be highest/lowest
    const dayAmounts = {
      0: [10],   // Sunday: low
      1: [500],  // Monday: highest
      2: [20],
      3: [30],
      4: [40],
      5: [50],
      6: [5]     // Saturday: lowest
    };

    for (const [dayIndex, amounts] of Object.entries(dayAmounts)) {
      for (let i = 0; i < amounts.length; i++) {
        const date = getUniqueDateForDay(parseInt(dayIndex), i);
        await insertExpense({
          date,
          place: 'TestMerchant',
          amount: amounts[i],
          type: 'Groceries',
          method: 'Debit',
          week: 1
        });
      }
    }

    const analysis = await spendingPatternsService.getDayOfWeekPatterns();

    // Property: Highest spending day should be Monday (500)
    expect(analysis.highestSpendingDay).toBe('Monday');
    
    // Property: Lowest spending day should be Saturday (5)
    expect(analysis.lowestSpendingDay).toBe('Saturday');
  });

  test('Property 13: Empty dataset returns valid structure with zeros', async () => {
    const analysis = await spendingPatternsService.getDayOfWeekPatterns();

    expect(analysis.days).toHaveLength(7);
    expect(analysis.weeklyAverage).toBe(0);
    
    for (const day of analysis.days) {
      expect(day.averageSpend).toBe(0);
      expect(day.transactionCount).toBe(0);
      expect(day.isHighSpendingDay).toBe(false);
      expect(day.topCategories).toEqual([]);
    }
  });
});

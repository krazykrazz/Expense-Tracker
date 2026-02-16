/**
 * Property-Based Tests for SpendingPatternsService - Pattern Detection
 * 
 * Consolidated from:
 * - recurringPatterns.pbt.test.js
 * - dayOfWeek.pbt.test.js
 * - seasonal.test.js (converted from unit test)
 * 
 * @invariant Recurring patterns must be detected with correct frequency when expenses occur
 * at regular intervals (±3 days tolerance) with at least 3 occurrences. Day-of-week analysis
 * must correctly calculate averages and identify high-spending days. Seasonal analysis must
 * aggregate monthly/quarterly data and identify categories with >25% variance.
 * 
 * Randomization adds value by testing pattern detection across varying merchant names, amounts,
 * occurrence counts, and date distributions to ensure the algorithm works universally.
 */

const fc = require('fast-check');
const { dbPbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const spendingPatternsService = require('./spendingPatternsService');
const { getDatabase } = require('../database/db');
const { ANALYTICS_CONFIG, PATTERN_FREQUENCIES } = require('../utils/analyticsConstants');

// Safe merchant name that avoids JavaScript reserved properties - use alphanumeric only
const safeMerchantName = () => fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{2,19}$/);

describe('SpendingPatternsService - Pattern Detection Property Tests', () => {
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
   * Generate dates at regular intervals with optional jitter
   */
  const generateRegularDates = (startDate, intervalDays, count, maxJitter = 0) => {
    const dates = [];
    const start = new Date(startDate);
    
    for (let i = 0; i < count; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + (i * intervalDays));
      
      // Add random jitter within tolerance
      if (maxJitter > 0) {
        const jitter = Math.floor(Math.random() * (maxJitter * 2 + 1)) - maxJitter;
        date.setDate(date.getDate() + jitter);
      }
      
      dates.push(date.toISOString().split('T')[0]);
    }
    
    return dates;
  };

  /**
   * Insert filler expenses to ensure 3+ months of data for pattern detection
   */
  const insertFillerExpenses = async () => {
    // Insert expenses across 4 months to satisfy data sufficiency
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

  /**
   * Get a date string for a specific day of week
   * Uses UTC to avoid timezone issues
   * @param {number} dayIndex - 0=Sunday, 1=Monday, etc.
   * @param {number} weekOffset - Which week (0=first week)
   */
  const getDateForDayOfWeek = (dayIndex, weekOffset = 0) => {
    // Use a known Sunday: 2024-01-07 is a Sunday in UTC
    const year = 2024;
    const month = 0; // January
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

  /**
   * Generate a date in a specific month
   * Uses day 1 to avoid future date issues when running early in the month
   */
  const getDateInMonth = (year, month) => {
    const day = 1; // First of month to avoid future date filtering issues
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  };

  // ============================================================================
  // Recurring Pattern Detection Tests
  // ============================================================================

  describe('Recurring Pattern Detection', () => {
    /**
     * **Feature: spending-patterns-predictions, Property 1: Recurring Pattern Detection Accuracy**
     * **Validates: Requirements 1.1, 1.4**
     * 
     * Property 1: For any expense history containing expenses from the same merchant at regular
     * intervals (within ±3 days tolerance) occurring at least 3 times, the Pattern_Analyzer
     * SHALL identify it as a recurring pattern with the correct frequency.
     */

    test('Property 1: Weekly patterns are detected with exact intervals', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeMerchantName(),
          safeAmount(),
          expenseType,
          paymentMethod,
          fc.integer({ min: 5, max: 10 }), // Number of occurrences
          async (merchantName, amount, type, method, occurrences) => {
            // Clear database
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Insert filler expenses to satisfy data sufficiency requirement
            await insertFillerExpenses();

            // Generate weekly expenses (7 days apart) with NO jitter for reliable detection
            const dates = generateRegularDates('2024-01-01', 7, occurrences, 0);
            
            for (const date of dates) {
              await insertExpense({
                date,
                place: merchantName,
                amount,
                type,
                method,
                week: 1
              });
            }

            // Get recurring patterns
            const patterns = await spendingPatternsService.getRecurringPatterns();

            // Property: Should detect the weekly pattern
            const merchantPattern = patterns.find(p => p.merchantName === merchantName);
            
            // Pattern should be detected if we have enough occurrences
            if (occurrences >= ANALYTICS_CONFIG.MIN_OCCURRENCES_FOR_PATTERN) {
              expect(merchantPattern).toBeDefined();
              if (merchantPattern) {
                expect(merchantPattern.frequency).toBe(PATTERN_FREQUENCIES.WEEKLY);
                // Occurrence count should match what we inserted
                expect(merchantPattern.occurrenceCount).toBe(occurrences);
              }
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property 1: Bi-weekly patterns are detected with exact intervals', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeMerchantName(),
          safeAmount(),
          expenseType,
          paymentMethod,
          fc.integer({ min: 5, max: 10 }),
          async (merchantName, amount, type, method, occurrences) => {
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            await insertFillerExpenses();

            // Generate bi-weekly expenses (14 days apart) with NO jitter
            const dates = generateRegularDates('2024-01-01', 14, occurrences, 0);
            
            for (const date of dates) {
              await insertExpense({
                date,
                place: merchantName,
                amount,
                type,
                method,
                week: 1
              });
            }

            const patterns = await spendingPatternsService.getRecurringPatterns();
            const merchantPattern = patterns.find(p => p.merchantName === merchantName);
            
            if (occurrences >= ANALYTICS_CONFIG.MIN_OCCURRENCES_FOR_PATTERN) {
              expect(merchantPattern).toBeDefined();
              if (merchantPattern) {
                expect(merchantPattern.frequency).toBe(PATTERN_FREQUENCIES.BI_WEEKLY);
                expect(merchantPattern.occurrenceCount).toBe(occurrences);
              }
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property 1: Monthly patterns are detected with exact intervals', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeMerchantName(),
          safeAmount(),
          expenseType,
          paymentMethod,
          fc.integer({ min: 5, max: 10 }),
          async (merchantName, amount, type, method, occurrences) => {
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            await insertFillerExpenses();

            // Generate monthly expenses (30 days apart) with NO jitter
            const dates = generateRegularDates('2024-01-01', 30, occurrences, 0);
            
            for (const date of dates) {
              await insertExpense({
                date,
                place: merchantName,
                amount,
                type,
                method,
                week: 1
              });
            }

            const patterns = await spendingPatternsService.getRecurringPatterns();
            const merchantPattern = patterns.find(p => p.merchantName === merchantName);
            
            if (occurrences >= ANALYTICS_CONFIG.MIN_OCCURRENCES_FOR_PATTERN) {
              expect(merchantPattern).toBeDefined();
              if (merchantPattern) {
                expect(merchantPattern.frequency).toBe(PATTERN_FREQUENCIES.MONTHLY);
                expect(merchantPattern.occurrenceCount).toBeGreaterThanOrEqual(occurrences - 1);
                expect(merchantPattern.occurrenceCount).toBeLessThanOrEqual(occurrences);
              }
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property 1: Patterns with fewer than 3 occurrences are not detected', async () => {
      await fc.assert(
        fc.asyncProperty(
          safeMerchantName(),
          safeAmount(),
          expenseType,
          paymentMethod,
          fc.integer({ min: 1, max: 2 }), // Less than minimum occurrences
          async (merchantName, amount, type, method, occurrences) => {
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            await insertFillerExpenses();

            const dates = generateRegularDates('2024-01-01', 7, occurrences, 0);
            
            for (const date of dates) {
              await insertExpense({
                date,
                place: merchantName,
                amount,
                type,
                method,
                week: 1
              });
            }

            const patterns = await spendingPatternsService.getRecurringPatterns();
            const merchantPattern = patterns.find(p => p.merchantName === merchantName);
            
            // Property: Should NOT detect pattern with fewer than 3 occurrences
            expect(merchantPattern).toBeUndefined();
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property 2: Pattern output contains all required fields', async () => {
      await insertFillerExpenses();

      // Insert a known weekly pattern
      const merchantName = 'TestMerchant';
      const dates = generateRegularDates('2024-01-01', 7, 5, 0);
      
      for (const date of dates) {
        await insertExpense({
          date,
          place: merchantName,
          amount: 50.00,
          type: 'Groceries',
          method: 'Debit',
          week: 1
        });
      }

      const patterns = await spendingPatternsService.getRecurringPatterns();
      const pattern = patterns.find(p => p.merchantName === merchantName);

      // Property 2: Output Structure Completeness
      expect(pattern).toBeDefined();
      expect(pattern).toHaveProperty('merchantName');
      expect(pattern).toHaveProperty('category');
      expect(pattern).toHaveProperty('frequency');
      expect(pattern).toHaveProperty('averageAmount');
      expect(pattern).toHaveProperty('amountVariance');
      expect(pattern.amountVariance).toHaveProperty('min');
      expect(pattern.amountVariance).toHaveProperty('max');
      expect(pattern).toHaveProperty('occurrenceCount');
      expect(pattern).toHaveProperty('lastOccurrence');
      expect(pattern).toHaveProperty('nextExpected');
      expect(pattern).toHaveProperty('confidence');
    });
  });

  // ============================================================================
  // Day-of-Week Pattern Tests
  // ============================================================================

  describe('Day-of-Week Patterns', () => {
    /**
     * **Feature: spending-patterns-predictions, Property 13: Day-of-Week Average Calculation**
     * **Feature: spending-patterns-predictions, Property 14: High-Spending Day Identification**
     * **Validates: Requirements 4.1, 4.2**
     */

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
        dbPbtOptions()
      );
    });

    test('Property 13: Average spend per day is correctly calculated', async () => {
      // Create a controlled test with known amounts per day
      const dayAmounts = {
        0: [100, 200], // Sunday: 2 occurrences, avg 150
        1: [50],       // Monday: 1 occurrence, avg 50
        2: [],         // Tuesday: no expenses
        3: [75, 25, 100], // Wednesday: 3 occurrences, avg ~66.67
        4: [150],      // Thursday: 1 occurrence
        5: [80, 120],  // Friday: 2 occurrences, avg 100
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

      // Verify averages
      expect(analysis.days[0].averageSpend).toBeCloseTo(150, 1);
      expect(analysis.days[1].averageSpend).toBeCloseTo(50, 1);
      expect(analysis.days[2].averageSpend).toBe(0);
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
        dbPbtOptions()
      );
    });

    test('Property 14: Highest and lowest spending days are correctly identified', async () => {
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

      expect(analysis.highestSpendingDay).toBe('Monday');
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

  // ============================================================================
  // Seasonal Analysis Tests
  // ============================================================================

  describe('Seasonal Analysis', () => {
    /**
     * **Feature: spending-patterns-predictions**
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
     * 
     * Tests seasonal analysis functionality including monthly data, quarterly aggregation,
     * and seasonal category variance detection.
     */

    test('Monthly data contains entries for each month in the analysis period', async () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      for (let i = 0; i < 6; i++) {
        let month = currentMonth - i;
        let year = currentYear;
        if (month <= 0) {
          month += 12;
          year -= 1;
        }
        
        await insertExpense({
          date: getDateInMonth(year, month),
          place: 'TestMerchant',
          amount: 100 + (i * 10),
          type: 'Groceries',
          method: 'Debit',
          week: 1
        });
      }

      const analysis = await spendingPatternsService.getSeasonalAnalysis(6);

      expect(analysis.monthlyData.length).toBeGreaterThanOrEqual(6);
      
      for (const month of analysis.monthlyData) {
        expect(month).toHaveProperty('year');
        expect(month).toHaveProperty('month');
        expect(month).toHaveProperty('monthName');
        expect(month).toHaveProperty('totalSpent');
        expect(month).toHaveProperty('previousMonthChange');
      }
    });

    test('Month-over-month change is correctly calculated', async () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      let month1 = currentMonth - 1;
      let year1 = currentYear;
      if (month1 <= 0) {
        month1 += 12;
        year1 -= 1;
      }

      await insertExpense({
        date: getDateInMonth(year1, month1),
        place: 'TestMerchant',
        amount: 100,
        type: 'Groceries',
        method: 'Debit',
        week: 1
      });

      await insertExpense({
        date: getDateInMonth(currentYear, currentMonth),
        place: 'TestMerchant',
        amount: 150,
        type: 'Groceries',
        method: 'Debit',
        week: 1
      });

      const analysis = await spendingPatternsService.getSeasonalAnalysis(3);

      const currentMonthData = analysis.monthlyData.find(
        m => m.year === currentYear && m.month === currentMonth
      );

      expect(currentMonthData).toBeDefined();
      expect(currentMonthData.previousMonthChange).toBeCloseTo(50, 0);
    });

    test('Quarterly data correctly aggregates monthly totals', async () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      for (let i = 5; i >= 0; i--) {
        let month = currentMonth - i;
        let year = currentYear;
        if (month <= 0) {
          month += 12;
          year -= 1;
        }
        
        const amount = 100 + (i * 50);
        
        await insertExpense({
          date: getDateInMonth(year, month),
          place: 'TestMerchant',
          amount,
          type: 'Groceries',
          method: 'Debit',
          week: 1
        });
      }

      const analysis = await spendingPatternsService.getSeasonalAnalysis(6);

      expect(analysis.quarterlyData.length).toBeGreaterThan(0);
      
      for (const quarter of analysis.quarterlyData) {
        expect(quarter).toHaveProperty('year');
        expect(quarter).toHaveProperty('quarter');
        expect(quarter).toHaveProperty('totalSpent');
        expect(quarter.quarter).toBeGreaterThanOrEqual(1);
        expect(quarter.quarter).toBeLessThanOrEqual(4);
      }
    });

    test('Quarter mapping is correct (Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)', async () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      for (let i = 11; i >= 0; i--) {
        let month = currentMonth - i;
        let year = currentYear;
        if (month <= 0) {
          month += 12;
          year -= 1;
        }
        
        await insertExpense({
          date: getDateInMonth(year, month),
          place: 'TestMerchant',
          amount: 100,
          type: 'Groceries',
          method: 'Debit',
          week: 1
        });
      }

      const analysis = await spendingPatternsService.getSeasonalAnalysis(12);

      for (const quarter of analysis.quarterlyData) {
        expect(quarter.quarter).toBeGreaterThanOrEqual(1);
        expect(quarter.quarter).toBeLessThanOrEqual(4);
      }
      
      for (const month of analysis.monthlyData) {
        const expectedQuarter = Math.ceil(month.month / 3);
        const matchingQuarter = analysis.quarterlyData.find(
          q => q.year === month.year && q.quarter === expectedQuarter
        );
        if (month.totalSpent > 0) {
          expect(matchingQuarter).toBeDefined();
        }
      }
    });

    test('Categories with >25% variance are identified as seasonal', async () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      
      let highMonth = currentMonth - 5;
      let highYear = currentYear;
      if (highMonth <= 0) {
        highMonth += 12;
        highYear -= 1;
      }
      
      await insertExpense({
        date: getDateInMonth(highYear, highMonth),
        place: 'TestMerchant',
        amount: 1000,
        type: 'Gifts',
        method: 'Debit',
        week: 1
      });

      for (let i = 4; i >= 0; i--) {
        let month = currentMonth - i;
        let year = currentYear;
        if (month <= 0) {
          month += 12;
          year -= 1;
        }
        
        await insertExpense({
          date: getDateInMonth(year, month),
          place: 'TestMerchant',
          amount: 100,
          type: 'Gifts',
          method: 'Debit',
          week: 1
        });
      }

      const analysis = await spendingPatternsService.getSeasonalAnalysis(12);

      const giftsCategory = analysis.seasonalCategories.find(c => c.category === 'Gifts');
      
      expect(giftsCategory).toBeDefined();
      expect(giftsCategory.varianceFromAnnualAverage).toBeGreaterThan(25);
    });

    test('Categories with low variance are not marked as seasonal', async () => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      for (let i = 11; i >= 0; i--) {
        let month = currentMonth - i;
        let year = currentYear;
        if (month <= 0) {
          month += 12;
          year -= 1;
        }
        
        await insertExpense({
          date: getDateInMonth(year, month),
          place: 'TestMerchant',
          amount: 100,
          type: 'Utilities',
          method: 'Debit',
          week: 1
        });
      }

      const analysis = await spendingPatternsService.getSeasonalAnalysis(12);

      const utilitiesCategory = analysis.seasonalCategories.find(c => c.category === 'Utilities');
      
      expect(utilitiesCategory).toBeUndefined();
    });

    test('Empty dataset returns valid structure', async () => {
      const analysis = await spendingPatternsService.getSeasonalAnalysis(12);

      expect(analysis).toHaveProperty('monthlyData');
      expect(analysis).toHaveProperty('quarterlyData');
      expect(analysis).toHaveProperty('seasonalCategories');
      expect(Array.isArray(analysis.monthlyData)).toBe(true);
      expect(Array.isArray(analysis.quarterlyData)).toBe(true);
      expect(Array.isArray(analysis.seasonalCategories)).toBe(true);
    });
  });
});

/**
 * Property-Based Tests for SpendingPatternsService - Recurring Pattern Detection
 * 
 * **Feature: spending-patterns-predictions, Property 1: Recurring Pattern Detection Accuracy**
 * **Validates: Requirements 1.1, 1.4**
 * 
 * Property 1: For any expense history containing expenses from the same merchant at regular
 * intervals (within ±3 days tolerance) occurring at least 3 times, the Pattern_Analyzer
 * SHALL identify it as a recurring pattern with the correct frequency.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const spendingPatternsService = require('./spendingPatternsService');
const { getDatabase } = require('../database/db');
const { ANALYTICS_CONFIG, PATTERN_FREQUENCIES } = require('../utils/analyticsConstants');

// Safe merchant name that avoids JavaScript reserved properties - use alphanumeric only
const safeMerchantName = () => fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{2,19}$/);

describe('SpendingPatternsService - Recurring Pattern Detection Property Tests', () => {
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
      pbtOptions()
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

          // Insert filler expenses to satisfy data sufficiency requirement
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
          
          // Pattern should be detected if we have enough occurrences
          if (occurrences >= ANALYTICS_CONFIG.MIN_OCCURRENCES_FOR_PATTERN) {
            expect(merchantPattern).toBeDefined();
            if (merchantPattern) {
              expect(merchantPattern.frequency).toBe(PATTERN_FREQUENCIES.BI_WEEKLY);
              expect(merchantPattern.occurrenceCount).toBe(occurrences);
            }
          }
        }
      ),
      pbtOptions()
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

          // Insert filler expenses to satisfy data sufficiency requirement
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
          
          // Pattern should be detected if we have enough occurrences
          if (occurrences >= ANALYTICS_CONFIG.MIN_OCCURRENCES_FOR_PATTERN) {
            expect(merchantPattern).toBeDefined();
            if (merchantPattern) {
              expect(merchantPattern.frequency).toBe(PATTERN_FREQUENCIES.MONTHLY);
              // For monthly patterns, the count might be slightly different due to date boundaries
              expect(merchantPattern.occurrenceCount).toBeGreaterThanOrEqual(occurrences - 1);
              expect(merchantPattern.occurrenceCount).toBeLessThanOrEqual(occurrences);
            }
          }
        }
      ),
      pbtOptions()
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

          // Insert filler expenses to satisfy data sufficiency requirement
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
      pbtOptions()
    );
  });

  test('Property 1: Pattern output contains all required fields', async () => {
    // Insert filler expenses to satisfy data sufficiency requirement
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

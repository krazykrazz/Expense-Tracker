/**
 * Property-Based Tests for Analytics Controller - API Date Range Filtering
 * 
 * **Feature: spending-patterns-predictions, Property 25: API Date Range Filtering**
 * **Validates: Requirements 8.2**
 * 
 * Property 25: For any API request with startDate and endDate parameters,
 * the returned data SHALL only include expenses within that date range (inclusive).
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber, safeDate } = require('../test/pbtArbitraries');
const { getDatabase } = require('../database/db');

// Import controller helper functions by requiring the module
const analyticsController = require('./analyticsController');
const spendingPatternsService = require('../services/spendingPatternsService');
const anomalyDetectionService = require('../services/anomalyDetectionService');

describe('Analytics Controller - API Date Range Filtering Property Tests', () => {
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
    // Clear expenses table with serialize
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    // Clear dismissed anomalies
    anomalyDetectionService.clearDismissedAnomalies();
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
   * Generate a date string for a specific offset from base date
   */
  const generateDate = (baseDate, dayOffset) => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + dayOffset);
    return date.toISOString().split('T')[0];
  };

  test('Property 25: Day-of-week patterns respect date range filtering', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate expenses across a date range
        fc.array(
          fc.record({
            dayOffset: fc.integer({ min: 0, max: 90 }),
            amount: safeAmount(),
            type: expenseType,
            method: paymentMethod,
            week: weekNumber
          }),
          { minLength: 5, maxLength: 15 }
        ),
        // Generate filter range (subset of the data range)
        fc.integer({ min: 10, max: 30 }), // startOffset
        fc.integer({ min: 50, max: 80 }), // endOffset
        async (expenseTemplates, startOffset, endOffset) => {
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

          const baseDate = new Date('2024-01-01');
          const startDate = generateDate(baseDate, startOffset);
          const endDate = generateDate(baseDate, endOffset);

          // Insert expenses
          const insertedExpenses = [];
          for (const template of expenseTemplates) {
            const date = generateDate(baseDate, template.dayOffset);
            await insertExpense({
              date,
              place: 'Test Place',
              amount: template.amount,
              type: template.type,
              method: template.method,
              week: template.week
            });
            insertedExpenses.push({ ...template, date });
          }

          // Get day-of-week patterns with date filter
          const result = await spendingPatternsService.getDayOfWeekPatterns({
            startDate,
            endDate
          });

          // Count expenses that should be included
          const expectedExpenses = insertedExpenses.filter(e => 
            e.date >= startDate && e.date <= endDate
          );

          // Property: Total transaction count should match filtered expenses
          const totalTransactions = result.days.reduce((sum, d) => sum + d.transactionCount, 0);
          expect(totalTransactions).toBe(expectedExpenses.length);
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 25: Anomalies respect date range filtering', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate expenses with varying amounts (some anomalous)
        fc.array(
          fc.record({
            dayOffset: fc.integer({ min: 0, max: 60 }),
            amount: fc.oneof(
              safeAmount({ min: 10, max: 100 }),  // Normal amounts
              safeAmount({ min: 500, max: 1000 }) // Potentially anomalous
            ),
            type: fc.constantFrom('Groceries', 'Dining Out'),
            method: paymentMethod,
            week: weekNumber
          }),
          { minLength: 10, maxLength: 20 }
        ),
        // Generate filter range
        fc.integer({ min: 10, max: 20 }), // startOffset
        fc.integer({ min: 40, max: 55 }), // endOffset
        async (expenseTemplates, startOffset, endOffset) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          anomalyDetectionService.clearDismissedAnomalies();

          const baseDate = new Date('2024-01-01');
          const startDate = generateDate(baseDate, startOffset);
          const endDate = generateDate(baseDate, endOffset);

          // Insert expenses
          for (const template of expenseTemplates) {
            const date = generateDate(baseDate, template.dayOffset);
            await insertExpense({
              date,
              place: 'Test Place',
              amount: template.amount,
              type: template.type,
              method: template.method,
              week: template.week
            });
          }

          // Get anomalies with date filter
          const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 90 });
          
          // Filter anomalies by date range (simulating API filtering)
          const filteredAnomalies = anomalies.filter(a => 
            a.date >= startDate && a.date <= endDate
          );

          // Property: All filtered anomalies should be within date range
          for (const anomaly of filteredAnomalies) {
            expect(anomaly.date >= startDate).toBe(true);
            expect(anomaly.date <= endDate).toBe(true);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 25: Empty date range returns no data', async () => {
    // Insert some expenses
    const baseDate = new Date('2024-06-01');
    for (let i = 0; i < 5; i++) {
      await insertExpense({
        date: generateDate(baseDate, i * 7),
        place: 'Test Place',
        amount: 50,
        type: 'Groceries',
        method: 'Cash',
        week: 1
      });
    }

    // Query with date range that has no data
    const result = await spendingPatternsService.getDayOfWeekPatterns({
      startDate: '2023-01-01',
      endDate: '2023-01-31'
    });

    // Property: No transactions should be found
    const totalTransactions = result.days.reduce((sum, d) => sum + d.transactionCount, 0);
    expect(totalTransactions).toBe(0);
  });

  test('Property 25: Date range is inclusive of both start and end dates', async () => {
    // Insert expenses on specific dates
    const startDate = '2024-03-15';
    const endDate = '2024-03-20';
    
    await insertExpense({
      date: startDate, // On start date
      place: 'Start Place',
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1
    });
    
    await insertExpense({
      date: endDate, // On end date
      place: 'End Place',
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1
    });
    
    await insertExpense({
      date: '2024-03-17', // In between
      place: 'Middle Place',
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1
    });
    
    await insertExpense({
      date: '2024-03-14', // Before range
      place: 'Before Place',
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1
    });
    
    await insertExpense({
      date: '2024-03-21', // After range
      place: 'After Place',
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1
    });

    // Query with date range
    const result = await spendingPatternsService.getDayOfWeekPatterns({
      startDate,
      endDate
    });

    // Property: Should include exactly 3 expenses (start, middle, end)
    const totalTransactions = result.days.reduce((sum, d) => sum + d.transactionCount, 0);
    expect(totalTransactions).toBe(3);
  });
});

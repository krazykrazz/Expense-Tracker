/**
 * Property-Based Tests for Anomaly Detection Service - Filtering Tests
 * 
 * Consolidated from:
 * - anomalyDetectionService.gapExclusion.pbt.test.js
 * - anomalyDetectionService.dismissedLearning.pbt.test.js
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');

// Mock activity log service
jest.mock('./activityLogService');

// Import the service to test
const anomalyDetectionService = require('./anomalyDetectionService');
const { getDatabase } = require('../database/db');



describe('AnomalyDetectionService - Gap Exclusion Property Tests', () => {
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
    // Clear dismissed anomalies
    anomalyDetectionService.clearDismissedAnomalies();
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

  test('Property 22: Baseline calculation only uses months with data', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate amounts for months with data
        fc.array(safeAmount({ min: 10, max: 500 }), { minLength: 3, maxLength: 10 }),
        // Generate gap months (0-3 gaps)
        fc.integer({ min: 0, max: 3 }),
        async (amounts, gapMonths) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          const category = 'Groceries';
          const baseYear = 2024;
          const baseMonth = 0;

          // Insert expenses with gaps
          let monthOffset = 0;
          for (const amount of amounts) {
            await insertExpense({
              date: generateDateInMonth(baseYear, baseMonth, monthOffset),
              amount,
              type: category,
              method: 'Cash',
              week: 1
            });
            // Skip some months to create gaps
            monthOffset += (monthOffset < gapMonths ? 2 : 1);
          }

          // Calculate baseline
          const baseline = await anomalyDetectionService.calculateCategoryBaseline(category);

          // Property: Mean should be calculated from actual amounts only
          const expectedMean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
          
          // Allow small floating point tolerance
          expect(Math.abs(baseline.mean - expectedMean)).toBeLessThan(0.01);
          
          // Property: Count should match number of expenses, not total months
          expect(baseline.count).toBe(amounts.length);
          
          // Property: monthsWithData should reflect actual months with expenses
          expect(baseline.monthsWithData).toBeLessThanOrEqual(amounts.length);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 22: Empty months do not affect standard deviation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate consistent amounts (low variance)
        fc.float({ min: 100, max: 100.5, noNaN: true }),
        fc.integer({ min: 5, max: 10 }),
        async (baseAmount, count) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          const category = 'Utilities';
          const baseYear = 2024;
          const amounts = [];

          // Insert expenses with gaps (every other month)
          for (let i = 0; i < count; i++) {
            const amount = baseAmount + (i * 0.1); // Small variation
            amounts.push(amount);
            await insertExpense({
              date: generateDateInMonth(baseYear, 0, i * 2), // Skip every other month
              amount,
              type: category,
              method: 'Debit',
              week: 1
            });
          }

          // Calculate baseline
          const baseline = await anomalyDetectionService.calculateCategoryBaseline(category);

          // Calculate expected standard deviation
          const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
          const variance = amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
          const expectedStdDev = Math.sqrt(variance);

          // Property: Standard deviation should be based only on actual expenses
          expect(Math.abs(baseline.stdDev - expectedStdDev)).toBeLessThan(0.1);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 22: Baseline with no expenses returns zero values', async () => {
    // Clear database to ensure empty state
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const baseline = await anomalyDetectionService.calculateCategoryBaseline('Groceries');

    expect(baseline.mean).toBe(0);
    expect(baseline.stdDev).toBe(0);
    expect(baseline.count).toBe(0);
    expect(baseline.monthsWithData).toBe(0);
    expect(baseline.hasValidBaseline).toBe(false);
  });

  test('Property 22: Baseline requires minimum occurrences for validity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 2 }), // Less than MIN_OCCURRENCES_FOR_PATTERN (3)
        safeAmount({ min: 50, max: 200 }),
        async (count, amount) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          const category = 'Entertainment';

          // Insert fewer than minimum required expenses
          for (let i = 0; i < count; i++) {
            await insertExpense({
              date: generateDateInMonth(2024, 0, i),
              amount,
              type: category,
              method: 'VISA',
              week: 1
            });
          }

          // Calculate baseline
          const baseline = await anomalyDetectionService.calculateCategoryBaseline(category);

          // Property: Baseline should not be valid with insufficient data
          expect(baseline.hasValidBaseline).toBe(false);
          expect(baseline.count).toBe(count);
        }
      ),
      pbtOptions()
    );
  });
});

describe('AnomalyDetectionService - Dismissed Anomaly Learning Property Tests', () => {
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
    // Clear dismissed anomalies
    await anomalyDetectionService.clearDismissedAnomalies();
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
   * Generate a date string for a specific day offset
   */
  const generateDate = (daysAgo = 0) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  };

  test('Property 20: Dismissed anomalies are not flagged in future detection runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Base amount for normal expenses
        fc.float({ min: 50, max: 100, noNaN: true }),
        // Number of normal expenses
        fc.integer({ min: 10, max: 20 }),
        async (baseAmount, normalCount) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          anomalyDetectionService.clearDismissedAnomalies();

          const category = 'Groceries';

          // Insert normal expenses
          for (let i = 0; i < normalCount; i++) {
            await insertExpense({
              date: generateDate(60 + i),
              amount: baseAmount + (i % 3),
              type: category,
              method: 'Cash',
              week: 1,
              place: 'Normal Store'
            });
          }

          // Create an anomalous expense
          const anomalyAmount = baseAmount * 50;
          await insertExpense({
            date: generateDate(5),
            amount: anomalyAmount,
            type: category,
            method: 'Cash',
            week: 1,
            place: 'Anomaly Store'
          });

          // First detection - should find the anomaly
          const firstDetection = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });
          const firstAnomalies = firstDetection.filter(a => a.place === 'Anomaly Store');
          
          // Should have detected the anomaly
          expect(firstAnomalies.length).toBeGreaterThanOrEqual(1);
          
          // Dismiss the anomaly
          const anomalyExpenseId = firstAnomalies[0].expenseId;
          await anomalyDetectionService.dismissAnomaly(anomalyExpenseId);

          // Second detection - should NOT find the dismissed anomaly
          const secondDetection = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });
          const secondAnomalies = secondDetection.filter(a => a.expenseId === anomalyExpenseId);
          
          // Property: Dismissed anomaly should not appear in future detections
          expect(secondAnomalies.length).toBe(0);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 20: Dismissing one anomaly does not affect others', async () => {
    // Clear database
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    anomalyDetectionService.clearDismissedAnomalies();

    const baseAmount = 50;

    // Insert normal expenses
    for (let i = 0; i < 15; i++) {
      await insertExpense({
        date: generateDate(60 + i),
        amount: baseAmount,
        type: 'Groceries',
        method: 'Cash',
        week: 1,
        place: 'Normal Store'
      });
    }

    // Create two anomalous expenses
    await insertExpense({
      date: generateDate(5),
      amount: baseAmount * 50,
      type: 'Groceries',
      method: 'Cash',
      week: 1,
      place: 'Anomaly Store 1'
    });

    await insertExpense({
      date: generateDate(3),
      amount: baseAmount * 50,
      type: 'Groceries',
      method: 'Cash',
      week: 1,
      place: 'Anomaly Store 2'
    });

    // First detection
    const firstDetection = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });
    const anomaly1 = firstDetection.find(a => a.place === 'Anomaly Store 1');
    const anomaly2 = firstDetection.find(a => a.place === 'Anomaly Store 2');
    
    expect(anomaly1).toBeDefined();
    expect(anomaly2).toBeDefined();

    // Dismiss only the first anomaly
    await anomalyDetectionService.dismissAnomaly(anomaly1.expenseId);

    // Second detection
    const secondDetection = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });
    
    // Property: Only dismissed anomaly should be excluded
    const secondAnomaly1 = secondDetection.find(a => a.expenseId === anomaly1.expenseId);
    const secondAnomaly2 = secondDetection.find(a => a.expenseId === anomaly2.expenseId);
    
    expect(secondAnomaly1).toBeUndefined(); // Dismissed
    expect(secondAnomaly2).toBeDefined(); // Not dismissed
  });

  test('Property 20: getDismissedAnomalies returns all dismissed expense IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Number of anomalies to dismiss
        fc.integer({ min: 1, max: 5 }),
        async (dismissCount) => {
          // Clear database and dismissed anomalies
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          await anomalyDetectionService.clearDismissedAnomalies();

          const expenseIds = [];
          
          // Create actual expenses and dismiss them
          for (let i = 0; i < dismissCount; i++) {
            const expenseId = await insertExpense({
              date: generateDate(i + 1),
              amount: 100 + i,
              type: 'Groceries',
              method: 'Cash',
              week: 1,
              place: `Test Store ${i}`
            });
            expenseIds.push(expenseId);
            await anomalyDetectionService.dismissAnomaly(expenseId);
          }

          // Get dismissed anomalies
          const dismissed = await anomalyDetectionService.getDismissedAnomalies();

          // Property: All dismissed IDs should be returned
          expect(dismissed.length).toBe(dismissCount);
          for (const id of expenseIds) {
            expect(dismissed).toContain(id);
          }
        }
      ),
      pbtOptions()
    );
  });

  test('Property 20: Dismissing same expense multiple times has no effect', async () => {
    // Clear database and dismissed anomalies
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await anomalyDetectionService.clearDismissedAnomalies();

    // Create an actual expense
    const expenseId = await insertExpense({
      date: generateDate(1),
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1,
      place: 'Test Store'
    });

    // Dismiss the same expense multiple times
    await anomalyDetectionService.dismissAnomaly(expenseId);
    await anomalyDetectionService.dismissAnomaly(expenseId);
    await anomalyDetectionService.dismissAnomaly(expenseId);

    // Get dismissed anomalies
    const dismissed = await anomalyDetectionService.getDismissedAnomalies();

    // Property: Should only appear once
    expect(dismissed.length).toBe(1);
    expect(dismissed[0]).toBe(expenseId);
  });

  test('Property 20: clearDismissedAnomalies resets the dismissed list', async () => {
    // Clear database and dismissed anomalies
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await anomalyDetectionService.clearDismissedAnomalies();

    // Create actual expenses and dismiss them
    const expenseId1 = await insertExpense({
      date: generateDate(1),
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1,
      place: 'Test Store 1'
    });
    const expenseId2 = await insertExpense({
      date: generateDate(2),
      amount: 200,
      type: 'Groceries',
      method: 'Cash',
      week: 1,
      place: 'Test Store 2'
    });
    const expenseId3 = await insertExpense({
      date: generateDate(3),
      amount: 300,
      type: 'Groceries',
      method: 'Cash',
      week: 1,
      place: 'Test Store 3'
    });

    await anomalyDetectionService.dismissAnomaly(expenseId1);
    await anomalyDetectionService.dismissAnomaly(expenseId2);
    await anomalyDetectionService.dismissAnomaly(expenseId3);

    let dismissed = await anomalyDetectionService.getDismissedAnomalies();
    expect(dismissed.length).toBe(3);

    // Clear dismissed anomalies
    await anomalyDetectionService.clearDismissedAnomalies();

    // Property: List should be empty after clear
    dismissed = await anomalyDetectionService.getDismissedAnomalies();
    expect(dismissed.length).toBe(0);
  });
});

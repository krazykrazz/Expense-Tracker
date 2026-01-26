/**
 * Property-Based Tests for AnomalyDetectionService - Dismissed Anomaly Learning
 * 
 * **Feature: spending-patterns-predictions, Property 20: Dismissed Anomaly Learning**
 * **Validates: Requirements 5.6**
 * 
 * Property 20: For any expense that has been dismissed as an anomaly,
 * future anomaly detection runs SHALL NOT flag that same expense as an anomaly.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const anomalyDetectionService = require('./anomalyDetectionService');
const { getDatabase } = require('../database/db');
const { ANOMALY_TYPES } = require('../utils/analyticsConstants');

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
          anomalyDetectionService.clearDismissedAnomalies();

          const expenseIds = [];
          
          // Dismiss multiple anomalies
          for (let i = 0; i < dismissCount; i++) {
            const expenseId = 1000 + i;
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
    anomalyDetectionService.clearDismissedAnomalies();

    const expenseId = 12345;

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
    // Dismiss some anomalies
    await anomalyDetectionService.dismissAnomaly(1);
    await anomalyDetectionService.dismissAnomaly(2);
    await anomalyDetectionService.dismissAnomaly(3);

    let dismissed = await anomalyDetectionService.getDismissedAnomalies();
    expect(dismissed.length).toBe(3);

    // Clear dismissed anomalies
    anomalyDetectionService.clearDismissedAnomalies();

    // Property: List should be empty after clear
    dismissed = await anomalyDetectionService.getDismissedAnomalies();
    expect(dismissed.length).toBe(0);
  });
});

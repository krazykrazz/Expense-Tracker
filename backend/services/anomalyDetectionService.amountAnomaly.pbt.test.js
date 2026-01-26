/**
 * Property-Based Tests for AnomalyDetectionService - Amount Anomaly Detection
 * 
 * **Feature: spending-patterns-predictions, Property 17: Amount Anomaly Detection**
 * **Validates: Requirements 5.1**
 * 
 * Property 17: For any expense where (amount - categoryAverage) / categoryStdDev > 3,
 * the Anomaly_Detector SHALL flag it as an anomaly with anomalyType='amount'.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, weekNumber } = require('../test/pbtArbitraries');
const anomalyDetectionService = require('./anomalyDetectionService');
const { getDatabase } = require('../database/db');
const { ANOMALY_TYPES, ANALYTICS_CONFIG } = require('../utils/analyticsConstants');

describe('AnomalyDetectionService - Amount Anomaly Detection Property Tests', () => {
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
   * Generate a recent date string (within last 30 days)
   */
  const generateRecentDate = (daysAgo = 0) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  };

  test('Property 17: Expenses > 3 standard deviations are flagged as amount anomalies', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Base amount for normal expenses (use consistent value)
        fc.float({ min: 50, max: 100, noNaN: true }),
        // Number of normal expenses (need enough for valid baseline)
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

          // Insert many normal expenses with very consistent amounts
          // This ensures the anomaly stands out even when included in baseline
          for (let i = 0; i < normalCount; i++) {
            await insertExpense({
              date: generateRecentDate(60 + i), // Historical (outside lookback)
              amount: baseAmount + (i % 3), // Very small variation (0, 1, or 2)
              type: category,
              method: 'Cash',
              week: 1,
              place: 'Normal Store'
            });
          }

          // Create an extremely anomalous expense (50x normal)
          // This should be detected even when included in baseline calculation
          const anomalyAmount = baseAmount * 50;
          
          await insertExpense({
            date: generateRecentDate(5), // Recent (within lookback)
            amount: anomalyAmount,
            type: category,
            method: 'Cash',
            week: 1,
            place: 'Anomaly Store'
          });

          // Detect anomalies
          const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });

          // Property: The anomalous expense should be flagged
          const amountAnomalies = anomalies.filter(a => a.anomalyType === ANOMALY_TYPES.AMOUNT);
          
          // Should have at least one amount anomaly
          expect(amountAnomalies.length).toBeGreaterThanOrEqual(1);
          
          // The anomaly should have correct type
          const foundAnomaly = amountAnomalies.find(a => a.place === 'Anomaly Store');
          expect(foundAnomaly).toBeDefined();
          expect(foundAnomaly.anomalyType).toBe(ANOMALY_TYPES.AMOUNT);
          expect(foundAnomaly.standardDeviations).toBeGreaterThan(ANALYTICS_CONFIG.ANOMALY_STD_DEVIATIONS);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 17: Expenses within 3 standard deviations are NOT flagged', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Base amount for expenses
        fc.float({ min: 50, max: 100, noNaN: true }),
        // Number of expenses
        fc.integer({ min: 5, max: 10 }),
        async (baseAmount, count) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          anomalyDetectionService.clearDismissedAnomalies();

          const category = 'Dining Out';

          // Insert expenses with consistent amounts (low variance)
          for (let i = 0; i < count; i++) {
            const amount = baseAmount + (i * 0.5); // Very small variation
            await insertExpense({
              date: generateRecentDate(i + 1),
              amount,
              type: category,
              method: 'Debit',
              week: 1,
              place: 'Restaurant'
            });
          }

          // Detect anomalies
          const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });

          // Property: No amount anomalies should be detected for consistent spending
          const amountAnomalies = anomalies.filter(a => 
            a.anomalyType === ANOMALY_TYPES.AMOUNT && a.category === category
          );
          
          expect(amountAnomalies.length).toBe(0);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 17: Amount anomaly includes correct metadata', async () => {
    // Clear database
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    anomalyDetectionService.clearDismissedAnomalies();

    const category = 'Entertainment';
    const baseAmount = 50;

    // Insert many normal expenses with consistent amounts
    for (let i = 0; i < 15; i++) {
      await insertExpense({
        date: generateRecentDate(60 + i), // Historical
        amount: baseAmount + (i % 3), // Small variation
        type: category,
        method: 'VISA',
        week: 1,
        place: 'Cinema'
      });
    }

    // Insert extremely anomalous expense (50x normal) - recent
    await insertExpense({
      date: generateRecentDate(1),
      amount: baseAmount * 50,
      type: category,
      method: 'VISA',
      week: 1,
      place: 'Concert Venue'
    });

    // Detect anomalies
    const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });
    const amountAnomalies = anomalies.filter(a => a.anomalyType === ANOMALY_TYPES.AMOUNT);

    expect(amountAnomalies.length).toBeGreaterThanOrEqual(1);
    
    const anomaly = amountAnomalies[0];
    
    // Property: Anomaly should have all required fields
    expect(anomaly).toHaveProperty('expenseId');
    expect(anomaly).toHaveProperty('date');
    expect(anomaly).toHaveProperty('place');
    expect(anomaly).toHaveProperty('amount');
    expect(anomaly).toHaveProperty('category');
    expect(anomaly).toHaveProperty('anomalyType');
    expect(anomaly).toHaveProperty('reason');
    expect(anomaly).toHaveProperty('severity');
    expect(anomaly).toHaveProperty('categoryAverage');
    expect(anomaly).toHaveProperty('standardDeviations');
    expect(anomaly).toHaveProperty('dismissed');
    
    expect(anomaly.anomalyType).toBe(ANOMALY_TYPES.AMOUNT);
    expect(anomaly.dismissed).toBe(false);
  });
});

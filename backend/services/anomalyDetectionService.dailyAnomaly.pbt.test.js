/**
 * Property-Based Tests for AnomalyDetectionService - Daily Total Anomaly Detection
 * 
 * **Feature: spending-patterns-predictions, Property 18: Daily Total Anomaly Detection**
 * **Validates: Requirements 5.2**
 * 
 * Property 18: For any day where totalDailySpending > dailyAverage * 2,
 * the Anomaly_Detector SHALL generate an alert with anomalyType='daily_total'.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const anomalyDetectionService = require('./anomalyDetectionService');
const { getDatabase } = require('../database/db');
const { ANOMALY_TYPES, ANALYTICS_CONFIG } = require('../utils/analyticsConstants');

describe('AnomalyDetectionService - Daily Total Anomaly Detection Property Tests', () => {
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

  test('Property 18: Days with spending > 2x daily average are flagged', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Daily amount for normal days
        fc.float({ min: 50, max: 100, noNaN: true }),
        // Number of normal days (historical)
        fc.integer({ min: 30, max: 60 }),
        // Multiplier for anomaly day (> 2x)
        fc.float({ min: 3, max: 5, noNaN: true }),
        async (dailyAmount, normalDays, anomalyMultiplier) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          anomalyDetectionService.clearDismissedAnomalies();

          // Insert normal daily expenses - spread across the lookback period
          // Use days 10-40 ago so they're within the lookback window for baseline
          for (let i = 0; i < normalDays; i++) {
            await insertExpense({
              date: generateDate(10 + i),
              amount: dailyAmount,
              type: 'Groceries',
              method: 'Cash',
              week: 1,
              place: 'Store'
            });
          }

          // Create an anomalous day with spending > 2x daily average
          const anomalyDate = generateDate(5); // Recent, within lookback
          const anomalyDayTotal = dailyAmount * anomalyMultiplier;
          
          // Split into multiple expenses on the same day
          await insertExpense({
            date: anomalyDate,
            amount: anomalyDayTotal * 0.6,
            type: 'Groceries',
            method: 'Cash',
            week: 1,
            place: 'Big Store'
          });
          await insertExpense({
            date: anomalyDate,
            amount: anomalyDayTotal * 0.4,
            type: 'Dining Out',
            method: 'Debit',
            week: 1,
            place: 'Restaurant'
          });

          // Detect anomalies with larger lookback to include all historical data
          const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 60 });

          // Property: The anomalous day should be flagged
          const dailyAnomalies = anomalies.filter(a => a.anomalyType === ANOMALY_TYPES.DAILY_TOTAL);
          
          // Should have at least one daily anomaly
          expect(dailyAnomalies.length).toBeGreaterThanOrEqual(1);
          
          // The anomaly should be for the correct date
          const foundAnomaly = dailyAnomalies.find(a => a.date === anomalyDate);
          expect(foundAnomaly).toBeDefined();
          expect(foundAnomaly.anomalyType).toBe(ANOMALY_TYPES.DAILY_TOTAL);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 18: Days with spending <= 2x daily average are NOT flagged', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Daily amount
        fc.float({ min: 50, max: 100, noNaN: true }),
        // Number of days
        fc.integer({ min: 20, max: 40 }),
        async (dailyAmount, days) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          anomalyDetectionService.clearDismissedAnomalies();

          // Insert consistent daily expenses - all within lookback period
          for (let i = 0; i < days; i++) {
            await insertExpense({
              date: generateDate(i + 1),
              amount: dailyAmount,
              type: 'Groceries',
              method: 'Cash',
              week: 1,
              place: 'Store'
            });
          }

          // Detect anomalies with lookback covering all inserted data
          const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: days + 5 });

          // Property: No daily anomalies should be detected for consistent spending
          const dailyAnomalies = anomalies.filter(a => a.anomalyType === ANOMALY_TYPES.DAILY_TOTAL);
          
          expect(dailyAnomalies.length).toBe(0);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 18: Daily anomaly includes correct metadata', async () => {
    // Clear database
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    anomalyDetectionService.clearDismissedAnomalies();

    const dailyAmount = 50;

    // Insert normal daily expenses (historical)
    for (let i = 0; i < 30; i++) {
      await insertExpense({
        date: generateDate(60 + i),
        amount: dailyAmount,
        type: 'Groceries',
        method: 'Cash',
        week: 1,
        place: 'Store'
      });
    }

    // Create anomalous day (5x normal)
    const anomalyDate = generateDate(5);
    await insertExpense({
      date: anomalyDate,
      amount: dailyAmount * 5,
      type: 'Entertainment',
      method: 'VISA',
      week: 1,
      place: 'Concert'
    });

    // Detect anomalies
    const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });
    const dailyAnomalies = anomalies.filter(a => a.anomalyType === ANOMALY_TYPES.DAILY_TOTAL);

    expect(dailyAnomalies.length).toBeGreaterThanOrEqual(1);
    
    const anomaly = dailyAnomalies[0];
    
    // Property: Anomaly should have all required fields
    expect(anomaly).toHaveProperty('expenseId');
    expect(anomaly).toHaveProperty('date');
    expect(anomaly).toHaveProperty('place');
    expect(anomaly).toHaveProperty('amount');
    expect(anomaly).toHaveProperty('category');
    expect(anomaly).toHaveProperty('anomalyType');
    expect(anomaly).toHaveProperty('reason');
    expect(anomaly).toHaveProperty('severity');
    expect(anomaly).toHaveProperty('dismissed');
    
    expect(anomaly.anomalyType).toBe(ANOMALY_TYPES.DAILY_TOTAL);
    expect(anomaly.category).toBe('Multiple');
    expect(anomaly.dismissed).toBe(false);
  });
});

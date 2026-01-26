/**
 * Property-Based Tests for AnomalyDetectionService - New Merchant Anomaly Detection
 * 
 * **Feature: spending-patterns-predictions, Property 19: New Merchant Anomaly Detection**
 * **Validates: Requirements 5.3**
 * 
 * Property 19: For any expense at a merchant with no prior history where
 * amount > typicalFirstVisitAmount, the Anomaly_Detector SHALL flag it
 * with anomalyType='new_merchant'.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const anomalyDetectionService = require('./anomalyDetectionService');
const { getDatabase } = require('../database/db');
const { ANOMALY_TYPES } = require('../utils/analyticsConstants');

describe('AnomalyDetectionService - New Merchant Anomaly Detection Property Tests', () => {
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

  test('Property 19: New merchants with high amounts are flagged', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Typical first-visit amount
        fc.float({ min: 20, max: 50, noNaN: true }),
        // Number of historical merchants
        fc.integer({ min: 10, max: 20 }),
        // Multiplier for anomalous new merchant (high amount)
        fc.float({ min: 5, max: 10, noNaN: true }),
        async (typicalAmount, merchantCount, anomalyMultiplier) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          anomalyDetectionService.clearDismissedAnomalies();

          // Insert historical first visits to establish typical first-visit amount
          // These need to be outside the lookback window to be considered "historical"
          for (let i = 0; i < merchantCount; i++) {
            await insertExpense({
              date: generateDate(60 + i), // Historical - outside 30-day lookback
              amount: typicalAmount + (i % 5), // Small variation
              type: 'Groceries',
              method: 'Cash',
              week: 1,
              place: `Historical Store ${i}`
            });
          }

          // Create a new merchant with unusually high first-visit amount
          const anomalyAmount = typicalAmount * anomalyMultiplier;
          
          await insertExpense({
            date: generateDate(5), // Recent - within lookback
            amount: anomalyAmount,
            type: 'Entertainment',
            method: 'VISA',
            week: 1,
            place: 'Brand New Expensive Place'
          });

          // Detect anomalies - use 30-day lookback so historical merchants are excluded
          const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });

          // Property: The new merchant with high amount should be flagged
          const merchantAnomalies = anomalies.filter(a => a.anomalyType === ANOMALY_TYPES.NEW_MERCHANT);
          
          // The anomaly should be for the new merchant if it exceeds threshold
          // Note: The threshold is mean + 2*stdDev of first-visit amounts
          // With consistent historical amounts, the threshold might be close to typicalAmount
          // So we check if the anomaly was detected when amount is significantly higher
          if (anomalyAmount > typicalAmount * 3) {
            // With 5-10x multiplier, this should definitely be flagged
            const foundAnomaly = merchantAnomalies.find(a => a.place === 'Brand New Expensive Place');
            expect(foundAnomaly).toBeDefined();
            if (foundAnomaly) {
              expect(foundAnomaly.anomalyType).toBe(ANOMALY_TYPES.NEW_MERCHANT);
            }
          }
        }
      ),
      pbtOptions()
    );
  });

  test('Property 19: New merchants with typical amounts are NOT flagged', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Typical first-visit amount
        fc.float({ min: 30, max: 60, noNaN: true }),
        // Number of historical merchants
        fc.integer({ min: 10, max: 20 }),
        async (typicalAmount, merchantCount) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          anomalyDetectionService.clearDismissedAnomalies();

          // Insert historical first visits
          for (let i = 0; i < merchantCount; i++) {
            await insertExpense({
              date: generateDate(60 + i),
              amount: typicalAmount,
              type: 'Groceries',
              method: 'Cash',
              week: 1,
              place: `Historical Store ${i}`
            });
          }

          // Create a new merchant with typical first-visit amount
          await insertExpense({
            date: generateDate(5),
            amount: typicalAmount, // Same as typical
            type: 'Groceries',
            method: 'Cash',
            week: 1,
            place: 'New Normal Store'
          });

          // Detect anomalies
          const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });

          // Property: New merchant with typical amount should NOT be flagged
          const merchantAnomalies = anomalies.filter(a => 
            a.anomalyType === ANOMALY_TYPES.NEW_MERCHANT && 
            a.place === 'New Normal Store'
          );
          
          expect(merchantAnomalies.length).toBe(0);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 19: Existing merchants are NOT flagged as new', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: 30, max: 60, noNaN: true }),
        fc.integer({ min: 5, max: 10 }),
        async (amount, visitCount) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          anomalyDetectionService.clearDismissedAnomalies();

          const merchantName = 'Regular Store';

          // Insert historical visits to the same merchant
          for (let i = 0; i < visitCount; i++) {
            await insertExpense({
              date: generateDate(60 + i),
              amount: amount,
              type: 'Groceries',
              method: 'Cash',
              week: 1,
              place: merchantName
            });
          }

          // Visit the same merchant again with high amount
          await insertExpense({
            date: generateDate(5),
            amount: amount * 10, // High amount
            type: 'Groceries',
            method: 'Cash',
            week: 1,
            place: merchantName
          });

          // Detect anomalies
          const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });

          // Property: Existing merchant should NOT be flagged as new_merchant
          const merchantAnomalies = anomalies.filter(a => 
            a.anomalyType === ANOMALY_TYPES.NEW_MERCHANT && 
            a.place === merchantName
          );
          
          expect(merchantAnomalies.length).toBe(0);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 19: New merchant anomaly includes correct metadata', async () => {
    // Clear database
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    anomalyDetectionService.clearDismissedAnomalies();

    const typicalAmount = 30;

    // Insert historical first visits
    for (let i = 0; i < 15; i++) {
      await insertExpense({
        date: generateDate(60 + i),
        amount: typicalAmount,
        type: 'Groceries',
        method: 'Cash',
        week: 1,
        place: `Store ${i}`
      });
    }

    // Create new merchant with high amount
    await insertExpense({
      date: generateDate(5),
      amount: typicalAmount * 10,
      type: 'Entertainment',
      method: 'VISA',
      week: 1,
      place: 'Expensive New Place'
    });

    // Detect anomalies
    const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 30 });
    const merchantAnomalies = anomalies.filter(a => a.anomalyType === ANOMALY_TYPES.NEW_MERCHANT);

    expect(merchantAnomalies.length).toBeGreaterThanOrEqual(1);
    
    const anomaly = merchantAnomalies[0];
    
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
    
    expect(anomaly.anomalyType).toBe(ANOMALY_TYPES.NEW_MERCHANT);
    expect(anomaly.dismissed).toBe(false);
    expect(anomaly.reason).toContain('First visit');
  });
});

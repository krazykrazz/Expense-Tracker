/**
 * Property-Based Tests for Anomaly Detection Service - Detection Tests
 * 
 * Consolidated from:
 * - anomalyDetectionService.amountAnomaly.pbt.test.js
 * - anomalyDetectionService.dailyAnomaly.pbt.test.js
 * - anomalyDetectionService.newMerchant.pbt.test.js
  *
 * @invariant Anomaly Detection Thresholds: For any expense amount relative to historical spending, anomalies are flagged when the amount exceeds the configured standard deviation threshold; daily spending anomalies and new merchant detections follow consistent rules. Randomization covers diverse spending histories and amount distributions.
 */

const fc = require('fast-check');
const { dbPbtOptions, safeAmount, paymentMethod, weekNumber } = require('../test/pbtArbitraries');

// Mock activity log service
jest.mock('./activityLogService');

// Import the service to test
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
      dbPbtOptions()
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
      dbPbtOptions()
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
      dbPbtOptions()
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
      dbPbtOptions()
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
      dbPbtOptions()
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
      dbPbtOptions()
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
      dbPbtOptions()
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

/**
 * Property-Based Tests for PredictionService - Early Month Historical Weighting
 * 
 * **Feature: spending-patterns-predictions, Property 9: Early Month Historical Weighting**
 * **Validates: Requirements 2.6**
 * 
 * Property 9: For any prediction calculated when daysElapsed < 7, the historical monthly
 * average SHALL have greater weight than current trajectory in the prediction formula.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const predictionService = require('./predictionService');
const { getDatabase } = require('../database/db');
const { ANALYTICS_CONFIG } = require('../utils/analyticsConstants');

describe('PredictionService - Early Month Weighting Property Tests', () => {
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
   * Generate a date string for a specific month offset
   */
  const generateDateInMonth = (baseYear, baseMonth, monthOffset) => {
    let year = baseYear;
    let month = baseMonth + monthOffset;
    
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    
    return `${year}-${String(month).padStart(2, '0')}-15`;
  };

  /**
   * Test the internal _calculatePrediction method directly
   * This allows us to test the weighting logic without date-based complications
   */
  test('Property 9: Early month weighting formula gives historical more weight', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Current spent amount
        safeAmount({ min: 100, max: 500 }),
        // Current daily average (low)
        safeAmount({ min: 10, max: 50 }),
        // Historical monthly average (high - to create contrast)
        safeAmount({ min: 2000, max: 5000 }),
        // Days elapsed in early month (1-6)
        fc.integer({ min: 1, max: ANALYTICS_CONFIG.EARLY_MONTH_DAYS - 1 }),
        async (currentSpent, dailyAverage, historicalAverage, daysElapsed) => {
          const totalDays = 30;
          const daysRemaining = totalDays - daysElapsed;

          // Call the internal calculation method
          const prediction = predictionService._calculatePrediction(
            currentSpent,
            dailyAverage,
            daysRemaining,
            daysElapsed,
            historicalAverage,
            totalDays
          );

          // Calculate pure trajectory and historical predictions
          const trajectoryPrediction = currentSpent + (dailyAverage * daysRemaining);
          const historicalDailyAvg = historicalAverage / totalDays;
          const historicalPrediction = currentSpent + (historicalDailyAvg * daysRemaining);

          // Property: In early month, prediction should be closer to historical than trajectory
          // when there's a significant difference between them
          if (Math.abs(historicalPrediction - trajectoryPrediction) > 100) {
            const distanceToHistorical = Math.abs(prediction - historicalPrediction);
            const distanceToTrajectory = Math.abs(prediction - trajectoryPrediction);
            
            // Historical should have more influence (prediction closer to historical)
            expect(distanceToHistorical).toBeLessThanOrEqual(distanceToTrajectory + 1);
          }
        }
      ),
      pbtOptions()
    );
  });

  test('Property 9: Prediction uses historical average when no current data (daysElapsed=0)', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeAmount({ min: 1000, max: 5000 }),
        async (historicalAverage) => {
          const totalDays = 30;
          const daysElapsed = 0;
          const daysRemaining = totalDays;
          const currentSpent = 0;
          const dailyAverage = 0;

          // Call the internal calculation method
          const prediction = predictionService._calculatePrediction(
            currentSpent,
            dailyAverage,
            daysRemaining,
            daysElapsed,
            historicalAverage,
            totalDays
          );

          // Property: With no current data, prediction should equal historical average
          expect(prediction).toBeCloseTo(historicalAverage, 0);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 9: Later in month, trajectory gets more weight', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Current spent amount
        safeAmount({ min: 1000, max: 3000 }),
        // Current daily average
        safeAmount({ min: 100, max: 200 }),
        // Historical monthly average (different from trajectory)
        safeAmount({ min: 500, max: 1500 }),
        // Days elapsed (after early month period, closer to end)
        fc.integer({ min: 20, max: 28 }),
        async (currentSpent, dailyAverage, historicalAverage, daysElapsed) => {
          const totalDays = 30;
          const daysRemaining = totalDays - daysElapsed;

          // Call the internal calculation method
          const prediction = predictionService._calculatePrediction(
            currentSpent,
            dailyAverage,
            daysRemaining,
            daysElapsed,
            historicalAverage,
            totalDays
          );

          // Calculate pure trajectory and historical predictions
          const trajectoryPrediction = currentSpent + (dailyAverage * daysRemaining);
          const historicalDailyAvg = historicalAverage / totalDays;
          const historicalPrediction = currentSpent + (historicalDailyAvg * daysRemaining);

          // Property: Later in month, prediction should be closer to trajectory
          if (Math.abs(historicalPrediction - trajectoryPrediction) > 50) {
            const distanceToHistorical = Math.abs(prediction - historicalPrediction);
            const distanceToTrajectory = Math.abs(prediction - trajectoryPrediction);
            
            // Trajectory should have more influence later in month
            expect(distanceToTrajectory).toBeLessThanOrEqual(distanceToHistorical + 1);
          }
        }
      ),
      pbtOptions()
    );
  });

  test('Property 9: EARLY_MONTH_DAYS threshold is respected', async () => {
    // Verify the threshold constant is 7
    expect(ANALYTICS_CONFIG.EARLY_MONTH_DAYS).toBe(7);
  });

  test('Property 9: Prediction equals current spent when month is complete', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeAmount({ min: 1000, max: 5000 }),
        safeAmount({ min: 1000, max: 5000 }),
        async (currentSpent, historicalAverage) => {
          const totalDays = 30;
          const daysElapsed = totalDays;
          const daysRemaining = 0;
          const dailyAverage = currentSpent / totalDays;

          // Call the internal calculation method
          const prediction = predictionService._calculatePrediction(
            currentSpent,
            dailyAverage,
            daysRemaining,
            daysElapsed,
            historicalAverage,
            totalDays
          );

          // Property: When month is complete, prediction should equal current spent
          expect(prediction).toBeCloseTo(currentSpent, 2);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 9: Weighting transitions smoothly from early to late month', async () => {
    // Test that as days progress, trajectory weight increases
    const currentSpent = 500;
    const dailyAverage = 50;
    const historicalAverage = 3000;
    const totalDays = 30;

    const predictions = [];
    for (let daysElapsed = 1; daysElapsed <= 25; daysElapsed++) {
      const daysRemaining = totalDays - daysElapsed;
      const prediction = predictionService._calculatePrediction(
        currentSpent,
        dailyAverage,
        daysRemaining,
        daysElapsed,
        historicalAverage,
        totalDays
      );
      predictions.push({ daysElapsed, prediction });
    }

    // Calculate trajectory and historical predictions for comparison
    const trajectoryPrediction = currentSpent + (dailyAverage * (totalDays - 1));
    const historicalDailyAvg = historicalAverage / totalDays;
    const historicalPrediction = currentSpent + (historicalDailyAvg * (totalDays - 1));

    // Early predictions should be closer to historical
    const earlyPrediction = predictions.find(p => p.daysElapsed === 3).prediction;
    const earlyDistToHist = Math.abs(earlyPrediction - historicalPrediction);
    const earlyDistToTraj = Math.abs(earlyPrediction - trajectoryPrediction);
    
    // Late predictions should be closer to trajectory
    const latePrediction = predictions.find(p => p.daysElapsed === 25).prediction;
    const lateDistToHist = Math.abs(latePrediction - historicalPrediction);
    const lateDistToTraj = Math.abs(latePrediction - trajectoryPrediction);

    // Early month: closer to historical
    expect(earlyDistToHist).toBeLessThan(earlyDistToTraj);
    
    // Late month: closer to trajectory
    expect(lateDistToTraj).toBeLessThan(lateDistToHist);
  });
});

/**
 * Property-Based Tests for Analytics Controller - Edge Case Handling
 * 
 * **Feature: spending-patterns-predictions, Property 27: Edge Case Handling**
 * **Validates: Requirements 8.4**
 * 
 * Property 27: For any calculation involving division, if the divisor is zero,
 * the result SHALL be 0 or null (not an error), and the system SHALL continue
 * operating normally.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const { getDatabase } = require('../database/db');

const spendingPatternsService = require('../services/spendingPatternsService');
const predictionService = require('../services/predictionService');
const anomalyDetectionService = require('../services/anomalyDetectionService');

describe('Analytics Controller - Edge Case Handling Property Tests', () => {
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

  test('Property 27: Empty database does not cause division by zero errors', async () => {
    // Ensure database is empty
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // All these operations should complete without throwing errors
    // even when there's no data (potential division by zero scenarios)
    
    // Data sufficiency check
    const sufficiency = await spendingPatternsService.checkDataSufficiency();
    expect(sufficiency).toBeDefined();
    expect(sufficiency.dataQualityScore).toBe(0);
    expect(sufficiency.monthsOfData).toBe(0);
    
    // Recurring patterns
    const patterns = await spendingPatternsService.getRecurringPatterns();
    expect(patterns).toBeDefined();
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBe(0);
    
    // Day of week patterns
    const dayPatterns = await spendingPatternsService.getDayOfWeekPatterns();
    expect(dayPatterns).toBeDefined();
    expect(dayPatterns.weeklyAverage).toBe(0);
    expect(dayPatterns.days).toBeDefined();
    expect(dayPatterns.days.length).toBe(7);
    
    // Seasonal analysis
    const seasonal = await spendingPatternsService.getSeasonalAnalysis();
    expect(seasonal).toBeDefined();
    expect(seasonal.monthlyData).toBeDefined();
    expect(seasonal.quarterlyData).toBeDefined();
    
    // Predictions (should handle gracefully)
    const prediction = await predictionService.getMonthEndPrediction(2024, 6);
    expect(prediction).toBeDefined();
    expect(prediction.currentSpent).toBe(0);
    expect(isFinite(prediction.predictedTotal)).toBe(true);
    
    // Anomalies
    const anomalies = await anomalyDetectionService.detectAnomalies();
    expect(anomalies).toBeDefined();
    expect(Array.isArray(anomalies)).toBe(true);
    expect(anomalies.length).toBe(0);
  });

  test('Property 27: Zero amount expenses do not cause errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            amount: fc.constant(0), // Zero amounts
            type: expenseType,
            method: paymentMethod,
            week: weekNumber
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (expenseTemplates) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Insert zero-amount expenses
          for (let i = 0; i < expenseTemplates.length; i++) {
            const template = expenseTemplates[i];
            await insertExpense({
              date: `2024-0${(i % 6) + 1}-15`,
              amount: template.amount,
              type: template.type,
              method: template.method,
              week: template.week
            });
          }

          // All operations should complete without errors
          const sufficiency = await spendingPatternsService.checkDataSufficiency();
          expect(sufficiency).toBeDefined();
          expect(isFinite(sufficiency.dataQualityScore)).toBe(true);

          const dayPatterns = await spendingPatternsService.getDayOfWeekPatterns();
          expect(dayPatterns).toBeDefined();
          expect(isFinite(dayPatterns.weeklyAverage)).toBe(true);

          // Verify no NaN or Infinity values in day patterns
          for (const day of dayPatterns.days) {
            expect(isFinite(day.averageSpend)).toBe(true);
            expect(isFinite(day.percentOfWeeklyTotal)).toBe(true);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 27: Single expense does not cause division errors in variance calculations', async () => {
    // Insert a single expense
    await insertExpense({
      date: '2024-06-15',
      place: 'Single Store',
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1
    });

    // Category baseline with single expense (variance calculation)
    const baseline = await anomalyDetectionService.calculateCategoryBaseline('Groceries');
    expect(baseline).toBeDefined();
    expect(isFinite(baseline.mean)).toBe(true);
    expect(isFinite(baseline.stdDev)).toBe(true);
    expect(baseline.stdDev).toBeGreaterThanOrEqual(0);

    // Day of week with single expense
    const dayPatterns = await spendingPatternsService.getDayOfWeekPatterns();
    expect(dayPatterns).toBeDefined();
    for (const day of dayPatterns.days) {
      expect(isFinite(day.averageSpend)).toBe(true);
    }
  });

  test('Property 27: Month with no expenses returns valid prediction', async () => {
    // Insert expenses in different months, but not in the target month
    await insertExpense({
      date: '2024-01-15',
      place: 'Store',
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1
    });
    
    await insertExpense({
      date: '2024-03-15',
      place: 'Store',
      amount: 150,
      type: 'Groceries',
      method: 'Cash',
      week: 1
    });

    // Get prediction for month with no expenses (February)
    const prediction = await predictionService.getMonthEndPrediction(2024, 2);
    
    expect(prediction).toBeDefined();
    expect(isFinite(prediction.currentSpent)).toBe(true);
    expect(isFinite(prediction.predictedTotal)).toBe(true);
    expect(isFinite(prediction.dailyAverage)).toBe(true);
    expect(prediction.currentSpent).toBe(0);
    // Should not throw or return NaN/Infinity
    expect(Number.isNaN(prediction.predictedTotal)).toBe(false);
    expect(Number.isNaN(prediction.dailyAverage)).toBe(false);
  });

  test('Property 27: Category with no historical data returns valid baseline', async () => {
    // Insert expenses for one category only
    await insertExpense({
      date: '2024-06-15',
      place: 'Store',
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1
    });

    // Get baseline for category with no data
    const baseline = await anomalyDetectionService.calculateCategoryBaseline('Entertainment');
    
    expect(baseline).toBeDefined();
    expect(baseline.mean).toBe(0);
    expect(baseline.stdDev).toBe(0);
    expect(baseline.count).toBe(0);
    expect(baseline.hasValidBaseline).toBe(false);
  });

  test('Property 27: Year-over-year comparison handles missing prior year data', async () => {
    // Insert expenses only for current year
    await insertExpense({
      date: '2024-06-15',
      place: 'Store',
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1
    });

    // Get prediction with YoY comparison (no prior year data)
    const prediction = await predictionService.getMonthEndPrediction(2024, 6);
    
    expect(prediction).toBeDefined();
    // yearOverYearChange should be null when no prior year data
    expect(prediction.yearOverYearChange).toBeNull();
    // Should not throw or return NaN
    expect(Number.isNaN(prediction.predictedTotal)).toBe(false);
  });

  test('Property 27: Seasonal analysis handles sparse data gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate sparse data (only some months have expenses)
        fc.array(
          fc.integer({ min: 0, max: 11 }), // Random months
          { minLength: 1, maxLength: 4 }
        ),
        fc.array(
          fc.record({
            amount: safeAmount(),
            type: expenseType,
            method: paymentMethod,
            week: weekNumber
          }),
          { minLength: 1, maxLength: 2 }
        ),
        async (months, expenseTemplates) => {
          // Clear database
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // Insert expenses only in selected months
          const uniqueMonths = [...new Set(months)];
          for (const month of uniqueMonths) {
            for (const template of expenseTemplates) {
              await insertExpense({
                date: `2024-${String(month + 1).padStart(2, '0')}-15`,
                amount: template.amount,
                type: template.type,
                method: template.method,
                week: template.week
              });
            }
          }

          // Seasonal analysis should handle gaps gracefully
          const seasonal = await spendingPatternsService.getSeasonalAnalysis(12);
          
          expect(seasonal).toBeDefined();
          expect(seasonal.monthlyData).toBeDefined();
          expect(seasonal.quarterlyData).toBeDefined();
          
          // Verify no NaN or Infinity in results
          for (const month of seasonal.monthlyData) {
            expect(isFinite(month.totalSpent)).toBe(true);
            if (month.previousMonthChange !== null) {
              expect(isFinite(month.previousMonthChange)).toBe(true);
            }
          }
          
          for (const quarter of seasonal.quarterlyData) {
            expect(isFinite(quarter.totalSpent)).toBe(true);
            if (quarter.previousQuarterChange !== null) {
              expect(isFinite(quarter.previousQuarterChange)).toBe(true);
            }
          }
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 27: Anomaly detection handles identical amounts gracefully', async () => {
    // Insert multiple expenses with identical amounts (stdDev = 0)
    for (let i = 0; i < 5; i++) {
      await insertExpense({
        date: `2024-0${i + 1}-15`,
        place: 'Same Store',
        amount: 100, // All same amount
        type: 'Groceries',
        method: 'Cash',
        week: 1
      });
    }

    // Anomaly detection should handle zero standard deviation
    const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 365 });
    
    expect(anomalies).toBeDefined();
    expect(Array.isArray(anomalies)).toBe(true);
    // With identical amounts, no amount anomalies should be detected
    const amountAnomalies = anomalies.filter(a => a.anomalyType === 'amount');
    expect(amountAnomalies.length).toBe(0);
  });

  test('Property 27: Prediction handles future month gracefully', async () => {
    // Insert some historical data
    await insertExpense({
      date: '2024-01-15',
      place: 'Store',
      amount: 100,
      type: 'Groceries',
      method: 'Cash',
      week: 1
    });

    // Get prediction for a future month (no current data)
    const prediction = await predictionService.getMonthEndPrediction(2030, 12);
    
    expect(prediction).toBeDefined();
    expect(isFinite(prediction.currentSpent)).toBe(true);
    expect(isFinite(prediction.predictedTotal)).toBe(true);
    expect(prediction.daysElapsed).toBe(0);
    expect(prediction.daysRemaining).toBeGreaterThan(0);
  });
});

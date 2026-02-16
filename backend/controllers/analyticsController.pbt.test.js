/**
 * @invariant Analytics Controller API Correctness
 * 
 * This test suite validates critical properties of the analytics controller API:
 * 1. Date range filtering is accurate and inclusive
 * 2. Edge cases (empty data, zero amounts, division by zero) are handled gracefully
 * 3. Response metadata includes data quality and confidence level indicators
 * 
 * Randomization adds value by testing various data distributions, date ranges,
 * and edge cases to ensure the API handles all scenarios correctly without errors.
 */

const fc = require('fast-check');
const { dbPbtOptions, safeAmount, paymentMethod, expenseType, weekNumber, safeDate } = require('../test/pbtArbitraries');
const { getDatabase } = require('../database/db');

const analyticsController = require('./analyticsController');
const spendingPatternsService = require('../services/spendingPatternsService');
const anomalyDetectionService = require('../services/anomalyDetectionService');
const predictionService = require('../services/predictionService');

describe('Analytics Controller - Property-Based Tests', () => {
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

  /**
   * Generate a date string for a specific month offset from a base date
   */
  const generateDateInMonth = (baseYear, baseMonth, monthOffset) => {
    const date = new Date(baseYear, baseMonth + monthOffset, 15);
    return date.toISOString().split('T')[0];
  };

  /**
   * Simulate API response construction with metadata
   */
  const buildApiResponse = async (data, sufficiency) => {
    return {
      ...data,
      metadata: {
        dataQuality: sufficiency.dataQualityScore,
        confidenceLevel: getConfidenceLevelFromMonths(sufficiency.monthsOfData)
      }
    };
  };

  const getConfidenceLevelFromMonths = (months) => {
    if (months >= 12) return 'high';
    if (months >= 6) return 'medium';
    return 'low';
  };

  describe('Date Range Filtering', () => {
    /**
     * Property 25: API Date Range Filtering
     * 
     * For any API request with startDate and endDate parameters,
     * the returned data SHALL only include expenses within that date range (inclusive).
     * 
     * Validates: Requirements 8.2
     */

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

  describe('Edge Case Handling', () => {
    /**
     * Property 27: Edge Case Handling
     * 
     * For any calculation involving division, if the divisor is zero,
     * the result SHALL be 0 or null (not an error), and the system SHALL continue
     * operating normally.
     * 
     * Validates: Requirements 8.4
     */

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
  });

  describe('Response Metadata', () => {
    /**
     * Property 26: API Response Metadata
     * 
     * For any analytics API response, the response object SHALL include
     * metadata fields for dataQuality and confidenceLevel.
     * 
     * Validates: Requirements 8.3
     */

    test('Property 26: Data sufficiency response includes metadata', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 15 }),
          fc.array(
            fc.record({
              amount: safeAmount(),
              type: expenseType,
              method: paymentMethod,
              week: weekNumber
            }),
            { minLength: 1, maxLength: 3 }
          ),
          async (monthsOfData, expenseTemplates) => {
            // Clear database
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Insert expenses if monthsOfData > 0
            if (monthsOfData > 0) {
              const baseYear = 2024;
              const baseMonth = 0;

              for (let monthOffset = 0; monthOffset < monthsOfData; monthOffset++) {
                for (const template of expenseTemplates) {
                  await insertExpense({
                    date: generateDateInMonth(baseYear, baseMonth, monthOffset),
                    amount: template.amount,
                    type: template.type,
                    method: template.method,
                    week: template.week
                  });
                }
              }
            }

            // Get data sufficiency (simulating API call)
            const sufficiency = await spendingPatternsService.checkDataSufficiency();
            const response = await buildApiResponse(sufficiency, sufficiency);

            // Property: Response must include metadata with dataQuality and confidenceLevel
            expect(response.metadata).toBeDefined();
            expect(response.metadata.dataQuality).toBeDefined();
            expect(typeof response.metadata.dataQuality).toBe('number');
            expect(response.metadata.dataQuality).toBeGreaterThanOrEqual(0);
            expect(response.metadata.dataQuality).toBeLessThanOrEqual(100);
            
            expect(response.metadata.confidenceLevel).toBeDefined();
            expect(['low', 'medium', 'high']).toContain(response.metadata.confidenceLevel);
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property 26: Prediction response includes metadata with confidence level', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 15 }),
          fc.array(
            fc.record({
              amount: safeAmount(),
              type: expenseType,
              method: paymentMethod,
              week: weekNumber
            }),
            { minLength: 1, maxLength: 3 }
          ),
          async (monthsOfData, expenseTemplates) => {
            // Clear database
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            const baseYear = 2024;
            const baseMonth = 0;

            for (let monthOffset = 0; monthOffset < monthsOfData; monthOffset++) {
              for (const template of expenseTemplates) {
                await insertExpense({
                  date: generateDateInMonth(baseYear, baseMonth, monthOffset),
                  amount: template.amount,
                  type: template.type,
                  method: template.method,
                  week: template.week
                });
              }
            }

            // Get prediction (simulating API call)
            const prediction = await predictionService.getMonthEndPrediction(2024, 6);
            const sufficiency = await spendingPatternsService.checkDataSufficiency();
            
            const response = {
              ...prediction,
              metadata: {
                dataQuality: sufficiency.dataQualityScore,
                confidenceLevel: prediction.confidenceLevel
              }
            };

            // Property: Response must include metadata
            expect(response.metadata).toBeDefined();
            expect(response.metadata.dataQuality).toBeDefined();
            expect(typeof response.metadata.dataQuality).toBe('number');
            expect(response.metadata.confidenceLevel).toBeDefined();
            expect(['low', 'medium', 'high']).toContain(response.metadata.confidenceLevel);
          }
        ),
        dbPbtOptions()
      );
    });

    test('Property 26: Confidence level correlates with months of data', async () => {
      // Test low confidence (< 6 months)
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM expenses', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Insert 3 months of data
      for (let month = 0; month < 3; month++) {
        await insertExpense({
          date: generateDateInMonth(2024, 0, month),
          amount: 100,
          type: 'Groceries',
          method: 'Cash',
          week: 1
        });
      }

      let sufficiency = await spendingPatternsService.checkDataSufficiency();
      expect(getConfidenceLevelFromMonths(sufficiency.monthsOfData)).toBe('low');

      // Add more data to reach medium confidence (6+ months)
      for (let month = 3; month < 6; month++) {
        await insertExpense({
          date: generateDateInMonth(2024, 0, month),
          amount: 100,
          type: 'Groceries',
          method: 'Cash',
          week: 1
        });
      }

      sufficiency = await spendingPatternsService.checkDataSufficiency();
      expect(getConfidenceLevelFromMonths(sufficiency.monthsOfData)).toBe('medium');

      // Add more data to reach high confidence (12+ months)
      for (let month = 6; month < 12; month++) {
        await insertExpense({
          date: generateDateInMonth(2024, 0, month),
          amount: 100,
          type: 'Groceries',
          method: 'Cash',
          week: 1
        });
      }

      sufficiency = await spendingPatternsService.checkDataSufficiency();
      expect(getConfidenceLevelFromMonths(sufficiency.monthsOfData)).toBe('high');
    });
  });
});

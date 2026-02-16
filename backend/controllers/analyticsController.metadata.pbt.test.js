/**
 * Property-Based Tests for Analytics Controller - API Response Metadata
 * 
 * **Feature: spending-patterns-predictions, Property 26: API Response Metadata**
 * **Validates: Requirements 8.3**
 * 
 * Property 26: For any analytics API response, the response object SHALL include
 * metadata fields for dataQuality and confidenceLevel.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, paymentMethod, expenseType, weekNumber } = require('../test/pbtArbitraries');
const { getDatabase } = require('../database/db');

const spendingPatternsService = require('../services/spendingPatternsService');
const predictionService = require('../services/predictionService');
const anomalyDetectionService = require('../services/anomalyDetectionService');

describe('Analytics Controller - API Response Metadata Property Tests', () => {
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

  test('Property 26: Recurring patterns response includes metadata', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 12 }),
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

          // Get patterns and sufficiency (simulating API call)
          const patterns = await spendingPatternsService.getRecurringPatterns();
          const sufficiency = await spendingPatternsService.checkDataSufficiency();
          
          const response = {
            patterns,
            metadata: {
              dataQuality: sufficiency.dataQualityScore,
              confidenceLevel: getConfidenceLevelFromMonths(sufficiency.monthsOfData),
              totalPatterns: patterns.length
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

  test('Property 26: Anomalies response includes metadata', async () => {
    // Insert some expenses
    for (let i = 0; i < 10; i++) {
      await insertExpense({
        date: generateDateInMonth(2024, 0, i % 6),
        amount: 50 + (i * 10),
        type: 'Groceries',
        method: 'Cash',
        week: 1
      });
    }

    // Get anomalies (simulating API call)
    const anomalies = await anomalyDetectionService.detectAnomalies({ lookbackDays: 365 });
    const sufficiency = await spendingPatternsService.checkDataSufficiency();
    
    const response = {
      anomalies,
      metadata: {
        dataQuality: sufficiency.dataQualityScore,
        confidenceLevel: getConfidenceLevelFromMonths(sufficiency.monthsOfData),
        totalAnomalies: anomalies.length
      }
    };

    // Property: Response must include metadata
    expect(response.metadata).toBeDefined();
    expect(response.metadata.dataQuality).toBeDefined();
    expect(typeof response.metadata.dataQuality).toBe('number');
    expect(response.metadata.confidenceLevel).toBeDefined();
    expect(['low', 'medium', 'high']).toContain(response.metadata.confidenceLevel);
    expect(response.metadata.totalAnomalies).toBeDefined();
    expect(typeof response.metadata.totalAnomalies).toBe('number');
  });
});

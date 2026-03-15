/**
 * Property-Based Tests for TrendsService
 *
 * Property 7: Data quality score excludes current month
 * Property 8: Data sufficiency flags and null sub-sections consistency
 *
 * Feature: analytics-hub-revamp
 * Validates: Requirements 4.6, 5.3, 5.4, 5.6
 *
 * @invariant Data Quality Current-Month Exclusion: For any set of expenses
 * spanning multiple months, the data quality monthsOfData count never includes
 * the current in-progress month. Data sufficiency flags are always consistent
 * with the nullity of their corresponding response fields.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// Mock dependencies before requiring trendsService
jest.mock('../utils/dbHelper');
jest.mock('./predictionService', () => ({
  getMonthEndPrediction: jest.fn(),
}));
jest.mock('./spendingPatternsService', () => ({
  getRecurringPatterns: jest.fn(),
}));
jest.mock('../config/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const dbHelper = require('../utils/dbHelper');
const predictionService = require('./predictionService');
const spendingPatternsService = require('./spendingPatternsService');
const trendsService = require('./trendsService');

// ─── Generators ───

/** Generate a year-month pair that is NOT the current month */
const arbPastYearMonth = fc.record({
  yr: fc.integer({ min: 2020, max: 2024 }),
  mo: fc.integer({ min: 1, max: 12 }),
}).map(({ yr, mo }) => ({
  yr: String(yr),
  mo: String(mo).padStart(2, '0'),
}));

/**
 * Generate a set of distinct year-month keys with expense counts.
 * Each entry represents a completed month with at least 1 expense.
 */
const arbCompletedMonths = fc.uniqueArray(
  fc.record({
    yr: fc.integer({ min: 2020, max: 2024 }),
    mo: fc.integer({ min: 1, max: 12 }),
    cnt: fc.integer({ min: 1, max: 200 }),
  }),
  { minLength: 0, maxLength: 15, selector: (e) => `${e.yr}-${e.mo}` }
);

// ─── Tests ───

describe('TrendsService — PBT', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Property 7: Data quality score excludes current month
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Property 7: Data quality score excludes current month
   *
   * For any set of expenses spanning multiple months and any reference
   * year/month identifying the "current" month, the monthsOfData count
   * should equal the number of distinct year-month pairs with expenses
   * EXCLUDING the current month.
   *
   * **Validates: Requirements 4.6, 5.6**
   */
  describe('Property 7: Data quality score excludes current month', () => {
    it('monthsOfData never includes the current month', async () => {
      await fc.assert(
        fc.asyncProperty(
          // The "current" month we are querying for
          fc.integer({ min: 2020, max: 2025 }),
          fc.integer({ min: 1, max: 12 }),
          // Completed months (may or may not overlap with current)
          arbCompletedMonths,
          // Whether to also include the current month in the DB rows
          fc.boolean(),
          async (year, month, completedMonths, includeCurrentMonth) => {
            // Build the rows that dbHelper.queryAll will return for
            // the _computeDataQuality GROUP BY query
            const rows = completedMonths.map((m) => ({
              yr: String(m.yr),
              mo: String(m.mo).padStart(2, '0'),
              cnt: m.cnt,
            }));

            // Optionally add the current month row
            if (includeCurrentMonth) {
              rows.push({
                yr: String(year),
                mo: String(month).padStart(2, '0'),
                cnt: 5,
              });
            }

            // Mock: _computeDataQuality calls queryAll once for the
            // GROUP BY query; _fetchMonthlyHistory calls queryOne per month;
            // We only care about the dataQuality result here.
            dbHelper.queryAll.mockResolvedValue(rows);
            // queryOne is used by _fetchMonthlyHistory — return empty
            dbHelper.queryOne.mockResolvedValue({ total: 0, cnt: 0 });
            predictionService.getMonthEndPrediction.mockResolvedValue(null);
            spendingPatternsService.getRecurringPatterns.mockResolvedValue([]);

            const result = await trendsService.getTrends(year, month);

            // Expected: count of distinct year-month pairs excluding current
            const currentKey = `${year}-${String(month).padStart(2, '0')}`;
            const expectedMonths = new Set(
              rows
                .map((r) => `${r.yr}-${r.mo}`)
                .filter((k) => k !== currentKey)
            ).size;

            expect(result.dataQuality.monthsOfData).toBe(expectedMonths);
          }
        ),
        pbtOptions()
      );
    });

    it('score is 0 when only the current month has data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2020, max: 2025 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 100 }),
          async (year, month, cnt) => {
            // Only the current month has expenses
            const rows = [
              {
                yr: String(year),
                mo: String(month).padStart(2, '0'),
                cnt,
              },
            ];

            dbHelper.queryAll.mockResolvedValue(rows);
            dbHelper.queryOne.mockResolvedValue({ total: 0, cnt: 0 });
            predictionService.getMonthEndPrediction.mockResolvedValue(null);
            spendingPatternsService.getRecurringPatterns.mockResolvedValue([]);

            const result = await trendsService.getTrends(year, month);

            expect(result.dataQuality.monthsOfData).toBe(0);
            expect(result.dataQuality.score).toBe(0);
          }
        ),
        pbtOptions()
      );
    });

    it('score is between 0 and 100 inclusive', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2020, max: 2025 }),
          fc.integer({ min: 1, max: 12 }),
          arbCompletedMonths,
          async (year, month, completedMonths) => {
            const rows = completedMonths.map((m) => ({
              yr: String(m.yr),
              mo: String(m.mo).padStart(2, '0'),
              cnt: m.cnt,
            }));

            dbHelper.queryAll.mockResolvedValue(rows);
            dbHelper.queryOne.mockResolvedValue({ total: 0, cnt: 0 });
            predictionService.getMonthEndPrediction.mockResolvedValue(null);
            spendingPatternsService.getRecurringPatterns.mockResolvedValue([]);

            const result = await trendsService.getTrends(year, month);

            expect(result.dataQuality.score).toBeGreaterThanOrEqual(0);
            expect(result.dataQuality.score).toBeLessThanOrEqual(100);
          }
        ),
        pbtOptions()
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Property 8: Data sufficiency flags and null sub-sections consistency
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Property 8: Data sufficiency flags and null sub-sections consistency
   *
   * If a dataSufficiency flag for a sub-section is false, then the
   * corresponding data field must be null. If the flag is true, the
   * field must not be null.
   *
   * **Validates: Requirements 5.3, 5.4**
   */
  describe('Property 8: Data sufficiency flags and null sub-sections consistency', () => {
    // Generator for prediction mock return values (null or valid object)
    const arbPrediction = fc.oneof(
      fc.constant(null),
      fc.record({
        predictedTotal: fc.integer({ min: 0, max: 100000 }).map((n) => n / 100),
        confidenceLevel: fc.constantFrom('low', 'medium', 'high'),
        currentSpent: fc.integer({ min: 0, max: 100000 }).map((n) => n / 100),
        daysRemaining: fc.integer({ min: 0, max: 31 }),
      })
    );

    // Generator for recurring patterns mock (empty array or valid patterns)
    const arbPatterns = fc.oneof(
      fc.constant([]),
      fc.constant(null),
      fc.array(
        fc.record({
          merchantName: fc.constantFrom('Netflix', 'Spotify', 'Amazon'),
          frequency: fc.constantFrom('weekly', 'monthly'),
          averageAmount: fc.integer({ min: 1, max: 10000 }).map((n) => n / 100),
          occurrenceCount: fc.integer({ min: 3, max: 20 }),
        }),
        { minLength: 1, maxLength: 12 }
      )
    );

    // Generator for monthly history queryOne results
    // true = month has data, false = month has no data
    const arbHasHistory = fc.boolean();

    it('flag=false implies field is null, flag=true implies field is not null', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2020, max: 2025 }),
          fc.integer({ min: 1, max: 12 }),
          arbPrediction,
          arbPatterns,
          arbHasHistory,
          async (year, month, predictionData, patternsData, hasHistory) => {
            // Mock prediction sub-service
            predictionService.getMonthEndPrediction.mockResolvedValue(predictionData);

            // Mock patterns sub-service
            spendingPatternsService.getRecurringPatterns.mockResolvedValue(patternsData);

            // Mock monthly history: queryOne is called per month in the 6-month window
            if (hasHistory) {
              dbHelper.queryOne.mockResolvedValue({ total: 150.0, cnt: 5 });
            } else {
              dbHelper.queryOne.mockResolvedValue({ total: 0, cnt: 0 });
            }

            // Mock data quality query
            dbHelper.queryAll.mockResolvedValue([]);

            const result = await trendsService.getTrends(year, month);

            // Check prediction consistency
            if (result.dataSufficiency.prediction) {
              expect(result.prediction).not.toBeNull();
            } else {
              expect(result.prediction).toBeNull();
            }

            // Check monthlyHistory consistency
            if (result.dataSufficiency.monthlyHistory) {
              expect(result.monthlyHistory).not.toBeNull();
            } else {
              expect(result.monthlyHistory).toBeNull();
            }

            // Check recurringPatterns consistency
            if (result.dataSufficiency.recurringPatterns) {
              expect(result.recurringPatterns).not.toBeNull();
            } else {
              expect(result.recurringPatterns).toBeNull();
            }
          }
        ),
        pbtOptions()
      );
    });

    it('all flags false when all sub-services return empty/null', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2020, max: 2025 }),
          fc.integer({ min: 1, max: 12 }),
          async (year, month) => {
            predictionService.getMonthEndPrediction.mockResolvedValue(null);
            spendingPatternsService.getRecurringPatterns.mockResolvedValue([]);
            dbHelper.queryOne.mockResolvedValue({ total: 0, cnt: 0 });
            dbHelper.queryAll.mockResolvedValue([]);

            const result = await trendsService.getTrends(year, month);

            expect(result.dataSufficiency.prediction).toBe(false);
            expect(result.dataSufficiency.monthlyHistory).toBe(false);
            expect(result.dataSufficiency.recurringPatterns).toBe(false);

            expect(result.prediction).toBeNull();
            expect(result.monthlyHistory).toBeNull();
            expect(result.recurringPatterns).toBeNull();
          }
        ),
        pbtOptions()
      );
    });

    it('sub-service errors produce null fields with false flags', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2020, max: 2025 }),
          fc.integer({ min: 1, max: 12 }),
          async (year, month) => {
            // All sub-services throw
            predictionService.getMonthEndPrediction.mockRejectedValue(
              new Error('prediction failure')
            );
            spendingPatternsService.getRecurringPatterns.mockRejectedValue(
              new Error('patterns failure')
            );
            // queryOne throws for history, queryAll returns empty for quality
            dbHelper.queryOne.mockRejectedValue(new Error('db failure'));
            dbHelper.queryAll.mockResolvedValue([]);

            const result = await trendsService.getTrends(year, month);

            // All should gracefully degrade to null / false
            expect(result.dataSufficiency.prediction).toBe(false);
            expect(result.dataSufficiency.monthlyHistory).toBe(false);
            expect(result.dataSufficiency.recurringPatterns).toBe(false);

            expect(result.prediction).toBeNull();
            expect(result.monthlyHistory).toBeNull();
            expect(result.recurringPatterns).toBeNull();
          }
        ),
        pbtOptions()
      );
    });
  });
});

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');

describe('ExpenseService - Property-Based Tests for Date Calculation', () => {
  /**
   * Helper to get the number of days in a month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {number} Number of days in the month
   */
  const getDaysInMonth = (year, month) => {
    return new Date(year, month, 0).getDate();
  };

  /**
   * Helper to parse a date string into components
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Object} { year, month, day }
   */
  const parseDate = (dateStr) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return { year, month, day };
  };

  // **Feature: recurring-expenses-v2, Property 3: Date Calculation Correctness**
  // **Validates: Requirements 1.5, 1.6**
  describe('Property 3: Date Calculation Correctness', () => {
    test('should preserve day of month when that day exists in the target month', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a source date with day 1-28 (exists in all months)
          fc.integer({ min: 2020, max: 2030 }).chain(year =>
            fc.integer({ min: 1, max: 12 }).chain(month =>
              fc.integer({ min: 1, max: 28 }).map(day =>
                `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              )
            )
          ),
          // Generate months ahead (1-12)
          fc.integer({ min: 1, max: 12 }),
          async (sourceDate, monthsAhead) => {
            const result = expenseService._calculateFutureDate(sourceDate, monthsAhead);
            
            const source = parseDate(sourceDate);
            const target = parseDate(result);
            
            // Property: Day should be preserved when source day is 1-28
            expect(target.day).toBe(source.day);
            
            // Verify the result is a valid date format
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          }
        ),
        pbtOptions()
      );
    }, 30000);

    test('should use last day of target month when source day exceeds days in target month', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a source date with day 29-31 (may not exist in all months)
          fc.integer({ min: 2020, max: 2030 }).chain(year =>
            fc.integer({ min: 1, max: 12 }).chain(month => {
              const daysInMonth = getDaysInMonth(year, month);
              // Only generate days 29-31 if the month has them
              const minDay = Math.min(29, daysInMonth);
              return fc.integer({ min: minDay, max: daysInMonth }).map(day =>
                `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              );
            })
          ),
          // Generate months ahead (1-12)
          fc.integer({ min: 1, max: 12 }),
          async (sourceDate, monthsAhead) => {
            const result = expenseService._calculateFutureDate(sourceDate, monthsAhead);
            
            const source = parseDate(sourceDate);
            const target = parseDate(result);
            
            // Calculate expected target month/year
            let expectedMonth = source.month + monthsAhead;
            let expectedYear = source.year;
            while (expectedMonth > 12) {
              expectedMonth -= 12;
              expectedYear += 1;
            }
            
            const daysInTargetMonth = getDaysInMonth(expectedYear, expectedMonth);
            
            // Property: Day should be min(sourceDay, daysInTargetMonth)
            const expectedDay = Math.min(source.day, daysInTargetMonth);
            expect(target.day).toBe(expectedDay);
            
            // Verify month and year are correct
            expect(target.month).toBe(expectedMonth);
            expect(target.year).toBe(expectedYear);
          }
        ),
        pbtOptions()
      );
    }, 30000);

    test('should handle leap year edge cases (Feb 29)', async () => {
      // Test specific leap year cases
      const leapYearCases = [
        { source: '2024-02-29', monthsAhead: 12, expected: '2025-02-28' }, // Leap to non-leap
        { source: '2024-02-29', monthsAhead: 1, expected: '2024-03-29' },  // Feb 29 to March
        { source: '2024-02-29', monthsAhead: 4, expected: '2024-06-29' },  // Feb 29 to June
        { source: '2020-02-29', monthsAhead: 12, expected: '2021-02-28' }, // Another leap to non-leap
        { source: '2024-02-29', monthsAhead: 48, expected: '2028-02-29' }, // Leap to leap (4 years)
      ];

      for (const testCase of leapYearCases) {
        const result = expenseService._calculateFutureDate(testCase.source, testCase.monthsAhead);
        expect(result).toBe(testCase.expected);
      }
    });

    test('should handle month-end edge cases (day 31 to shorter months)', async () => {
      // Test specific month-end cases
      const monthEndCases = [
        { source: '2025-01-31', monthsAhead: 1, expected: '2025-02-28' },  // Jan 31 to Feb (non-leap)
        { source: '2024-01-31', monthsAhead: 1, expected: '2024-02-29' },  // Jan 31 to Feb (leap)
        { source: '2025-01-31', monthsAhead: 3, expected: '2025-04-30' },  // Jan 31 to April
        { source: '2025-03-31', monthsAhead: 1, expected: '2025-04-30' },  // Mar 31 to April
        { source: '2025-05-31', monthsAhead: 1, expected: '2025-06-30' },  // May 31 to June
        { source: '2025-08-31', monthsAhead: 1, expected: '2025-09-30' },  // Aug 31 to Sept
        { source: '2025-10-31', monthsAhead: 1, expected: '2025-11-30' },  // Oct 31 to Nov
      ];

      for (const testCase of monthEndCases) {
        const result = expenseService._calculateFutureDate(testCase.source, testCase.monthsAhead);
        expect(result).toBe(testCase.expected);
      }
    });

    test('should correctly handle year boundary crossings', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate dates in the last few months of a year
          fc.integer({ min: 2020, max: 2029 }).chain(year =>
            fc.integer({ min: 10, max: 12 }).chain(month =>
              fc.integer({ min: 1, max: 28 }).map(day =>
                `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              )
            )
          ),
          // Generate months ahead that will cross year boundary
          fc.integer({ min: 1, max: 12 }),
          async (sourceDate, monthsAhead) => {
            const result = expenseService._calculateFutureDate(sourceDate, monthsAhead);
            
            const source = parseDate(sourceDate);
            const target = parseDate(result);
            
            // Calculate expected target month/year
            let expectedMonth = source.month + monthsAhead;
            let expectedYear = source.year;
            while (expectedMonth > 12) {
              expectedMonth -= 12;
              expectedYear += 1;
            }
            
            // Property: Year and month should be correctly calculated
            expect(target.year).toBe(expectedYear);
            expect(target.month).toBe(expectedMonth);
            
            // Property: Day should be preserved (since we use days 1-28)
            expect(target.day).toBe(source.day);
          }
        ),
        pbtOptions()
      );
    }, 30000);

    test('should always return a valid date string in YYYY-MM-DD format', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate any valid source date
          fc.integer({ min: 2020, max: 2030 }).chain(year =>
            fc.integer({ min: 1, max: 12 }).chain(month => {
              const daysInMonth = getDaysInMonth(year, month);
              return fc.integer({ min: 1, max: daysInMonth }).map(day =>
                `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              );
            })
          ),
          // Generate months ahead (1-12)
          fc.integer({ min: 1, max: 12 }),
          async (sourceDate, monthsAhead) => {
            const result = expenseService._calculateFutureDate(sourceDate, monthsAhead);
            
            // Property: Result should be a valid date string
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            
            // Property: Result should be parseable as a valid date
            const parsed = parseDate(result);
            expect(parsed.year).toBeGreaterThanOrEqual(2020);
            expect(parsed.month).toBeGreaterThanOrEqual(1);
            expect(parsed.month).toBeLessThanOrEqual(12);
            expect(parsed.day).toBeGreaterThanOrEqual(1);
            expect(parsed.day).toBeLessThanOrEqual(31);
            
            // Property: The day should not exceed the days in the target month
            const daysInTargetMonth = getDaysInMonth(parsed.year, parsed.month);
            expect(parsed.day).toBeLessThanOrEqual(daysInTargetMonth);
          }
        ),
        pbtOptions()
      );
    }, 30000);
  });
});

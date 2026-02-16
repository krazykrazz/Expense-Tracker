/**
 * Property-Based Tests for StatementBalanceService - Billing Cycle Date Calculation
 * Using fast-check library for property-based testing
 * 
 * **Property 7: Billing Cycle Date Calculation**
 * **Validates: Requirements 3.3**
 */

const fc = require('fast-check');
const { pbtOptions, safeDateObject } = require('../test/pbtArbitraries');
const statementBalanceService = require('./statementBalanceService');

describe('StatementBalanceService - Billing Cycle Property Tests', () => {
  /**
   * Property 7: Billing Cycle Date Calculation
   * Validates: Requirements 3.3
   * 
   * For any billing_cycle_day value (1-31) and reference date, the previous billing cycle 
   * should be calculated as: start = (billing_cycle_day + 1) of two months ago, 
   * end = billing_cycle_day of previous month.
   */
  test('Property 7: Billing cycle dates are calculated correctly for any valid billing_cycle_day', async () => {
    // Arbitrary for valid billing_cycle_day values (1-31)
    const billingCycleDayArbitrary = fc.integer({ min: 1, max: 31 });
    
    // Use safeDateObject to avoid invalid dates
    const referenceDateArbitrary = safeDateObject({ 
      min: new Date('2023-03-01'), 
      max: new Date('2025-10-31') 
    });

    await fc.assert(
      fc.property(
        billingCycleDayArbitrary,
        referenceDateArbitrary,
        (billingCycleDay, referenceDate) => {
          const result = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
          
          // Verify result structure
          expect(result).toHaveProperty('startDate');
          expect(result).toHaveProperty('endDate');
          
          // Verify date format (YYYY-MM-DD)
          expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          
          // Parse dates as UTC to avoid timezone issues
          const startDate = new Date(result.startDate + 'T00:00:00Z');
          const endDate = new Date(result.endDate + 'T00:00:00Z');
          
          // Verify dates are valid
          expect(startDate.toString()).not.toBe('Invalid Date');
          expect(endDate.toString()).not.toBe('Invalid Date');
          
          // Verify start date is before end date
          expect(startDate.getTime()).toBeLessThanOrEqual(endDate.getTime());
          
          // Verify the cycle is approximately one month (25-35 days to account for month variations)
          const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          expect(daysDiff).toBeGreaterThanOrEqual(25);
          expect(daysDiff).toBeLessThanOrEqual(35);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: End date day matches billing_cycle_day (or last day of month if billing_cycle_day > days in month)
   */
  test('End date day matches billing_cycle_day or is last day of month', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 1, max: 31 });
    const referenceDateArbitrary = safeDateObject({ 
      min: new Date('2023-03-01'), 
      max: new Date('2025-10-31') 
    });

    await fc.assert(
      fc.property(
        billingCycleDayArbitrary,
        referenceDateArbitrary,
        (billingCycleDay, referenceDate) => {
          const result = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
          
          const endDate = new Date(result.endDate + 'T00:00:00Z'); // Parse as UTC
          const endDay = endDate.getUTCDate();
          const endMonth = endDate.getUTCMonth();
          const endYear = endDate.getUTCFullYear();
          
          // Get the number of days in the end month
          const daysInEndMonth = new Date(Date.UTC(endYear, endMonth + 1, 0)).getUTCDate();
          
          // End day should be either the billing_cycle_day or the last day of the month
          // (whichever is smaller)
          const expectedEndDay = Math.min(billingCycleDay, daysInEndMonth);
          expect(endDay).toBe(expectedEndDay);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Start date is the day after billing_cycle_day of the previous month
   */
  test('Start date is day after billing_cycle_day of previous month', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 1, max: 28 }); // Use 28 to avoid month-end edge cases
    const referenceDateArbitrary = safeDateObject({ 
      min: new Date('2023-03-01'), 
      max: new Date('2025-10-31') 
    });

    await fc.assert(
      fc.property(
        billingCycleDayArbitrary,
        referenceDateArbitrary,
        (billingCycleDay, referenceDate) => {
          const result = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
          
          const startDate = new Date(result.startDate + 'T00:00:00Z'); // Parse as UTC
          const endDate = new Date(result.endDate + 'T00:00:00Z');
          
          // Start date should be approximately one month before end date
          // and should be the day after billing_cycle_day
          const startDay = startDate.getUTCDate();
          
          // For billing_cycle_day <= 28, start day should be billing_cycle_day + 1
          // (unless it's the 1st of the next month)
          if (startDay !== 1) {
            expect(startDay).toBe(billingCycleDay + 1);
          }
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Previous cycle is always in the past relative to reference date
   */
  test('Previous cycle end date is always before or on reference date', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 1, max: 31 });
    const referenceDateArbitrary = safeDateObject({ 
      min: new Date('2023-03-01'), 
      max: new Date('2025-10-31') 
    });

    await fc.assert(
      fc.property(
        billingCycleDayArbitrary,
        referenceDateArbitrary,
        (billingCycleDay, referenceDate) => {
          const result = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
          
          const endDate = new Date(result.endDate + 'T00:00:00Z'); // Parse as UTC
          
          // End date should be before or equal to reference date
          // (it's the previous cycle, so it should have already closed)
          // Compare using UTC timestamps
          expect(endDate.getTime()).toBeLessThanOrEqual(referenceDate.getTime());
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Invalid billing_cycle_day values should throw errors
   */
  test('Invalid billing_cycle_day values throw errors', async () => {
    const invalidDayArbitrary = fc.oneof(
      fc.integer({ min: -100, max: 0 }),
      fc.integer({ min: 32, max: 100 }),
      fc.constant(null),
      fc.constant(undefined)
    );
    
    const referenceDateArbitrary = fc.date({ 
      min: new Date('2023-01-01'), 
      max: new Date('2025-12-31') 
    });

    await fc.assert(
      fc.property(
        invalidDayArbitrary,
        referenceDateArbitrary,
        (invalidDay, referenceDate) => {
          expect(() => {
            statementBalanceService.calculatePreviousCycleDates(invalidDay, referenceDate);
          }).toThrow('Billing cycle day must be between 1 and 31');
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Consecutive reference dates produce consistent cycles
   * If reference date moves forward by one day within the same cycle, 
   * the previous cycle dates should remain the same
   */
  test('Consecutive days within same cycle produce same previous cycle dates', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 1, max: 28 });
    
    // Generate a reference date that's at least 5 days after billing_cycle_day
    // to ensure we're well within a cycle
    const yearArbitrary = fc.integer({ min: 2023, max: 2025 });
    const monthArbitrary = fc.integer({ min: 3, max: 10 }); // Avoid year boundaries

    await fc.assert(
      fc.property(
        billingCycleDayArbitrary,
        yearArbitrary,
        monthArbitrary,
        (billingCycleDay, year, month) => {
          // Create two consecutive dates that are both after billing_cycle_day
          const day1 = billingCycleDay + 5;
          const day2 = billingCycleDay + 6;
          
          // Ensure days are valid for the month
          if (day1 > 28 || day2 > 28) {
            return true; // Skip this case
          }
          
          // Use Date.UTC to create consistent UTC dates
          const date1 = new Date(Date.UTC(year, month - 1, day1));
          const date2 = new Date(Date.UTC(year, month - 1, day2));
          
          const result1 = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, date1);
          const result2 = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, date2);
          
          // Both dates are in the same cycle, so previous cycle should be the same
          expect(result1.startDate).toBe(result2.startDate);
          expect(result1.endDate).toBe(result2.endDate);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Cycle transition - day before and after billing_cycle_day produce different cycles
   */
  test('Day before and after billing_cycle_day produce different previous cycles', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 5, max: 25 }); // Avoid edge cases
    const yearArbitrary = fc.integer({ min: 2023, max: 2025 });
    const monthArbitrary = fc.integer({ min: 3, max: 10 });

    await fc.assert(
      fc.property(
        billingCycleDayArbitrary,
        yearArbitrary,
        monthArbitrary,
        (billingCycleDay, year, month) => {
          // Day on billing_cycle_day (still in previous cycle)
          const dateOnCycleDay = new Date(Date.UTC(year, month - 1, billingCycleDay));
          // Day after billing_cycle_day (in new cycle)
          const dateAfterCycleDay = new Date(Date.UTC(year, month - 1, billingCycleDay + 1));
          
          const resultOn = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, dateOnCycleDay);
          const resultAfter = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, dateAfterCycleDay);
          
          // The previous cycles should be different (one month apart)
          expect(resultOn.endDate).not.toBe(resultAfter.endDate);
          
          // The "after" cycle's end date should be one month later than the "on" cycle's end date
          const endDateOn = new Date(resultOn.endDate + 'T00:00:00Z');
          const endDateAfter = new Date(resultAfter.endDate + 'T00:00:00Z');
          
          // End date after should be approximately one month later
          const monthDiff = (endDateAfter.getUTCFullYear() - endDateOn.getUTCFullYear()) * 12 + 
                           (endDateAfter.getUTCMonth() - endDateOn.getUTCMonth());
          expect(monthDiff).toBe(1);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });
});

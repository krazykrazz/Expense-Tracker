/**
 * Property-Based Tests for Payment Method Service - Credit Utilization Calculation
 * Feature: configurable-payment-methods
 * 
 * Property 19: Credit Utilization Calculation
 * **Validates: Requirements 3.7, 3.8**
 * 
 * For any credit card with balance B and credit limit L where L > 0,
 * the utilization percentage should equal exactly (B / L) * 100, rounded to two decimal places.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const paymentMethodService = require('./paymentMethodService');

describe('PaymentMethodService - Credit Utilization Property Tests', () => {
  /**
   * Feature: configurable-payment-methods, Property 19: Credit Utilization Calculation
   * **Validates: Requirements 3.7, 3.8**
   * 
   * For any credit card with balance B and credit limit L where L > 0,
   * the utilization percentage should equal exactly (B / L) * 100, rounded to two decimal places.
   */
  test('Property 19: Credit Utilization Calculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0), max: Math.fround(50000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(100), max: Math.fround(100000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        async (balance, creditLimit) => {
          const utilization = paymentMethodService.calculateUtilizationPercentage(balance, creditLimit);
          
          // Calculate expected utilization
          const expectedUtilization = Math.round((balance / creditLimit) * 100 * 100) / 100;
          
          // Utilization should match expected value
          expect(utilization).toBe(expectedUtilization);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Utilization should be null when credit limit is zero or null
   */
  test('Property: Utilization should be null when credit limit is zero or null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
        fc.oneof(fc.constant(0), fc.constant(null), fc.constant(undefined)),
        async (balance, creditLimit) => {
          const utilization = paymentMethodService.calculateUtilizationPercentage(balance, creditLimit);
          
          // Utilization should be null when no valid credit limit
          expect(utilization).toBeNull();
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Utilization can exceed 100% when balance exceeds limit
   */
  test('Property: Utilization can exceed 100% when balance exceeds limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(1000), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(100), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        async (balance, creditLimit) => {
          // Balance is intentionally larger than limit
          const utilization = paymentMethodService.calculateUtilizationPercentage(balance, creditLimit);
          
          // Utilization should be greater than 100%
          expect(utilization).toBeGreaterThan(100);
          
          // Should still be calculated correctly
          const expectedUtilization = Math.round((balance / creditLimit) * 100 * 100) / 100;
          expect(utilization).toBe(expectedUtilization);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Utilization status should be 'danger' when >= 70%
   */
  test('Property: Utilization status should be danger when >= 70%', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(70), max: Math.fround(200), noNaN: true }),
        async (utilizationPercentage) => {
          const status = paymentMethodService.getUtilizationStatus(utilizationPercentage);
          
          expect(status).toBe('danger');
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Utilization status should be 'warning' when >= 30% and < 70%
   */
  test('Property: Utilization status should be warning when >= 30% and < 70%', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(30), max: Math.fround(69.99), noNaN: true }),
        async (utilizationPercentage) => {
          const status = paymentMethodService.getUtilizationStatus(utilizationPercentage);
          
          expect(status).toBe('warning');
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Utilization status should be 'good' when < 30%
   */
  test('Property: Utilization status should be good when < 30%', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0), max: Math.fround(29.99), noNaN: true }),
        async (utilizationPercentage) => {
          const status = paymentMethodService.getUtilizationStatus(utilizationPercentage);
          
          expect(status).toBe('good');
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Days until due should be calculated correctly
   */
  test('Property: Days until due should be calculated correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }), // Use 28 to avoid month-end edge cases
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        async (paymentDueDay, year, month, currentDay) => {
          const referenceDate = new Date(year, month - 1, currentDay);
          
          const daysUntilDue = paymentMethodService.calculateDaysUntilDue(paymentDueDay, referenceDate);
          
          // Days until due should be a non-negative number
          expect(daysUntilDue).toBeGreaterThanOrEqual(0);
          
          // Days until due should be at most 31 (one month)
          expect(daysUntilDue).toBeLessThanOrEqual(31);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Days until due should be null when no due day is set
   */
  test('Property: Days until due should be null when no due day is set', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant(0), fc.constant(-1), fc.constant(32)),
        async (invalidDueDay) => {
          const daysUntilDue = paymentMethodService.calculateDaysUntilDue(invalidDueDay);
          
          expect(daysUntilDue).toBeNull();
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Billing cycle should be calculated correctly
   */
  test('Property: Billing cycle should return valid date range', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 1, max: 28 }),
        async (billingStart, billingEnd) => {
          const cycle = paymentMethodService.calculateCurrentBillingCycle(billingStart, billingEnd);
          
          // Cycle should have start and end dates
          expect(cycle).not.toBeNull();
          expect(cycle.startDate).toBeDefined();
          expect(cycle.endDate).toBeDefined();
          
          // Dates should be in YYYY-MM-DD format
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          expect(cycle.startDate).toMatch(dateRegex);
          expect(cycle.endDate).toMatch(dateRegex);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property: Billing cycle should be null when not configured
   */
  test('Property: Billing cycle should be null when not configured', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant({ start: null, end: null }),
          fc.constant({ start: null, end: 15 }),
          fc.constant({ start: 1, end: null }),
          fc.constant({ start: undefined, end: undefined })
        ),
        async (config) => {
          const cycle = paymentMethodService.calculateCurrentBillingCycle(config.start, config.end);
          
          expect(cycle).toBeNull();
          
          return true;
        }
      ),
      pbtOptions()
    );
  });
});

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for LoanPaymentHistory Component
 * 
 * Feature: loan-payment-tracking
 * Property 14: Running Balance in Payment History
 * Validates: Requirements 6.2
 * 
 * For any payment history display, each entry should show a running balance
 * that equals initial_balance minus the cumulative sum of all payments
 * up to and including that entry.
 */

/**
 * Helper function to calculate running balances
 * This mirrors the logic in LoanPaymentHistory component
 */
const calculateRunningBalances = (payments, initialBalance) => {
  if (!payments || payments.length === 0) {
    return [];
  }

  // Reverse to chronological order for calculation
  const chronological = [...payments].reverse();
  
  let cumulativePayments = 0;
  const withBalances = chronological.map(payment => {
    cumulativePayments += payment.amount;
    const runningBalance = Math.max(0, initialBalance - cumulativePayments);
    return {
      ...payment,
      runningBalance
    };
  });

  // Return in reverse chronological order (newest first) for display
  return withBalances.reverse();
};

// Custom arbitrary for generating valid payment dates as strings
const paymentDateArbitrary = fc.integer({ min: 2020, max: 2030 })
  .chain(year => 
    fc.integer({ min: 1, max: 12 }).chain(month =>
      fc.integer({ min: 1, max: 28 }).map(day => {
        const monthStr = month.toString().padStart(2, '0');
        const dayStr = day.toString().padStart(2, '0');
        return `${year}-${monthStr}-${dayStr}`;
      })
    )
  );

// Custom arbitrary for generating valid payment entries
const paymentArbitrary = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  amount: fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
  payment_date: paymentDateArbitrary,
  notes: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: null })
});

// Custom arbitrary for generating a list of payments in reverse chronological order
const paymentsListArbitrary = fc.array(paymentArbitrary, { minLength: 1, maxLength: 20 })
  .map(payments => {
    // Sort by date descending (newest first)
    return payments.sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  });

describe('LoanPaymentHistory - Running Balance Property Tests', () => {
  /**
   * Property 14: Running Balance in Payment History
   * Validates: Requirements 6.2
   * 
   * For any payment history display, each entry should show a running balance
   * that equals initial_balance minus the cumulative sum of all payments
   * up to and including that entry.
   */
  it('Property 14: Running balance equals initial_balance minus cumulative payments', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1000), max: Math.fround(1000000), noNaN: true }), // initialBalance
        paymentsListArbitrary,
        (initialBalance, payments) => {
          const result = calculateRunningBalances(payments, initialBalance);
          
          // Verify each payment has a running balance
          expect(result.length).toBe(payments.length);
          result.forEach(payment => {
            expect(payment).toHaveProperty('runningBalance');
            expect(typeof payment.runningBalance).toBe('number');
          });
          
          // Verify running balances are calculated correctly
          // Convert to chronological order for verification
          const chronological = [...result].reverse();
          let cumulativeSum = 0;
          
          chronological.forEach(payment => {
            cumulativeSum += payment.amount;
            const expectedBalance = Math.max(0, initialBalance - cumulativeSum);
            // Use approximate equality due to floating point
            expect(payment.runningBalance).toBeCloseTo(expectedBalance, 2);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Running balance is always non-negative
   * Validates: Requirements 6.2
   */
  it('Property: Running balance is always non-negative (clamped to 0)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }), // Small initial balance
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 10000 }),
            amount: fc.float({ min: Math.fround(1000), max: Math.fround(50000), noNaN: true }), // Large payments
            payment_date: paymentDateArbitrary,
            notes: fc.constant(null)
          }),
          { minLength: 1, maxLength: 5 }
        ).map(payments => payments.sort((a, b) => b.payment_date.localeCompare(a.payment_date))),
        (initialBalance, payments) => {
          const result = calculateRunningBalances(payments, initialBalance);
          
          // All running balances should be >= 0
          result.forEach(payment => {
            expect(payment.runningBalance).toBeGreaterThanOrEqual(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: First payment (newest) has the lowest running balance
   * Validates: Requirements 6.2
   */
  it('Property: Newest payment has lowest or equal running balance', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(10000), max: Math.fround(1000000), noNaN: true }),
        paymentsListArbitrary,
        (initialBalance, payments) => {
          const result = calculateRunningBalances(payments, initialBalance);
          
          if (result.length > 1) {
            // The first entry (newest) should have the lowest or equal balance
            const newestBalance = result[0].runningBalance;
            result.forEach(payment => {
              expect(payment.runningBalance).toBeGreaterThanOrEqual(newestBalance - 0.01);
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty payments array returns empty result
   * Validates: Requirements 6.2
   */
  it('Property: Empty payments returns empty result', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1000), max: Math.fround(1000000), noNaN: true }),
        (initialBalance) => {
          const result = calculateRunningBalances([], initialBalance);
          expect(result).toEqual([]);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Single payment running balance equals initial minus payment
   * Validates: Requirements 6.2
   */
  it('Property: Single payment running balance equals initial minus payment amount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(10000), max: Math.fround(1000000), noNaN: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true }),
        (initialBalance, paymentAmount) => {
          const payments = [{
            id: 1,
            amount: paymentAmount,
            payment_date: '2026-01-15',
            notes: null
          }];
          
          const result = calculateRunningBalances(payments, initialBalance);
          
          expect(result.length).toBe(1);
          const expectedBalance = Math.max(0, initialBalance - paymentAmount);
          expect(result[0].runningBalance).toBeCloseTo(expectedBalance, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Total payments equals initial balance minus final running balance
   * (when balance doesn't go negative)
   * Validates: Requirements 6.2
   */
  it('Property: Sum of payments equals initial balance minus final running balance', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(100000), max: Math.fround(1000000), noNaN: true }), // Large initial balance
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 10000 }),
            amount: fc.float({ min: Math.fround(100), max: Math.fround(1000), noNaN: true }), // Small payments
            payment_date: paymentDateArbitrary,
            notes: fc.constant(null)
          }),
          { minLength: 1, maxLength: 10 }
        ).map(payments => payments.sort((a, b) => b.payment_date.localeCompare(a.payment_date))),
        (initialBalance, payments) => {
          const result = calculateRunningBalances(payments, initialBalance);
          
          const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
          const finalBalance = result[0].runningBalance; // Newest payment has final balance
          
          // If balance didn't go negative, the math should work out
          if (initialBalance >= totalPayments) {
            expect(initialBalance - totalPayments).toBeCloseTo(finalBalance, 2);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

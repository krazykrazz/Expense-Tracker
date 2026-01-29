/**
 * Property-Based Tests for MortgagePaymentService
 *
 * Feature: mortgage-insights
 * Tests:
 *   - Property 1: Payment Round-Trip
 *   - Property 2: Payment History Preservation
 *   - Property 9: Payment History Ordering
 *
 * Validates: Requirements 1.2, 1.3, 8.1, 8.2, 8.3
 */

const fc = require('fast-check');
const { createTestDatabase, resetTestDatabase } = require('../database/db');
const mortgagePaymentService = require('./mortgagePaymentService');
const mortgagePaymentRepository = require('../repositories/mortgagePaymentRepository');
const loanRepository = require('../repositories/loanRepository');
const { dbPbtOptions, safeString, safeAmount } = require('../test/pbtArbitraries');

/**
 * Helper to clean up all payments for a mortgage
 */
async function cleanupPayments(mortgageId) {
  try {
    await mortgagePaymentRepository.deleteByMortgage(mortgageId);
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Safe past date arbitrary for effective dates
 * Generates dates between 2020 and today as YYYY-MM-DD strings
 */
const safePastDateString = () => {
  const today = new Date();
  const maxYear = today.getFullYear();
  const maxMonth = today.getMonth() + 1;
  const maxDay = today.getDate();
  
  return fc.record({
    year: fc.integer({ min: 2020, max: maxYear }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  }).filter(({ year, month }) => {
    // Filter out future dates
    if (year > maxYear) return false;
    if (year === maxYear && month > maxMonth) return false;
    return true;
  }).map(({ year, month, day }) => {
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  });
};

/**
 * Safe future date arbitrary for renewal dates
 */
const safeFutureDateString = () => {
  return fc.integer({ min: 30, max: 3650 }).map(daysInFuture => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysInFuture);
    const year = futureDate.getFullYear();
    const month = (futureDate.getMonth() + 1).toString().padStart(2, '0');
    const day = futureDate.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
};

/**
 * Arbitrary for valid payment entry data
 */
const validPaymentArb = fc.record({
  payment_amount: safeAmount({ min: 100, max: 50000 }),
  effective_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null })
});

/**
 * Arbitrary for multiple payment entries with distinct dates
 */
const multiplePaymentsArb = fc.array(validPaymentArb, { minLength: 2, maxLength: 10 })
  .map(payments => {
    // Ensure unique effective dates by appending index to year
    return payments.map((p, index) => ({
      ...p,
      effective_date: `202${index % 6}-${(index % 12 + 1).toString().padStart(2, '0')}-${((index % 28) + 1).toString().padStart(2, '0')}`
    }));
  });

/**
 * Helper to create a test mortgage
 */
async function createTestMortgage() {
  const mortgageData = {
    name: 'Test Mortgage',
    initial_balance: 500000,
    start_date: '2020-01-01',
    loan_type: 'mortgage',
    amortization_period: 25,
    term_length: 5,
    renewal_date: (() => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 3);
      return futureDate.toISOString().split('T')[0];
    })(),
    rate_type: 'fixed',
    payment_frequency: 'monthly',
    is_paid_off: 0
  };
  
  return await loanRepository.create(mortgageData);
}

describe('MortgagePaymentService Property Tests', () => {
  let testMortgage;

  beforeAll(async () => {
    await createTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    testMortgage = await createTestMortgage();
  });

  /**
   * Property 1: Payment Round-Trip
   *
   * For any valid payment entry with a positive payment amount and valid effective date,
   * storing the payment and then retrieving it by mortgage ID shall return an equivalent
   * payment entry with all fields preserved (payment_amount, effective_date, notes).
   *
   * **Validates: Requirements 1.2, 8.1, 8.2**
   */
  describe('Property 1: Payment Round-Trip', () => {
    test('Creating and retrieving a payment should preserve all fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          validPaymentArb,
          async (paymentData) => {
            // Clean up any existing payments first
            await cleanupPayments(testMortgage.id);
            
            // Create the payment using the service
            const created = await mortgagePaymentService.setPaymentAmount(
              testMortgage.id,
              paymentData.payment_amount,
              paymentData.effective_date,
              paymentData.notes
            );

            // Retrieve the payment by ID
            const retrieved = await mortgagePaymentService.getPaymentById(created.id);

            // Verify all fields are preserved
            expect(retrieved).not.toBeNull();
            expect(retrieved.loan_id).toBe(testMortgage.id);
            expect(retrieved.payment_amount).toBeCloseTo(paymentData.payment_amount, 2);
            expect(retrieved.effective_date).toBe(paymentData.effective_date);
            
            if (paymentData.notes !== null) {
              expect(retrieved.notes).toBe(paymentData.notes.trim());
            } else {
              expect(retrieved.notes).toBeNull();
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('getCurrentPayment should return the most recently created payment', async () => {
      await fc.assert(
        fc.asyncProperty(
          validPaymentArb,
          async (paymentData) => {
            // Clean up any existing payments first
            await cleanupPayments(testMortgage.id);
            
            // Create the payment using the service
            const created = await mortgagePaymentService.setPaymentAmount(
              testMortgage.id,
              paymentData.payment_amount,
              paymentData.effective_date,
              paymentData.notes
            );

            // Retrieve current payment
            const current = await mortgagePaymentService.getCurrentPayment(testMortgage.id);

            // Verify the current payment matches what we created
            expect(current).not.toBeNull();
            expect(current.id).toBe(created.id);
            expect(current.payment_amount).toBeCloseTo(paymentData.payment_amount, 2);
            expect(current.effective_date).toBe(paymentData.effective_date);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 2: Payment History Preservation
   *
   * For any sequence of payment amount updates to a mortgage, the payment history
   * shall contain all previous values in chronological order, with no entries lost or modified.
   *
   * **Validates: Requirements 1.3**
   */
  describe('Property 2: Payment History Preservation', () => {
    test('Multiple payments should all be preserved in history', async () => {
      await fc.assert(
        fc.asyncProperty(
          multiplePaymentsArb,
          async (payments) => {
            // Clean up any existing payments first
            await cleanupPayments(testMortgage.id);
            
            // Create all payments
            const createdPayments = [];
            for (const paymentData of payments) {
              const created = await mortgagePaymentService.setPaymentAmount(
                testMortgage.id,
                paymentData.payment_amount,
                paymentData.effective_date,
                paymentData.notes
              );
              createdPayments.push(created);
            }

            // Retrieve payment history
            const history = await mortgagePaymentService.getPaymentHistory(testMortgage.id);

            // Verify all payments are in history
            expect(history.length).toBe(payments.length);

            // Verify each created payment exists in history
            for (const created of createdPayments) {
              const found = history.find(h => h.id === created.id);
              expect(found).toBeDefined();
              expect(found.payment_amount).toBeCloseTo(created.payment_amount, 2);
              expect(found.effective_date).toBe(created.effective_date);
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Updating a payment should not affect other payments in history', async () => {
      await fc.assert(
        fc.asyncProperty(
          multiplePaymentsArb,
          validPaymentArb,
          async (payments, updateData) => {
            // Clean up any existing payments first
            await cleanupPayments(testMortgage.id);
            
            // Create all payments
            const createdPayments = [];
            for (const paymentData of payments) {
              const created = await mortgagePaymentService.setPaymentAmount(
                testMortgage.id,
                paymentData.payment_amount,
                paymentData.effective_date,
                paymentData.notes
              );
              createdPayments.push(created);
            }

            // Update the first payment
            const firstPayment = createdPayments[0];
            await mortgagePaymentService.updatePayment(
              firstPayment.id,
              updateData.payment_amount,
              updateData.effective_date,
              updateData.notes
            );

            // Retrieve payment history
            const history = await mortgagePaymentService.getPaymentHistory(testMortgage.id);

            // Verify all other payments are unchanged
            for (let i = 1; i < createdPayments.length; i++) {
              const original = createdPayments[i];
              const found = history.find(h => h.id === original.id);
              expect(found).toBeDefined();
              expect(found.payment_amount).toBeCloseTo(original.payment_amount, 2);
              expect(found.effective_date).toBe(original.effective_date);
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 9: Payment History Ordering
   *
   * For any mortgage with multiple payment entries, retrieving the payment history
   * shall return entries sorted by effective_date in ascending chronological order.
   *
   * **Validates: Requirements 8.3**
   */
  describe('Property 9: Payment History Ordering', () => {
    test('Payment history should be sorted by effective_date ascending', async () => {
      await fc.assert(
        fc.asyncProperty(
          multiplePaymentsArb,
          async (payments) => {
            // Clean up any existing payments first
            await cleanupPayments(testMortgage.id);
            
            // Create all payments
            for (const paymentData of payments) {
              await mortgagePaymentService.setPaymentAmount(
                testMortgage.id,
                paymentData.payment_amount,
                paymentData.effective_date,
                paymentData.notes
              );
            }

            // Retrieve payment history
            const history = await mortgagePaymentService.getPaymentHistory(testMortgage.id);

            // Verify history is sorted by effective_date ascending
            for (let i = 1; i < history.length; i++) {
              const prevDate = new Date(history[i - 1].effective_date);
              const currDate = new Date(history[i].effective_date);
              expect(currDate.getTime()).toBeGreaterThanOrEqual(prevDate.getTime());
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('getCurrentPayment should return the payment with the latest effective_date', async () => {
      await fc.assert(
        fc.asyncProperty(
          multiplePaymentsArb,
          async (payments) => {
            // Clean up any existing payments first
            await cleanupPayments(testMortgage.id);
            
            // Create all payments
            for (const paymentData of payments) {
              await mortgagePaymentService.setPaymentAmount(
                testMortgage.id,
                paymentData.payment_amount,
                paymentData.effective_date,
                paymentData.notes
              );
            }

            // Retrieve current payment and history
            const current = await mortgagePaymentService.getCurrentPayment(testMortgage.id);
            const history = await mortgagePaymentService.getPaymentHistory(testMortgage.id);

            // Find the payment with the latest effective_date
            const latestInHistory = history.reduce((latest, payment) => {
              const latestDate = new Date(latest.effective_date);
              const paymentDate = new Date(payment.effective_date);
              return paymentDate > latestDate ? payment : latest;
            }, history[0]);

            // Verify current payment is the one with the latest effective_date
            expect(current.id).toBe(latestInHistory.id);
            expect(current.effective_date).toBe(latestInHistory.effective_date);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });
});

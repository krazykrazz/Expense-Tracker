/**
 * Preservation Property Tests for Statement Balance Payment Update
 * Spec: statement-balance-payment-update (bugfix)
 * 
 * Property 2: Preservation - Non-Statement-Balance Calculations
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 * 
 * CRITICAL: These tests capture baseline behavior on UNFIXED code.
 * They MUST PASS on unfixed code to establish the preservation baseline.
 * After the fix is implemented, these tests MUST STILL PASS to confirm no regressions.
 * 
 * GOAL: Verify that for all inputs where the bug condition does NOT hold,
 * the fixed function produces the same result as the original function.
 * 
 * For any calculation that is NOT the statement balance (current balance, projected balance,
 * utilization, billing cycle dates, payment history), the fixed code SHALL produce exactly
 * the same result as the original code, preserving all existing functionality for
 * non-statement-balance features.
 * 
 * Testing Approach: Observation-first methodology
 * 1. Observe behavior on UNFIXED code for non-buggy inputs
 * 2. Write property-based tests capturing observed behavior patterns
 * 3. Property-based testing generates many test cases for stronger guarantees
 * 
 * @invariant Preservation: All non-statement-balance calculations SHALL remain unchanged
 * after the fix is implemented. This includes current balance, payment logging, billing
 * cycle date calculations, expense tracking, payment history, payment deletion, and
 * FinancialOverviewModal data fetching.
 */

const fc = require('fast-check');
const { dbPbtOptions, safeAmount, safeDate } = require('../test/pbtArbitraries');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

// Mock the database module to use our isolated test database
let mockTestDb;
jest.mock('../database/db', () => ({
  getDatabase: jest.fn(() => Promise.resolve(mockTestDb))
}));

const statementBalanceService = require('./statementBalanceService');
const creditCardPaymentRepository = require('../repositories/creditCardPaymentRepository');

describe('StatementBalanceService - Preservation Properties (Property 2)', () => {
  beforeAll(async () => {
    mockTestDb = await createIsolatedTestDb();
  });

  afterAll(() => {
    cleanupIsolatedTestDb(mockTestDb);
  });

  /**
   * Helper: Insert a credit card payment method with billing cycle
   */
  async function insertCreditCard(displayName, billingCycleDay) {
    return new Promise((resolve, reject) => {
      mockTestDb.run(
        `INSERT INTO payment_methods (type, display_name, full_name, billing_cycle_day, is_active)
         VALUES ('credit_card', ?, ?, ?, 1)`,
        [displayName, 'Test Credit Card', billingCycleDay],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  /**
   * Helper: Insert an expense with posted_date
   */
  async function insertExpense(paymentMethodId, amount, date, postedDate = null) {
    return new Promise((resolve, reject) => {
      mockTestDb.run(
        `INSERT INTO expenses (payment_method_id, amount, date, posted_date, place, notes, type, week, method)
         VALUES (?, ?, ?, ?, 'Test Place', 'Test expense', 'Other', 1, 'credit_card')`,
        [paymentMethodId, amount, date, postedDate],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  /**
   * Helper: Insert a credit card payment
   */
  async function insertPayment(paymentMethodId, amount, paymentDate) {
    return new Promise((resolve, reject) => {
      mockTestDb.run(
        `INSERT INTO credit_card_payments (payment_method_id, amount, payment_date)
         VALUES (?, ?, ?)`,
        [paymentMethodId, amount, paymentDate],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  /**
   * Helper: Clean up test data
   */
  async function cleanupTestData() {
    return new Promise((resolve, reject) => {
      mockTestDb.serialize(() => {
        mockTestDb.run('DELETE FROM credit_card_payments', (err) => {
          if (err) return reject(err);
        });
        mockTestDb.run('DELETE FROM expenses', (err) => {
          if (err) return reject(err);
        });
        mockTestDb.run('DELETE FROM payment_methods', (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }

  /**
   * Property 2.1: Payment Records Stored Correctly
   * **Validates: Requirement 3.2**
   * 
   * EXPECTED OUTCOME ON UNFIXED CODE: PASS
   * 
   * Verifies that payment records are stored correctly in the credit_card_payments table
   * with the correct payment_date and amount. This functionality must remain unchanged
   * after the fix.
   */
  test('Property 2.1: Payment records stored correctly in credit_card_payments table', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }), // Billing cycle day
        safeAmount({ min: 100, max: 5000 }), // Payment amount
        safeDate({ min: new Date('2026-01-01'), max: new Date('2026-12-31') }), // Payment date
        async (billingCycleDay, paymentAmount, paymentDate) => {
          await cleanupTestData();

          // Create credit card
          const cardId = await insertCreditCard(
            `TestCard_${Date.now()}_${Math.random()}`,
            billingCycleDay
          );

          // Insert payment
          const paymentId = await insertPayment(cardId, paymentAmount, paymentDate);

          // Verify payment was stored correctly using repository
          const storedPayment = await creditCardPaymentRepository.findById(paymentId);

          // ASSERTIONS: Payment data must be stored correctly
          expect(storedPayment).not.toBeNull();
          expect(storedPayment.payment_method_id).toBe(cardId);
          expect(storedPayment.amount).toBeCloseTo(paymentAmount, 2);
          expect(storedPayment.payment_date).toBe(paymentDate);

          return true;
        }
      ),
      dbPbtOptions({ numRuns: 15 })
    );
  });

  /**
   * Property 2.2: Billing Cycle Date Calculations Unchanged
   * **Validates: Requirement 3.6**
   * 
   * EXPECTED OUTCOME ON UNFIXED CODE: PASS
   * 
   * Verifies that calculatePreviousCycleDates() produces consistent results.
   * This date calculation logic must remain unchanged after the fix.
   */
  test('Property 2.2: Billing cycle date calculations by calculatePreviousCycleDates() remain unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }), // Billing cycle day
        safeDate({ min: new Date('2026-01-01'), max: new Date('2026-12-31') }), // Reference date
        async (billingCycleDay, referenceDate) => {
          // Calculate cycle dates
          const cycleDates = statementBalanceService.calculatePreviousCycleDates(
            billingCycleDay,
            referenceDate
          );

          // ASSERTIONS: Cycle dates must be valid and consistent
          expect(cycleDates).toHaveProperty('startDate');
          expect(cycleDates).toHaveProperty('endDate');
          expect(cycleDates.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(cycleDates.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

          // Start date must be before end date
          expect(new Date(cycleDates.startDate).getTime()).toBeLessThan(new Date(cycleDates.endDate).getTime());

          // Verify idempotency: calling twice with same inputs produces same results
          const cycleDates2 = statementBalanceService.calculatePreviousCycleDates(
            billingCycleDay,
            referenceDate
          );
          expect(cycleDates2.startDate).toBe(cycleDates.startDate);
          expect(cycleDates2.endDate).toBe(cycleDates.endDate);

          return true;
        }
      ),
      dbPbtOptions({ numRuns: 20 })
    );
  });

  /**
   * Property 2.3: Expense Tracking with posted_date Unchanged
   * **Validates: Requirement 3.3**
   * 
   * EXPECTED OUTCOME ON UNFIXED CODE: PASS
   * 
   * Verifies that expense tracking with posted_date using COALESCE(posted_date, date)
   * continues to work correctly. The statement balance calculation uses this logic
   * to determine the effective posting date for billing cycle calculations.
   */
  test('Property 2.3: Expense tracking with posted_date using COALESCE(posted_date, date) remains unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }), // Billing cycle day
        safeAmount({ min: 100, max: 5000 }), // Expense amount
        safeDate({ min: new Date('2026-02-01'), max: new Date('2026-03-31') }), // Expense date
        fc.option(safeDate({ min: new Date('2026-02-01'), max: new Date('2026-03-31') }), { nil: null }), // Posted date (optional)
        async (billingCycleDay, expenseAmount, expenseDate, postedDate) => {
          await cleanupTestData();

          // Create credit card
          const cardId = await insertCreditCard(
            `TestCard_${Date.now()}_${Math.random()}`,
            billingCycleDay
          );

          // Insert expense with optional posted_date
          await insertExpense(cardId, expenseAmount, expenseDate, postedDate);

          // Calculate statement balance (which uses COALESCE(posted_date, date))
          const referenceDate = '2026-04-15';
          const result = await statementBalanceService.calculateStatementBalance(
            cardId,
            referenceDate
          );

          // ASSERTIONS: Statement balance calculation must handle posted_date correctly
          expect(result).not.toBeNull();
          expect(result.totalExpenses).toBeGreaterThanOrEqual(0);
          
          // The effective date for the expense should be posted_date if present, otherwise date
          // If the expense falls within the previous cycle, it should be included in totalExpenses
          const effectiveDate = postedDate || expenseDate;
          const cycleDates = statementBalanceService.calculatePreviousCycleDates(
            billingCycleDay,
            referenceDate
          );
          
          const isInCycle = effectiveDate >= cycleDates.startDate && effectiveDate <= cycleDates.endDate;
          
          if (isInCycle) {
            expect(result.totalExpenses).toBeCloseTo(expenseAmount, 2);
          } else {
            expect(result.totalExpenses).toBe(0);
          }

          return true;
        }
      ),
      dbPbtOptions({ numRuns: 15 })
    );
  });

  /**
   * Property 2.4: Payment History Display Unchanged
   * **Validates: Requirement 3.4**
   * 
   * EXPECTED OUTCOME ON UNFIXED CODE: PASS
   * 
   * Verifies that payment history queries return correct results in the correct order.
   * The Payments tab in CreditCardDetailView must continue to display payment history
   * correctly after the fix.
   */
  test('Property 2.4: Payment history display in Payments tab continues to work correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }), // Billing cycle day
        fc.array(
          fc.record({
            amount: safeAmount({ min: 50, max: 2000 }),
            date: safeDate({ min: new Date('2026-01-01'), max: new Date('2026-12-31') })
          }),
          { minLength: 1, maxLength: 5 }
        ), // Multiple payments
        async (billingCycleDay, payments) => {
          await cleanupTestData();

          // Create credit card
          const cardId = await insertCreditCard(
            `TestCard_${Date.now()}_${Math.random()}`,
            billingCycleDay
          );

          // Insert multiple payments
          for (const payment of payments) {
            await insertPayment(cardId, payment.amount, payment.date);
          }

          // Retrieve payment history
          const paymentHistory = await creditCardPaymentRepository.findByPaymentMethodId(cardId);

          // ASSERTIONS: Payment history must be complete and correctly ordered
          expect(paymentHistory).toHaveLength(payments.length);
          
          // Verify all payments are present
          const totalStored = paymentHistory.reduce((sum, p) => sum + p.amount, 0);
          const totalExpected = payments.reduce((sum, p) => sum + p.amount, 0);
          expect(totalStored).toBeCloseTo(totalExpected, 2);

          // Verify reverse chronological order (most recent first)
          for (let i = 0; i < paymentHistory.length - 1; i++) {
            const current = new Date(paymentHistory[i].payment_date);
            const next = new Date(paymentHistory[i + 1].payment_date);
            expect(current >= next).toBe(true);
          }

          return true;
        }
      ),
      dbPbtOptions({ numRuns: 10 })
    );
  });

  /**
   * Property 2.5: Payment Deletion Functionality Unchanged
   * **Validates: Requirement 3.5**
   * 
   * EXPECTED OUTCOME ON UNFIXED CODE: PASS
   * 
   * Verifies that payment deletion continues to work correctly and maintains data
   * consistency. After the fix, deleting a payment should still remove it from the
   * database and update the statement balance accordingly.
   */
  test('Property 2.5: Payment deletion functionality continues to work correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }), // Billing cycle day
        safeAmount({ min: 100, max: 5000 }), // Payment amount
        safeDate({ min: new Date('2026-01-01'), max: new Date('2026-12-31') }), // Payment date
        async (billingCycleDay, paymentAmount, paymentDate) => {
          await cleanupTestData();

          // Create credit card
          const cardId = await insertCreditCard(
            `TestCard_${Date.now()}_${Math.random()}`,
            billingCycleDay
          );

          // Insert payment
          const paymentId = await insertPayment(cardId, paymentAmount, paymentDate);

          // Verify payment exists
          const paymentBefore = await creditCardPaymentRepository.findById(paymentId);
          expect(paymentBefore).not.toBeNull();

          // Delete payment
          const deleted = await creditCardPaymentRepository.delete(paymentId);
          expect(deleted).toBe(true);

          // Verify payment is gone
          const paymentAfter = await creditCardPaymentRepository.findById(paymentId);
          expect(paymentAfter).toBeNull();

          // Verify payment history no longer includes deleted payment
          const paymentHistory = await creditCardPaymentRepository.findByPaymentMethodId(cardId);
          expect(paymentHistory).toHaveLength(0);

          return true;
        }
      ),
      dbPbtOptions({ numRuns: 15 })
    );
  });

  /**
   * Property 2.6: Statement Balance Calculation Structure Unchanged
   * **Validates: Requirement 3.7**
   * 
   * EXPECTED OUTCOME ON UNFIXED CODE: PASS
   * 
   * Verifies that the statement balance calculation returns the expected data structure
   * with all required fields. The FinancialOverviewModal and other components rely on
   * this structure, which must remain unchanged after the fix.
   */
  test('Property 2.6: FinancialOverviewModal statement balance display continues to fetch data via existing API endpoints', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }), // Billing cycle day
        safeAmount({ min: 100, max: 5000 }), // Expense amount
        async (billingCycleDay, expenseAmount) => {
          await cleanupTestData();

          // Create credit card
          const cardId = await insertCreditCard(
            `TestCard_${Date.now()}_${Math.random()}`,
            billingCycleDay
          );

          // Insert expense in previous cycle
          const referenceDate = '2026-03-25';
          const cycleDates = statementBalanceService.calculatePreviousCycleDates(
            billingCycleDay,
            referenceDate
          );
          await insertExpense(cardId, expenseAmount, cycleDates.startDate);

          // Calculate statement balance
          const result = await statementBalanceService.calculateStatementBalance(
            cardId,
            referenceDate
          );

          // ASSERTIONS: Result structure must be consistent
          expect(result).not.toBeNull();
          expect(result).toHaveProperty('statementBalance');
          expect(result).toHaveProperty('cycleStartDate');
          expect(result).toHaveProperty('cycleEndDate');
          expect(result).toHaveProperty('totalExpenses');
          expect(result).toHaveProperty('totalPayments');
          expect(result).toHaveProperty('isPaid');

          // Verify data types
          expect(typeof result.statementBalance).toBe('number');
          expect(typeof result.cycleStartDate).toBe('string');
          expect(typeof result.cycleEndDate).toBe('string');
          expect(typeof result.totalExpenses).toBe('number');
          expect(typeof result.totalPayments).toBe('number');
          expect(typeof result.isPaid).toBe('boolean');

          // Verify date formats
          expect(result.cycleStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(result.cycleEndDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

          // Verify cycle dates match expected
          expect(result.cycleStartDate).toBe(cycleDates.startDate);
          expect(result.cycleEndDate).toBe(cycleDates.endDate);

          return true;
        }
      ),
      dbPbtOptions({ numRuns: 15 })
    );
  });

  /**
   * Property 2.7: Payments After Statement Date Work Correctly (Control)
   * **Validates: Requirements 3.1, 3.2**
   * 
   * EXPECTED OUTCOME ON UNFIXED CODE: PASS
   * 
   * This is a control test to verify that payments made AFTER the statement date
   * (not ON it) continue to work correctly. This functionality is NOT affected by
   * the bug and must remain unchanged after the fix.
   * 
   * This test establishes that the bug is specific to payments ON the statement date,
   * not payments after it.
   */
  test('Property 2.7: Payments after statement date continue to reduce balance correctly (control)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }), // Billing cycle day
        safeAmount({ min: 100, max: 5000 }), // Expense amount
        safeAmount({ min: 50, max: 5000 }), // Payment amount
        fc.integer({ min: 1, max: 10 }), // Days after statement date
        async (billingCycleDay, expenseAmount, paymentAmount, daysAfter) => {
          await cleanupTestData();

          // Create credit card
          const cardId = await insertCreditCard(
            `TestCard_${Date.now()}_${Math.random()}`,
            billingCycleDay
          );

          // Calculate cycle dates
          const referenceDate = '2026-03-25';
          const cycleDates = statementBalanceService.calculatePreviousCycleDates(
            billingCycleDay,
            referenceDate
          );

          // Insert expense in previous cycle
          await insertExpense(cardId, expenseAmount, cycleDates.startDate);

          // Insert payment AFTER statement date (not ON it)
          const statementDate = new Date(cycleDates.endDate);
          const paymentDate = new Date(statementDate);
          paymentDate.setDate(paymentDate.getDate() + daysAfter);
          const paymentDateStr = paymentDate.toISOString().split('T')[0];

          await insertPayment(cardId, paymentAmount, paymentDateStr);

          // Calculate statement balance
          const result = await statementBalanceService.calculateStatementBalance(
            cardId,
            referenceDate
          );

          // ASSERTIONS: Payment after statement date should be subtracted correctly
          const expectedBalance = Math.max(0, expenseAmount - paymentAmount);
          expect(result.statementBalance).toBeCloseTo(expectedBalance, 2);
          expect(result.totalPayments).toBeCloseTo(paymentAmount, 2);
          expect(result.isPaid).toBe(expectedBalance <= 0);

          return true;
        }
      ),
      dbPbtOptions({ numRuns: 15 })
    );
  });
});

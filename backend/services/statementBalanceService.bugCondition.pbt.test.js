/**
 * Bug Condition Exploration Test for Statement Balance Payment Update
 * Spec: statement-balance-payment-update (bugfix)
 * 
 * Property 1: Fault Condition - Statement Balance Subtracts Payments on Statement Date
 * **Validates: Requirements 2.1, 2.3, 2.4**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * This test encodes the expected behavior - it will validate the fix when it passes after implementation.
 * 
 * GOAL: Surface counterexamples that demonstrate the bug exists.
 * 
 * For any payment logged ON the statement closing date, the calculateStatementBalance function
 * SHALL subtract that payment amount from the total expenses in the previous billing cycle,
 * resulting in an accurate statement balance that reflects all payments made since the statement
 * was generated.
 * 
 * Bug Hypothesis: SQL query uses `payment_date > ?` instead of `payment_date >= ?`, which
 * excludes payments made ON the statement closing date.
 * 
 * @invariant Payment on Statement Date Reduces Balance: For any payment made ON the statement
 * closing date, the statement balance SHALL equal (total expenses - payment amount). The isPaid
 * flag SHALL be true when the statement balance reaches $0.
 */

const fc = require('fast-check');
const { dbPbtOptions, safeAmount } = require('../test/pbtArbitraries');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

// Mock the database module to use our isolated test database
let mockTestDb;
jest.mock('../database/db', () => ({
  getDatabase: jest.fn(() => Promise.resolve(mockTestDb))
}));

const statementBalanceService = require('./statementBalanceService');

describe('StatementBalanceService - Bug Condition Exploration (Property 1)', () => {
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
   * Property 1: Fault Condition - Payment on Statement Date Reduces Balance
   * **Validates: Requirements 2.1, 2.3, 2.4**
   * 
   * EXPECTED OUTCOME ON UNFIXED CODE: This test will FAIL because payments made ON the
   * statement closing date are not subtracted from the statement balance.
   * 
   * Counterexamples will show:
   * - Payment on statement date not subtracted from balance
   * - isPaid remains false even when full payment made on statement date
   * - Root cause: SQL query uses `payment_date > ?` instead of `payment_date >= ?`
   */
  test('Property 1: Payment on statement closing date reduces statement balance', async () => {
    // Use a scoped approach with concrete test cases for this deterministic bug
    // This ensures reproducibility and clear counterexamples
    
    const testCases = [
      {
        name: 'Full payment on statement date',
        billingCycleDay: 15,
        referenceDate: '2026-03-20', // After statement closed on Mar 15
        expenseAmount: 3839.64,
        expenseDate: '2026-03-01', // During Feb 16 - Mar 15 cycle
        paymentAmount: 3839.64,
        paymentDate: '2026-03-15', // ON statement closing date
        expectedBalance: 0,
        expectedIsPaid: true
      },
      {
        name: 'Partial payment on statement date',
        billingCycleDay: 15,
        referenceDate: '2026-03-20',
        expenseAmount: 3839.64,
        expenseDate: '2026-03-01',
        paymentAmount: 2000.00,
        paymentDate: '2026-03-15', // ON statement closing date
        expectedBalance: 1839.64,
        expectedIsPaid: false
      },
      {
        name: 'Multiple expenses, full payment on statement date',
        billingCycleDay: 15,
        referenceDate: '2026-03-20',
        expenses: [
          { amount: 1500.00, date: '2026-02-20' },
          { amount: 2339.64, date: '2026-03-10' }
        ],
        paymentAmount: 3839.64,
        paymentDate: '2026-03-15', // ON statement closing date
        expectedBalance: 0,
        expectedIsPaid: true
      }
    ];

    for (const testCase of testCases) {
      await cleanupTestData();

      // Create credit card with billing cycle
      const cardId = await insertCreditCard(
        `TestCard_${Date.now()}_${Math.random()}`,
        testCase.billingCycleDay
      );

      // Insert expense(s) in the previous billing cycle
      if (testCase.expenses) {
        for (const expense of testCase.expenses) {
          await insertExpense(cardId, expense.amount, expense.date);
        }
      } else {
        await insertExpense(cardId, testCase.expenseAmount, testCase.expenseDate);
      }

      // Insert payment ON the statement closing date
      await insertPayment(cardId, testCase.paymentAmount, testCase.paymentDate);

      // Calculate statement balance
      const result = await statementBalanceService.calculateStatementBalance(
        cardId,
        testCase.referenceDate
      );

      // ASSERTIONS: These encode the EXPECTED behavior
      // On UNFIXED code, these will FAIL, confirming the bug exists
      expect(result.statementBalance).toBeCloseTo(testCase.expectedBalance, 2);
      expect(result.isPaid).toBe(testCase.expectedIsPaid);

      // Additional verification: totalPayments should include the payment on statement date
      expect(result.totalPayments).toBeCloseTo(testCase.paymentAmount, 2);
    }
  });

  /**
   * Property 1 (Extended): Multiple payments including one on statement date
   * **Validates: Requirements 2.1, 2.3, 2.4**
   * 
   * EXPECTED OUTCOME ON UNFIXED CODE: This test will FAIL because the payment made ON
   * the statement closing date is not included in the totalPayments calculation.
   */
  test('Property 1 (Extended): Multiple payments including statement date payment', async () => {
    await cleanupTestData();

    const billingCycleDay = 15;
    const referenceDate = '2026-03-25';
    
    // Create credit card
    const cardId = await insertCreditCard(
      `TestCard_${Date.now()}_${Math.random()}`,
      billingCycleDay
    );

    // Insert expenses in previous cycle (Feb 16 - Mar 15)
    await insertExpense(cardId, 2000.00, '2026-02-20');
    await insertExpense(cardId, 1839.64, '2026-03-10');
    // Total expenses: $3,839.64

    // Insert multiple payments
    await insertPayment(cardId, 2000.00, '2026-03-15'); // ON statement date
    await insertPayment(cardId, 1839.64, '2026-03-20'); // After statement date

    // Calculate statement balance
    const result = await statementBalanceService.calculateStatementBalance(
      cardId,
      referenceDate
    );

    // EXPECTED: Both payments should be subtracted
    expect(result.totalExpenses).toBeCloseTo(3839.64, 2);
    expect(result.totalPayments).toBeCloseTo(3839.64, 2); // Both payments
    expect(result.statementBalance).toBeCloseTo(0, 2);
    expect(result.isPaid).toBe(true);
  });

  /**
   * Property 1 (Boundary): Payment one day AFTER statement date (control case)
   * **Validates: Requirements 2.1, 2.3, 2.4**
   * 
   * EXPECTED OUTCOME ON UNFIXED CODE: This test should PASS because payments made
   * AFTER the statement date (not ON it) are correctly handled by the existing code.
   * 
   * This serves as a control to confirm the bug is specific to payments ON the statement date.
   */
  test('Property 1 (Control): Payment after statement date works correctly', async () => {
    await cleanupTestData();

    const billingCycleDay = 15;
    const referenceDate = '2026-03-20';
    
    // Create credit card
    const cardId = await insertCreditCard(
      `TestCard_${Date.now()}_${Math.random()}`,
      billingCycleDay
    );

    // Insert expense in previous cycle
    await insertExpense(cardId, 3839.64, '2026-03-01');

    // Insert payment AFTER statement date (not ON it)
    await insertPayment(cardId, 3839.64, '2026-03-16'); // One day after

    // Calculate statement balance
    const result = await statementBalanceService.calculateStatementBalance(
      cardId,
      referenceDate
    );

    // This should work correctly even on unfixed code
    expect(result.statementBalance).toBeCloseTo(0, 2);
    expect(result.isPaid).toBe(true);
    expect(result.totalPayments).toBeCloseTo(3839.64, 2);
  });

  /**
   * Property 1 (PBT): Generalized property for payments on statement date
   * **Validates: Requirements 2.1, 2.3, 2.4**
   * 
   * EXPECTED OUTCOME ON UNFIXED CODE: This test will FAIL with counterexamples showing
   * that payments on the statement date are not subtracted from the balance.
   */
  test('Property 1 (PBT): Any payment on statement date reduces balance correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }), // Billing cycle day (avoid month-end edge cases)
        safeAmount({ min: 100, max: 5000 }), // Expense amount
        safeAmount({ min: 50, max: 5000 }), // Payment amount
        async (billingCycleDay, expenseAmount, paymentAmount) => {
          await cleanupTestData();

          // Create credit card
          const cardId = await insertCreditCard(
            `TestCard_${Date.now()}_${Math.random()}`,
            billingCycleDay
          );

          // Calculate cycle dates for a reference date after the cycle
          const referenceDate = '2026-03-25';
          const cycleDates = statementBalanceService.calculatePreviousCycleDates(
            billingCycleDay,
            referenceDate
          );

          // Insert expense in the previous cycle
          const expenseDate = cycleDates.startDate;
          await insertExpense(cardId, expenseAmount, expenseDate);

          // Insert payment ON the statement closing date
          await insertPayment(cardId, paymentAmount, cycleDates.endDate);

          // Calculate statement balance
          const result = await statementBalanceService.calculateStatementBalance(
            cardId,
            referenceDate
          );

          // Expected balance: max(0, expenses - payment), rounded like the service does
          const rawExpected = expenseAmount - paymentAmount;
          const expectedBalance = Math.max(0, Math.round(rawExpected * 100) / 100);
          const expectedIsPaid = expectedBalance <= 0;

          // ASSERTIONS: These will FAIL on unfixed code
          expect(result.statementBalance).toBeCloseTo(expectedBalance, 2);
          expect(result.isPaid).toBe(expectedIsPaid);
          expect(result.totalPayments).toBeCloseTo(paymentAmount, 2);

          return true;
        }
      ),
      dbPbtOptions({ numRuns: 20 }) // Reduced runs for exploration phase
    );
  });
});

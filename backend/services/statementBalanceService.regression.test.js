/**
 * Regression Prevention Tests for Statement Balance Payment Update
 * Spec: statement-balance-payment-update (bugfix)
 * 
 * **CRITICAL REGRESSION CONTEXT**:
 * This functionality was working as recently as Feb 27, 2026 (CIBC MC).
 * On Mar 2, 2026, WS VISA showed the bug: statement balance didn't update
 * after logging a payment in full.
 * 
 * **ROOT CAUSES (two bugs)**:
 * 
 * 1. SQL query used `payment_date > ?` instead of `payment_date >= ?`,
 *    excluding payments made ON the statement closing date.
 * 
 * 2. calculateStatementBalance() always used raw expense totals as the base,
 *    ignoring the user-entered actual statement balance from the billing cycle
 *    record. When mid-cycle payments cause the bank's actual statement balance
 *    to differ from raw expenses, the calculation produces wrong results.
 *    Example: WS VISA had $7,663.66 in raw expenses but the bank statement
 *    was $3,839.64 (after mid-cycle payments were applied). The old code
 *    computed $7,663.66 - $3,839.64 = $3,824.02 instead of $3,839.64 - $3,839.64 = $0.
 * 
 * **FIXES IMPLEMENTED**:
 * 1. Changed `payment_date > ?` to `payment_date >= ?`
 * 2. When a billing cycle record exists with is_user_entered=1, use the
 *    actual_statement_balance as the base instead of raw expenses.
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

// Mock the database module to use our isolated test database
let mockTestDb;
jest.mock('../database/db', () => ({
  getDatabase: jest.fn(() => Promise.resolve(mockTestDb))
}));

const statementBalanceService = require('./statementBalanceService');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const creditCardPaymentRepository = require('../repositories/creditCardPaymentRepository');

describe('StatementBalanceService - Regression Prevention Tests', () => {
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
   * Helper: Insert a billing cycle record (user-entered or auto-generated)
   */
  async function insertBillingCycle(paymentMethodId, startDate, endDate, actualBalance, calculatedBalance, isUserEntered = 0) {
    const effectiveBalance = isUserEntered ? actualBalance : calculatedBalance;
    const balanceType = isUserEntered ? 'actual' : 'calculated';
    return new Promise((resolve, reject) => {
      mockTestDb.run(
        `INSERT INTO credit_card_billing_cycles 
         (payment_method_id, cycle_start_date, cycle_end_date, actual_statement_balance, 
          calculated_statement_balance, is_user_entered, effective_balance, balance_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentMethodId, startDate, endDate, actualBalance, calculatedBalance, isUserEntered, effectiveBalance, balanceType],
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
        mockTestDb.run('DELETE FROM credit_card_billing_cycles', (err) => {
          if (err) return reject(err);
        });
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
   * REGRESSION TEST 1: End-to-End - Create Billing Cycle → Log Payment → Verify Balance
   * 
   * This test simulates the complete user workflow that was broken by the regression:
   * 1. User has a credit card with billing cycle configured
   * 2. User makes purchases during a billing cycle
   * 3. Statement closes on the billing cycle day
   * 4. User logs a payment on the statement closing date
   * 5. User expects to see the statement balance updated correctly
   * 
   * **Validates: Requirements 2.1, 2.3, 2.4**
   */
  test('REGRESSION 1: End-to-end workflow - billing cycle creation to payment logging', async () => {
    await cleanupTestData();

    // Step 1: Create credit card with billing cycle day of 15
    const cardId = await insertCreditCard('Visa Card', 15);
    const card = await paymentMethodRepository.findById(cardId);
    expect(card.billing_cycle_day).toBe(15);

    // Step 2: User makes purchases during Feb 16 - Mar 15, 2026 cycle
    await insertExpense(cardId, 1200.50, '2026-02-20'); // Groceries
    await insertExpense(cardId, 850.00, '2026-03-01');  // Gas
    await insertExpense(cardId, 1789.14, '2026-03-10'); // Electronics
    // Total: $3,839.64

    // Step 3: Statement closes on Mar 15, 2026
    // User checks balance on Mar 16, 2026 (after statement closed)
    const balanceBeforePayment = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-16'
    );
    expect(balanceBeforePayment.statementBalance).toBeCloseTo(3839.64, 2);
    expect(balanceBeforePayment.isPaid).toBe(false);
    expect(balanceBeforePayment.cycleEndDate).toBe('2026-03-15');

    // Step 4: User logs payment on Mar 15, 2026 (the statement closing date)
    // THIS IS THE BUG CONDITION - payment on exact statement date
    await insertPayment(cardId, 3839.64, '2026-03-15');

    // Step 5: User refreshes page and expects to see statement balance updated
    const balanceAfterPayment = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-16'
    );

    // CRITICAL ASSERTIONS: These would fail with the bug
    expect(balanceAfterPayment.statementBalance).toBeCloseTo(0, 2);
    expect(balanceAfterPayment.isPaid).toBe(true);
    expect(balanceAfterPayment.totalExpenses).toBeCloseTo(3839.64, 2);
    expect(balanceAfterPayment.totalPayments).toBeCloseTo(3839.64, 2);

    // Verify payment was stored correctly
    const payments = await creditCardPaymentRepository.findByPaymentMethodId(cardId);
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBeCloseTo(3839.64, 2);
    expect(payments[0].payment_date).toBe('2026-03-15');
  });

  /**
   * REGRESSION TEST 2: Edge Case - Payment on Exact Statement Closing Date
   * 
   * This is the EXACT bug condition that was broken. The SQL query used
   * `payment_date > ?` which excluded payments made ON the statement date.
   * 
   * **Validates: Requirements 2.1, 2.3, 2.4, 2.5**
   */
  test('REGRESSION 2: Payment on exact statement closing date reduces balance', async () => {
    await cleanupTestData();

    const cardId = await insertCreditCard('MasterCard', 15);

    // Expense in previous cycle
    await insertExpense(cardId, 2500.00, '2026-03-01');

    // Payment ON statement closing date (Mar 15)
    await insertPayment(cardId, 2500.00, '2026-03-15');

    const result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-20'
    );

    // With the bug: statementBalance would be 2500.00, isPaid would be false
    // With the fix: statementBalance should be 0, isPaid should be true
    expect(result.statementBalance).toBeCloseTo(0, 2);
    expect(result.isPaid).toBe(true);
    expect(result.totalPayments).toBeCloseTo(2500.00, 2);
  });

  /**
   * REGRESSION TEST 3: Edge Case - Payment One Day After Statement Closing Date
   * 
   * This is a control test to verify that payments made AFTER the statement date
   * (not ON it) work correctly. This functionality was NOT broken by the regression.
   * 
   * **Validates: Requirements 2.1, 2.3, 2.4**
   */
  test('REGRESSION 3: Payment one day after statement closing date works correctly', async () => {
    await cleanupTestData();

    const cardId = await insertCreditCard('Amex Card', 15);

    // Expense in previous cycle
    await insertExpense(cardId, 1800.00, '2026-03-05');

    // Payment one day AFTER statement closing date (Mar 16)
    await insertPayment(cardId, 1800.00, '2026-03-16');

    const result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-20'
    );

    // This should work correctly even with the bug
    expect(result.statementBalance).toBeCloseTo(0, 2);
    expect(result.isPaid).toBe(true);
    expect(result.totalPayments).toBeCloseTo(1800.00, 2);
  });

  /**
   * REGRESSION TEST 4: Edge Case - Multiple Payments Across Different Dates
   * 
   * Tests the scenario where a user makes multiple payments, including one on
   * the statement closing date. Only payments made ON or AFTER the statement
   * date should be subtracted from the statement balance.
   * 
   * **Validates: Requirements 2.1, 2.3, 2.4**
   */
  test('REGRESSION 4: Multiple payments across different dates all reduce balance', async () => {
    await cleanupTestData();

    const cardId = await insertCreditCard('Discover Card', 15);

    // Expenses in previous cycle (Feb 16 - Mar 15)
    await insertExpense(cardId, 1000.00, '2026-02-20');
    await insertExpense(cardId, 1500.00, '2026-03-01');
    await insertExpense(cardId, 1339.64, '2026-03-10');
    // Total: $3,839.64

    // Multiple payments on different dates
    await insertPayment(cardId, 1500.00, '2026-03-15'); // ON statement date (bug condition)
    await insertPayment(cardId, 1339.64, '2026-03-20'); // After statement date

    const result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-25'
    );

    // With the bug: only payment on Mar 20 would be counted
    // Payment on Mar 15 would be excluded, leaving balance at $1,500.00
    // With the fix: both payments should be counted
    expect(result.totalExpenses).toBeCloseTo(3839.64, 2);
    expect(result.totalPayments).toBeCloseTo(2839.64, 2); // Only payments on/after statement date
    expect(result.statementBalance).toBeCloseTo(1000.00, 2);
    expect(result.isPaid).toBe(false);

    // Now make the final payment to fully pay off the statement
    await insertPayment(cardId, 1000.00, '2026-03-22');

    const resultAfterFinalPayment = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-25'
    );

    expect(resultAfterFinalPayment.totalPayments).toBeCloseTo(3839.64, 2);
    expect(resultAfterFinalPayment.statementBalance).toBeCloseTo(0, 2);
    expect(resultAfterFinalPayment.isPaid).toBe(true);
  });

  /**
   * REGRESSION TEST 5: Edge Case - Partial Payment vs Full Payment
   * 
   * Tests both partial and full payment scenarios to ensure the isPaid flag
   * is set correctly based on the statement balance.
   * 
   * **Validates: Requirements 2.1, 2.3, 2.4, 2.5**
   */
  test('REGRESSION 5: Partial payment vs full payment - isPaid flag accuracy', async () => {
    await cleanupTestData();

    const cardId = await insertCreditCard('Chase Card', 15);

    // Expense in previous cycle
    await insertExpense(cardId, 5000.00, '2026-03-01');

    // Test 1: Partial payment on statement date
    await insertPayment(cardId, 2000.00, '2026-03-15');

    let result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-20'
    );

    expect(result.statementBalance).toBeCloseTo(3000.00, 2);
    expect(result.isPaid).toBe(false);
    expect(result.totalPayments).toBeCloseTo(2000.00, 2);

    // Test 2: Additional payment to fully pay off statement
    await insertPayment(cardId, 3000.00, '2026-03-22');

    result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-25'
    );

    expect(result.statementBalance).toBeCloseTo(0, 2);
    expect(result.isPaid).toBe(true);
    expect(result.totalPayments).toBeCloseTo(5000.00, 2);

    // Test 3: Overpayment scenario
    await cleanupTestData();
    const cardId2 = await insertCreditCard('Citi Card', 15);
    await insertExpense(cardId2, 1000.00, '2026-03-01');
    await insertPayment(cardId2, 1500.00, '2026-03-15'); // Overpayment

    result = await statementBalanceService.calculateStatementBalance(
      cardId2,
      '2026-03-20'
    );

    // Statement balance should floor at 0 for overpayment
    expect(result.statementBalance).toBeCloseTo(0, 2);
    expect(result.isPaid).toBe(true);
    expect(result.totalPayments).toBeCloseTo(1500.00, 2);
  });

  /**
   * REGRESSION TEST 6: Integration - Statement Balance Calculation Through Full API
   * 
   * Tests the statement balance calculation through the service layer to ensure
   * the fix works correctly in the full application context.
   * 
   * **Validates: Requirements 2.1, 2.3, 2.4, 2.5**
   */
  test('REGRESSION 6: Statement balance calculation through full service layer', async () => {
    await cleanupTestData();

    // Create multiple credit cards with different billing cycles
    const card1Id = await insertCreditCard('Card 1', 15);
    const card2Id = await insertCreditCard('Card 2', 28);

    // Card 1: Expenses and payment on statement date
    await insertExpense(card1Id, 1500.00, '2026-03-01');
    await insertPayment(card1Id, 1500.00, '2026-03-15');

    // Card 2: Expenses and payment after statement date
    await insertExpense(card2Id, 2000.00, '2026-03-10');
    await insertPayment(card2Id, 2000.00, '2026-03-29');

    // Calculate statement balances for both cards
    const balances = await statementBalanceService.getStatementBalances(
      [card1Id, card2Id],
      '2026-04-05'
    );

    // Verify both cards show correct balances
    expect(balances.size).toBe(2);

    const card1Balance = balances.get(card1Id);
    expect(card1Balance.statementBalance).toBeCloseTo(0, 2);
    expect(card1Balance.isPaid).toBe(true);

    const card2Balance = balances.get(card2Id);
    expect(card2Balance.statementBalance).toBeCloseTo(0, 2);
    expect(card2Balance.isPaid).toBe(true);
  });

  /**
   * REGRESSION TEST 7: Integration - Verify Data Structure for UI Components
   * 
   * Ensures that the statement balance calculation returns the correct data
   * structure expected by UI components (CreditCardDetailView, FinancialOverviewModal).
   * 
   * **Validates: Requirements 2.2, 2.5**
   */
  test('REGRESSION 7: Statement balance data structure for UI components', async () => {
    await cleanupTestData();

    const cardId = await insertCreditCard('UI Test Card', 15);

    // Scenario 1: Unpaid statement
    await insertExpense(cardId, 1000.00, '2026-03-01');

    let result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-20'
    );

    // Verify complete data structure
    expect(result).toHaveProperty('statementBalance');
    expect(result).toHaveProperty('cycleStartDate');
    expect(result).toHaveProperty('cycleEndDate');
    expect(result).toHaveProperty('totalExpenses');
    expect(result).toHaveProperty('totalPayments');
    expect(result).toHaveProperty('isPaid');

    expect(result.statementBalance).toBeCloseTo(1000.00, 2);
    expect(result.isPaid).toBe(false);
    expect(result.cycleStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.cycleEndDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Scenario 2: Paid statement (payment on statement date)
    await insertPayment(cardId, 1000.00, '2026-03-15');

    result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-20'
    );

    // UI should display "✓ Paid" badge when isPaid is true
    expect(result.statementBalance).toBeCloseTo(0, 2);
    expect(result.isPaid).toBe(true);

    // Verify the paid badge display logic would work correctly
    const shouldShowPaidBadge = result.isPaid;
    const displayBalance = result.isPaid ? '$0.00' : `$${result.statementBalance.toFixed(2)}`;
    
    expect(shouldShowPaidBadge).toBe(true);
    expect(displayBalance).toBe('$0.00');
  });

  /**
   * REGRESSION TEST 8: Edge Case - Different Billing Cycle Days
   * 
   * Tests the fix works correctly for various billing cycle days to ensure
   * the date comparison logic is correct across different cycle configurations.
   * 
   * **Validates: Requirements 2.1, 2.3, 2.4**
   */
  test('REGRESSION 8: Payment on statement date works for different billing cycle days', async () => {
    await cleanupTestData();

    const testCases = [
      { billingCycleDay: 1, referenceDate: '2026-03-05', statementDate: '2026-03-01' },
      { billingCycleDay: 10, referenceDate: '2026-03-15', statementDate: '2026-03-10' },
      { billingCycleDay: 15, referenceDate: '2026-03-20', statementDate: '2026-03-15' },
      { billingCycleDay: 20, referenceDate: '2026-03-25', statementDate: '2026-03-20' },
      { billingCycleDay: 28, referenceDate: '2026-04-05', statementDate: '2026-03-28' }
    ];

    for (const testCase of testCases) {
      await cleanupTestData();

      const cardId = await insertCreditCard(
        `Card_Day${testCase.billingCycleDay}`,
        testCase.billingCycleDay
      );

      // Calculate cycle dates
      const cycleDates = statementBalanceService.calculatePreviousCycleDates(
        testCase.billingCycleDay,
        testCase.referenceDate
      );

      // Insert expense in the cycle
      await insertExpense(cardId, 1234.56, cycleDates.startDate);

      // Insert payment ON the statement closing date
      await insertPayment(cardId, 1234.56, cycleDates.endDate);

      const result = await statementBalanceService.calculateStatementBalance(
        cardId,
        testCase.referenceDate
      );

      // All billing cycle days should handle payment on statement date correctly
      expect(result.statementBalance).toBeCloseTo(0, 2);
      expect(result.isPaid).toBe(true);
      expect(result.totalPayments).toBeCloseTo(1234.56, 2);
      expect(result.cycleEndDate).toBe(cycleDates.endDate);
    }
  });

  /**
   * REGRESSION TEST 9: Edge Case - Payment Before Statement Date (Control)
   * 
   * Verifies that payments made BEFORE the statement closing date are NOT
   * subtracted from the statement balance. This is correct behavior and should
   * remain unchanged.
   * 
   * **Validates: Requirements 2.3, 2.4**
   */
  test('REGRESSION 9: Payment before statement date is not subtracted (correct behavior)', async () => {
    await cleanupTestData();

    const cardId = await insertCreditCard('Control Card', 15);

    // Expense in previous cycle
    await insertExpense(cardId, 2000.00, '2026-03-01');

    // Payment BEFORE statement closing date (during the cycle)
    await insertPayment(cardId, 500.00, '2026-03-10');

    const result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-20'
    );

    // Payment made during the cycle should NOT reduce the statement balance
    // The statement balance represents what was owed at the end of the cycle
    expect(result.statementBalance).toBeCloseTo(2000.00, 2);
    expect(result.isPaid).toBe(false);
    expect(result.totalPayments).toBeCloseTo(0, 2); // No payments after statement date
  });

  /**
   * REGRESSION TEST 10: Integration - Posted Date Handling
   * 
   * Verifies that expenses with posted_date are correctly included in the
   * statement balance calculation using COALESCE(posted_date, date).
   * 
   * **Validates: Requirements 2.3, 2.4**
   */
  test('REGRESSION 10: Expenses with posted_date are correctly included in statement balance', async () => {
    await cleanupTestData();

    const cardId = await insertCreditCard('Posted Date Card', 15);

    // Cycle is Feb 16 - Mar 15 for billing_cycle_day=15, referenceDate=2026-03-20

    // Expense with posted_date in the cycle
    await insertExpense(cardId, 1000.00, '2026-02-10', '2026-02-20'); // posted_date in cycle

    // Expense with posted_date outside the cycle
    await insertExpense(cardId, 500.00, '2026-03-01', '2026-03-20'); // posted_date after cycle

    // Payment on statement date
    await insertPayment(cardId, 1000.00, '2026-03-15');

    const result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-20'
    );

    // Only the first expense (posted_date in cycle) should be included
    expect(result.totalExpenses).toBeCloseTo(1000.00, 2);
    expect(result.totalPayments).toBeCloseTo(1000.00, 2);
    expect(result.statementBalance).toBeCloseTo(0, 2);
    expect(result.isPaid).toBe(true);
  });

  /**
   * REGRESSION TEST 11: Mid-Cycle Payment Scenario (WS VISA Bug - Root Cause #2)
   *
   * This reproduces the EXACT scenario that failed on Mar 2, 2026 for WS VISA:
   * - Raw expenses totaled $7,663.66 during the cycle
   * - Mid-cycle payments ($4,000 + $3,824.02 + $288.44 = $8,112.46) were applied
   *   by the bank, so the actual statement balance was $3,839.64
   * - User entered actual_statement_balance = $3,839.64 in the billing cycle record
   * - User then logged a payment of $3,839.64 on the cycle end date
   * - Old code: $7,663.66 - $3,839.64 = $3,824.02 (WRONG — used raw expenses)
   * - Fixed code: $3,839.64 - $3,839.64 = $0 (CORRECT — uses actual balance)
   *
   * **Validates: Requirements 2.1, 2.3, 2.4, 2.5**
   */
  test('REGRESSION 11: Mid-cycle payment scenario uses actual statement balance as base', async () => {
    await cleanupTestData();

    // WS VISA with billing_cycle_day = 14
    const cardId = await insertCreditCard('WS VISA', 14);

    // Cycle: Jan 15 - Feb 14, 2026
    const cycleStart = '2026-01-15';
    const cycleEnd = '2026-02-14';

    // Raw expenses during the cycle total $7,663.66
    await insertExpense(cardId, 3200.00, '2026-01-20');
    await insertExpense(cardId, 2100.00, '2026-01-28');
    await insertExpense(cardId, 1500.00, '2026-02-05');
    await insertExpense(cardId, 863.66, '2026-02-10');
    // Total raw expenses: $7,663.66

    // User entered the billing cycle with actual statement balance from the bank.
    // The bank already applied mid-cycle payments, so actual balance is $3,839.64.
    await insertBillingCycle(
      cardId,
      cycleStart,
      cycleEnd,
      3839.64,   // actual_statement_balance (from bank)
      7663.66,   // calculated_statement_balance (raw expenses)
      1          // is_user_entered = true
    );

    // User logs a payment of $3,839.64 on the cycle end date
    await insertPayment(cardId, 3839.64, cycleEnd);

    // Reference date after cycle end
    const result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-02-20'
    );

    // With the bug: $7,663.66 - $3,839.64 = $3,824.02 (WRONG)
    // With the fix: $3,839.64 - $3,839.64 = $0 (CORRECT)
    expect(result.statementBalance).toBeCloseTo(0, 2);
    expect(result.isPaid).toBe(true);
    expect(result.totalExpenses).toBeCloseTo(7663.66, 2);
    expect(result.totalPayments).toBeCloseTo(3839.64, 2);
  });

  /**
   * REGRESSION TEST 12: No Billing Cycle Record Preserves Raw Expense Behavior
   *
   * When no billing cycle record exists (or it's auto-generated with
   * is_user_entered=0 and actual_statement_balance=0), the service should
   * fall back to using raw expenses as the base — the original behavior.
   *
   * **Validates: Requirements 2.3, 2.4, 3.1**
   */
  test('REGRESSION 12: Without user-entered billing cycle, raw expenses are used as base', async () => {
    await cleanupTestData();

    const cardId = await insertCreditCard('Fallback Card', 15);

    // Expenses in cycle (Feb 16 - Mar 15)
    await insertExpense(cardId, 1500.00, '2026-02-25');
    await insertExpense(cardId, 800.00, '2026-03-05');
    // Total: $2,300.00

    // NO billing cycle record inserted — should use raw expenses

    // Payment on statement date
    await insertPayment(cardId, 2300.00, '2026-03-15');

    const result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-20'
    );

    // Base should be raw expenses ($2,300) since no billing cycle record exists
    expect(result.statementBalance).toBeCloseTo(0, 2);
    expect(result.isPaid).toBe(true);
    expect(result.totalExpenses).toBeCloseTo(2300.00, 2);
    expect(result.totalPayments).toBeCloseTo(2300.00, 2);
  });

  /**
   * REGRESSION TEST 13: Auto-Generated Billing Cycle (is_user_entered=0) Uses Raw Expenses
   *
   * When a billing cycle record exists but is auto-generated (is_user_entered=0)
   * with actual_statement_balance=0, the service should use raw expenses as base.
   *
   * **Validates: Requirements 2.3, 2.4, 3.1**
   */
  test('REGRESSION 13: Auto-generated billing cycle with zero actual balance uses raw expenses', async () => {
    await cleanupTestData();

    const cardId = await insertCreditCard('Auto-Gen Card', 15);

    // Expenses in cycle (Feb 16 - Mar 15)
    await insertExpense(cardId, 1200.00, '2026-03-01');
    await insertExpense(cardId, 600.00, '2026-03-10');
    // Total: $1,800.00

    // Auto-generated billing cycle with actual_statement_balance = 0
    await insertBillingCycle(
      cardId,
      '2026-02-16',
      '2026-03-15',
      0,        // actual_statement_balance = 0 (auto-generated)
      1800.00,  // calculated_statement_balance
      0         // is_user_entered = false
    );

    // Payment on statement date
    await insertPayment(cardId, 1800.00, '2026-03-15');

    const result = await statementBalanceService.calculateStatementBalance(
      cardId,
      '2026-03-20'
    );

    // Auto-generated cycle with zero actual balance → use raw expenses as base
    expect(result.statementBalance).toBeCloseTo(0, 2);
    expect(result.isPaid).toBe(true);
    expect(result.totalExpenses).toBeCloseTo(1800.00, 2);
    expect(result.totalPayments).toBeCloseTo(1800.00, 2);
  });

});

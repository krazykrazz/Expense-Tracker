/**
 * Property-Based Tests for StatementBalanceService - Floor at Zero
 * Using fast-check library for property-based testing
 * 
 * **Property 9: Statement Balance Floor at Zero**
 * **Validates: Requirements 3.6, 4.4**
 */

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');

describe('StatementBalanceService - Floor at Zero - Property-Based Tests', () => {
  let db;
  let statementBalanceService;
  
  beforeAll(async () => {
    // Get the test database
    const { getDatabase } = require('../database/db');
    db = await getDatabase();
    
    // Get the service
    statementBalanceService = require('./statementBalanceService');
  });

  // Helper function to create a credit card for testing
  async function createTestCreditCard(billingCycleDay) {
    const uniqueName = `TestCard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO payment_methods (type, display_name, credit_limit, current_balance, payment_due_day, billing_cycle_day, is_active)
        VALUES ('credit_card', ?, 5000, 0, 25, ?, 1)
      `;
      db.run(sql, [uniqueName, billingCycleDay], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Helper function to insert an expense
  async function insertExpense(expense) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO expenses (date, posted_date, place, amount, type, week, method, payment_method_id, original_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        expense.date,
        expense.posted_date || null,
        expense.place || 'Test Place',
        expense.amount,
        expense.type || 'Other',
        expense.week || 1,
        expense.method || 'Credit Card',
        expense.payment_method_id,
        expense.original_cost || null
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Helper function to insert a payment
  async function insertPayment(payment) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO credit_card_payments (payment_method_id, amount, payment_date, notes)
        VALUES (?, ?, ?, ?)
      `;
      db.run(sql, [
        payment.payment_method_id,
        payment.amount,
        payment.payment_date,
        payment.notes || null
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Helper function to clean up test data
  async function cleanupTestData(cardId, expenseIds = [], paymentIds = []) {
    for (const id of expenseIds) {
      await new Promise((resolve) => {
        db.run('DELETE FROM expenses WHERE id = ?', [id], resolve);
      });
    }
    for (const id of paymentIds) {
      await new Promise((resolve) => {
        db.run('DELETE FROM credit_card_payments WHERE id = ?', [id], resolve);
      });
    }
    await new Promise((resolve) => {
      db.run('DELETE FROM payment_methods WHERE id = ?', [cardId], resolve);
    });
  }

  /**
   * Property 9: Statement Balance Floor at Zero
   * Validates: Requirements 3.6, 4.4
   * 
   * For any statement balance calculation that results in a negative value 
   * (due to overpayment), the returned statement balance should be zero.
   */
  test('Property 9: Statement balance is floored at zero for overpayment scenarios', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 10, max: 20 });
    // Expense amount is smaller than payment to create overpayment
    const expenseAmountArbitrary = fc.float({ min: 50, max: 100, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);
    // Payment amount is larger than expense to create overpayment
    const overpaymentMultiplierArbitrary = fc.float({ min: 1.5, max: 3, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 1);

    await fc.assert(
      fc.asyncProperty(
        billingCycleDayArbitrary,
        expenseAmountArbitrary,
        overpaymentMultiplierArbitrary,
        async (billingCycleDay, expenseAmount, multiplier) => {
          let cardId = null;
          const expenseIds = [];
          const paymentIds = [];
          
          try {
            // Create a credit card
            cardId = await createTestCreditCard(billingCycleDay);

            // Reference date: June 15, 2024
            const referenceDate = new Date(Date.UTC(2024, 5, 15));
            const cycleDates = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
            
            // Insert expense within the billing cycle
            const cycleStart = new Date(cycleDates.startDate + 'T00:00:00Z');
            const cycleEnd = new Date(cycleDates.endDate + 'T00:00:00Z');
            const midCycleDate = new Date(cycleStart.getTime() + (cycleEnd.getTime() - cycleStart.getTime()) / 2);
            const expenseDate = midCycleDate.toISOString().split('T')[0];
            
            const expenseId = await insertExpense({
              date: expenseDate,
              amount: expenseAmount,
              payment_method_id: cardId
            });
            expenseIds.push(expenseId);
            
            // Insert payment LARGER than expense (overpayment)
            const paymentAmount = Math.round(expenseAmount * multiplier * 100) / 100;
            const paymentDate = new Date(cycleEnd.getTime() + 2 * 24 * 60 * 60 * 1000);
            const paymentDateStr = paymentDate.toISOString().split('T')[0];
            
            const paymentId = await insertPayment({
              payment_method_id: cardId,
              amount: paymentAmount,
              payment_date: paymentDateStr
            });
            paymentIds.push(paymentId);
            
            // Calculate statement balance
            const result = await statementBalanceService.calculateStatementBalance(cardId, referenceDate);
            
            // Verify the statement balance is floored at zero
            expect(result).not.toBeNull();
            expect(result.totalExpenses).toBeCloseTo(expenseAmount, 2);
            expect(result.totalPayments).toBeCloseTo(paymentAmount, 2);
            
            // The raw calculation would be negative, but it should be floored at 0
            expect(result.statementBalance).toBe(0);
            expect(result.isPaid).toBe(true);
            
            return true;
          } finally {
            if (cardId) {
              await cleanupTestData(cardId, expenseIds, paymentIds);
            }
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property: Statement balance is never negative
   */
  test('Statement balance is never negative regardless of payment amount', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 10, max: 20 });
    const expenseAmountArbitrary = fc.float({ min: 10, max: 200, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);
    const paymentAmountArbitrary = fc.float({ min: 10, max: 1000, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);

    await fc.assert(
      fc.asyncProperty(
        billingCycleDayArbitrary,
        expenseAmountArbitrary,
        paymentAmountArbitrary,
        async (billingCycleDay, expenseAmount, paymentAmount) => {
          let cardId = null;
          const expenseIds = [];
          const paymentIds = [];
          
          try {
            // Create a credit card
            cardId = await createTestCreditCard(billingCycleDay);

            // Reference date: June 15, 2024
            const referenceDate = new Date(Date.UTC(2024, 5, 15));
            const cycleDates = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
            
            // Insert expense within the billing cycle
            const cycleStart = new Date(cycleDates.startDate + 'T00:00:00Z');
            const cycleEnd = new Date(cycleDates.endDate + 'T00:00:00Z');
            const midCycleDate = new Date(cycleStart.getTime() + (cycleEnd.getTime() - cycleStart.getTime()) / 2);
            const expenseDate = midCycleDate.toISOString().split('T')[0];
            
            const expenseId = await insertExpense({
              date: expenseDate,
              amount: expenseAmount,
              payment_method_id: cardId
            });
            expenseIds.push(expenseId);
            
            // Insert payment (could be any amount)
            const paymentDate = new Date(cycleEnd.getTime() + 2 * 24 * 60 * 60 * 1000);
            const paymentDateStr = paymentDate.toISOString().split('T')[0];
            
            const paymentId = await insertPayment({
              payment_method_id: cardId,
              amount: paymentAmount,
              payment_date: paymentDateStr
            });
            paymentIds.push(paymentId);
            
            // Calculate statement balance
            const result = await statementBalanceService.calculateStatementBalance(cardId, referenceDate);
            
            // The key property: statement balance is NEVER negative
            expect(result).not.toBeNull();
            expect(result.statementBalance).toBeGreaterThanOrEqual(0);
            
            // Verify isPaid flag is correct
            if (paymentAmount >= expenseAmount) {
              expect(result.isPaid).toBe(true);
              expect(result.statementBalance).toBe(0);
            } else {
              expect(result.isPaid).toBe(false);
              expect(result.statementBalance).toBeGreaterThan(0);
            }
            
            return true;
          } finally {
            if (cardId) {
              await cleanupTestData(cardId, expenseIds, paymentIds);
            }
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property: isPaid flag is true when statement balance is zero
   */
  test('isPaid flag is true when statement balance is zero or less', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 10, max: 20 });
    const expenseAmountArbitrary = fc.float({ min: 50, max: 100, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);

    await fc.assert(
      fc.asyncProperty(
        billingCycleDayArbitrary,
        expenseAmountArbitrary,
        async (billingCycleDay, expenseAmount) => {
          let cardId = null;
          const expenseIds = [];
          const paymentIds = [];
          
          try {
            // Create a credit card
            cardId = await createTestCreditCard(billingCycleDay);

            // Reference date: June 15, 2024
            const referenceDate = new Date(Date.UTC(2024, 5, 15));
            const cycleDates = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
            
            // Insert expense within the billing cycle
            const cycleStart = new Date(cycleDates.startDate + 'T00:00:00Z');
            const cycleEnd = new Date(cycleDates.endDate + 'T00:00:00Z');
            const midCycleDate = new Date(cycleStart.getTime() + (cycleEnd.getTime() - cycleStart.getTime()) / 2);
            const expenseDate = midCycleDate.toISOString().split('T')[0];
            
            const expenseId = await insertExpense({
              date: expenseDate,
              amount: expenseAmount,
              payment_method_id: cardId
            });
            expenseIds.push(expenseId);
            
            // Insert payment EXACTLY equal to expense (paid in full)
            const paymentDate = new Date(cycleEnd.getTime() + 2 * 24 * 60 * 60 * 1000);
            const paymentDateStr = paymentDate.toISOString().split('T')[0];
            
            const paymentId = await insertPayment({
              payment_method_id: cardId,
              amount: expenseAmount, // Exact payment
              payment_date: paymentDateStr
            });
            paymentIds.push(paymentId);
            
            // Calculate statement balance
            const result = await statementBalanceService.calculateStatementBalance(cardId, referenceDate);
            
            // Verify isPaid is true when balance is exactly zero
            expect(result).not.toBeNull();
            expect(result.statementBalance).toBe(0);
            expect(result.isPaid).toBe(true);
            
            return true;
          } finally {
            if (cardId) {
              await cleanupTestData(cardId, expenseIds, paymentIds);
            }
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property: No expenses results in zero statement balance
   */
  test('No expenses in billing cycle results in zero statement balance', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 10, max: 20 });

    await fc.assert(
      fc.asyncProperty(
        billingCycleDayArbitrary,
        async (billingCycleDay) => {
          let cardId = null;
          
          try {
            // Create a credit card with no expenses
            cardId = await createTestCreditCard(billingCycleDay);

            // Reference date: June 15, 2024
            const referenceDate = new Date(Date.UTC(2024, 5, 15));
            
            // Calculate statement balance (no expenses)
            const result = await statementBalanceService.calculateStatementBalance(cardId, referenceDate);
            
            // Verify zero balance and isPaid
            expect(result).not.toBeNull();
            expect(result.totalExpenses).toBe(0);
            expect(result.totalPayments).toBe(0);
            expect(result.statementBalance).toBe(0);
            expect(result.isPaid).toBe(true);
            
            return true;
          } finally {
            if (cardId) {
              await cleanupTestData(cardId);
            }
          }
        }
      ),
      dbPbtOptions()
    );
  });
});

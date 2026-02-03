/**
 * Property-Based Tests for StatementBalanceService - Payment Subtraction
 * Using fast-check library for property-based testing
 * 
 * **Property 8: Payment Subtraction in Statement Balance**
 * **Validates: Requirements 3.5, 4.2, 4.3**
 */

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');

describe('StatementBalanceService - Payment Subtraction - Property-Based Tests', () => {
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
   * Property 8: Payment Subtraction in Statement Balance
   * Validates: Requirements 3.5, 4.2, 4.3
   * 
   * For any credit card with calculated statement expenses, the final statement balance 
   * should equal (total expenses in cycle) minus (total payments made since the statement date).
   */
  test('Property 8: Statement balance equals expenses minus payments since statement date', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 10, max: 20 });
    const expenseAmountArbitrary = fc.float({ min: 100, max: 500, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);
    const paymentAmountArbitrary = fc.float({ min: 10, max: 200, noNaN: true })
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
            
            // Insert payment AFTER the statement date (cycle end)
            // Payment should be after cycle end but before reference date
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
            
            // Verify the calculation
            expect(result).not.toBeNull();
            expect(result.totalExpenses).toBeCloseTo(expenseAmount, 2);
            expect(result.totalPayments).toBeCloseTo(paymentAmount, 2);
            
            // Statement balance = expenses - payments (floored at 0)
            const expectedBalance = Math.max(0, expenseAmount - paymentAmount);
            expect(result.statementBalance).toBeCloseTo(expectedBalance, 2);
            
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
   * Property: Payments made before statement date are not subtracted
   */
  test('Payments before statement date are not subtracted from statement balance', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 10, max: 20 });
    const expenseAmountArbitrary = fc.float({ min: 100, max: 500, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);
    const paymentAmountArbitrary = fc.float({ min: 10, max: 200, noNaN: true })
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
            
            // Insert payment BEFORE the statement date (within the cycle)
            // This payment should NOT be subtracted from the statement balance
            const paymentDate = new Date(cycleStart.getTime() + 5 * 24 * 60 * 60 * 1000);
            const paymentDateStr = paymentDate.toISOString().split('T')[0];
            
            const paymentId = await insertPayment({
              payment_method_id: cardId,
              amount: paymentAmount,
              payment_date: paymentDateStr
            });
            paymentIds.push(paymentId);
            
            // Calculate statement balance
            const result = await statementBalanceService.calculateStatementBalance(cardId, referenceDate);
            
            // Verify the payment is NOT subtracted (it was made before statement date)
            expect(result).not.toBeNull();
            expect(result.totalExpenses).toBeCloseTo(expenseAmount, 2);
            expect(result.totalPayments).toBe(0); // Payment before statement date not counted
            expect(result.statementBalance).toBeCloseTo(expenseAmount, 2);
            
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
   * Property: Multiple payments are summed correctly
   */
  test('Multiple payments after statement date are summed correctly', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 10, max: 20 });
    const expenseAmountArbitrary = fc.float({ min: 200, max: 500, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);
    const paymentAmountsArbitrary = fc.array(
      fc.float({ min: 10, max: 50, noNaN: true })
        .filter(n => !isNaN(n) && isFinite(n) && n > 0)
        .map(n => Math.round(n * 100) / 100),
      { minLength: 2, maxLength: 4 }
    );

    await fc.assert(
      fc.asyncProperty(
        billingCycleDayArbitrary,
        expenseAmountArbitrary,
        paymentAmountsArbitrary,
        async (billingCycleDay, expenseAmount, paymentAmounts) => {
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
            
            // Insert multiple payments after the statement date
            let totalPayments = 0;
            for (let i = 0; i < paymentAmounts.length; i++) {
              const paymentDate = new Date(cycleEnd.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
              const paymentDateStr = paymentDate.toISOString().split('T')[0];
              
              const paymentId = await insertPayment({
                payment_method_id: cardId,
                amount: paymentAmounts[i],
                payment_date: paymentDateStr
              });
              paymentIds.push(paymentId);
              totalPayments += paymentAmounts[i];
            }
            
            // Calculate statement balance
            const result = await statementBalanceService.calculateStatementBalance(cardId, referenceDate);
            
            // Verify all payments are summed
            expect(result).not.toBeNull();
            expect(result.totalExpenses).toBeCloseTo(expenseAmount, 2);
            expect(result.totalPayments).toBeCloseTo(totalPayments, 2);
            
            // Statement balance = expenses - total payments (floored at 0)
            const expectedBalance = Math.max(0, expenseAmount - totalPayments);
            expect(result.statementBalance).toBeCloseTo(expectedBalance, 2);
            
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
});

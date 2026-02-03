/**
 * Property-Based Tests for StatementBalanceService - Statement Balance Expense Calculation
 * Using fast-check library for property-based testing
 * 
 * **Property 6: Statement Balance Expense Calculation**
 * **Validates: Requirements 3.1, 3.2**
 */

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// We need to test the service with a real database, so we'll use the test database
// that's set up by the jest environment

describe('StatementBalanceService - Statement Balance Expense Calculation - Property-Based Tests', () => {
  let db;
  let statementBalanceService;
  let paymentMethodRepository;
  
  beforeAll(async () => {
    // Get the test database
    const { getDatabase } = require('../database/db');
    db = await getDatabase();
    
    // Get the service and repository
    statementBalanceService = require('./statementBalanceService');
    paymentMethodRepository = require('../repositories/paymentMethodRepository');
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
    // Delete expenses
    for (const id of expenseIds) {
      await new Promise((resolve) => {
        db.run('DELETE FROM expenses WHERE id = ?', [id], resolve);
      });
    }
    // Delete payments
    for (const id of paymentIds) {
      await new Promise((resolve) => {
        db.run('DELETE FROM credit_card_payments WHERE id = ?', [id], resolve);
      });
    }
    // Delete card
    await new Promise((resolve) => {
      db.run('DELETE FROM payment_methods WHERE id = ?', [cardId], resolve);
    });
  }

  /**
   * Property 6: Statement Balance Expense Calculation
   * Validates: Requirements 3.1, 3.2
   * 
   * For any credit card with a configured billing cycle and a set of expenses, 
   * the statement balance should equal the sum of all expenses where 
   * COALESCE(posted_date, date) falls within the previous billing cycle period.
   */
  test('Property 6: Statement balance equals sum of expenses in previous billing cycle', async () => {
    // Arbitrary for billing cycle day
    const billingCycleDayArbitrary = fc.integer({ min: 10, max: 20 });
    
    // Arbitrary for expense amounts
    const expenseAmountArbitrary = fc.float({ min: 1, max: 500, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);

    await fc.assert(
      fc.asyncProperty(
        billingCycleDayArbitrary,
        fc.array(expenseAmountArbitrary, { minLength: 1, maxLength: 5 }),
        async (billingCycleDay, expenseAmounts) => {
          let cardId = null;
          const expenseIds = [];
          
          try {
            // Create a credit card with billing cycle configured
            cardId = await createTestCreditCard(billingCycleDay);

            // Use a fixed reference date for predictable testing
            const referenceDate = new Date(Date.UTC(2024, 5, 15)); // June 15, 2024
            
            // Calculate the previous cycle dates
            const cycleDates = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
            
            // Insert expenses within the previous billing cycle
            let expectedTotal = 0;
            for (const amount of expenseAmounts) {
              // Create expense date within the cycle
              const cycleStart = new Date(cycleDates.startDate + 'T00:00:00Z');
              const cycleEnd = new Date(cycleDates.endDate + 'T00:00:00Z');
              const midCycleDate = new Date(cycleStart.getTime() + (cycleEnd.getTime() - cycleStart.getTime()) / 2);
              const expenseDate = midCycleDate.toISOString().split('T')[0];
              
              const expenseId = await insertExpense({
                date: expenseDate,
                posted_date: null,
                amount: amount,
                payment_method_id: cardId
              });
              expenseIds.push(expenseId);
              
              expectedTotal += amount;
            }
            
            // Calculate statement balance
            const result = await statementBalanceService.calculateStatementBalance(cardId, referenceDate);
            
            // Verify the statement balance equals the sum of expenses
            expect(result).not.toBeNull();
            expect(result.totalExpenses).toBeCloseTo(expectedTotal, 2);
            expect(result.totalPayments).toBe(0);
            expect(result.statementBalance).toBeCloseTo(expectedTotal, 2);
            
            return true;
          } finally {
            // Cleanup
            if (cardId) {
              await cleanupTestData(cardId, expenseIds);
            }
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property: Expenses with posted_date use posted_date for cycle determination
   */
  test('Expenses use posted_date when available for cycle determination', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 10, max: 20 });
    const expenseAmountArbitrary = fc.float({ min: 10, max: 100, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);

    await fc.assert(
      fc.asyncProperty(
        billingCycleDayArbitrary,
        expenseAmountArbitrary,
        async (billingCycleDay, amount) => {
          let cardId = null;
          const expenseIds = [];
          
          try {
            // Create a credit card
            cardId = await createTestCreditCard(billingCycleDay);

            // Reference date: June 15, 2024
            const referenceDate = new Date(Date.UTC(2024, 5, 15));
            const cycleDates = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
            
            // Create an expense with date OUTSIDE the cycle but posted_date INSIDE the cycle
            const outsideDate = '2024-01-01'; // Way before the cycle
            const cycleStart = new Date(cycleDates.startDate + 'T00:00:00Z');
            const cycleEnd = new Date(cycleDates.endDate + 'T00:00:00Z');
            const midCycleDate = new Date(cycleStart.getTime() + (cycleEnd.getTime() - cycleStart.getTime()) / 2);
            const insidePostedDate = midCycleDate.toISOString().split('T')[0];
            
            const expenseId = await insertExpense({
              date: outsideDate,
              posted_date: insidePostedDate,
              amount: amount,
              payment_method_id: cardId
            });
            expenseIds.push(expenseId);
            
            // Calculate statement balance
            const result = await statementBalanceService.calculateStatementBalance(cardId, referenceDate);
            
            // The expense should be included because posted_date is in the cycle
            expect(result).not.toBeNull();
            expect(result.totalExpenses).toBeCloseTo(amount, 2);
            
            return true;
          } finally {
            if (cardId) {
              await cleanupTestData(cardId, expenseIds);
            }
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property: Expenses outside the billing cycle are not included
   */
  test('Expenses outside billing cycle are not included in statement balance', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 10, max: 20 });
    const expenseAmountArbitrary = fc.float({ min: 10, max: 100, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);

    await fc.assert(
      fc.asyncProperty(
        billingCycleDayArbitrary,
        expenseAmountArbitrary,
        expenseAmountArbitrary,
        async (billingCycleDay, insideAmount, outsideAmount) => {
          let cardId = null;
          const expenseIds = [];
          
          try {
            // Create a credit card
            cardId = await createTestCreditCard(billingCycleDay);

            // Reference date: June 15, 2024
            const referenceDate = new Date(Date.UTC(2024, 5, 15));
            const cycleDates = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
            
            // Insert expense INSIDE the cycle
            const cycleStart = new Date(cycleDates.startDate + 'T00:00:00Z');
            const cycleEnd = new Date(cycleDates.endDate + 'T00:00:00Z');
            const midCycleDate = new Date(cycleStart.getTime() + (cycleEnd.getTime() - cycleStart.getTime()) / 2);
            const insideDate = midCycleDate.toISOString().split('T')[0];
            
            const insideExpenseId = await insertExpense({
              date: insideDate,
              amount: insideAmount,
              payment_method_id: cardId
            });
            expenseIds.push(insideExpenseId);
            
            // Insert expense OUTSIDE the cycle (way before)
            const beforeExpenseId = await insertExpense({
              date: '2023-01-01',
              amount: outsideAmount,
              payment_method_id: cardId
            });
            expenseIds.push(beforeExpenseId);
            
            // Insert expense OUTSIDE the cycle (after cycle end, in current cycle)
            const afterCycleDate = new Date(cycleEnd.getTime() + 5 * 24 * 60 * 60 * 1000);
            const afterExpenseId = await insertExpense({
              date: afterCycleDate.toISOString().split('T')[0],
              amount: outsideAmount,
              payment_method_id: cardId
            });
            expenseIds.push(afterExpenseId);
            
            // Calculate statement balance
            const result = await statementBalanceService.calculateStatementBalance(cardId, referenceDate);
            
            // Only the inside expense should be included
            expect(result).not.toBeNull();
            expect(result.totalExpenses).toBeCloseTo(insideAmount, 2);
            
            return true;
          } finally {
            if (cardId) {
              await cleanupTestData(cardId, expenseIds);
            }
          }
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * Property: original_cost is used when set (for insurance cases)
   */
  test('original_cost is used instead of amount when set', async () => {
    const billingCycleDayArbitrary = fc.integer({ min: 10, max: 20 });
    const amountArbitrary = fc.float({ min: 10, max: 50, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);
    const originalCostArbitrary = fc.float({ min: 100, max: 200, noNaN: true })
      .filter(n => !isNaN(n) && isFinite(n) && n > 0)
      .map(n => Math.round(n * 100) / 100);

    await fc.assert(
      fc.asyncProperty(
        billingCycleDayArbitrary,
        amountArbitrary,
        originalCostArbitrary,
        async (billingCycleDay, amount, originalCost) => {
          let cardId = null;
          const expenseIds = [];
          
          try {
            // Create a credit card
            cardId = await createTestCreditCard(billingCycleDay);

            // Reference date: June 15, 2024
            const referenceDate = new Date(Date.UTC(2024, 5, 15));
            const cycleDates = statementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);
            
            // Insert expense with original_cost set
            const cycleStart = new Date(cycleDates.startDate + 'T00:00:00Z');
            const cycleEnd = new Date(cycleDates.endDate + 'T00:00:00Z');
            const midCycleDate = new Date(cycleStart.getTime() + (cycleEnd.getTime() - cycleStart.getTime()) / 2);
            const expenseDate = midCycleDate.toISOString().split('T')[0];
            
            const expenseId = await insertExpense({
              date: expenseDate,
              amount: amount,
              original_cost: originalCost,
              payment_method_id: cardId
            });
            expenseIds.push(expenseId);
            
            // Calculate statement balance
            const result = await statementBalanceService.calculateStatementBalance(cardId, referenceDate);
            
            // The original_cost should be used for the balance calculation
            expect(result).not.toBeNull();
            expect(result.totalExpenses).toBeCloseTo(originalCost, 2);
            
            return true;
          } finally {
            if (cardId) {
              await cleanupTestData(cardId, expenseIds);
            }
          }
        }
      ),
      dbPbtOptions()
    );
  });
});

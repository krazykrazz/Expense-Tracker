/**
 * Fixed Expense Loan Linkage Integration Tests
 * 
 * Tests the end-to-end flow of:
 * 1. Creating a linked fixed expense
 * 2. Verifying reminders appear
 * 3. Auto-logging a payment
 * 4. Verifying reminder is suppressed
 * 
 * Requirements: 3.4, 4.4
 */

const { getDatabase } = require('../database/db');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const loanRepository = require('../repositories/loanRepository');
const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const reminderService = require('./reminderService');
const autoPaymentLoggerService = require('./autoPaymentLoggerService');

describe('Fixed Expense Loan Linkage Integration Tests', () => {
  let db;
  let testLoanId;
  let testFixedExpenseId;
  const testYear = 2024;
  const testMonth = 6;
  const testDueDay = 15;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data in correct order (child tables first)
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loan_payments', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM fixed_expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loan_balances', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loans', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create a test loan
    const loan = await loanRepository.create({
      name: 'Test Car Loan',
      initial_balance: 25000,
      start_date: '2024-01-01',
      loan_type: 'loan',
      notes: 'Test loan for integration testing'
    });
    testLoanId = loan.id;
  });

  afterEach(async () => {
    // Clean up test data
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loan_payments', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM fixed_expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loan_balances', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM loans', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe('End-to-End Flow: Create Linked Expense → Reminders → Auto-Log → Suppression', () => {
    /**
     * Integration Test: Complete flow from linked expense creation to reminder suppression
     * _Requirements: 3.4, 4.4_
     */
    it('should complete the full flow: create linked expense, show reminders, auto-log payment, suppress reminder', async () => {
      // Step 1: Create a linked fixed expense with due date
      const fixedExpense = await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Car Loan Payment',
        amount: 500,
        category: 'Other',
        payment_type: 'Debit',
        payment_due_day: testDueDay,
        linked_loan_id: testLoanId
      });
      testFixedExpenseId = fixedExpense.id;

      // Verify the fixed expense was created with correct linkage
      expect(fixedExpense.linked_loan_id).toBe(testLoanId);
      expect(fixedExpense.payment_due_day).toBe(testDueDay);

      // Step 2: Verify reminders appear (use a reference date where due day is within 7 days)
      // Set reference date to June 10, 2024 (5 days before due day 15)
      const referenceDate = new Date(2024, 5, 10); // June 10, 2024
      
      const remindersBeforePayment = await reminderService.getLoanPaymentReminders(referenceDate);
      
      // Should have the linked expense in due soon payments
      expect(remindersBeforePayment.hasLinkedExpenses).toBe(true);
      expect(remindersBeforePayment.dueSoonCount).toBe(1);
      expect(remindersBeforePayment.dueSoonPayments.length).toBe(1);
      
      const reminder = remindersBeforePayment.dueSoonPayments[0];
      expect(reminder.fixedExpenseId).toBe(testFixedExpenseId);
      expect(reminder.loanId).toBe(testLoanId);
      expect(reminder.amount).toBe(500);
      expect(reminder.hasPaymentThisMonth).toBe(false);

      // Step 3: Auto-log the payment
      const paymentDate = `${testYear}-${String(testMonth).padStart(2, '0')}-${String(testDueDay).padStart(2, '0')}`;
      
      const payment = await autoPaymentLoggerService.createPaymentFromFixedExpense({
        linked_loan_id: testLoanId,
        amount: 500,
        name: 'Car Loan Payment'
      }, paymentDate);

      // Verify payment was created correctly
      expect(payment.loan_id).toBe(testLoanId);
      expect(payment.amount).toBe(500);
      expect(payment.payment_date).toBe(paymentDate);
      expect(payment.notes).toContain('Auto-logged from fixed expense');

      // Step 4: Verify reminder is suppressed after payment
      // _Requirements: 3.4_
      const remindersAfterPayment = await reminderService.getLoanPaymentReminders(referenceDate);
      
      // The linked expense should still exist but not appear in due soon payments
      expect(remindersAfterPayment.hasLinkedExpenses).toBe(true);
      expect(remindersAfterPayment.dueSoonCount).toBe(0);
      expect(remindersAfterPayment.dueSoonPayments.length).toBe(0);
      
      // Verify the reminder is in allReminders but marked as having payment
      const allReminder = remindersAfterPayment.allReminders.find(
        r => r.fixedExpenseId === testFixedExpenseId
      );
      expect(allReminder).toBeDefined();
      expect(allReminder.hasPaymentThisMonth).toBe(true);
    });

    /**
     * Integration Test: Reminders work correctly when due day is in the past
     * Note: The system calculates days until NEXT due date, so past due days
     * show as "due soon" for next month rather than "overdue"
     * _Requirements: 3.4_
     */
    it('should handle reminders when due day has passed in current month', async () => {
      // Create a linked fixed expense with due date
      const fixedExpense = await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Car Loan Payment',
        amount: 500,
        category: 'Other',
        payment_type: 'Debit',
        payment_due_day: testDueDay,
        linked_loan_id: testLoanId
      });
      testFixedExpenseId = fixedExpense.id;

      // Set reference date to June 20, 2024 (5 days AFTER due day 15)
      // The system will calculate days until July 15 (next due date)
      const referenceDate = new Date(2024, 5, 20); // June 20, 2024
      
      // Verify reminder appears (as due soon for next month, not overdue)
      const remindersBeforePayment = await reminderService.getLoanPaymentReminders(referenceDate);
      
      // The expense should be in allReminders
      expect(remindersBeforePayment.hasLinkedExpenses).toBe(true);
      const reminder = remindersBeforePayment.allReminders.find(
        r => r.fixedExpenseId === testFixedExpenseId
      );
      expect(reminder).toBeDefined();
      expect(reminder.hasPaymentThisMonth).toBe(false);

      // Log the payment
      const paymentDate = `${testYear}-${String(testMonth).padStart(2, '0')}-20`;
      
      await autoPaymentLoggerService.createPaymentFromFixedExpense({
        linked_loan_id: testLoanId,
        amount: 500,
        name: 'Car Loan Payment'
      }, paymentDate);

      // Verify reminder is suppressed (hasPaymentThisMonth = true)
      const remindersAfterPayment = await reminderService.getLoanPaymentReminders(referenceDate);
      
      const reminderAfter = remindersAfterPayment.allReminders.find(
        r => r.fixedExpenseId === testFixedExpenseId
      );
      expect(reminderAfter).toBeDefined();
      expect(reminderAfter.hasPaymentThisMonth).toBe(true);
    });

    /**
     * Integration Test: Multiple linked expenses with different payment states
     * _Requirements: 3.4_
     */
    it('should correctly handle multiple linked expenses with different payment states', async () => {
      // Create a second loan
      const loan2 = await loanRepository.create({
        name: 'Test Mortgage',
        initial_balance: 300000,
        start_date: '2024-01-01',
        loan_type: 'mortgage',
        notes: 'Test mortgage'
      });

      // Create two linked fixed expenses with due dates within the reminder window
      const expense1 = await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Car Loan Payment',
        amount: 500,
        category: 'Other',
        payment_type: 'Debit',
        payment_due_day: 12, // Due on 12th
        linked_loan_id: testLoanId
      });

      const expense2 = await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Mortgage Payment',
        amount: 2000,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: 15, // Due on 15th
        linked_loan_id: loan2.id
      });

      // Reference date: June 10, 2024
      // - Car loan (due 12th) is due soon (2 days)
      // - Mortgage (due 15th) is due soon (5 days)
      const referenceDate = new Date(2024, 5, 10);
      
      // Verify both reminders appear as due soon
      const remindersInitial = await reminderService.getLoanPaymentReminders(referenceDate);
      
      expect(remindersInitial.dueSoonCount).toBe(2);
      expect(remindersInitial.dueSoonPayments.length).toBe(2);

      // Log payment for car loan only
      await autoPaymentLoggerService.createPaymentFromFixedExpense({
        linked_loan_id: testLoanId,
        amount: 500,
        name: 'Car Loan Payment'
      }, '2024-06-10');

      // Verify only car loan reminder is suppressed
      const remindersAfterPartialPayment = await reminderService.getLoanPaymentReminders(referenceDate);
      
      expect(remindersAfterPartialPayment.dueSoonCount).toBe(1); // Only mortgage still due
      expect(remindersAfterPartialPayment.dueSoonPayments[0].loanId).toBe(loan2.id);

      // Log payment for mortgage
      await autoPaymentLoggerService.createPaymentFromFixedExpense({
        linked_loan_id: loan2.id,
        amount: 2000,
        name: 'Mortgage Payment'
      }, '2024-06-10');

      // Verify all reminders are suppressed
      const remindersAfterAllPayments = await reminderService.getLoanPaymentReminders(referenceDate);
      
      expect(remindersAfterAllPayments.dueSoonCount).toBe(0);
    });
  });

  describe('Auto-Log Suggestions Integration', () => {
    /**
     * Integration Test: Auto-log suggestions appear for eligible expenses
     * _Requirements: 4.1_
     */
    it('should return auto-log suggestions for eligible expenses', async () => {
      // Create a linked fixed expense with due date
      await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Car Loan Payment',
        amount: 500,
        category: 'Other',
        payment_type: 'Debit',
        payment_due_day: testDueDay,
        linked_loan_id: testLoanId
      });

      // Reference date: June 16, 2024 (after due day 15)
      const referenceDate = new Date(2024, 5, 16);
      
      const suggestions = await autoPaymentLoggerService.getPendingAutoLogSuggestions(
        testYear,
        testMonth,
        referenceDate
      );

      expect(suggestions.length).toBe(1);
      expect(suggestions[0].loanId).toBe(testLoanId);
      expect(suggestions[0].amount).toBe(500);
      expect(suggestions[0].suggestedPaymentDate).toBe('2024-06-15');
    });

    /**
     * Integration Test: Auto-log suggestions are not returned after payment
     * _Requirements: 4.1_
     */
    it('should not return auto-log suggestions after payment is logged', async () => {
      // Create a linked fixed expense
      await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Car Loan Payment',
        amount: 500,
        category: 'Other',
        payment_type: 'Debit',
        payment_due_day: testDueDay,
        linked_loan_id: testLoanId
      });

      // Reference date: June 16, 2024 (after due day 15)
      const referenceDate = new Date(2024, 5, 16);
      
      // Verify suggestion exists before payment
      const suggestionsBefore = await autoPaymentLoggerService.getPendingAutoLogSuggestions(
        testYear,
        testMonth,
        referenceDate
      );
      expect(suggestionsBefore.length).toBe(1);

      // Log the payment
      await loanPaymentRepository.create({
        loan_id: testLoanId,
        amount: 500,
        payment_date: '2024-06-15',
        notes: 'Manual payment'
      });

      // Verify suggestion is no longer returned
      const suggestionsAfter = await autoPaymentLoggerService.getPendingAutoLogSuggestions(
        testYear,
        testMonth,
        referenceDate
      );
      expect(suggestionsAfter.length).toBe(0);
    });

    /**
     * Integration Test: Auto-log from suggestion creates correct payment
     * _Requirements: 4.4_
     */
    it('should create correct payment when auto-logging from suggestion', async () => {
      // Create a linked fixed expense
      const fixedExpense = await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Car Loan Payment',
        amount: 500,
        category: 'Other',
        payment_type: 'Debit',
        payment_due_day: testDueDay,
        linked_loan_id: testLoanId
      });

      // Auto-log from suggestion
      const payment = await autoPaymentLoggerService.autoLogFromSuggestion(
        fixedExpense.id,
        testYear,
        testMonth
      );

      // Verify payment attributes
      expect(payment.loan_id).toBe(testLoanId);
      expect(payment.amount).toBe(500);
      expect(payment.payment_date).toBe('2024-06-15');
      expect(payment.notes).toContain('Auto-logged from fixed expense');
      expect(payment.notes).toContain('Car Loan Payment');

      // Verify payment exists in repository
      const payments = await loanPaymentRepository.findByLoan(testLoanId);
      expect(payments.length).toBe(1);
      expect(payments[0].id).toBe(payment.id);
    });
  });

  describe('Paid-Off Loan Handling', () => {
    /**
     * Integration Test: Reminders are not shown for paid-off loans
     */
    it('should not show reminders for linked expenses when loan is paid off', async () => {
      // Create a linked fixed expense
      await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Car Loan Payment',
        amount: 500,
        category: 'Other',
        payment_type: 'Debit',
        payment_due_day: testDueDay,
        linked_loan_id: testLoanId
      });

      // Reference date: June 10, 2024 (5 days before due day)
      const referenceDate = new Date(2024, 5, 10);
      
      // Verify reminder appears initially
      const remindersBeforePaidOff = await reminderService.getLoanPaymentReminders(referenceDate);
      expect(remindersBeforePaidOff.dueSoonCount).toBe(1);

      // Mark loan as paid off
      await loanRepository.markPaidOff(testLoanId, 1);

      // Verify reminder is no longer shown
      const remindersAfterPaidOff = await reminderService.getLoanPaymentReminders(referenceDate);
      expect(remindersAfterPaidOff.dueSoonCount).toBe(0);
      expect(remindersAfterPaidOff.overdueCount).toBe(0);
      
      // But the linked expense should still be in allReminders with isLoanPaidOff flag
      const allReminder = remindersAfterPaidOff.allReminders.find(
        r => r.loanId === testLoanId
      );
      expect(allReminder).toBeDefined();
      expect(allReminder.isLoanPaidOff).toBe(true);
    });

    /**
     * Integration Test: Auto-log suggestions are not returned for paid-off loans
     */
    it('should not return auto-log suggestions for paid-off loans', async () => {
      // Create a linked fixed expense
      await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Car Loan Payment',
        amount: 500,
        category: 'Other',
        payment_type: 'Debit',
        payment_due_day: testDueDay,
        linked_loan_id: testLoanId
      });

      // Reference date: June 16, 2024 (after due day)
      const referenceDate = new Date(2024, 5, 16);
      
      // Verify suggestion exists initially
      const suggestionsBefore = await autoPaymentLoggerService.getPendingAutoLogSuggestions(
        testYear,
        testMonth,
        referenceDate
      );
      expect(suggestionsBefore.length).toBe(1);

      // Mark loan as paid off
      await loanRepository.markPaidOff(testLoanId, 1);

      // Verify suggestion is no longer returned
      const suggestionsAfter = await autoPaymentLoggerService.getPendingAutoLogSuggestions(
        testYear,
        testMonth,
        referenceDate
      );
      expect(suggestionsAfter.length).toBe(0);
    });
  });

  describe('Fixed Expense with Loan Details Query', () => {
    /**
     * Integration Test: getFixedExpensesWithLoans returns correct loan details
     */
    it('should return fixed expenses with correct loan details', async () => {
      // Create a linked fixed expense
      await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Car Loan Payment',
        amount: 500,
        category: 'Other',
        payment_type: 'Debit',
        payment_due_day: testDueDay,
        linked_loan_id: testLoanId
      });

      // Create an unlinked fixed expense
      await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Rent',
        amount: 1500,
        category: 'Housing',
        payment_type: 'Debit',
        payment_due_day: 1,
        linked_loan_id: null
      });

      const expenses = await fixedExpenseRepository.getFixedExpensesWithLoans(testYear, testMonth);

      expect(expenses.length).toBe(2);

      // Find the linked expense
      const linkedExpense = expenses.find(e => e.name === 'Car Loan Payment');
      expect(linkedExpense).toBeDefined();
      expect(linkedExpense.linked_loan_id).toBe(testLoanId);
      expect(linkedExpense.loan_name).toBe('Test Car Loan');
      expect(linkedExpense.loan_type).toBe('loan');
      expect(linkedExpense.is_paid_off).toBe(0);

      // Find the unlinked expense
      const unlinkedExpense = expenses.find(e => e.name === 'Rent');
      expect(unlinkedExpense).toBeDefined();
      expect(unlinkedExpense.linked_loan_id).toBeNull();
      expect(unlinkedExpense.loan_name).toBeNull();
    });

    /**
     * Integration Test: Loan paid-off status is reflected in joined query
     */
    it('should reflect loan paid-off status in joined query', async () => {
      // Create a linked fixed expense
      await fixedExpenseRepository.createFixedExpense({
        year: testYear,
        month: testMonth,
        name: 'Car Loan Payment',
        amount: 500,
        category: 'Other',
        payment_type: 'Debit',
        payment_due_day: testDueDay,
        linked_loan_id: testLoanId
      });

      // Verify initial state
      const expensesBefore = await fixedExpenseRepository.getFixedExpensesWithLoans(testYear, testMonth);
      expect(expensesBefore[0].is_paid_off).toBe(0);

      // Mark loan as paid off
      await loanRepository.markPaidOff(testLoanId, 1);

      // Verify paid-off status is reflected
      const expensesAfter = await fixedExpenseRepository.getFixedExpensesWithLoans(testYear, testMonth);
      expect(expensesAfter[0].is_paid_off).toBe(1);
      expect(expensesAfter[0].linked_loan_id).toBe(testLoanId); // Linkage preserved
    });
  });
});

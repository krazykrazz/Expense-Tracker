/**
 * Auto Payment Logger Service
 * 
 * Handles automatic logging of loan payments from linked fixed expenses.
 * When a fixed expense is linked to a loan and has a due date, this service
 * can automatically create loan payment entries.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.6
 */

const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const loanRepository = require('../repositories/loanRepository');
const logger = require('../config/logger');

/**
 * Note prefix for auto-logged payments
 */
const AUTO_LOG_NOTE_PREFIX = 'Auto-logged from fixed expense';

class AutoPaymentLoggerService {
  /**
   * Create a loan payment entry from a linked fixed expense
   * @param {Object} fixedExpense - Fixed expense object with linked_loan_id and amount
   * @param {string} paymentDate - Payment date in YYYY-MM-DD format
   * @returns {Promise<Object>} Created loan payment entry
   * _Requirements: 4.2, 4.3, 4.4, 4.6_
   */
  async createPaymentFromFixedExpense(fixedExpense, paymentDate) {
    // Validate fixed expense has required fields
    if (!fixedExpense) {
      throw new Error('Fixed expense is required');
    }
    
    if (!fixedExpense.linked_loan_id) {
      throw new Error('Fixed expense must be linked to a loan');
    }
    
    if (fixedExpense.amount === undefined || fixedExpense.amount === null) {
      throw new Error('Fixed expense must have an amount');
    }
    
    if (!paymentDate) {
      throw new Error('Payment date is required');
    }
    
    // Validate payment date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(paymentDate)) {
      throw new Error('Payment date must be in YYYY-MM-DD format');
    }
    
    // Verify the loan exists
    const loan = await loanRepository.findById(fixedExpense.linked_loan_id);
    if (!loan) {
      throw new Error('Linked loan not found');
    }
    
    // Create the note indicating auto-logged source
    // _Requirements: 4.6_
    const fixedExpenseName = fixedExpense.name || fixedExpense.fixed_expense_name || 'Unknown';
    const note = `${AUTO_LOG_NOTE_PREFIX}: ${fixedExpenseName}`;
    
    // Create the loan payment entry
    // _Requirements: 4.2, 4.3, 4.4_
    const payment = await loanPaymentRepository.create({
      loan_id: fixedExpense.linked_loan_id,
      amount: fixedExpense.amount,
      payment_date: paymentDate,
      notes: note
    });
    
    logger.info('Auto-logged loan payment from fixed expense:', {
      paymentId: payment.id,
      loanId: fixedExpense.linked_loan_id,
      amount: fixedExpense.amount,
      paymentDate: paymentDate,
      fixedExpenseName: fixedExpenseName
    });
    
    return payment;
  }

  /**
   * Get pending auto-log suggestions for a specific month
   * Returns linked fixed expenses that are eligible for auto-logging:
   * - Have a linked_loan_id
   * - Have a payment_due_day
   * - Due day has passed (or is today)
   * - No loan payment exists for the current month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {Date} [referenceDate] - Reference date (defaults to today)
   * @returns {Promise<Array>} Array of eligible fixed expenses for auto-logging
   * _Requirements: 4.1_
   */
  async getPendingAutoLogSuggestions(year, month, referenceDate = new Date()) {
    // Validate inputs
    if (!year || !month || month < 1 || month > 12) {
      throw new Error('Invalid year or month');
    }
    
    const today = new Date(referenceDate);
    today.setHours(0, 0, 0, 0);
    const currentDayOfMonth = today.getDate();
    
    // Get linked fixed expenses with due dates for the specified month
    const linkedExpenses = await fixedExpenseRepository.getLinkedFixedExpensesForMonth(year, month);
    
    if (linkedExpenses.length === 0) {
      return [];
    }
    
    // Get loan IDs to check for existing payments
    const loanIds = [...new Set(linkedExpenses.map(e => e.loan_id))];
    
    // Check which loans have payments this month
    const paymentStatusMap = await loanPaymentRepository.getPaymentStatusForMonth(
      loanIds,
      year,
      month
    );
    
    // Filter to expenses eligible for auto-logging
    // _Requirements: 4.1_
    const eligibleExpenses = linkedExpenses.filter(expense => {
      // Skip if loan is paid off
      if (expense.is_paid_off === 1) {
        return false;
      }
      
      // Skip if payment already exists for this month
      if (paymentStatusMap.get(expense.loan_id)) {
        return false;
      }
      
      // Only include if due day has passed or is today
      // _Requirements: 4.1_
      if (expense.payment_due_day > currentDayOfMonth) {
        return false;
      }
      
      return true;
    });
    
    // Build suggestion objects with payment date
    return eligibleExpenses.map(expense => {
      // Calculate the payment date (year-month-due_day)
      // _Requirements: 4.3_
      const monthStr = String(month).padStart(2, '0');
      const dayStr = String(expense.payment_due_day).padStart(2, '0');
      const paymentDate = `${year}-${monthStr}-${dayStr}`;
      
      return {
        fixedExpenseId: expense.fixed_expense_id,
        fixedExpenseName: expense.fixed_expense_name,
        amount: expense.amount,
        paymentDueDay: expense.payment_due_day,
        loanId: expense.loan_id,
        loanName: expense.loan_name,
        loanType: expense.loan_type,
        suggestedPaymentDate: paymentDate
      };
    });
  }

  /**
   * Auto-log a payment from a suggestion
   * Convenience method that combines getting the fixed expense and creating the payment
   * @param {number} fixedExpenseId - Fixed expense ID
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} Created loan payment entry
   */
  async autoLogFromSuggestion(fixedExpenseId, year, month) {
    // Get the linked fixed expenses for the month
    const linkedExpenses = await fixedExpenseRepository.getLinkedFixedExpensesForMonth(year, month);
    
    // Find the specific expense
    const expense = linkedExpenses.find(e => e.fixed_expense_id === fixedExpenseId);
    
    if (!expense) {
      throw new Error('Fixed expense not found or not linked to a loan');
    }
    
    if (expense.is_paid_off === 1) {
      throw new Error('Cannot auto-log payment for a paid-off loan');
    }
    
    // Check if payment already exists
    const hasPayment = await loanPaymentRepository.hasPaymentForMonth(
      expense.loan_id,
      year,
      month
    );
    
    if (hasPayment) {
      throw new Error('A payment already exists for this loan this month');
    }
    
    // Calculate the payment date
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(expense.payment_due_day).padStart(2, '0');
    const paymentDate = `${year}-${monthStr}-${dayStr}`;
    
    // Create the payment
    return await this.createPaymentFromFixedExpense({
      linked_loan_id: expense.loan_id,
      amount: expense.amount,
      name: expense.fixed_expense_name
    }, paymentDate);
  }
}

module.exports = new AutoPaymentLoggerService();

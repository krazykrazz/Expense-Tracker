/**
 * Loan Payment Service
 * 
 * Handles business logic for loan payment tracking.
 * Validates payment data and coordinates with the repository layer.
 * 
 * Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 5.1
 */

const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const loanRepository = require('../repositories/loanRepository');

class LoanPaymentService {
  /**
   * Validate payment data
   * @param {Object} paymentData - Payment data to validate
   * @throws {Error} If validation fails
   */
  validatePayment(paymentData) {
    // Validate amount - must be a positive number (Requirement 1.5)
    if (paymentData.amount === undefined || paymentData.amount === null) {
      throw new Error('Payment amount is required');
    }
    
    if (typeof paymentData.amount !== 'number' || isNaN(paymentData.amount)) {
      throw new Error('Payment amount must be a valid number');
    }
    
    if (paymentData.amount <= 0) {
      throw new Error('Payment amount must be a positive number');
    }
    
    // Validate payment_date - must be in YYYY-MM-DD format and not in the future (Requirement 1.6)
    if (!paymentData.payment_date) {
      throw new Error('Payment date is required');
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(paymentData.payment_date)) {
      throw new Error('Payment date must be in YYYY-MM-DD format');
    }
    
    // Validate that the date is a valid date
    const date = new Date(paymentData.payment_date + 'T00:00:00');
    if (isNaN(date.getTime())) {
      throw new Error('Payment date must be in YYYY-MM-DD format');
    }
    
    // Validate that the date is not in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paymentDate = new Date(paymentData.payment_date + 'T00:00:00');
    
    if (paymentDate > today) {
      throw new Error('Payment date cannot be in the future');
    }
  }

  /**
   * Verify loan exists and is eligible for payment tracking
   * Payment tracking is only available for loans and mortgages, not lines of credit (Requirement 5.1)
   * @param {number} loanId - Loan ID
   * @returns {Promise<Object>} The loan object
   * @throws {Error} If loan not found or is a line of credit
   */
  async verifyLoanEligibility(loanId) {
    const loan = await loanRepository.findById(loanId);
    
    if (!loan) {
      throw new Error('Loan not found');
    }
    
    if (loan.loan_type === 'line_of_credit') {
      throw new Error('Payment tracking is only available for loans and mortgages');
    }
    
    return loan;
  }

  /**
   * Create a new payment entry (Requirement 1.1)
   * @param {number} loanId - Loan ID
   * @param {Object} paymentData - { amount, payment_date, notes }
   * @returns {Promise<Object>} Created payment entry
   */
  async createPayment(loanId, paymentData) {
    // Verify loan exists and is eligible
    await this.verifyLoanEligibility(loanId);
    
    // Validate payment data
    this.validatePayment(paymentData);
    
    // Create the payment
    return await loanPaymentRepository.create({
      loan_id: loanId,
      amount: paymentData.amount,
      payment_date: paymentData.payment_date,
      notes: paymentData.notes || null
    });
  }

  /**
   * Get all payments for a loan in reverse chronological order (Requirement 1.2)
   * @param {number} loanId - Loan ID
   * @returns {Promise<Array>} Array of payment entries
   */
  async getPayments(loanId) {
    // Verify loan exists and is eligible
    await this.verifyLoanEligibility(loanId);
    
    // Get payments ordered by payment_date DESC
    return await loanPaymentRepository.findByLoanOrdered(loanId);
  }

  /**
   * Update a payment entry (Requirement 1.3)
   * @param {number} paymentId - Payment ID
   * @param {Object} paymentData - Updated payment data { amount, payment_date, notes }
   * @returns {Promise<Object|null>} Updated payment or null if not found
   */
  async updatePayment(paymentId, paymentData) {
    // First, verify the payment exists
    const existingPayment = await loanPaymentRepository.findById(paymentId);
    
    if (!existingPayment) {
      return null;
    }
    
    // Verify the loan is eligible for payment tracking
    await this.verifyLoanEligibility(existingPayment.loan_id);
    
    // Validate the updated payment data
    this.validatePayment(paymentData);
    
    // Update the payment
    return await loanPaymentRepository.update(paymentId, {
      amount: paymentData.amount,
      payment_date: paymentData.payment_date,
      notes: paymentData.notes || null
    });
  }

  /**
   * Delete a payment entry (Requirement 1.4)
   * @param {number} paymentId - Payment ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deletePayment(paymentId) {
    // First, verify the payment exists
    const existingPayment = await loanPaymentRepository.findById(paymentId);
    
    if (!existingPayment) {
      return false;
    }
    
    // Verify the loan is eligible for payment tracking
    await this.verifyLoanEligibility(existingPayment.loan_id);
    
    // Delete the payment
    return await loanPaymentRepository.delete(paymentId);
  }

  /**
   * Get a single payment by ID
   * @param {number} paymentId - Payment ID
   * @returns {Promise<Object|null>} Payment entry or null if not found
   */
  async getPaymentById(paymentId) {
    return await loanPaymentRepository.findById(paymentId);
  }
}

module.exports = new LoanPaymentService();

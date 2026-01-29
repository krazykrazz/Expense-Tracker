const mortgagePaymentRepository = require('../repositories/mortgagePaymentRepository');
const loanRepository = require('../repositories/loanRepository');
const logger = require('../config/logger');

/**
 * Service for managing mortgage payment tracking
 * Handles validation and business logic for payment entries
 */
class MortgagePaymentService {
  /**
   * Validate payment data
   * @param {Object} data - Payment data to validate
   * @param {number} data.paymentAmount - Payment amount
   * @param {string} data.effectiveDate - Effective date (YYYY-MM-DD)
   * @throws {Error} If validation fails
   */
  validatePaymentData(data) {
    const errors = [];

    // Validate payment amount - must be positive
    if (data.paymentAmount === undefined || data.paymentAmount === null) {
      errors.push('Payment amount is required');
    } else if (typeof data.paymentAmount !== 'number' || isNaN(data.paymentAmount)) {
      errors.push('Payment amount must be a number');
    } else if (data.paymentAmount <= 0) {
      errors.push('Payment amount must be a positive number');
    }

    // Validate effective date format
    if (!data.effectiveDate) {
      errors.push('Effective date is required');
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(data.effectiveDate)) {
        errors.push('Effective date must be in YYYY-MM-DD format');
      } else {
        const date = new Date(data.effectiveDate);
        if (isNaN(date.getTime())) {
          errors.push('Effective date must be a valid date');
        } else {
          // Check if the date string matches what we get back from the Date object
          // This catches invalid dates like 2025-02-30 that get auto-corrected
          const dateString = date.toISOString().split('T')[0];
          if (dateString !== data.effectiveDate) {
            errors.push('Effective date must be a valid date');
          }
          
          // Check if date is not in the future
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (date > today) {
            errors.push('Effective date cannot be in the future');
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }

  /**
   * Set or create a payment amount entry for a mortgage
   * Creates a new payment history entry preserving previous values
   * @param {number} mortgageId - Mortgage loan ID
   * @param {number} paymentAmount - Payment amount
   * @param {string} effectiveDate - Date payment amount takes effect (YYYY-MM-DD)
   * @param {string} [notes] - Optional notes
   * @returns {Promise<Object>} Created payment entry
   */
  async setPaymentAmount(mortgageId, paymentAmount, effectiveDate, notes = null) {
    // Validate mortgage ID
    if (!mortgageId) {
      throw new Error('Mortgage ID is required');
    }

    // Verify the mortgage exists and is a mortgage type
    const loan = await loanRepository.findById(mortgageId);
    if (!loan) {
      throw new Error('Mortgage not found');
    }
    if (loan.loan_type !== 'mortgage') {
      throw new Error('Payment tracking is only available for mortgages');
    }

    // Validate payment data
    this.validatePaymentData({ paymentAmount, effectiveDate });

    // Create the payment entry
    const paymentEntry = {
      loan_id: mortgageId,
      payment_amount: paymentAmount,
      effective_date: effectiveDate,
      notes: notes ? notes.trim() : null
    };

    const created = await mortgagePaymentRepository.create(paymentEntry);
    
    logger.info('Created mortgage payment entry:', {
      mortgageId,
      paymentAmount,
      effectiveDate
    });

    return created;
  }

  /**
   * Get the current (most recent) payment amount for a mortgage
   * @param {number} mortgageId - Mortgage loan ID
   * @returns {Promise<Object|null>} Current payment entry or null if none exists
   */
  async getCurrentPayment(mortgageId) {
    // Validate mortgage ID
    if (!mortgageId) {
      throw new Error('Mortgage ID is required');
    }

    const currentPayment = await mortgagePaymentRepository.findCurrentByMortgage(mortgageId);
    return currentPayment;
  }

  /**
   * Get payment history for a mortgage
   * Returns all payment entries in chronological order (oldest first)
   * @param {number} mortgageId - Mortgage loan ID
   * @returns {Promise<Array>} Array of payment entries in chronological order
   */
  async getPaymentHistory(mortgageId) {
    // Validate mortgage ID
    if (!mortgageId) {
      throw new Error('Mortgage ID is required');
    }

    const history = await mortgagePaymentRepository.findByMortgage(mortgageId);
    return history;
  }

  /**
   * Update an existing payment entry
   * @param {number} paymentId - Payment entry ID
   * @param {number} paymentAmount - Updated payment amount
   * @param {string} effectiveDate - Updated effective date (YYYY-MM-DD)
   * @param {string} [notes] - Optional notes
   * @returns {Promise<Object|null>} Updated payment entry or null if not found
   */
  async updatePayment(paymentId, paymentAmount, effectiveDate, notes = null) {
    // Validate payment ID
    if (!paymentId) {
      throw new Error('Payment ID is required');
    }

    // Validate payment data
    this.validatePaymentData({ paymentAmount, effectiveDate });

    const paymentEntry = {
      payment_amount: paymentAmount,
      effective_date: effectiveDate,
      notes: notes ? notes.trim() : null
    };

    const updated = await mortgagePaymentRepository.update(paymentId, paymentEntry);
    
    if (updated) {
      logger.info('Updated mortgage payment entry:', { paymentId, paymentAmount, effectiveDate });
    } else {
      logger.warn('Payment entry not found for update:', { paymentId });
    }

    return updated;
  }

  /**
   * Delete a payment entry
   * @param {number} paymentId - Payment entry ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deletePayment(paymentId) {
    // Validate payment ID
    if (!paymentId) {
      throw new Error('Payment ID is required');
    }

    const deleted = await mortgagePaymentRepository.delete(paymentId);
    
    if (deleted) {
      logger.info('Deleted mortgage payment entry:', { paymentId });
    } else {
      logger.warn('Payment entry not found for deletion:', { paymentId });
    }

    return deleted;
  }

  /**
   * Get a payment entry by ID
   * @param {number} paymentId - Payment entry ID
   * @returns {Promise<Object|null>} Payment entry or null if not found
   */
  async getPaymentById(paymentId) {
    // Validate payment ID
    if (!paymentId) {
      throw new Error('Payment ID is required');
    }

    return await mortgagePaymentRepository.findById(paymentId);
  }
}

module.exports = new MortgagePaymentService();

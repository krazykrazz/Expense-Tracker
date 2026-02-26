const creditCardPaymentRepository = require('../repositories/creditCardPaymentRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const activityLogService = require('./activityLogService');
const { runInTransaction } = require('../utils/dbHelper');
const logger = require('../config/logger');

/**
 * Service for managing credit card payments
 * Handles validation, business logic, and orchestration for credit card payment operations
 */
class CreditCardPaymentService {
  /**
   * Validate payment data
   * @param {Object} data - Payment data to validate
   * @returns {Object} Validation result { isValid, errors }
   */
  validatePayment(data) {
    const errors = [];

    // Validate payment_method_id
    if (!data.payment_method_id) {
      errors.push('Payment method ID is required');
    } else if (!Number.isInteger(data.payment_method_id) || data.payment_method_id <= 0) {
      errors.push('Payment method ID must be a positive integer');
    }

    // Validate amount (must be positive)
    if (data.amount === undefined || data.amount === null) {
      errors.push('Payment amount is required');
    } else if (typeof data.amount !== 'number' || data.amount <= 0) {
      errors.push('Payment amount must be greater than zero');
    }

    // Validate payment_date
    if (!data.payment_date) {
      errors.push('Payment date is required');
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(data.payment_date)) {
        errors.push('Payment date must be in YYYY-MM-DD format');
      } else {
        const date = new Date(data.payment_date);
        if (isNaN(date.getTime())) {
          errors.push('Payment date must be a valid date');
        } else {
          // Check if the date string matches what we get back from the Date object
          const dateString = date.toISOString().split('T')[0];
          if (dateString !== data.payment_date) {
            errors.push('Payment date must be a valid date');
          }
        }
      }
    }

    // Validate notes length if provided
    if (data.notes && data.notes.length > 500) {
      errors.push('Notes must not exceed 500 characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Record a payment and update the credit card balance
   * @param {Object} data - Payment data { payment_method_id, amount, payment_date, notes }
   * @returns {Promise<Object>} Created payment record
   */
  async recordPayment(data) {
    // Validate input
    const validation = this.validatePayment(data);
    if (!validation.isValid) {
      throw new Error(validation.errors.join('; '));
    }

    // Verify payment method exists and is a credit card
    const paymentMethod = await paymentMethodRepository.findById(data.payment_method_id);
    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    if (paymentMethod.type !== 'credit_card') {
      throw new Error('Payments can only be recorded for credit card payment methods');
    }

    // Create payment record and update balance atomically (BUG-004 fix)
    const payment = await runInTransaction(async (tx) => {
      const insertResult = await tx.run(
        `INSERT INTO credit_card_payments (payment_method_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)`,
        [data.payment_method_id, data.amount, data.payment_date, data.notes ? data.notes.trim() : null]
      );

      const row = await tx.get('SELECT * FROM payment_methods WHERE id = ?', [data.payment_method_id]);
      const newBalance = Math.max(0, (row.current_balance || 0) - data.amount);
      await tx.run(
        'UPDATE payment_methods SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newBalance, data.payment_method_id]
      );

      return {
        id: insertResult.lastID,
        payment_method_id: data.payment_method_id,
        amount: data.amount,
        payment_date: data.payment_date,
        notes: data.notes ? data.notes.trim() : null
      };
    });

    logger.info('Recorded credit card payment:', {
      paymentId: payment.id,
      paymentMethodId: data.payment_method_id,
      amount: data.amount,
      date: data.payment_date
    });

    // Log activity event (fire-and-forget)
    await activityLogService.logEvent(
      'credit_card_payment_added',
      'credit_card_payment',
      payment.id,
      `Added credit card payment of $${data.amount.toFixed(2)} to ${paymentMethod.display_name}`,
      {
        paymentMethodId: data.payment_method_id,
        amount: data.amount,
        payment_date: data.payment_date,
        cardName: paymentMethod.display_name
      }
    );

    return payment;
  }

  /**
   * Get payment history for a credit card
   * Returns payments in reverse chronological order (most recent first)
   * @param {number} paymentMethodId - Payment method ID
   * @returns {Promise<Array>} Array of payment records
   */
  async getPaymentHistory(paymentMethodId) {
    if (!paymentMethodId) {
      throw new Error('Payment method ID is required');
    }

    // Verify payment method exists and is a credit card
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    if (paymentMethod.type !== 'credit_card') {
      throw new Error('Payment history is only available for credit card payment methods');
    }

    const payments = await creditCardPaymentRepository.findByPaymentMethodId(paymentMethodId);

    logger.debug('Retrieved payment history:', {
      paymentMethodId,
      count: payments.length
    });

    return payments;
  }

  /**
   * Get total payments in a date range
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<number>} Total payment amount
   */
  async getTotalPaymentsInRange(paymentMethodId, startDate, endDate) {
    if (!paymentMethodId) {
      throw new Error('Payment method ID is required');
    }

    if (!startDate || !endDate) {
      throw new Error('Start date and end date are required');
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      throw new Error('Dates must be in YYYY-MM-DD format');
    }

    // Verify payment method exists
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    const total = await creditCardPaymentRepository.getTotalPayments(paymentMethodId, startDate, endDate);

    logger.debug('Calculated total payments in range:', {
      paymentMethodId,
      startDate,
      endDate,
      total
    });

    return total;
  }

  /**
   * Get payments within a date range
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of payment records
   */
  async getPaymentsInRange(paymentMethodId, startDate, endDate) {
    if (!paymentMethodId) {
      throw new Error('Payment method ID is required');
    }

    if (!startDate || !endDate) {
      throw new Error('Start date and end date are required');
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      throw new Error('Dates must be in YYYY-MM-DD format');
    }

    // Verify payment method exists
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    return creditCardPaymentRepository.findByDateRange(paymentMethodId, startDate, endDate);
  }

  /**
   * Delete a payment record
   * Note: This does NOT reverse the balance change
   * @param {number} paymentId - Payment ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deletePayment(paymentId) {
    if (!paymentId) {
      throw new Error('Payment ID is required');
    }

    // Get payment to find the amount and payment method
    const payment = await creditCardPaymentRepository.findById(paymentId);
    if (!payment) {
      return false;
    }

    // Delete payment and reverse balance atomically (BUG-004 fix)
    const deleted = await runInTransaction(async (tx) => {
      const result = await tx.run('DELETE FROM credit_card_payments WHERE id = ?', [paymentId]);
      if (result.changes === 0) return false;

      const row = await tx.get('SELECT * FROM payment_methods WHERE id = ?', [payment.payment_method_id]);
      const newBalance = Math.max(0, (row.current_balance || 0) + payment.amount);
      await tx.run(
        'UPDATE payment_methods SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newBalance, payment.payment_method_id]
      );
      return true;
    });

    if (deleted) {
      // Look up card name for activity log
      const paymentMethod = await paymentMethodRepository.findById(payment.payment_method_id);
      const cardName = paymentMethod ? paymentMethod.display_name : 'Unknown';

      logger.info('Deleted credit card payment:', {
        paymentId,
        paymentMethodId: payment.payment_method_id,
        amount: payment.amount
      });

      // Log activity event (fire-and-forget)
      await activityLogService.logEvent(
        'credit_card_payment_deleted',
        'credit_card_payment',
        paymentId,
        `Deleted credit card payment of $${payment.amount.toFixed(2)} from ${cardName}`,
        {
          paymentMethodId: payment.payment_method_id,
          amount: payment.amount,
          payment_date: payment.payment_date,
          cardName
        }
      );
    }

    return deleted;
  }

  /**
   * Get a payment by ID
   * @param {number} paymentId - Payment ID
   * @returns {Promise<Object|null>} Payment record or null if not found
   */
  async getPaymentById(paymentId) {
    if (!paymentId) {
      throw new Error('Payment ID is required');
    }

    return creditCardPaymentRepository.findById(paymentId);
  }
}

module.exports = new CreditCardPaymentService();

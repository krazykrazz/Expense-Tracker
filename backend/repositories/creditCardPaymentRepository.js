const { getDatabase } = require('../database/db');
const logger = require('../config/logger');

/**
 * Repository for managing credit card payments in the database
 * Handles CRUD operations for the credit_card_payments table
 */
class CreditCardPaymentRepository {
  /**
   * Create a new credit card payment record
   * @param {Object} payment - Payment data
   * @returns {Promise<Object>} Created payment with ID
   */
  async create(payment) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO credit_card_payments (
          payment_method_id, amount, payment_date, notes
        ) VALUES (?, ?, ?, ?)
      `;
      
      const params = [
        payment.payment_method_id,
        payment.amount,
        payment.payment_date,
        payment.notes || null
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to create credit card payment:', err);
          reject(err);
          return;
        }
        
        logger.debug('Created credit card payment:', { 
          id: this.lastID, 
          paymentMethodId: payment.payment_method_id,
          amount: payment.amount 
        });
        
        resolve({
          id: this.lastID,
          payment_method_id: payment.payment_method_id,
          amount: payment.amount,
          payment_date: payment.payment_date,
          notes: payment.notes || null
        });
      });
    });
  }

  /**
   * Find all payments for a specific payment method
   * Returns payments in reverse chronological order (most recent first)
   * @param {number} paymentMethodId - Payment method ID
   * @returns {Promise<Array>} Array of payment records
   */
  async findByPaymentMethodId(paymentMethodId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM credit_card_payments 
        WHERE payment_method_id = ?
        ORDER BY payment_date DESC, created_at DESC
      `;
      
      db.all(sql, [paymentMethodId], (err, rows) => {
        if (err) {
          logger.error('Failed to find payments by payment method ID:', err);
          reject(err);
          return;
        }
        
        logger.debug('Found credit card payments:', { 
          paymentMethodId, 
          count: rows ? rows.length : 0 
        });
        resolve(rows || []);
      });
    });
  }

  /**
   * Find payments within a date range for a specific payment method
   * Returns payments in reverse chronological order
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of payment records
   */
  async findByDateRange(paymentMethodId, startDate, endDate) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM credit_card_payments 
        WHERE payment_method_id = ?
          AND payment_date >= ?
          AND payment_date <= ?
        ORDER BY payment_date DESC, created_at DESC
      `;
      
      db.all(sql, [paymentMethodId, startDate, endDate], (err, rows) => {
        if (err) {
          logger.error('Failed to find payments by date range:', err);
          reject(err);
          return;
        }
        
        logger.debug('Found credit card payments in date range:', { 
          paymentMethodId, 
          startDate, 
          endDate, 
          count: rows ? rows.length : 0 
        });
        resolve(rows || []);
      });
    });
  }

  /**
   * Find a payment by ID
   * @param {number} id - Payment ID
   * @returns {Promise<Object|null>} Payment record or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM credit_card_payments WHERE id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          logger.error('Failed to find payment by ID:', err);
          reject(err);
          return;
        }
        
        resolve(row || null);
      });
    });
  }

  /**
   * Delete a payment record
   * @param {number} id - Payment ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM credit_card_payments WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          logger.error('Failed to delete credit card payment:', err);
          reject(err);
          return;
        }
        
        const deleted = this.changes > 0;
        logger.debug('Delete credit card payment:', { id, deleted });
        resolve(deleted);
      });
    });
  }

  /**
   * Get total payments for a payment method within a date range
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<number>} Total payment amount
   */
  async getTotalPayments(paymentMethodId, startDate, endDate) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT COALESCE(SUM(amount), 0) as total
        FROM credit_card_payments 
        WHERE payment_method_id = ?
          AND payment_date >= ?
          AND payment_date <= ?
      `;
      
      db.get(sql, [paymentMethodId, startDate, endDate], (err, row) => {
        if (err) {
          logger.error('Failed to get total payments:', err);
          reject(err);
          return;
        }
        
        const total = row ? row.total : 0;
        logger.debug('Total payments in date range:', { 
          paymentMethodId, 
          startDate, 
          endDate, 
          total 
        });
        resolve(total);
      });
    });
  }

  /**
   * Get all payments for a payment method (alias for findByPaymentMethodId)
   * @param {number} paymentMethodId - Payment method ID
   * @returns {Promise<Array>} Array of payment records
   */
  async getPaymentHistory(paymentMethodId) {
    return this.findByPaymentMethodId(paymentMethodId);
  }
}

module.exports = new CreditCardPaymentRepository();

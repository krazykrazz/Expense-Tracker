const { getDatabase } = require('../database/db');
const logger = require('../config/logger');

/**
 * Repository for managing payment methods in the database
 * Handles CRUD operations for the payment_methods table
 * Supports type-specific payment methods: cash, cheque, debit, credit_card
 */
class PaymentMethodRepository {
  /**
   * Create a new payment method
   * @param {Object} paymentMethod - Payment method data
   * @returns {Promise<Object>} Created payment method with ID
   */
  async create(paymentMethod) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO payment_methods (
          type, display_name, full_name, account_details,
          credit_limit, current_balance, payment_due_day,
          billing_cycle_day, billing_cycle_start, billing_cycle_end, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        paymentMethod.type,
        paymentMethod.display_name,
        paymentMethod.full_name || null,
        paymentMethod.account_details || null,
        paymentMethod.credit_limit || null,
        paymentMethod.current_balance || 0,
        paymentMethod.payment_due_day || null,
        paymentMethod.billing_cycle_day || null,
        paymentMethod.billing_cycle_start || null,
        paymentMethod.billing_cycle_end || null,
        paymentMethod.is_active !== undefined ? paymentMethod.is_active : 1
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to create payment method:', err);
          reject(err);
          return;
        }
        
        logger.debug('Created payment method:', { id: this.lastID, displayName: paymentMethod.display_name });
        
        resolve({
          id: this.lastID,
          type: paymentMethod.type,
          display_name: paymentMethod.display_name,
          full_name: paymentMethod.full_name || null,
          account_details: paymentMethod.account_details || null,
          credit_limit: paymentMethod.credit_limit || null,
          current_balance: paymentMethod.current_balance || 0,
          payment_due_day: paymentMethod.payment_due_day || null,
          billing_cycle_day: paymentMethod.billing_cycle_day || null,
          billing_cycle_start: paymentMethod.billing_cycle_start || null,
          billing_cycle_end: paymentMethod.billing_cycle_end || null,
          is_active: paymentMethod.is_active !== undefined ? paymentMethod.is_active : 1
        });
      });
    });
  }

  /**
   * Find all payment methods with optional filtering
   * @param {Object} options - Filter options { type, activeOnly }
   * @returns {Promise<Array>} Array of payment methods
   */
  async findAll(options = {}) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM payment_methods';
      const params = [];
      const conditions = [];
      
      if (options.type) {
        conditions.push('type = ?');
        params.push(options.type);
      }
      
      if (options.activeOnly) {
        conditions.push('is_active = 1');
      }
      
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      
      sql += ' ORDER BY type, display_name';
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('Failed to find payment methods:', err);
          reject(err);
          return;
        }
        
        logger.debug('Found payment methods:', { count: rows ? rows.length : 0 });
        resolve(rows || []);
      });
    });
  }

  /**
   * Find a payment method by ID
   * @param {number} id - Payment method ID
   * @returns {Promise<Object|null>} Payment method or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM payment_methods WHERE id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          logger.error('Failed to find payment method by ID:', err);
          reject(err);
          return;
        }
        
        resolve(row || null);
      });
    });
  }

  /**
   * Find a payment method by display name
   * @param {string} displayName - Display name to search for
   * @returns {Promise<Object|null>} Payment method or null if not found
   */
  async findByDisplayName(displayName) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM payment_methods WHERE display_name = ?';
      
      db.get(sql, [displayName], (err, row) => {
        if (err) {
          logger.error('Failed to find payment method by display name:', err);
          reject(err);
          return;
        }
        
        resolve(row || null);
      });
    });
  }

  /**
   * Update a payment method
   * @param {number} id - Payment method ID
   * @param {Object} data - Updated payment method data
   * @returns {Promise<Object|null>} Updated payment method or null if not found
   */
  async update(id, data) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE payment_methods 
        SET type = ?, display_name = ?, full_name = ?, account_details = ?,
            credit_limit = ?, current_balance = ?, payment_due_day = ?,
            billing_cycle_day = ?, billing_cycle_start = ?, billing_cycle_end = ?, is_active = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        data.type,
        data.display_name,
        data.full_name || null,
        data.account_details || null,
        data.credit_limit || null,
        data.current_balance !== undefined ? data.current_balance : 0,
        data.payment_due_day || null,
        data.billing_cycle_day || null,
        data.billing_cycle_start || null,
        data.billing_cycle_end || null,
        data.is_active !== undefined ? data.is_active : 1,
        id
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to update payment method:', err);
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null);
          return;
        }
        
        logger.debug('Updated payment method:', { id, changes: this.changes });
        
        resolve({
          id,
          type: data.type,
          display_name: data.display_name,
          full_name: data.full_name || null,
          account_details: data.account_details || null,
          credit_limit: data.credit_limit || null,
          current_balance: data.current_balance !== undefined ? data.current_balance : 0,
          payment_due_day: data.payment_due_day || null,
          billing_cycle_day: data.billing_cycle_day || null,
          billing_cycle_start: data.billing_cycle_start || null,
          billing_cycle_end: data.billing_cycle_end || null,
          is_active: data.is_active !== undefined ? data.is_active : 1
        });
      });
    });
  }

  /**
   * Delete a payment method (only if no associated expenses)
   * @param {number} id - Payment method ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM payment_methods WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          logger.error('Failed to delete payment method:', err);
          reject(err);
          return;
        }
        
        const deleted = this.changes > 0;
        logger.debug('Delete payment method:', { id, deleted });
        resolve(deleted);
      });
    });
  }

  /**
   * Set active/inactive status for a payment method
   * @param {number} id - Payment method ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<Object|null>} Updated payment method or null if not found
   */
  async setActive(id, isActive) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE payment_methods 
        SET is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      db.run(sql, [isActive ? 1 : 0, id], function(err) {
        if (err) {
          logger.error('Failed to set payment method active status:', err);
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null);
          return;
        }
        
        logger.debug('Set payment method active status:', { id, isActive });
        
        // Fetch and return the updated payment method
        db.get('SELECT * FROM payment_methods WHERE id = ?', [id], (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        });
      });
    });
  }

  /**
   * Count expenses associated with a payment method (all-time)
   * @param {number} id - Payment method ID
   * @returns {Promise<number>} Count of associated expenses
   */
  async countAssociatedExpenses(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM expenses WHERE payment_method_id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          logger.error('Failed to count associated expenses:', err);
          reject(err);
          return;
        }
        
        const count = row ? row.count : 0;
        logger.debug('Count associated expenses:', { paymentMethodId: id, count });
        resolve(count);
      });
    });
  }

  /**
   * Count expenses associated with a payment method within a date range
   * Uses COALESCE(posted_date, date) for effective posting date to match balance calculation
   * @param {number} id - Payment method ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<number>} Count of associated expenses in date range
   * _Requirements: 2.1, 2.2_
   */
  async countExpensesInDateRange(id, startDate, endDate) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT COUNT(*) as count 
        FROM expenses 
        WHERE payment_method_id = ? 
          AND COALESCE(posted_date, date) >= ? 
          AND COALESCE(posted_date, date) <= ?
      `;
      
      db.get(sql, [id, startDate, endDate], (err, row) => {
        if (err) {
          logger.error('Failed to count expenses in date range:', err);
          reject(err);
          return;
        }
        
        const count = row ? row.count : 0;
        logger.debug('Count expenses in date range:', { paymentMethodId: id, startDate, endDate, count });
        resolve(count);
      });
    });
  }

  /**
   * Get all active payment methods for dropdown population
   * @returns {Promise<Array>} Array of active payment methods
   */
  async getActivePaymentMethods() {
    return this.findAll({ activeOnly: true });
  }

  /**
   * Update credit card balance (increment or decrement)
   * @param {number} id - Payment method ID
   * @param {number} amount - Amount to add (positive) or subtract (negative)
   * @returns {Promise<Object|null>} Updated payment method or null if not found
   */
  async updateBalance(id, amount) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // First get current balance to ensure we don't go negative
      db.get('SELECT * FROM payment_methods WHERE id = ?', [id], (err, row) => {
        if (err) {
          logger.error('Failed to get payment method for balance update:', err);
          reject(err);
          return;
        }
        
        if (!row) {
          resolve(null);
          return;
        }
        
        const newBalance = Math.max(0, (row.current_balance || 0) + amount);
        
        const sql = `
          UPDATE payment_methods 
          SET current_balance = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        
        db.run(sql, [newBalance, id], function(err) {
          if (err) {
            logger.error('Failed to update payment method balance:', err);
            reject(err);
            return;
          }
          
          logger.debug('Updated payment method balance:', { id, oldBalance: row.current_balance, newBalance, change: amount });
          
          resolve({
            ...row,
            current_balance: newBalance
          });
        });
      });
    });
  }
}

module.exports = new PaymentMethodRepository();

const { getDatabase } = require('../database/db');
const logger = require('../config/logger');

/**
 * Repository for managing credit card billing cycle history in the database
 * Handles CRUD operations for the credit_card_billing_cycles table
 * 
 * _Requirements: 1.1, 1.5, 2.2, 2.4_
 */
class BillingCycleRepository {
  /**
   * Create a new billing cycle record
   * @param {Object} data - Billing cycle data
   * @param {number} data.payment_method_id - Payment method ID
   * @param {string} data.cycle_start_date - Cycle start date (YYYY-MM-DD)
   * @param {string} data.cycle_end_date - Cycle end date (YYYY-MM-DD)
   * @param {number} data.actual_statement_balance - User-provided actual balance
   * @param {number} data.calculated_statement_balance - System-calculated balance
   * @param {number} [data.minimum_payment] - Optional minimum payment amount
   * @param {string} [data.due_date] - Optional due date (YYYY-MM-DD)
   * @param {string} [data.notes] - Optional notes
   * @param {string} [data.statement_pdf_path] - Optional PDF file path
   * @param {number} [data.is_user_entered] - 1 if user-entered, 0 if auto-generated (default 0)
   * @returns {Promise<Object>} Created record with ID
   * _Requirements: 1.1_
   */
  async create(data) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO credit_card_billing_cycles (
          payment_method_id, cycle_start_date, cycle_end_date,
          actual_statement_balance, calculated_statement_balance,
          minimum_payment, due_date, notes, statement_pdf_path, is_user_entered
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        data.payment_method_id,
        data.cycle_start_date,
        data.cycle_end_date,
        data.actual_statement_balance,
        data.calculated_statement_balance,
        data.minimum_payment || null,
        data.due_date || null,
        data.notes || null,
        data.statement_pdf_path || null,
        data.is_user_entered || 0
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to create billing cycle:', err);
          reject(err);
          return;
        }
        
        logger.debug('Created billing cycle:', { 
          id: this.lastID, 
          paymentMethodId: data.payment_method_id,
          cycleEndDate: data.cycle_end_date,
          hasPdf: !!data.statement_pdf_path,
          isUserEntered: data.is_user_entered || 0
        });
        
        resolve({
          id: this.lastID,
          payment_method_id: data.payment_method_id,
          cycle_start_date: data.cycle_start_date,
          cycle_end_date: data.cycle_end_date,
          actual_statement_balance: data.actual_statement_balance,
          calculated_statement_balance: data.calculated_statement_balance,
          minimum_payment: data.minimum_payment || null,
          due_date: data.due_date || null,
          notes: data.notes || null,
          statement_pdf_path: data.statement_pdf_path || null,
          is_user_entered: data.is_user_entered || 0
        });
      });
    });
  }

  /**
   * Find a billing cycle record by ID
   * @param {number} id - Billing cycle ID
   * @returns {Promise<Object|null>} Billing cycle record or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM credit_card_billing_cycles WHERE id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          logger.error('Failed to find billing cycle by ID:', err);
          reject(err);
          return;
        }
        
        resolve(row || null);
      });
    });
  }

  /**
   * Find billing cycle by payment method and cycle end date
   * Used to check for duplicate entries
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} cycleEndDate - Cycle end date (YYYY-MM-DD)
   * @returns {Promise<Object|null>} Billing cycle record or null if not found
   * _Requirements: 1.3_
   */
  async findByPaymentMethodAndCycleEnd(paymentMethodId, cycleEndDate) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM credit_card_billing_cycles 
        WHERE payment_method_id = ? AND cycle_end_date = ?
      `;
      
      db.get(sql, [paymentMethodId, cycleEndDate], (err, row) => {
        if (err) {
          logger.error('Failed to find billing cycle by payment method and cycle end:', err);
          reject(err);
          return;
        }
        
        resolve(row || null);
      });
    });
  }

  /**
   * Get billing cycle history for a payment method
   * Returns records sorted by cycle_end_date in descending order (most recent first)
   * @param {number} paymentMethodId - Payment method ID
   * @param {Object} [options] - Query options
   * @param {number} [options.limit] - Maximum number of records to return
   * @param {string} [options.startDate] - Filter by cycle_end_date >= startDate (YYYY-MM-DD)
   * @param {string} [options.endDate] - Filter by cycle_end_date <= endDate (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of billing cycle records sorted by cycle_end_date DESC
   * _Requirements: 1.5, 2.2_
   */
  async findByPaymentMethod(paymentMethodId, options = {}) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT * FROM credit_card_billing_cycles 
        WHERE payment_method_id = ?
      `;
      const params = [paymentMethodId];
      
      // Add date range filtering
      if (options.startDate) {
        sql += ' AND cycle_end_date >= ?';
        params.push(options.startDate);
      }
      
      if (options.endDate) {
        sql += ' AND cycle_end_date <= ?';
        params.push(options.endDate);
      }
      
      // Sort by cycle_end_date descending (most recent first)
      sql += ' ORDER BY cycle_end_date DESC';
      
      // Add limit if specified
      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
      }
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('Failed to find billing cycles by payment method:', err);
          reject(err);
          return;
        }
        
        logger.debug('Found billing cycles:', { 
          paymentMethodId, 
          count: rows ? rows.length : 0 
        });
        resolve(rows || []);
      });
    });
  }

  /**
   * Update a billing cycle record
   * @param {number} id - Billing cycle ID
   * @param {Object} data - Updated data
   * @param {number} [data.actual_statement_balance] - Updated actual balance
   * @param {number} [data.minimum_payment] - Updated minimum payment
   * @param {string} [data.due_date] - Updated due date
   * @param {string} [data.notes] - Updated notes
   * @param {string} [data.statement_pdf_path] - Updated PDF path
   * @param {number} [data.is_user_entered] - Set to 1 to mark as user-entered
   * @returns {Promise<Object|null>} Updated record or null if not found
   * _Requirements: 2.4_
   */
  async update(id, data) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // First get the existing record to preserve calculated_statement_balance
      db.get('SELECT * FROM credit_card_billing_cycles WHERE id = ?', [id], (err, existing) => {
        if (err) {
          logger.error('Failed to get billing cycle for update:', err);
          reject(err);
          return;
        }
        
        if (!existing) {
          resolve(null);
          return;
        }
        
        const sql = `
          UPDATE credit_card_billing_cycles 
          SET actual_statement_balance = ?,
              minimum_payment = ?,
              due_date = ?,
              notes = ?,
              statement_pdf_path = ?,
              is_user_entered = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        
        const params = [
          data.actual_statement_balance !== undefined 
            ? data.actual_statement_balance 
            : existing.actual_statement_balance,
          data.minimum_payment !== undefined ? data.minimum_payment : existing.minimum_payment,
          data.due_date !== undefined ? data.due_date : existing.due_date,
          data.notes !== undefined ? data.notes : existing.notes,
          data.statement_pdf_path !== undefined ? data.statement_pdf_path : existing.statement_pdf_path,
          data.is_user_entered !== undefined ? data.is_user_entered : (existing.is_user_entered || 0),
          id
        ];
        
        db.run(sql, params, function(err) {
          if (err) {
            logger.error('Failed to update billing cycle:', err);
            reject(err);
            return;
          }
          
          if (this.changes === 0) {
            resolve(null);
            return;
          }
          
          logger.debug('Updated billing cycle:', { id, changes: this.changes });
          
          // Return the updated record
          db.get('SELECT * FROM credit_card_billing_cycles WHERE id = ?', [id], (err, row) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(row);
          });
        });
      });
    });
  }

  /**
   * Delete a billing cycle record
   * @param {number} id - Billing cycle ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   * _Requirements: 2.4_
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM credit_card_billing_cycles WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          logger.error('Failed to delete billing cycle:', err);
          reject(err);
          return;
        }
        
        const deleted = this.changes > 0;
        logger.debug('Delete billing cycle:', { id, deleted });
        resolve(deleted);
      });
    });
  }

  /**
   * Get current billing cycle status for a payment method
   * Returns the billing cycle record for the specified cycle end date if it exists
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} cycleEndDate - Current cycle end date (YYYY-MM-DD)
   * @returns {Promise<Object|null>} Billing cycle record or null if not found
   */
  async getCurrentCycleStatus(paymentMethodId, cycleEndDate) {
    return this.findByPaymentMethodAndCycleEnd(paymentMethodId, cycleEndDate);
  }

  /**
   * Get credit cards that need billing cycle entry
   * Returns credit cards with billing_cycle_day configured that don't have
   * an entry for the most recently completed billing cycle
   * @param {Date} referenceDate - Reference date for determining current cycle
   * @returns {Promise<Array>} Array of payment methods needing billing cycle entry
   */
  async getCreditCardsNeedingBillingCycleEntry(referenceDate) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // Get all active credit cards with billing_cycle_day configured
      const sql = `
        SELECT pm.* 
        FROM payment_methods pm
        WHERE pm.type = 'credit_card' 
          AND pm.is_active = 1 
          AND pm.billing_cycle_day IS NOT NULL
      `;
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          logger.error('Failed to get credit cards needing billing cycle entry:', err);
          reject(err);
          return;
        }
        
        resolve(rows || []);
      });
    });
  }
}

module.exports = new BillingCycleRepository();

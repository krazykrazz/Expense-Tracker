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
   * @param {string} [data.notes] - Optional notes
   * @param {string} [data.statement_pdf_path] - Optional PDF file path
   * @param {number} [data.is_user_entered] - 1 if user-entered, 0 if auto-generated (default 0)
   * @returns {Promise<Object>} Created record with ID
   * _Requirements: 1.1_
   */
  async create(data) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // Build column list and params dynamically to support optional effective_balance/balance_type
      const columns = [
        'payment_method_id', 'cycle_start_date', 'cycle_end_date',
        'actual_statement_balance', 'calculated_statement_balance',
        'minimum_payment', 'notes', 'statement_pdf_path', 'is_user_entered'
      ];
      const values = [
        data.payment_method_id,
        data.cycle_start_date,
        data.cycle_end_date,
        data.actual_statement_balance,
        data.calculated_statement_balance,
        data.minimum_payment || null,
        data.notes || null,
        data.statement_pdf_path || null,
        data.is_user_entered || 0
      ];

      // Include persisted effective balance columns when provided
      if (data.effective_balance !== undefined && data.effective_balance !== null) {
        columns.push('effective_balance', 'balance_type');
        values.push(data.effective_balance, data.balance_type || 'calculated');
      }

      const placeholders = columns.map(() => '?').join(', ');
      const sql = `
        INSERT INTO credit_card_billing_cycles (${columns.join(', ')})
        VALUES (${placeholders})
      `;
      
      db.run(sql, values, function(err) {
        if (err) {
          // If the error is about unknown columns, retry without them
          if (err.message && err.message.includes('effective_balance')) {
            const fallbackSql = `
              INSERT INTO credit_card_billing_cycles (
                payment_method_id, cycle_start_date, cycle_end_date,
                actual_statement_balance, calculated_statement_balance,
                minimum_payment, notes, statement_pdf_path, is_user_entered
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const fallbackParams = [
              data.payment_method_id, data.cycle_start_date, data.cycle_end_date,
              data.actual_statement_balance, data.calculated_statement_balance,
              data.minimum_payment || null, data.notes || null,
              data.statement_pdf_path || null, data.is_user_entered || 0
            ];
            db.run(fallbackSql, fallbackParams, function(fallbackErr) {
              if (fallbackErr) {
                logger.error('Failed to create billing cycle:', fallbackErr);
                reject(fallbackErr);
                return;
              }
              resolveCreated(this.lastID, data, resolve);
            });
            return;
          }
          logger.error('Failed to create billing cycle:', err);
          reject(err);
          return;
        }
        
        resolveCreated(this.lastID, data, resolve);
      });
    });

    function resolveCreated(id, data, resolve) {
      logger.debug('Created billing cycle:', { 
        id, 
        paymentMethodId: data.payment_method_id,
        cycleEndDate: data.cycle_end_date,
        hasPdf: !!data.statement_pdf_path,
        isUserEntered: data.is_user_entered || 0
      });
      
      resolve({
        id,
        payment_method_id: data.payment_method_id,
        cycle_start_date: data.cycle_start_date,
        cycle_end_date: data.cycle_end_date,
        actual_statement_balance: data.actual_statement_balance,
        calculated_statement_balance: data.calculated_statement_balance,
        minimum_payment: data.minimum_payment || null,
        notes: data.notes || null,
        statement_pdf_path: data.statement_pdf_path || null,
        is_user_entered: data.is_user_entered || 0,
        effective_balance: data.effective_balance !== undefined ? data.effective_balance : undefined,
        balance_type: data.balance_type !== undefined ? data.balance_type : undefined
      });
    }
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
   * Find the most recent billing cycle before a given date for a payment method
   * Used to retrieve the previous cycle's balance for carry-forward calculations
   *
   * @param {number} paymentMethodId - The payment method ID
   * @param {string} beforeDate - Date string; returns cycles with cycle_end_date strictly before this date
   * @returns {Promise<Object|null>} The most recent previous cycle record, or null if none exists
   * _Requirements: 1.1, 2.1, 3.2_
   */
  async findPreviousCycle(paymentMethodId, beforeDate) {
    const db = await getDatabase();

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM credit_card_billing_cycles
        WHERE payment_method_id = ? AND cycle_end_date < ?
        ORDER BY cycle_end_date DESC
        LIMIT 1
      `;

      db.get(sql, [paymentMethodId, beforeDate], (err, row) => {
        if (err) {
          logger.error('Failed to find previous billing cycle:', err);
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
        
        // Build SET clause dynamically to support optional effective_balance/balance_type
        const setClauses = [
          'actual_statement_balance = ?',
          'minimum_payment = ?',
          'notes = ?',
          'statement_pdf_path = ?',
          'is_user_entered = ?',
          'updated_at = CURRENT_TIMESTAMP'
        ];
        const params = [
          data.actual_statement_balance !== undefined 
            ? data.actual_statement_balance 
            : existing.actual_statement_balance,
          data.minimum_payment !== undefined ? data.minimum_payment : existing.minimum_payment,
          data.notes !== undefined ? data.notes : existing.notes,
          data.statement_pdf_path !== undefined ? data.statement_pdf_path : existing.statement_pdf_path,
          data.is_user_entered !== undefined ? data.is_user_entered : (existing.is_user_entered || 0)
        ];

        // Include persisted effective balance columns when provided
        if (data.effective_balance !== undefined) {
          setClauses.splice(setClauses.length - 1, 0, 'effective_balance = ?', 'balance_type = ?');
          params.push(data.effective_balance, data.balance_type || 'calculated');
        }

        params.push(id);

        const sql = `
          UPDATE credit_card_billing_cycles 
          SET ${setClauses.join(',\n              ')}
          WHERE id = ?
        `;
        
        db.run(sql, params, function(err) {
          if (err) {
            // If the error is about unknown columns, retry without them
            if (err.message && err.message.includes('effective_balance')) {
              const fallbackSql = `
                UPDATE credit_card_billing_cycles 
                SET actual_statement_balance = ?,
                    minimum_payment = ?,
                    notes = ?,
                    statement_pdf_path = ?,
                    is_user_entered = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `;
              const fallbackParams = [
                data.actual_statement_balance !== undefined 
                  ? data.actual_statement_balance 
                  : existing.actual_statement_balance,
                data.minimum_payment !== undefined ? data.minimum_payment : existing.minimum_payment,
                data.notes !== undefined ? data.notes : existing.notes,
                data.statement_pdf_path !== undefined ? data.statement_pdf_path : existing.statement_pdf_path,
                data.is_user_entered !== undefined ? data.is_user_entered : (existing.is_user_entered || 0),
                id
              ];
              db.run(fallbackSql, fallbackParams, function(fallbackErr) {
                if (fallbackErr) {
                  logger.error('Failed to update billing cycle:', fallbackErr);
                  reject(fallbackErr);
                  return;
                }
                if (this.changes === 0) {
                  resolve(null);
                  return;
                }
                logger.debug('Updated billing cycle (fallback):', { id, changes: this.changes });
                db.get('SELECT * FROM credit_card_billing_cycles WHERE id = ?', [id], (err, row) => {
                  if (err) { reject(err); return; }
                  resolve(row);
                });
              });
              return;
            }
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
   * Update only the calculated_statement_balance for a billing cycle
   * Used to keep auto-generated cycle balances fresh when expenses change
   * @param {number} id - Billing cycle ID
   * @param {number} calculatedBalance - New calculated balance
   * @returns {Promise<boolean>} True if updated, false if not found
   */
  async updateCalculatedBalance(id, calculatedBalance, effectiveBalanceData) {
    const db = await getDatabase();

    return new Promise((resolve, reject) => {
      // Build SET clause — include effective_balance/balance_type if provided
      const setClauses = [
        'calculated_statement_balance = ?',
        'updated_at = CURRENT_TIMESTAMP'
      ];
      const params = [calculatedBalance];

      if (effectiveBalanceData && effectiveBalanceData.effective_balance !== undefined) {
        setClauses.splice(setClauses.length - 1, 0, 'effective_balance = ?', 'balance_type = ?');
        params.push(effectiveBalanceData.effective_balance, effectiveBalanceData.balance_type || 'calculated');
      }

      params.push(id);

      const sql = `
        UPDATE credit_card_billing_cycles 
        SET ${setClauses.join(', ')}
        WHERE id = ?
      `;

      db.run(sql, params, function(err) {
        if (err) {
          // If error is about unknown columns, retry without them
          if (err.message && err.message.includes('effective_balance')) {
            const fallbackSql = `
              UPDATE credit_card_billing_cycles 
              SET calculated_statement_balance = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `;
            db.run(fallbackSql, [calculatedBalance, id], function(fallbackErr) {
              if (fallbackErr) {
                logger.error('Failed to update calculated balance:', fallbackErr);
                reject(fallbackErr);
                return;
              }
              const updated = this.changes > 0;
              logger.debug('Updated calculated balance (fallback):', { id, calculatedBalance, updated });
              resolve(updated);
            });
            return;
          }
          logger.error('Failed to update calculated balance:', err);
          reject(err);
          return;
        }

        const updated = this.changes > 0;
        logger.debug('Updated calculated balance:', { id, calculatedBalance, updated });
        resolve(updated);
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
   * Find unreviewed auto-generated billing cycle records
   * Returns cycles where is_user_entered = 0 AND reviewed_at IS NULL,
   * joined with payment_methods to include display_name and full_name
   * @returns {Promise<Array>} Array of unreviewed auto-generated billing cycle records
   * _Requirements: 2.1, 2.4_
   */
  async findUnreviewedAutoGenerated() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT bch.*, pm.display_name, pm.full_name
        FROM credit_card_billing_cycles bch
        JOIN payment_methods pm ON bch.payment_method_id = pm.id
        WHERE bch.is_user_entered = 0 AND bch.reviewed_at IS NULL
        ORDER BY bch.cycle_end_date DESC
      `;
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          logger.error('Failed to find unreviewed auto-generated billing cycles:', err);
          reject(err);
          return;
        }
        
        logger.debug('Found unreviewed auto-generated billing cycles:', { 
          count: rows ? rows.length : 0 
        });
        resolve(rows || []);
      });
    });
  }

  /**
   * Mark all unreviewed auto-generated billing cycles as reviewed.
   * Sets reviewed_at to the current timestamp for cycles where
   * is_user_entered = 0 AND reviewed_at IS NULL.
   * @returns {Promise<number>} Number of cycles marked as reviewed
   */
  async markAllAutoGeneratedAsReviewed() {
    const db = await getDatabase();

    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE credit_card_billing_cycles
        SET reviewed_at = datetime('now')
        WHERE is_user_entered = 0 AND reviewed_at IS NULL
      `;

      db.run(sql, [], function(err) {
        if (err) {
          logger.error('Failed to mark auto-generated billing cycles as reviewed:', err);
          reject(err);
          return;
        }

        logger.debug('Marked auto-generated billing cycles as reviewed:', { count: this.changes });
        resolve(this.changes);
      });
    });
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

const { getDatabase } = require('../database/db');

/**
 * Repository for mortgage payment tracking
 * Handles CRUD operations for the mortgage_payments table
 */
class MortgagePaymentRepository {
  /**
   * Create a new payment entry
   * @param {Object} paymentEntry - Payment entry data
   * @param {number} paymentEntry.loan_id - Mortgage loan ID
   * @param {number} paymentEntry.payment_amount - Payment amount
   * @param {string} paymentEntry.effective_date - Date payment takes effect (YYYY-MM-DD)
   * @param {string} [paymentEntry.notes] - Optional notes
   * @returns {Promise<Object>} Created payment entry with ID
   */
  async create(paymentEntry) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO mortgage_payments (loan_id, payment_amount, effective_date, notes)
        VALUES (?, ?, ?, ?)
      `;
      
      const params = [
        paymentEntry.loan_id,
        paymentEntry.payment_amount,
        paymentEntry.effective_date,
        paymentEntry.notes || null
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        resolve({
          id: this.lastID,
          ...paymentEntry,
          notes: paymentEntry.notes || null
        });
      });
    });
  }

  /**
   * Find all payment entries for a mortgage
   * Returns entries sorted by effective_date ASC (chronological order)
   * @param {number} mortgageId - Mortgage loan ID
   * @returns {Promise<Array>} Array of payment entries in chronological order
   */
  async findByMortgage(mortgageId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM mortgage_payments 
        WHERE loan_id = ? 
        ORDER BY effective_date ASC
      `;
      
      db.all(sql, [mortgageId], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Find the current (most recent) payment entry for a mortgage
   * @param {number} mortgageId - Mortgage loan ID
   * @returns {Promise<Object|null>} Most recent payment entry or null if none exists
   */
  async findCurrentByMortgage(mortgageId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM mortgage_payments 
        WHERE loan_id = ? 
        ORDER BY effective_date DESC 
        LIMIT 1
      `;
      
      db.get(sql, [mortgageId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  }

  /**
   * Update a payment entry by ID
   * @param {number} id - Payment entry ID
   * @param {Object} paymentEntry - Updated payment entry data
   * @returns {Promise<Object|null>} Updated payment entry or null if not found
   */
  async update(id, paymentEntry) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE mortgage_payments 
        SET payment_amount = ?, effective_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        paymentEntry.payment_amount,
        paymentEntry.effective_date,
        paymentEntry.notes || null,
        id
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null);
          return;
        }
        
        resolve({
          id: id,
          ...paymentEntry,
          notes: paymentEntry.notes || null
        });
      });
    });
  }

  /**
   * Delete a payment entry by ID
   * @param {number} id - Payment entry ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM mortgage_payments WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  /**
   * Find a payment entry by ID
   * @param {number} id - Payment entry ID
   * @returns {Promise<Object|null>} Payment entry or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM mortgage_payments WHERE id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  }

  /**
   * Delete all payment entries for a mortgage
   * Used for cleanup or when mortgage is deleted (though CASCADE handles this)
   * @param {number} mortgageId - Mortgage loan ID
   * @returns {Promise<number>} Number of entries deleted
   */
  async deleteByMortgage(mortgageId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM mortgage_payments WHERE loan_id = ?';
      
      db.run(sql, [mortgageId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes);
      });
    });
  }
}

module.exports = new MortgagePaymentRepository();

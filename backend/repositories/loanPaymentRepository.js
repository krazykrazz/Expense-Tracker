const { getDatabase } = require('../database/db');

class LoanPaymentRepository {
  /**
   * Create a new payment entry
   * @param {Object} payment - Payment data { loan_id, amount, payment_date, notes }
   * @returns {Promise<Object>} Created payment entry with ID
   */
  async create(payment) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO loan_payments (loan_id, amount, payment_date, notes)
        VALUES (?, ?, ?, ?)
      `;
      
      const params = [
        payment.loan_id,
        payment.amount,
        payment.payment_date,
        payment.notes || null
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        resolve({
          id: this.lastID,
          loan_id: payment.loan_id,
          amount: payment.amount,
          payment_date: payment.payment_date,
          notes: payment.notes || null
        });
      });
    });
  }

  /**
   * Find all payments for a loan (default ordering by created_at DESC)
   * @param {number} loanId - Loan ID
   * @returns {Promise<Array>} Array of payment entries
   */
  async findByLoan(loanId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM loan_payments 
        WHERE loan_id = ? 
        ORDER BY created_at DESC
      `;
      
      db.all(sql, [loanId], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Find all payments for a loan ordered by payment_date (reverse chronological)
   * This is the primary method for displaying payment history
   * @param {number} loanId - Loan ID
   * @returns {Promise<Array>} Array of payment entries sorted by payment_date DESC
   */
  async findByLoanOrdered(loanId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM loan_payments 
        WHERE loan_id = ? 
        ORDER BY payment_date DESC, id DESC
      `;
      
      db.all(sql, [loanId], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Find a single payment by ID
   * @param {number} id - Payment ID
   * @returns {Promise<Object|null>} Payment entry or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM loan_payments WHERE id = ?';
      
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
   * Update a payment entry by ID
   * @param {number} id - Payment ID
   * @param {Object} payment - Updated payment data { amount, payment_date, notes }
   * @returns {Promise<Object|null>} Updated payment or null if not found
   */
  async update(id, payment) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE loan_payments 
        SET amount = ?, payment_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        payment.amount,
        payment.payment_date,
        payment.notes || null,
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
          amount: payment.amount,
          payment_date: payment.payment_date,
          notes: payment.notes || null
        });
      });
    });
  }

  /**
   * Delete a payment entry by ID
   * @param {number} id - Payment ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM loan_payments WHERE id = ?';
      
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
   * Get the sum of all payments for a loan
   * @param {number} loanId - Loan ID
   * @returns {Promise<number>} Total payment amount
   */
  async getTotalPayments(loanId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT COALESCE(SUM(amount), 0) as total
        FROM loan_payments 
        WHERE loan_id = ?
      `;
      
      db.get(sql, [loanId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row ? row.total : 0);
      });
    });
  }

  /**
   * Get payment count for a loan
   * @param {number} loanId - Loan ID
   * @returns {Promise<number>} Number of payments
   */
  async getPaymentCount(loanId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT COUNT(*) as count
        FROM loan_payments 
        WHERE loan_id = ?
      `;
      
      db.get(sql, [loanId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row ? row.count : 0);
      });
    });
  }

  /**
   * Get the most recent payment for a loan
   * @param {number} loanId - Loan ID
   * @returns {Promise<Object|null>} Most recent payment or null
   */
  async getLastPayment(loanId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM loan_payments 
        WHERE loan_id = ? 
        ORDER BY payment_date DESC, id DESC
        LIMIT 1
      `;
      
      db.get(sql, [loanId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  }

  /**
   * Check if a payment exists for a loan in a specific month
   * @param {number} loanId - Loan ID
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<boolean>} True if payment exists for the month
   */
  async hasPaymentForMonth(loanId, year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // Format month with leading zero for date comparison
      const monthStr = String(month).padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      const endDate = `${year}-${monthStr}-31`;
      
      const sql = `
        SELECT COUNT(*) as count
        FROM loan_payments 
        WHERE loan_id = ? 
          AND payment_date >= ?
          AND payment_date <= ?
      `;
      
      db.get(sql, [loanId, startDate, endDate], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row && row.count > 0);
      });
    });
  }

  /**
   * Get payments for multiple loans in a specific month
   * Returns a map of loan_id to boolean indicating if payment exists
   * @param {Array<number>} loanIds - Array of loan IDs
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Map<number, boolean>>} Map of loan_id to hasPayment
   */
  async getPaymentStatusForMonth(loanIds, year, month) {
    if (!loanIds || loanIds.length === 0) {
      return new Map();
    }
    
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // Format month with leading zero for date comparison
      const monthStr = String(month).padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      const endDate = `${year}-${monthStr}-31`;
      
      const placeholders = loanIds.map(() => '?').join(',');
      const sql = `
        SELECT loan_id, COUNT(*) as count
        FROM loan_payments 
        WHERE loan_id IN (${placeholders})
          AND payment_date >= ?
          AND payment_date <= ?
        GROUP BY loan_id
      `;
      
      const params = [...loanIds, startDate, endDate];
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Build map with all loan IDs, defaulting to false
        const result = new Map();
        loanIds.forEach(id => result.set(id, false));
        
        // Set true for loans that have payments
        (rows || []).forEach(row => {
          if (row.count > 0) {
            result.set(row.loan_id, true);
          }
        });
        
        resolve(result);
      });
    });
  }
}

module.exports = new LoanPaymentRepository();

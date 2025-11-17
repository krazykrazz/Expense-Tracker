const { getDatabase } = require('../database/db');

class LoanBalanceRepository {
  /**
   * Create a new balance entry
   * @param {Object} balanceEntry - Balance entry data
   * @returns {Promise<Object>} Created balance entry with ID
   */
  async create(balanceEntry) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      const params = [
        balanceEntry.loan_id,
        balanceEntry.year,
        balanceEntry.month,
        balanceEntry.remaining_balance,
        balanceEntry.rate
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Return the created balance entry with its ID
        resolve({
          id: this.lastID,
          ...balanceEntry
        });
      });
    });
  }

  /**
   * Find all balance entries for a loan
   * @param {number} loanId - Loan ID
   * @returns {Promise<Array>} Array of balance entries
   */
  async findByLoan(loanId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM loan_balances 
        WHERE loan_id = ? 
        ORDER BY year DESC, month DESC
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
   * Find a balance entry for a specific loan and month
   * @param {number} loanId - Loan ID
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object|null>} Balance entry or null if not found
   */
  async findByLoanAndMonth(loanId, year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM loan_balances 
        WHERE loan_id = ? AND year = ? AND month = ?
      `;
      
      db.get(sql, [loanId, year, month], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  }

  /**
   * Update a balance entry by ID
   * @param {number} id - Balance entry ID
   * @param {Object} balanceEntry - Updated balance entry data
   * @returns {Promise<Object|null>} Updated balance entry or null if not found
   */
  async update(id, balanceEntry) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE loan_balances 
        SET year = ?, month = ?, remaining_balance = ?, rate = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        balanceEntry.year,
        balanceEntry.month,
        balanceEntry.remaining_balance,
        balanceEntry.rate,
        id
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null); // No rows updated, balance entry not found
          return;
        }
        
        // Return the updated balance entry
        resolve({
          id: id,
          ...balanceEntry
        });
      });
    });
  }

  /**
   * Delete a balance entry by ID
   * @param {number} id - Balance entry ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM loan_balances WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
          return;
        }
        // this.changes indicates how many rows were affected
        resolve(this.changes > 0);
      });
    });
  }

  /**
   * Create or update a balance entry (upsert)
   * @param {Object} balanceEntry - Balance entry data
   * @returns {Promise<Object>} Created or updated balance entry
   */
  async upsert(balanceEntry) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(loan_id, year, month) 
        DO UPDATE SET 
          remaining_balance = excluded.remaining_balance,
          rate = excluded.rate,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      const params = [
        balanceEntry.loan_id,
        balanceEntry.year,
        balanceEntry.month,
        balanceEntry.remaining_balance,
        balanceEntry.rate
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Return the balance entry with ID (either new or existing)
        resolve({
          id: this.lastID || balanceEntry.id,
          ...balanceEntry
        });
      });
    });
  }

  /**
   * Get balance history for a loan with chronological sorting
   * @param {number} loanId - Loan ID
   * @returns {Promise<Array>} Array of balance entries sorted chronologically
   */
  async getBalanceHistory(loanId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM loan_balances 
        WHERE loan_id = ? 
        ORDER BY year ASC, month ASC
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
   * Get total debt over time across all active loans
   * Returns monthly totals of all loan balances
   * @returns {Promise<Array>} Array of {year, month, total_debt} objects sorted chronologically
   */
  async getTotalDebtOverTime() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          lb.year,
          lb.month,
          SUM(lb.remaining_balance) as total_debt,
          COUNT(DISTINCT lb.loan_id) as loan_count
        FROM loan_balances lb
        INNER JOIN loans l ON lb.loan_id = l.id
        WHERE l.is_paid_off = 0
        GROUP BY lb.year, lb.month
        ORDER BY lb.year ASC, lb.month ASC
      `;
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

}

module.exports = new LoanBalanceRepository();

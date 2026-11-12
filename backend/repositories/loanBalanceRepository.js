const { getDatabase } = require('../database/db');

class LoanBalanceRepository {
  /**
   * Find a balance entry by ID
   * @param {number} id - Balance entry ID
   * @returns {Promise<Object|null>} Balance entry or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM loan_balances WHERE id = ?';
      
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
   * Create a new balance entry
   * @param {Object} balanceEntry - Balance entry data
   * @returns {Promise<Object>} Created balance entry with ID
   */
  async create(balanceEntry) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate, source)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        balanceEntry.loan_id,
        balanceEntry.year,
        balanceEntry.month,
        balanceEntry.remaining_balance,
        balanceEntry.rate,
        balanceEntry.source || 'manual'
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
        SET year = ?, month = ?, remaining_balance = ?, rate = ?, source = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        balanceEntry.year,
        balanceEntry.month,
        balanceEntry.remaining_balance,
        balanceEntry.rate,
        balanceEntry.source || 'manual',
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
        INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate, source)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(loan_id, year, month) 
        DO UPDATE SET 
          remaining_balance = excluded.remaining_balance,
          rate = excluded.rate,
          source = excluded.source,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      const params = [
        balanceEntry.loan_id,
        balanceEntry.year,
        balanceEntry.month,
        balanceEntry.remaining_balance,
        balanceEntry.rate,
        balanceEntry.source || 'manual'
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
   * Get every balance snapshot for every existing loan, with the loan's paid-off flag
   * @returns {Promise<Array>} Array of {loan_id, is_paid_off, year, month, remaining_balance} sorted by loan then month
   */
  async getAllSnapshotsWithLoanStatus() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          lb.loan_id,
          l.is_paid_off,
          lb.year,
          lb.month,
          lb.remaining_balance
        FROM loan_balances lb
        INNER JOIN loans l ON lb.loan_id = l.id
        ORDER BY lb.loan_id ASC, lb.year ASC, lb.month ASC
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

  /**
   * Write a generated ('auto') snapshot. Never overwrites a user-entered ('manual') snapshot.
   * @param {Object} entry - { loan_id, year, month, remaining_balance, rate }
   * @returns {Promise<void>}
   */
  async upsertAuto(entry) {
    const db = await getDatabase();

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate, source)
        VALUES (?, ?, ?, ?, ?, 'auto')
        ON CONFLICT(loan_id, year, month)
        DO UPDATE SET
          remaining_balance = excluded.remaining_balance,
          rate = excluded.rate,
          updated_at = CURRENT_TIMESTAMP
        WHERE loan_balances.source = 'auto'
          AND (loan_balances.remaining_balance != excluded.remaining_balance
            OR loan_balances.rate != excluded.rate)
      `;

      db.run(sql, [entry.loan_id, entry.year, entry.month, entry.remaining_balance, entry.rate], (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Delete generated ('auto') snapshots after a month (e.g. left over from deleted payments)
   * @param {number} loanId - Loan ID
   * @param {number} year - Year of the last month to keep
   * @param {number} month - Last month to keep (1-12)
   * @returns {Promise<number>} Number of rows deleted
   */
  async deleteAutoAfter(loanId, year, month) {
    const db = await getDatabase();

    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM loan_balances
        WHERE loan_id = ? AND source = 'auto' AND (year * 12 + month) > ?
      `;

      db.run(sql, [loanId, year * 12 + month], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes);
      });
    });
  }

}

module.exports = new LoanBalanceRepository();

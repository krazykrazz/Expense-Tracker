const { getDatabase } = require('../database/db');

class LoanRepository {
  /**
   * Create a new loan
   * @param {Object} loan - Loan data
   * @returns {Promise<Object>} Created loan with ID
   */
  async create(loan) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO loans (name, initial_balance, start_date, notes, loan_type, is_paid_off, estimated_months_left,
                          amortization_period, term_length, renewal_date, rate_type, payment_frequency, estimated_property_value,
                          fixed_interest_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      // Only allow fixed_interest_rate for loan_type='loan'
      const fixedRate = loan.loan_type === 'loan' ? (loan.fixed_interest_rate ?? null) : null;
      
      const params = [
        loan.name,
        loan.initial_balance,
        loan.start_date,
        loan.notes || null,
        loan.loan_type || 'loan',
        loan.is_paid_off !== undefined ? loan.is_paid_off : 0,
        loan.estimated_months_left || null,
        loan.amortization_period || null,
        loan.term_length || null,
        loan.renewal_date || null,
        loan.rate_type || null,
        loan.payment_frequency || null,
        loan.estimated_property_value || null,
        fixedRate
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Return the created loan with its ID
        resolve({
          id: this.lastID,
          ...loan,
          loan_type: loan.loan_type || 'loan',
          is_paid_off: loan.is_paid_off !== undefined ? loan.is_paid_off : 0,
          amortization_period: loan.amortization_period || null,
          term_length: loan.term_length || null,
          renewal_date: loan.renewal_date || null,
          rate_type: loan.rate_type || null,
          payment_frequency: loan.payment_frequency || null,
          estimated_property_value: loan.estimated_property_value || null,
          fixed_interest_rate: fixedRate
        });
      });
    });
  }

  /**
   * Find all loans
   * @returns {Promise<Array>} Array of loans
   */
  async findAll() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM loans ORDER BY created_at DESC';
      
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
   * Find a single loan by ID
   * @param {number} id - Loan ID
   * @returns {Promise<Object|null>} Loan object or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM loans WHERE id = ?';
      
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
   * Update a loan by ID
   * @param {number} id - Loan ID
   * @param {Object} loan - Updated loan data
   * @returns {Promise<Object|null>} Updated loan or null if not found
   */
  async update(id, loan) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE loans 
        SET name = ?, initial_balance = ?, start_date = ?, notes = ?, loan_type = ?, estimated_months_left = ?,
            amortization_period = ?, term_length = ?, renewal_date = ?, rate_type = ?, payment_frequency = ?, 
            estimated_property_value = ?, fixed_interest_rate = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      // Only allow fixed_interest_rate for loan_type='loan'
      const loanType = loan.loan_type || 'loan';
      const fixedRate = loanType === 'loan' ? (loan.fixed_interest_rate ?? null) : null;
      
      const params = [
        loan.name,
        loan.initial_balance,
        loan.start_date,
        loan.notes || null,
        loanType,
        loan.estimated_months_left !== undefined ? loan.estimated_months_left : null,
        loan.amortization_period !== undefined ? loan.amortization_period : null,
        loan.term_length !== undefined ? loan.term_length : null,
        loan.renewal_date !== undefined ? loan.renewal_date : null,
        loan.rate_type !== undefined ? loan.rate_type : null,
        loan.payment_frequency !== undefined ? loan.payment_frequency : null,
        loan.estimated_property_value !== undefined ? loan.estimated_property_value : null,
        fixedRate,
        id
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null); // No rows updated, loan not found
          return;
        }
        
        // Return the updated loan
        resolve({
          id: id,
          ...loan,
          fixed_interest_rate: fixedRate
        });
      });
    });
  }

  /**
   * Update only allowed fields for a loan (for loans after creation)
   * Allowed fields: name, notes, fixed_interest_rate
   * Immutable fields: initial_balance, start_date, loan_type
   * @param {number} id - Loan ID
   * @param {Object} updates - Fields to update (only allowed fields will be applied)
   * @returns {Promise<Object|null>} Updated loan or null if not found
   */
  async updateFields(id, updates) {
    const db = await getDatabase();
    
    // Only allow updating specific fields for loans
    const allowedFields = ['name', 'notes', 'fixed_interest_rate'];
    const fieldsToUpdate = [];
    const params = [];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fieldsToUpdate.push(`${field} = ?`);
        params.push(updates[field]);
      }
    }
    
    if (fieldsToUpdate.length === 0) {
      // No allowed fields to update, return current loan
      return this.findById(id);
    }
    
    params.push(id);
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE loans 
        SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      db.run(sql, params, async function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null); // No rows updated, loan not found
          return;
        }
        
        // Fetch and return the updated loan
        try {
          const db = await getDatabase();
          db.get('SELECT * FROM loans WHERE id = ?', [id], (err, row) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(row);
          });
        } catch (fetchErr) {
          reject(fetchErr);
        }
      });
    });
  }

  /**
   * Update only allowed mortgage fields (for mortgages after creation)
   * Allowed fields: name, notes, estimated_property_value, renewal_date
   * Immutable fields: initial_balance, start_date, amortization_period, term_length
   * @param {number} id - Loan ID
   * @param {Object} updates - Fields to update (only allowed fields will be applied)
   * @returns {Promise<Object|null>} Updated loan or null if not found
   */
  async updateMortgageFields(id, updates) {
    const db = await getDatabase();
    
    // Only allow updating specific fields for mortgages
    const allowedFields = ['name', 'notes', 'estimated_property_value', 'renewal_date'];
    const fieldsToUpdate = [];
    const params = [];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fieldsToUpdate.push(`${field} = ?`);
        params.push(updates[field]);
      }
    }
    
    if (fieldsToUpdate.length === 0) {
      // No allowed fields to update, return current loan
      return this.findById(id);
    }
    
    params.push(id);
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE loans 
        SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      db.run(sql, params, async function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null); // No rows updated, loan not found
          return;
        }
        
        // Fetch and return the updated loan
        try {
          const db = await getDatabase();
          db.get('SELECT * FROM loans WHERE id = ?', [id], (err, row) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(row);
          });
        } catch (fetchErr) {
          reject(fetchErr);
        }
      });
    });
  }

  /**
   * Delete a loan by ID (cascades to balance entries)
   * @param {number} id - Loan ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM loans WHERE id = ?';
      
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
   * Mark a loan as paid off or reactivate it
   * @param {number} id - Loan ID
   * @param {number} isPaidOff - 1 for paid off, 0 for active
   * @returns {Promise<boolean>} True if updated, false if not found
   */
  async markPaidOff(id, isPaidOff) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE loans 
        SET is_paid_off = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      db.run(sql, [isPaidOff, id], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  /**
   * Get the most recent balance entry for a loan
   * @param {number} loanId - Loan ID
   * @returns {Promise<Object|null>} Most recent balance entry or null
   */
  async getCurrentBalance(loanId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM loan_balances 
        WHERE loan_id = ? 
        ORDER BY year DESC, month DESC 
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
   * Get all loans with their current balances and rates
   * @returns {Promise<Array>} Array of loans with currentBalance and currentRate
   */
  async getAllWithCurrentBalances() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          l.id,
          l.name,
          l.initial_balance,
          l.start_date,
          l.notes,
          l.loan_type,
          l.is_paid_off,
          l.estimated_months_left,
          l.amortization_period,
          l.term_length,
          l.renewal_date,
          l.rate_type,
          l.payment_frequency,
          l.estimated_property_value,
          l.fixed_interest_rate,
          l.created_at,
          l.updated_at,
          COALESCE(lb.remaining_balance, l.initial_balance) as currentBalance,
          COALESCE(lb.rate, 0) as currentRate
        FROM loans l
        LEFT JOIN (
          SELECT 
            loan_id,
            remaining_balance,
            rate,
            ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY year DESC, month DESC) as rn
          FROM loan_balances
        ) lb ON l.id = lb.loan_id AND lb.rn = 1
        ORDER BY l.created_at DESC
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
   * Get loans for a specific month (where start_date <= selected month)
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of loans with currentBalance and currentRate
   */
  async getLoansForMonth(year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // Create a date string for comparison - use last day of month
      // A loan that starts any day in January should appear in January's summary
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const selectedDate = `${year}-${month.toString().padStart(2, '0')}-${lastDayOfMonth.toString().padStart(2, '0')}`;
      
      const sql = `
        SELECT 
          l.id,
          l.name,
          l.initial_balance,
          l.start_date,
          l.notes,
          l.loan_type,
          l.is_paid_off,
          l.estimated_months_left,
          l.amortization_period,
          l.term_length,
          l.renewal_date,
          l.rate_type,
          l.payment_frequency,
          l.estimated_property_value,
          l.fixed_interest_rate,
          l.created_at,
          l.updated_at,
          COALESCE(lb.remaining_balance, l.initial_balance) as currentBalance,
          COALESCE(lb.rate, 0) as currentRate
        FROM loans l
        LEFT JOIN (
          SELECT 
            loan_id,
            remaining_balance,
            rate,
            ROW_NUMBER() OVER (
              PARTITION BY loan_id 
              ORDER BY year DESC, month DESC
            ) as rn
          FROM loan_balances
          WHERE (year < ? OR (year = ? AND month <= ?))
        ) lb ON l.id = lb.loan_id AND lb.rn = 1
        WHERE date(l.start_date) <= date(?)
        ORDER BY l.created_at DESC
      `;
      
      db.all(sql, [year, year, month, selectedDate], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }
}

module.exports = new LoanRepository();

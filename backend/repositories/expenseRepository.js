const { getDatabase } = require('../database/db');

class ExpenseRepository {
  /**
   * Create a new expense entry
   * @param {Object} expense - Expense data
   * @returns {Promise<Object>} Created expense with ID
   */
  async create(expense) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO expenses (date, place, notes, amount, type, week, method)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        expense.date,
        expense.place || null,
        expense.notes || null,
        expense.amount,
        expense.type,
        expense.week,
        expense.method
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Return the created expense with its ID
        resolve({
          id: this.lastID,
          ...expense
        });
      });
    });
  }

  /**
   * Find all expenses with optional year/month filtering
   * @param {Object} filters - Optional filters { year, month }
   * @returns {Promise<Array>} Array of expenses
   */
  async findAll(filters = {}) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM expenses';
      const params = [];
      
      // Add filtering by year and month if provided
      if (filters.year && filters.month) {
        sql += ' WHERE strftime("%Y", date) = ? AND strftime("%m", date) = ?';
        params.push(
          filters.year.toString(),
          filters.month.toString().padStart(2, '0')
        );
      } else if (filters.year) {
        sql += ' WHERE strftime("%Y", date) = ?';
        params.push(filters.year.toString());
      } else if (filters.month) {
        sql += ' WHERE strftime("%m", date) = ?';
        params.push(filters.month.toString().padStart(2, '0'));
      }
      
      sql += ' ORDER BY date DESC';
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Find a single expense by ID
   * @param {number} id - Expense ID
   * @returns {Promise<Object|null>} Expense object or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM expenses WHERE id = ?';
      
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
   * Update an expense by ID
   * @param {number} id - Expense ID
   * @param {Object} expense - Updated expense data
   * @returns {Promise<Object|null>} Updated expense or null if not found
   */
  async update(id, expense) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE expenses 
        SET date = ?, place = ?, notes = ?, amount = ?, type = ?, week = ?, method = ?
        WHERE id = ?
      `;
      
      const params = [
        expense.date,
        expense.place || null,
        expense.notes || null,
        expense.amount,
        expense.type,
        expense.week,
        expense.method,
        id
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null); // No rows updated, expense not found
          return;
        }
        
        // Return the updated expense
        resolve({
          id: id,
          ...expense
        });
      });
    });
  }

  /**
   * Delete an expense by ID
   * @param {number} id - Expense ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM expenses WHERE id = ?';
      
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
   * Get monthly gross income for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<number|null>} Gross amount or null if not set
   */
  async getMonthlyGross(year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT gross_amount FROM monthly_gross WHERE year = ? AND month = ?';
      
      db.get(sql, [year, month], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row ? row.gross_amount : null);
      });
    });
  }

  /**
   * Set monthly gross income for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {number} grossAmount - Gross income amount
   * @returns {Promise<Object>} Updated monthly gross record
   */
  async setMonthlyGross(year, month, grossAmount) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO monthly_gross (year, month, gross_amount)
        VALUES (?, ?, ?)
        ON CONFLICT(year, month) 
        DO UPDATE SET gross_amount = excluded.gross_amount
      `;
      
      db.run(sql, [year, month, grossAmount], function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        resolve({
          year,
          month,
          gross_amount: grossAmount
        });
      });
    });
  }

  /**
   * Get summary data for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} Summary object with weekly, method, type totals
   */
  async getSummary(year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const yearStr = year.toString();
      const monthStr = month.toString().padStart(2, '0');
      
      // Query for weekly totals
      const weeklySQL = `
        SELECT week, SUM(amount) as total
        FROM expenses
        WHERE strftime("%Y", date) = ? AND strftime("%m", date) = ?
        GROUP BY week
      `;
      
      // Query for payment method totals
      const methodSQL = `
        SELECT method, SUM(amount) as total
        FROM expenses
        WHERE strftime("%Y", date) = ? AND strftime("%m", date) = ?
        GROUP BY method
      `;
      
      // Query for type totals (Gas, Food, and Other)
      const typeSQL = `
        SELECT type, SUM(amount) as total
        FROM expenses
        WHERE strftime("%Y", date) = ? AND strftime("%m", date) = ?
        AND type IN ('Gas', 'Food', 'Other')
        GROUP BY type
      `;
      
      // Query for overall total
      const totalSQL = `
        SELECT SUM(amount) as total
        FROM expenses
        WHERE strftime("%Y", date) = ? AND strftime("%m", date) = ?
      `;
      
      const summary = {
        weeklyTotals: {
          week1: 0,
          week2: 0,
          week3: 0,
          week4: 0,
          week5: 0
        },
        methodTotals: {
          'Cash': 0,
          'Debit': 0,
          'CIBC MC': 0,
          'PCF MC': 0,
          'WS VISA': 0,
          'VISA': 0
        },
        typeTotals: {
          'Gas': 0,
          'Food': 0,
          'Other': 0
        },
        total: 0
      };
      
      // Execute all queries
      db.all(weeklySQL, [yearStr, monthStr], (err, weeklyRows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Populate weekly totals
        weeklyRows.forEach(row => {
          summary.weeklyTotals[`week${row.week}`] = parseFloat(row.total.toFixed(2));
        });
        
        db.all(methodSQL, [yearStr, monthStr], (err, methodRows) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Populate method totals
          methodRows.forEach(row => {
            summary.methodTotals[row.method] = parseFloat(row.total.toFixed(2));
          });
          
          db.all(typeSQL, [yearStr, monthStr], (err, typeRows) => {
            if (err) {
              reject(err);
              return;
            }
            
            // Populate type totals
            typeRows.forEach(row => {
              summary.typeTotals[row.type] = parseFloat(row.total.toFixed(2));
            });
            
            db.get(totalSQL, [yearStr, monthStr], (err, totalRow) => {
              if (err) {
                reject(err);
                return;
              }
              
              // Populate overall total
              summary.total = totalRow.total ? parseFloat(totalRow.total.toFixed(2)) : 0;
              
              resolve(summary);
            });
          });
        });
      });
    });
  }
}

module.exports = new ExpenseRepository();

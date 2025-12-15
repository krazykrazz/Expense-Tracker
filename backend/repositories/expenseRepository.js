const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

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
      
      sql += ' ORDER BY date ASC';
      
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
      const sql = 'SELECT SUM(amount) as total FROM income_sources WHERE year = ? AND month = ?';
      
      db.get(sql, [year, month], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        // Return the sum of all income sources, or null if no sources exist
        resolve(row && row.total !== null ? row.total : null);
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
   * Get tax-deductible expenses for a specific year
   * @param {number} year - Year
   * @returns {Promise<Array>} Array of tax-deductible expense objects
   */
  async getTaxDeductibleExpenses(year) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, date, place, amount, notes, type, method, week
        FROM expenses
        WHERE strftime('%Y', date) = ?
          AND type IN ('Tax - Medical', 'Tax - Donation')
        ORDER BY date ASC
      `;
      
      const params = [year.toString()];
      
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
   * Get distinct place names from expenses
   * @returns {Promise<Array<string>>} Array of unique place names
   */
  async getDistinctPlaces() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT DISTINCT place 
        FROM expenses 
        WHERE place IS NOT NULL AND place != '' 
        ORDER BY place ASC
      `;
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map(row => row.place));
      });
    });
  }

  /**
   * Get category frequency for a specific place
   * @param {string} place - The place name (case-insensitive match)
   * @returns {Promise<Array<{category: string, count: number, last_used: string}>>}
   */
  async getCategoryFrequencyByPlace(place) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      if (!place || place.trim() === '') {
        resolve([]);
        return;
      }

      const sql = `
        SELECT type as category, COUNT(*) as count, MAX(date) as last_used
        FROM expenses
        WHERE LOWER(place) = LOWER(?)
        GROUP BY type
        ORDER BY count DESC, last_used DESC
      `;
      
      db.all(sql, [place.trim()], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Get suggested category for a place based on historical data
   * @param {string} place - Place name
   * @returns {Promise<Object|null>} Object with suggested category and confidence, or null
   */
  async getSuggestedCategory(place) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      if (!place || place.trim() === '') {
        resolve(null);
        return;
      }

      const sql = `
        SELECT type, COUNT(*) as count
        FROM expenses
        WHERE LOWER(place) = LOWER(?)
        GROUP BY type
        ORDER BY count DESC
        LIMIT 1
      `;
      
      db.get(sql, [place.trim()], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!row) {
          resolve(null);
          return;
        }
        
        // Get total count for this place to calculate confidence
        const totalSql = `
          SELECT COUNT(*) as total
          FROM expenses
          WHERE LOWER(place) = LOWER(?)
        `;
        
        db.get(totalSql, [place.trim()], (err, totalRow) => {
          if (err) {
            reject(err);
            return;
          }
          
          const confidence = totalRow.total > 0 
            ? Math.round((row.count / totalRow.total) * 100) 
            : 0;
          
          resolve({
            category: row.type,
            confidence: confidence,
            count: row.count,
            total: totalRow.total
          });
        });
      });
    });
  }

  /**
   * Get merchant analytics data with aggregated spending information
   * @param {Object} filters - Date filters { period, startDate, endDate }
   * @returns {Promise<Array>} Array of merchant analytics objects
   */
  async getMerchantAnalytics(filters = {}) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          place as name,
          SUM(amount) as totalSpend,
          COUNT(DISTINCT date) as visitCount,
          SUM(amount) / COUNT(DISTINCT date) as averageSpend,
          MIN(date) as firstVisit,
          MAX(date) as lastVisit
        FROM expenses
        WHERE place IS NOT NULL AND place != ''
      `;
      
      const params = [];
      
      // Add date filtering based on filters
      if (filters.startDate && filters.endDate) {
        sql += ' AND date >= ? AND date <= ?';
        params.push(filters.startDate, filters.endDate);
      } else if (filters.startDate) {
        sql += ' AND date >= ?';
        params.push(filters.startDate);
      } else if (filters.endDate) {
        sql += ' AND date <= ?';
        params.push(filters.endDate);
      }
      
      sql += `
        GROUP BY place
        ORDER BY totalSpend DESC
      `;
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Process results to calculate additional fields
        const results = rows.map(row => ({
          name: row.name,
          totalSpend: parseFloat(row.totalSpend.toFixed(2)),
          visitCount: row.visitCount,
          averageSpend: parseFloat(row.averageSpend.toFixed(2)),
          firstVisit: row.firstVisit,
          lastVisit: row.lastVisit
        }));
        
        resolve(results);
      });
    });
  }

  /**
   * Get all expenses for a specific merchant with optional date filtering
   * @param {string} merchantName - The merchant/place name
   * @param {Object} filters - Date filters { period, startDate, endDate }
   * @returns {Promise<Array>} Array of expense objects
   */
  async getMerchantExpenses(merchantName, filters = {}) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT id, date, place, notes, amount, type, method, week
        FROM expenses
        WHERE LOWER(place) = LOWER(?)
      `;
      
      const params = [merchantName];
      
      // Add date filtering based on filters
      if (filters.startDate && filters.endDate) {
        sql += ' AND date >= ? AND date <= ?';
        params.push(filters.startDate, filters.endDate);
      } else if (filters.startDate) {
        sql += ' AND date >= ?';
        params.push(filters.startDate);
      } else if (filters.endDate) {
        sql += ' AND date <= ?';
        params.push(filters.endDate);
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
   * Get monthly trend data for a specific merchant
   * @param {string} merchantName - The merchant/place name
   * @param {number} months - Number of months to include (default 12)
   * @returns {Promise<Array>} Array of monthly trend objects
   */
  async getMerchantTrend(merchantName, months = 12) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          strftime('%Y', date) as year,
          strftime('%m', date) as month,
          SUM(amount) as amount,
          COUNT(*) as visitCount
        FROM expenses
        WHERE LOWER(place) = LOWER(?)
          AND date >= date('now', '-${months} months')
        GROUP BY strftime('%Y-%m', date)
        ORDER BY year, month
      `;
      
      db.all(sql, [merchantName], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Process results to include month names and format data
        const results = rows.map(row => {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const monthIndex = parseInt(row.month) - 1;
          
          return {
            year: parseInt(row.year),
            month: parseInt(row.month),
            monthName: `${monthNames[monthIndex]} ${row.year}`,
            amount: parseFloat(row.amount.toFixed(2)),
            visitCount: row.visitCount
          };
        });
        
        resolve(results);
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
      
      // Query for type totals (all categories)
      const typeSQL = `
        SELECT type, SUM(amount) as total
        FROM expenses
        WHERE strftime("%Y", date) = ? AND strftime("%m", date) = ?
        GROUP BY type
      `;
      
      // Query for overall total
      const totalSQL = `
        SELECT SUM(amount) as total
        FROM expenses
        WHERE strftime("%Y", date) = ? AND strftime("%m", date) = ?
      `;
      
      // Initialize typeTotals with all categories set to 0
      const typeTotals = {};
      CATEGORIES.forEach(category => {
        typeTotals[category] = 0;
      });
      
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
          'Cheque': 0,
          'CIBC MC': 0,
          'PCF MC': 0,
          'WS VISA': 0,
          'VISA': 0
        },
        typeTotals: typeTotals,
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

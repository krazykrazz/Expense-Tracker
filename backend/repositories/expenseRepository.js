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
   * Supports multiple invoices per expense with invoice count and details
   * @param {number} year - Year
   * @returns {Promise<Array>} Array of tax-deductible expense objects with invoice information
   */
  async getTaxDeductibleExpenses(year) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // First, get all expenses with invoice counts
      const expenseSql = `
        SELECT 
          e.id, e.date, e.place, e.amount, e.notes, e.type, e.method, e.week,
          (SELECT COUNT(*) FROM expense_invoices WHERE expense_id = e.id) as invoice_count
        FROM expenses e
        WHERE strftime('%Y', e.date) = ?
          AND e.type IN ('Tax - Medical', 'Tax - Donation')
        ORDER BY e.date ASC
      `;
      
      const params = [year.toString()];
      
      db.all(expenseSql, params, async (err, expenseRows) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!expenseRows || expenseRows.length === 0) {
          resolve([]);
          return;
        }
        
        // Get all invoices for these expenses in a single query
        const expenseIds = expenseRows.map(e => e.id);
        const placeholders = expenseIds.map(() => '?').join(',');
        
        const invoiceSql = `
          SELECT 
            ei.id, ei.expense_id, ei.person_id, ei.filename, ei.original_filename,
            ei.file_path, ei.file_size, ei.mime_type, ei.upload_date,
            p.name as person_name
          FROM expense_invoices ei
          LEFT JOIN people p ON ei.person_id = p.id
          WHERE ei.expense_id IN (${placeholders})
          ORDER BY ei.expense_id, ei.upload_date ASC
        `;
        
        db.all(invoiceSql, expenseIds, (invoiceErr, invoiceRows) => {
          if (invoiceErr) {
            reject(invoiceErr);
            return;
          }
          
          // Group invoices by expense_id
          const invoicesByExpense = {};
          (invoiceRows || []).forEach(inv => {
            if (!invoicesByExpense[inv.expense_id]) {
              invoicesByExpense[inv.expense_id] = [];
            }
            invoicesByExpense[inv.expense_id].push({
              id: inv.id,
              expenseId: inv.expense_id,
              personId: inv.person_id,
              personName: inv.person_name,
              filename: inv.filename,
              originalFilename: inv.original_filename,
              filePath: inv.file_path,
              fileSize: inv.file_size,
              mimeType: inv.mime_type,
              uploadDate: inv.upload_date
            });
          });
          
          // Transform the results to include invoice information
          const expenses = expenseRows.map(row => {
            const invoices = invoicesByExpense[row.id] || [];
            const expense = {
              id: row.id,
              date: row.date,
              place: row.place,
              amount: row.amount,
              notes: row.notes,
              type: row.type,
              method: row.method,
              week: row.week,
              hasInvoice: invoices.length > 0,
              invoiceCount: invoices.length,
              invoices: invoices
            };
            
            // For backward compatibility, also include first invoice as 'invoice'
            if (invoices.length > 0) {
              expense.invoice = invoices[0];
            }
            
            return expense;
          });
          
          resolve(expenses);
        });
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
   * @param {boolean} includeFixedExpenses - Whether to include fixed expenses in analysis
   * @returns {Promise<Array>} Array of merchant analytics objects
   */
  async getMerchantAnalytics(filters = {}, includeFixedExpenses = false) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      if (!includeFixedExpenses) {
        // Original logic for expenses only
        let sql = `
          SELECT 
            place as name,
            SUM(amount) as totalSpend,
            COUNT(DISTINCT date) as visitCount,
            SUM(amount) / COUNT(DISTINCT date) as averageSpend,
            MIN(date) as firstVisit,
            MAX(date) as lastVisit
          FROM expenses
          WHERE place IS NOT NULL AND place != '' AND TRIM(place) != ''
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
      } else {
        // Combined logic for expenses + fixed expenses
        this.getCombinedMerchantAnalytics(filters).then(resolve).catch(reject);
      }
    });
  }

  /**
   * Get combined merchant analytics (expenses + fixed expenses)
   * @param {Object} filters - Date filters
   * @returns {Promise<Array>} Array of combined merchant analytics
   */
  async getCombinedMerchantAnalytics(filters = {}) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // First get expenses data
      let expensesSql = `
        SELECT 
          place as name,
          SUM(amount) as totalSpend,
          COUNT(DISTINCT date) as visitCount,
          MIN(date) as firstVisit,
          MAX(date) as lastVisit
        FROM expenses
        WHERE place IS NOT NULL AND place != '' AND TRIM(place) != ''
      `;
      
      const expensesParams = [];
      
      // Add date filtering for expenses
      if (filters.startDate && filters.endDate) {
        expensesSql += ' AND date >= ? AND date <= ?';
        expensesParams.push(filters.startDate, filters.endDate);
      } else if (filters.startDate) {
        expensesSql += ' AND date >= ?';
        expensesParams.push(filters.startDate);
      } else if (filters.endDate) {
        expensesSql += ' AND date <= ?';
        expensesParams.push(filters.endDate);
      }
      
      expensesSql += ' GROUP BY place';
      
      // Then get fixed expenses data
      let fixedSql = `
        SELECT 
          name,
          SUM(amount) as totalSpend,
          COUNT(*) as visitCount,
          MIN(year || '-' || printf('%02d', month) || '-01') as firstVisit,
          MAX(year || '-' || printf('%02d', month) || '-01') as lastVisit
        FROM fixed_expenses
        WHERE name IS NOT NULL AND name != '' AND TRIM(name) != ''
      `;
      
      const fixedParams = [];
      
      // Add date filtering for fixed expenses
      if (filters.startDate && filters.endDate) {
        const startYear = new Date(filters.startDate).getFullYear();
        const startMonth = new Date(filters.startDate).getMonth() + 1;
        const endYear = new Date(filters.endDate).getFullYear();
        const endMonth = new Date(filters.endDate).getMonth() + 1;
        
        fixedSql += ` AND ((year > ? OR (year = ? AND month >= ?)) AND (year < ? OR (year = ? AND month <= ?)))`;
        fixedParams.push(startYear, startYear, startMonth, endYear, endYear, endMonth);
      } else if (filters.startDate) {
        const startYear = new Date(filters.startDate).getFullYear();
        const startMonth = new Date(filters.startDate).getMonth() + 1;
        fixedSql += ` AND (year > ? OR (year = ? AND month >= ?))`;
        fixedParams.push(startYear, startYear, startMonth);
      } else if (filters.endDate) {
        const endYear = new Date(filters.endDate).getFullYear();
        const endMonth = new Date(filters.endDate).getMonth() + 1;
        fixedSql += ` AND (year < ? OR (year = ? AND month <= ?))`;
        fixedParams.push(endYear, endYear, endMonth);
      }
      
      fixedSql += ' GROUP BY name';
      
      // Execute both queries
      db.all(expensesSql, expensesParams, (err, expensesRows) => {
        if (err) {
          reject(err);
          return;
        }
        
        db.all(fixedSql, fixedParams, (err, fixedRows) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Combine the results
          const merchantMap = new Map();
          
          // Add expenses data
          expensesRows.forEach(row => {
            const name = row.name.toLowerCase();
            merchantMap.set(name, {
              name: row.name,
              totalSpend: parseFloat(row.totalSpend),
              visitCount: row.visitCount,
              firstVisit: row.firstVisit,
              lastVisit: row.lastVisit
            });
          });
          
          // Add or merge fixed expenses data
          fixedRows.forEach(row => {
            const name = row.name.toLowerCase();
            if (merchantMap.has(name)) {
              // Merge with existing expense data
              const existing = merchantMap.get(name);
              existing.totalSpend += parseFloat(row.totalSpend);
              existing.visitCount += row.visitCount;
              existing.firstVisit = existing.firstVisit < row.firstVisit ? existing.firstVisit : row.firstVisit;
              existing.lastVisit = existing.lastVisit > row.lastVisit ? existing.lastVisit : row.lastVisit;
            } else {
              // Add as new merchant
              merchantMap.set(name, {
                name: row.name,
                totalSpend: parseFloat(row.totalSpend),
                visitCount: row.visitCount,
                firstVisit: row.firstVisit,
                lastVisit: row.lastVisit
              });
            }
          });
          
          // Convert to array and calculate averages
          const results = Array.from(merchantMap.values()).map(merchant => ({
            name: merchant.name,
            totalSpend: parseFloat(merchant.totalSpend.toFixed(2)),
            visitCount: merchant.visitCount,
            averageSpend: parseFloat((merchant.totalSpend / merchant.visitCount).toFixed(2)),
            firstVisit: merchant.firstVisit,
            lastVisit: merchant.lastVisit
          }));
          
          // Sort by total spend descending
          results.sort((a, b) => b.totalSpend - a.totalSpend);
          
          resolve(results);
        });
      });
    });
  }

  /**
   * Get all expenses for a specific merchant with optional date filtering
   * @param {string} merchantName - The merchant/place name
   * @param {Object} filters - Date filters { period, startDate, endDate }
   * @param {boolean} includeFixedExpenses - Whether to include fixed expenses
   * @returns {Promise<Array>} Array of expense objects
   */
  async getMerchantExpenses(merchantName, filters = {}, includeFixedExpenses = false) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT id, date, place, notes, amount, type, method, week, 'expense' as source
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
      
      if (includeFixedExpenses) {
        // Union with fixed expenses
        sql += `
        UNION ALL
        SELECT 
          id, 
          year || '-' || printf('%02d', month) || '-01' as date,
          name as place,
          '' as notes,
          amount,
          category as type,
          payment_type as method,
          1 as week,
          'fixed_expense' as source
        FROM fixed_expenses
        WHERE LOWER(name) = LOWER(?)
        `;
        params.push(merchantName);
        
        // Add date filtering for fixed expenses
        if (filters.startDate && filters.endDate) {
          const startYear = new Date(filters.startDate).getFullYear();
          const startMonth = new Date(filters.startDate).getMonth() + 1;
          const endYear = new Date(filters.endDate).getFullYear();
          const endMonth = new Date(filters.endDate).getMonth() + 1;
          
          sql += ` AND ((year > ? OR (year = ? AND month >= ?)) AND (year < ? OR (year = ? AND month <= ?)))`;
          params.push(startYear, startYear, startMonth, endYear, endYear, endMonth);
        } else if (filters.startDate) {
          const startYear = new Date(filters.startDate).getFullYear();
          const startMonth = new Date(filters.startDate).getMonth() + 1;
          sql += ` AND (year > ? OR (year = ? AND month >= ?))`;
          params.push(startYear, startYear, startMonth);
        } else if (filters.endDate) {
          const endYear = new Date(filters.endDate).getFullYear();
          const endMonth = new Date(filters.endDate).getMonth() + 1;
          sql += ` AND (year < ? OR (year = ? AND month <= ?))`;
          params.push(endYear, endYear, endMonth);
        }
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
   * @param {boolean} includeFixedExpenses - Whether to include fixed expenses
   * @returns {Promise<Array>} Array of monthly trend objects
   */
  async getMerchantTrend(merchantName, months = 12, includeFixedExpenses = false) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          strftime('%Y', date) as year,
          strftime('%m', date) as month,
          SUM(amount) as amount,
          COUNT(*) as visitCount
        FROM expenses
        WHERE LOWER(place) = LOWER(?)
          AND date >= date('now', '-${months} months')
        GROUP BY strftime('%Y-%m', date)
      `;
      
      const params = [merchantName];
      
      if (includeFixedExpenses) {
        // Union with fixed expenses
        sql += `
        UNION ALL
        SELECT 
          CAST(year as TEXT) as year,
          printf('%02d', month) as month,
          SUM(amount) as amount,
          COUNT(*) as visitCount
        FROM fixed_expenses
        WHERE LOWER(name) = LOWER(?)
          AND (year * 12 + month) >= (strftime('%Y', 'now') * 12 + strftime('%m', 'now') - ${months})
        GROUP BY year, month
        `;
        params.push(merchantName);
        
        // Wrap in outer query to combine results by month
        sql = `
          SELECT 
            year,
            month,
            SUM(amount) as amount,
            SUM(visitCount) as visitCount
          FROM (${sql}) combined
          GROUP BY year, month
          ORDER BY year, month
        `;
      } else {
        sql += ' ORDER BY year, month';
      }
      
      db.all(sql, params, (err, rows) => {
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

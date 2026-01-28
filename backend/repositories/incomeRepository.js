const { getDatabase } = require('../database/db');

class IncomeRepository {
  /**
   * Get all income sources for a specific month (now includes category)
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of income source objects with category
   */
  async getIncomeSources(year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, year, month, name, amount, category, created_at, updated_at
        FROM income_sources
        WHERE year = ? AND month = ?
        ORDER BY category ASC, created_at ASC
      `;
      
      db.all(sql, [year, month], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Get total monthly gross (sum of all sources)
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<number>} Total gross amount
   */
  async getTotalMonthlyGross(year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT COALESCE(SUM(amount), 0) as total
        FROM income_sources
        WHERE year = ? AND month = ?
      `;
      
      db.get(sql, [year, month], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row ? parseFloat(row.total.toFixed(2)) : 0);
      });
    });
  }

  /**
   * Get income totals by category for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} Object with category totals
   */
  async getIncomeByCategoryForMonth(year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM income_sources
        WHERE year = ? AND month = ?
        GROUP BY category
      `;
      
      db.all(sql, [year, month], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Convert array to object
        const result = {};
        rows.forEach(row => {
          result[row.category] = parseFloat(row.total.toFixed(2));
        });
        
        resolve(result);
      });
    });
  }

  /**
   * Get income totals by category for entire year
   * @param {number} year - Year
   * @returns {Promise<Object>} Object with category totals and grand total for the year
   */
  async getIncomeByCategoryForYear(year) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM income_sources
        WHERE year = ?
        GROUP BY category
      `;
      
      db.all(sql, [year], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Convert array to object and calculate grand total
        const byCategory = {};
        let grandTotal = 0;
        
        rows.forEach(row => {
          const categoryTotal = parseFloat(row.total.toFixed(2));
          byCategory[row.category] = categoryTotal;
          grandTotal += categoryTotal;
        });
        
        resolve({
          byCategory,
          total: parseFloat(grandTotal.toFixed(2))
        });
      });
    });
  }

  /**
   * Create a new income source (now includes category)
   * @param {Object} incomeSource - { year, month, name, amount, category }
   * @returns {Promise<Object>} Created income source with ID
   */
  async createIncomeSource(incomeSource) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO income_sources (year, month, name, amount, category)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      const params = [
        incomeSource.year,
        incomeSource.month,
        incomeSource.name,
        incomeSource.amount,
        incomeSource.category || 'Other'  // Default to Other if not provided
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Return the created income source with its ID
        resolve({
          id: this.lastID,
          ...incomeSource,
          category: incomeSource.category || 'Other'
        });
      });
    });
  }

  /**
   * Update an income source by ID (now includes category)
   * @param {number} id - Income source ID
   * @param {Object} updates - { name, amount, category }
   * @returns {Promise<Object|null>} Updated income source or null if not found
   */
  async updateIncomeSource(id, updates) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE income_sources
        SET name = ?, amount = ?, category = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        updates.name,
        updates.amount,
        updates.category,
        id
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null); // No rows updated, income source not found
          return;
        }
        
        // Fetch and return the updated income source
        db.get('SELECT * FROM income_sources WHERE id = ?', [id], (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        });
      });
    });
  }

  /**
   * Delete an income source by ID
   * @param {number} id - Income source ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteIncomeSource(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM income_sources WHERE id = ?';
      
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
   * Copy income sources from previous month to current month (preserves categories)
   * @param {number} year - Target year
   * @param {number} month - Target month (1-12)
   * @returns {Promise<Array>} Array of created income sources
   */
  async copyFromPreviousMonth(year, month) {
    const db = await getDatabase();
    
    // Calculate previous month
    let prevYear = year;
    let prevMonth = month - 1;
    
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    
    return new Promise((resolve, reject) => {
      // First, get income sources from previous month
      const selectSql = `
        SELECT name, amount, category
        FROM income_sources
        WHERE year = ? AND month = ?
        ORDER BY created_at ASC
      `;
      
      db.all(selectSql, [prevYear, prevMonth], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!rows || rows.length === 0) {
          resolve([]);
          return;
        }
        
        // Insert each source into the target month
        const insertSql = `
          INSERT INTO income_sources (year, month, name, amount, category)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        const createdSources = [];
        let completed = 0;
        
        rows.forEach((row) => {
          db.run(insertSql, [year, month, row.name, row.amount, row.category], function(err) {
            if (err) {
              reject(err);
              return;
            }
            
            createdSources.push({
              id: this.lastID,
              year,
              month,
              name: row.name,
              amount: row.amount,
              category: row.category
            });
            
            completed++;
            if (completed === rows.length) {
              resolve(createdSources);
            }
          });
        });
      });
    });
  }
}

module.exports = new IncomeRepository();

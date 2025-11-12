const { getDatabase } = require('../database/db');

class IncomeRepository {
  /**
   * Get all income sources for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of income source objects
   */
  async getIncomeSources(year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, year, month, name, amount, created_at, updated_at
        FROM income_sources
        WHERE year = ? AND month = ?
        ORDER BY created_at ASC
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
   * Create a new income source
   * @param {Object} incomeSource - { year, month, name, amount }
   * @returns {Promise<Object>} Created income source with ID
   */
  async createIncomeSource(incomeSource) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO income_sources (year, month, name, amount)
        VALUES (?, ?, ?, ?)
      `;
      
      const params = [
        incomeSource.year,
        incomeSource.month,
        incomeSource.name,
        incomeSource.amount
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Return the created income source with its ID
        resolve({
          id: this.lastID,
          ...incomeSource
        });
      });
    });
  }

  /**
   * Update an income source by ID
   * @param {number} id - Income source ID
   * @param {Object} updates - { name, amount }
   * @returns {Promise<Object|null>} Updated income source or null if not found
   */
  async updateIncomeSource(id, updates) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE income_sources
        SET name = ?, amount = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        updates.name,
        updates.amount,
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
   * Copy income sources from previous month to current month
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
        SELECT name, amount
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
          INSERT INTO income_sources (year, month, name, amount)
          VALUES (?, ?, ?, ?)
        `;
        
        const createdSources = [];
        let completed = 0;
        
        rows.forEach((row) => {
          db.run(insertSql, [year, month, row.name, row.amount], function(err) {
            if (err) {
              reject(err);
              return;
            }
            
            createdSources.push({
              id: this.lastID,
              year,
              month,
              name: row.name,
              amount: row.amount
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

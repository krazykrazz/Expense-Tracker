const { getDatabase } = require('../database/db');

class BudgetRepository {
  /**
   * Create a new budget
   * @param {Object} budget - { year, month, category, limit }
   * @returns {Promise<Object>} Created budget with ID
   */
  async create(budget) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO budgets (year, month, category, "limit")
        VALUES (?, ?, ?, ?)
      `;
      
      const params = [
        budget.year,
        budget.month,
        budget.category,
        budget.limit
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Return the created budget with its ID
        resolve({
          id: this.lastID,
          ...budget,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
    });
  }

  /**
   * Find a budget by ID
   * @param {number} id - Budget ID
   * @returns {Promise<Object|null>} Budget object or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM budgets WHERE id = ?';
      
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
   * Get all budgets for a specific year/month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of budget objects
   */
  async findByYearMonth(year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, year, month, category, "limit", created_at, updated_at
        FROM budgets
        WHERE year = ? AND month = ?
        ORDER BY category ASC
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
   * Update a budget limit by ID
   * @param {number} id - Budget ID
   * @param {number} limit - New limit amount
   * @returns {Promise<Object|null>} Updated budget or null if not found
   */
  async updateLimit(id, limit) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE budgets
        SET "limit" = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      db.run(sql, [limit, id], function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null); // No rows updated, budget not found
          return;
        }
        
        // Fetch and return the updated budget
        db.get('SELECT * FROM budgets WHERE id = ?', [id], (err, row) => {
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
   * Delete a budget by ID
   * @param {number} id - Budget ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM budgets WHERE id = ?';
      
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
   * Get budgets for copy operation (source month)
   * @param {number} year - Source year
   * @param {number} month - Source month (1-12)
   * @returns {Promise<Array>} Array of budget objects from source month
   */
  async findForCopy(year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT category, "limit"
        FROM budgets
        WHERE year = ? AND month = ?
        ORDER BY category ASC
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
}

module.exports = new BudgetRepository();

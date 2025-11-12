const { getDatabase } = require('../database/db');

class FixedExpenseRepository {
  /**
   * Get all fixed expense items for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of fixed expense objects
   */
  async getFixedExpenses(year, month) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, year, month, name, amount, created_at, updated_at
        FROM fixed_expenses
        WHERE year = ? AND month = ?
        ORDER BY name ASC
      `;
      db.all(sql, [year, month], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get total fixed expenses (sum of all items)
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<number>} Total fixed expenses amount
   */
  async getTotalFixedExpenses(year, month) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT COALESCE(SUM(amount), 0) as total
        FROM fixed_expenses
        WHERE year = ? AND month = ?
      `;
      db.get(sql, [year, month], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.total);
        }
      });
    });
  }

  /**
   * Create a new fixed expense item
   * @param {Object} fixedExpense - { year, month, name, amount }
   * @returns {Promise<Object>} Created fixed expense with ID
   */
  async createFixedExpense(fixedExpense) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO fixed_expenses (year, month, name, amount)
        VALUES (?, ?, ?, ?)
      `;
      const params = [
        fixedExpense.year,
        fixedExpense.month,
        fixedExpense.name,
        fixedExpense.amount
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          // Return the created fixed expense with the new ID
          resolve({
            id: this.lastID,
            ...fixedExpense,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      });
    });
  }

  /**
   * Update a fixed expense item by ID
   * @param {number} id - Fixed expense ID
   * @param {Object} updates - { name, amount }
   * @returns {Promise<Object|null>} Updated fixed expense or null
   */
  async updateFixedExpense(id, updates) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE fixed_expenses
        SET name = ?, amount = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      const params = [updates.name, updates.amount, id];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else if (this.changes === 0) {
          resolve(null);
        } else {
          // Fetch and return the updated record
          db.get('SELECT * FROM fixed_expenses WHERE id = ?', [id], (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(row);
            }
          });
        }
      });
    });
  }

  /**
   * Delete a fixed expense item by ID
   * @param {number} id - Fixed expense ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteFixedExpense(id) {
    const db = await getDatabase();
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM fixed_expenses WHERE id = ?';
      db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  /**
   * Copy all fixed expenses from one month to another
   * @param {number} fromYear - Source year
   * @param {number} fromMonth - Source month (1-12)
   * @param {number} toYear - Target year
   * @param {number} toMonth - Target month (1-12)
   * @returns {Promise<Array>} Array of created fixed expense objects
   */
  async copyFixedExpenses(fromYear, fromMonth, toYear, toMonth) {
    const db = await getDatabase();
    
    // First, get all fixed expenses from the source month
    const sourceExpenses = await this.getFixedExpenses(fromYear, fromMonth);
    
    if (sourceExpenses.length === 0) {
      return [];
    }
    
    // Create new fixed expenses for the target month
    const createdExpenses = [];
    
    for (const expense of sourceExpenses) {
      const newExpense = await this.createFixedExpense({
        year: toYear,
        month: toMonth,
        name: expense.name,
        amount: expense.amount
      });
      createdExpenses.push(newExpense);
    }
    
    return createdExpenses;
  }
}

module.exports = new FixedExpenseRepository();

const { getDatabase } = require('../database/db');

class RecurringExpenseRepository {
  /**
   * Create a new recurring expense template
   * @param {Object} template - Recurring expense template data
   * @returns {Promise<Object>} Created template with ID
   */
  async create(template) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO recurring_expenses (place, amount, notes, type, method, day_of_month, start_month, end_month, paused)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        template.place,
        template.amount,
        template.notes || null,
        template.type,
        template.method,
        template.day_of_month,
        template.start_month,
        template.end_month || null,
        template.paused || 0
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Return the created template with its ID
        resolve({
          id: this.lastID,
          ...template,
          paused: template.paused || 0
        });
      });
    });
  }

  /**
   * Find all recurring expense templates
   * @returns {Promise<Array>} Array of recurring templates
   */
  async findAll() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM recurring_expenses ORDER BY start_month ASC, day_of_month ASC';
      
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
   * Find a single recurring expense template by ID
   * @param {number} id - Template ID
   * @returns {Promise<Object|null>} Template object or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM recurring_expenses WHERE id = ?';
      
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
   * Find active recurring templates for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of active templates for the month
   */
  async findActive(year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const currentMonth = `${year}-${month.toString().padStart(2, '0')}`;
      
      const sql = `
        SELECT * FROM recurring_expenses
        WHERE start_month <= ?
        AND (end_month IS NULL OR end_month >= ?)
        AND paused = 0
        ORDER BY day_of_month ASC
      `;
      
      db.all(sql, [currentMonth, currentMonth], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Update a recurring expense template by ID
   * @param {number} id - Template ID
   * @param {Object} template - Updated template data
   * @returns {Promise<Object|null>} Updated template or null if not found
   */
  async update(id, template) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE recurring_expenses 
        SET place = ?, amount = ?, notes = ?, type = ?, method = ?, 
            day_of_month = ?, start_month = ?, end_month = ?, paused = ?
        WHERE id = ?
      `;
      
      const params = [
        template.place,
        template.amount,
        template.notes || null,
        template.type,
        template.method,
        template.day_of_month,
        template.start_month,
        template.end_month || null,
        template.paused !== undefined ? template.paused : 0,
        id
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null); // No rows updated, template not found
          return;
        }
        
        // Return the updated template
        resolve({
          id: id,
          ...template
        });
      });
    });
  }

  /**
   * Delete a recurring expense template by ID
   * @param {number} id - Template ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM recurring_expenses WHERE id = ?';
      
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
   * Toggle pause status on a recurring expense template
   * @param {number} id - Template ID
   * @param {boolean} paused - Pause status (true/false or 1/0)
   * @returns {Promise<Object|null>} Updated template or null if not found
   */
  async togglePause(id, paused) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const pausedValue = paused ? 1 : 0;
      const sql = 'UPDATE recurring_expenses SET paused = ? WHERE id = ?';
      
      db.run(sql, [pausedValue, id], function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null);
          return;
        }
        
        // Return the updated template
        db.get('SELECT * FROM recurring_expenses WHERE id = ?', [id], (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        });
      });
    });
  }
}

module.exports = new RecurringExpenseRepository();

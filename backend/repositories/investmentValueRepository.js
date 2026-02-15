const { getDatabase } = require('../database/db');

class InvestmentValueRepository {
  /**
   * Find a value entry by ID
   * @param {number} id - Value entry ID
   * @returns {Promise<Object|null>} Value entry or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM investment_values WHERE id = ?';
      
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
   * Create a new value entry
   * @param {Object} valueEntry - Value entry data { investment_id, year, month, value }
   * @returns {Promise<Object>} Created value entry with ID
   */
  async create(valueEntry) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO investment_values (investment_id, year, month, value)
        VALUES (?, ?, ?, ?)
      `;
      
      const params = [
        valueEntry.investment_id,
        valueEntry.year,
        valueEntry.month,
        valueEntry.value
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Return the created value entry with its ID
        resolve({
          id: this.lastID,
          ...valueEntry,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
    });
  }
  /**
   * Find a value entry by ID
   * @param {number} id - Value entry ID
   * @returns {Promise<Object|null>} Value entry or null if not found
   */
  async findById(id) {
    const db = await getDatabase();

    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM investment_values WHERE id = ?';

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
   * Find all value entries for an investment
   * @param {number} investmentId - Investment ID
   * @returns {Promise<Array>} Array of value entry objects
   */
  async findByInvestment(investmentId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM investment_values
        WHERE investment_id = ?
        ORDER BY year DESC, month DESC
      `;
      
      db.all(sql, [investmentId], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Find a specific value entry by investment and month
   * @param {number} investmentId - Investment ID
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object|null>} Value entry object or null if not found
   */
  async findByInvestmentAndMonth(investmentId, year, month) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM investment_values
        WHERE investment_id = ? AND year = ? AND month = ?
      `;
      
      db.get(sql, [investmentId, year, month], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  }

  /**
   * Update a value entry by ID
   * @param {number} id - Value entry ID
   * @param {Object} valueEntry - Updated value entry data { value }
   * @returns {Promise<Object|null>} Updated value entry or null if not found
   */
  async update(id, valueEntry) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE investment_values 
        SET value = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [valueEntry.value, id];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null); // No rows updated, value entry not found
          return;
        }
        
        // Fetch and return the updated value entry
        db.get('SELECT * FROM investment_values WHERE id = ?', [id], (err, row) => {
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
   * Delete a value entry by ID
   * @param {number} id - Value entry ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM investment_values WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  /**
   * Create or update a value entry (upsert)
   * @param {Object} valueEntry - Value entry data { investment_id, year, month, value }
   * @returns {Promise<Object>} Created or updated value entry
   */
  async upsert(valueEntry) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // First, try to find existing entry
      const findSql = `
        SELECT * FROM investment_values
        WHERE investment_id = ? AND year = ? AND month = ?
      `;
      
      db.get(findSql, [valueEntry.investment_id, valueEntry.year, valueEntry.month], (err, existing) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (existing) {
          // Update existing entry
          const updateSql = `
            UPDATE investment_values 
            SET value = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          
          db.run(updateSql, [valueEntry.value, existing.id], function(err) {
            if (err) {
              reject(err);
              return;
            }
            
            // Fetch and return the updated entry
            db.get('SELECT * FROM investment_values WHERE id = ?', [existing.id], (err, row) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(row);
            });
          });
        } else {
          // Create new entry
          const insertSql = `
            INSERT INTO investment_values (investment_id, year, month, value)
            VALUES (?, ?, ?, ?)
          `;
          
          db.run(insertSql, [valueEntry.investment_id, valueEntry.year, valueEntry.month, valueEntry.value], function(err) {
            if (err) {
              reject(err);
              return;
            }
            
            // Return the created entry
            resolve({
              id: this.lastID,
              ...valueEntry,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          });
        }
      });
    });
  }

  /**
   * Get value history for an investment with chronological sorting
   * @param {number} investmentId - Investment ID
   * @returns {Promise<Array>} Array of value entries sorted chronologically (most recent first)
   */
  async getValueHistory(investmentId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM investment_values
        WHERE investment_id = ?
        ORDER BY year DESC, month DESC
      `;
      
      db.all(sql, [investmentId], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }
}

module.exports = new InvestmentValueRepository();

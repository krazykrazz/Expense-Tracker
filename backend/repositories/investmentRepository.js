const { getDatabase } = require('../database/db');

class InvestmentRepository {
  /**
   * Create a new investment
   * @param {Object} investment - Investment data { name, type, initial_value }
   * @returns {Promise<Object>} Created investment with ID
   */
  async create(investment) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO investments (name, type, initial_value)
        VALUES (?, ?, ?)
      `;
      
      const params = [
        investment.name,
        investment.type,
        investment.initial_value
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Return the created investment with its ID
        resolve({
          id: this.lastID,
          ...investment,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
    });
  }

  /**
   * Find all investments
   * @returns {Promise<Array>} Array of investment objects
   */
  async findAll() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM investments ORDER BY name ASC';
      
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
   * Find a single investment by ID
   * @param {number} id - Investment ID
   * @returns {Promise<Object|null>} Investment object or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM investments WHERE id = ?';
      
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
   * Update an investment by ID
   * @param {number} id - Investment ID
   * @param {Object} investment - Updated investment data { name, type } (initial_value cannot be updated)
   * @returns {Promise<Object|null>} Updated investment or null if not found
   */
  async update(id, investment) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE investments 
        SET name = ?, type = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        investment.name,
        investment.type,
        id
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null); // No rows updated, investment not found
          return;
        }
        
        // Fetch and return the updated investment
        db.get('SELECT * FROM investments WHERE id = ?', [id], (err, row) => {
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
   * Delete an investment by ID (cascades to value entries)
   * @param {number} id - Investment ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM investments WHERE id = ?';
      
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
   * Get the most recent value entry for an investment
   * @param {number} investmentId - Investment ID
   * @returns {Promise<Object|null>} Most recent value entry or null
   */
  async getCurrentValue(investmentId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM investment_values
        WHERE investment_id = ?
        ORDER BY year DESC, month DESC
        LIMIT 1
      `;
      
      db.get(sql, [investmentId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  }

  /**
   * Get all investments with their current values
   * @returns {Promise<Array>} Array of investments with currentValue field
   */
  async getAllWithCurrentValues() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          i.*,
          COALESCE(
            (SELECT value 
             FROM investment_values 
             WHERE investment_id = i.id 
             ORDER BY year DESC, month DESC 
             LIMIT 1),
            i.initial_value
          ) as currentValue
        FROM investments i
        ORDER BY i.name ASC
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
}

module.exports = new InvestmentRepository();

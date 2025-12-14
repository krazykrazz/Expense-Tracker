const { getDatabase } = require('../database/db');
const logger = require('../config/logger');

class PeopleRepository {
  /**
   * Create a new person
   * @param {Object} person - Person data
   * @param {string} person.name - Person's name (required)
   * @param {string} [person.dateOfBirth] - Person's date of birth (optional)
   * @returns {Promise<Object>} Created person with ID
   */
  async create(person) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO people (name, date_of_birth)
        VALUES (?, ?)
      `;
      
      const params = [
        person.name,
        person.dateOfBirth || null
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('Error creating person:', err);
          reject(err);
          return;
        }
        
        // Return the created person with its ID
        resolve({
          id: this.lastID,
          name: person.name,
          dateOfBirth: person.dateOfBirth || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
    });
  }

  /**
   * Find a person by ID
   * @param {number} id - Person ID
   * @returns {Promise<Object|null>} Person object or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM people WHERE id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          logger.error('Error finding person by ID:', err);
          reject(err);
          return;
        }
        
        if (row) {
          resolve({
            id: row.id,
            name: row.name,
            dateOfBirth: row.date_of_birth,
            createdAt: row.created_at,
            updatedAt: row.updated_at
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Get all people
   * @returns {Promise<Array>} Array of all people
   */
  async findAll() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM people ORDER BY name ASC';
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          logger.error('Error finding all people:', err);
          reject(err);
          return;
        }
        
        const people = rows.map(row => ({
          id: row.id,
          name: row.name,
          dateOfBirth: row.date_of_birth,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
        
        resolve(people);
      });
    });
  }

  /**
   * Update a person by ID
   * @param {number} id - Person ID
   * @param {Object} person - Updated person data
   * @param {string} person.name - Person's name
   * @param {string} [person.dateOfBirth] - Person's date of birth
   * @returns {Promise<Object|null>} Updated person or null if not found
   */
  async update(id, person) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE people 
        SET name = ?, date_of_birth = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      const params = [
        person.name,
        person.dateOfBirth || null,
        id
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('Error updating person:', err);
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          logger.debug('Person not found for update, ID:', id);
          resolve(null); // No rows updated, person not found
          return;
        }
        
        logger.debug('Updated person ID:', id);
        
        // Return the updated person
        resolve({
          id: id,
          name: person.name,
          dateOfBirth: person.dateOfBirth || null,
          updatedAt: new Date().toISOString()
        });
      });
    });
  }

  /**
   * Delete a person by ID (cascades to expense associations)
   * @param {number} id - Person ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM people WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          logger.error('Error deleting person:', err);
          reject(err);
          return;
        }
        
        const deleted = this.changes > 0;
        if (deleted) {
          logger.info('Deleted person ID:', id);
        } else {
          logger.debug('Person not found for deletion, ID:', id);
        }
        
        resolve(deleted);
      });
    });
  }

  /**
   * Check if a person has associated expenses
   * @param {number} id - Person ID
   * @returns {Promise<boolean>} True if person has associated expenses
   */
  async hasAssociatedExpenses(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM expense_people WHERE person_id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          logger.error('Error checking associated expenses:', err);
          reject(err);
          return;
        }
        
        resolve(row.count > 0);
      });
    });
  }

  /**
   * Get count of associated expenses for a person
   * @param {number} id - Person ID
   * @returns {Promise<number>} Number of associated expenses
   */
  async getAssociatedExpenseCount(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM expense_people WHERE person_id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          logger.error('Error getting associated expense count:', err);
          reject(err);
          return;
        }
        
        resolve(row.count);
      });
    });
  }
}

module.exports = new PeopleRepository();
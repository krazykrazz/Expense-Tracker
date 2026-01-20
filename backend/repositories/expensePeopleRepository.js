const { getDatabase } = require('../database/db');
const logger = require('../config/logger');

class ExpensePeopleRepository {
  /**
   * Create expense-person associations with amounts
   * @param {number} expenseId - Expense ID
   * @param {Array} personAllocations - Array of {personId, amount, originalAmount?} objects
   * @returns {Promise<Array>} Created associations
   */
  async createAssociations(expenseId, personAllocations) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // Use a transaction to ensure all associations are created atomically
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const createdAssociations = [];
        let completed = 0;
        let hasError = false;
        
        if (personAllocations.length === 0) {
          db.run('COMMIT');
          resolve([]);
          return;
        }
        
        personAllocations.forEach((allocation) => {
          const sql = `
            INSERT INTO expense_people (expense_id, person_id, amount, original_amount)
            VALUES (?, ?, ?, ?)
          `;
          
          // Use originalAmount if provided, otherwise default to amount
          const originalAmount = allocation.originalAmount !== undefined 
            ? allocation.originalAmount 
            : allocation.amount;
          
          db.run(sql, [expenseId, allocation.personId, allocation.amount, originalAmount], function(err) {
            if (err && !hasError) {
              hasError = true;
              logger.error('Error creating expense-person association:', err);
              db.run('ROLLBACK');
              reject(err);
              return;
            }
            
            if (!hasError) {
              createdAssociations.push({
                id: this.lastID,
                expenseId: expenseId,
                personId: allocation.personId,
                amount: allocation.amount,
                originalAmount: originalAmount
              });
              
              completed++;
              if (completed === personAllocations.length) {
                db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    logger.error('Error committing transaction:', commitErr);
                    reject(commitErr);
                  } else {
                    resolve(createdAssociations);
                  }
                });
              }
            }
          });
        });
      });
    });
  }

  /**
   * Get people associated with an expense
   * @param {number} expenseId - Expense ID
   * @returns {Promise<Array>} Array of people with their allocated amounts (including original_amount)
   */
  async getPeopleForExpense(expenseId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          ep.id as association_id,
          ep.person_id,
          ep.amount,
          ep.original_amount,
          p.name,
          p.date_of_birth,
          p.created_at,
          p.updated_at
        FROM expense_people ep
        JOIN people p ON ep.person_id = p.id
        WHERE ep.expense_id = ?
        ORDER BY p.name ASC
      `;
      
      db.all(sql, [expenseId], (err, rows) => {
        if (err) {
          logger.error('Error getting people for expense:', err);
          reject(err);
          return;
        }
        
        const people = rows.map(row => ({
          associationId: row.association_id,
          personId: row.person_id,
          name: row.name,
          dateOfBirth: row.date_of_birth,
          amount: row.amount,
          originalAmount: row.original_amount,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
        
        resolve(people);
      });
    });
  }

  /**
   * Update person allocations for an expense
   * @param {number} expenseId - Expense ID
   * @param {Array} personAllocations - Array of {personId, amount, originalAmount?} objects
   * @returns {Promise<Array>} Updated associations
   */
  async updateExpenseAllocations(expenseId, personAllocations) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // First, delete existing associations
        db.run('DELETE FROM expense_people WHERE expense_id = ?', [expenseId], (err) => {
          if (err) {
            logger.error('Error deleting existing associations:', err);
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          // Then create new associations
          if (personAllocations.length === 0) {
            db.run('COMMIT');
            resolve([]);
            return;
          }
          
          const createdAssociations = [];
          let completed = 0;
          let hasError = false;
          
          personAllocations.forEach((allocation) => {
            const sql = `
              INSERT INTO expense_people (expense_id, person_id, amount, original_amount)
              VALUES (?, ?, ?, ?)
            `;
            
            // Use originalAmount if provided, otherwise default to amount
            const originalAmount = allocation.originalAmount !== undefined 
              ? allocation.originalAmount 
              : allocation.amount;
            
            db.run(sql, [expenseId, allocation.personId, allocation.amount, originalAmount], function(err) {
              if (err && !hasError) {
                hasError = true;
                logger.error('Error creating new association:', err);
                db.run('ROLLBACK');
                reject(err);
                return;
              }
              
              if (!hasError) {
                createdAssociations.push({
                  id: this.lastID,
                  expenseId: expenseId,
                  personId: allocation.personId,
                  amount: allocation.amount,
                  originalAmount: originalAmount
                });
                
                completed++;
                if (completed === personAllocations.length) {
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      logger.error('Error committing update transaction:', commitErr);
                      reject(commitErr);
                    } else {
                      logger.debug('Updated expense-person associations for expense:', expenseId);
                      resolve(createdAssociations);
                    }
                  });
                }
              }
            });
          });
        });
      });
    });
  }

  /**
   * Delete associations by expense ID
   * @param {number} expenseId - Expense ID
   * @returns {Promise<number>} Number of deleted associations
   */
  async deleteByExpenseId(expenseId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM expense_people WHERE expense_id = ?';
      
      db.run(sql, [expenseId], function(err) {
        if (err) {
          logger.error('Error deleting associations by expense ID:', err);
          reject(err);
          return;
        }
        
        logger.debug('Deleted associations for expense:', expenseId, 'Count:', this.changes);
        resolve(this.changes);
      });
    });
  }

  /**
   * Delete associations by person ID
   * @param {number} personId - Person ID
   * @returns {Promise<number>} Number of deleted associations
   */
  async deleteByPersonId(personId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM expense_people WHERE person_id = ?';
      
      db.run(sql, [personId], function(err) {
        if (err) {
          logger.error('Error deleting associations by person ID:', err);
          reject(err);
          return;
        }
        
        logger.debug('Deleted associations for person:', personId, 'Count:', this.changes);
        resolve(this.changes);
      });
    });
  }

  /**
   * Get expenses associated with a person
   * @param {number} personId - Person ID
   * @returns {Promise<Array>} Array of expenses with allocated amounts
   */
  async getExpensesForPerson(personId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          ep.id as association_id,
          ep.expense_id,
          ep.amount as allocated_amount,
          e.date,
          e.place,
          e.notes,
          e.amount as total_amount,
          e.type,
          e.method
        FROM expense_people ep
        JOIN expenses e ON ep.expense_id = e.id
        WHERE ep.person_id = ?
        ORDER BY e.date DESC
      `;
      
      db.all(sql, [personId], (err, rows) => {
        if (err) {
          logger.error('Error getting expenses for person:', err);
          reject(err);
          return;
        }
        
        const expenses = rows.map(row => ({
          associationId: row.association_id,
          expenseId: row.expense_id,
          allocatedAmount: row.allocated_amount,
          date: row.date,
          place: row.place,
          notes: row.notes,
          totalAmount: row.total_amount,
          type: row.type,
          method: row.method
        }));
        
        resolve(expenses);
      });
    });
  }

  /**
   * Check if an expense has any people associations
   * @param {number} expenseId - Expense ID
   * @returns {Promise<boolean>} True if expense has people associations
   */
  async hasAssociations(expenseId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM expense_people WHERE expense_id = ?';
      
      db.get(sql, [expenseId], (err, row) => {
        if (err) {
          logger.error('Error checking associations:', err);
          reject(err);
          return;
        }
        
        resolve(row.count > 0);
      });
    });
  }

  /**
   * Get total allocated amount for an expense
   * @param {number} expenseId - Expense ID
   * @returns {Promise<number>} Total allocated amount
   */
  async getTotalAllocatedAmount(expenseId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT SUM(amount) as total FROM expense_people WHERE expense_id = ?';
      
      db.get(sql, [expenseId], (err, row) => {
        if (err) {
          logger.error('Error getting total allocated amount:', err);
          reject(err);
          return;
        }
        
        resolve(row.total || 0);
      });
    });
  }

  /**
   * Get people for multiple expenses at once
   * @param {Array<number>} expenseIds - Array of expense IDs
   * @returns {Promise<Object>} Object mapping expense IDs to their people arrays (including original_amount)
   */
  async getPeopleForExpenses(expenseIds) {
    if (!expenseIds || expenseIds.length === 0) {
      return {};
    }

    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const placeholders = expenseIds.map(() => '?').join(',');
      const sql = `
        SELECT 
          ep.expense_id,
          ep.id as association_id,
          ep.person_id,
          ep.amount,
          ep.original_amount,
          p.name,
          p.date_of_birth
        FROM expense_people ep
        JOIN people p ON ep.person_id = p.id
        WHERE ep.expense_id IN (${placeholders})
        ORDER BY ep.expense_id, p.name ASC
      `;
      
      db.all(sql, expenseIds, (err, rows) => {
        if (err) {
          logger.error('Error getting people for expenses:', err);
          reject(err);
          return;
        }
        
        // Group by expense ID
        const result = {};
        rows.forEach(row => {
          if (!result[row.expense_id]) {
            result[row.expense_id] = [];
          }
          result[row.expense_id].push({
            associationId: row.association_id,
            personId: row.person_id,
            name: row.name,
            dateOfBirth: row.date_of_birth,
            amount: row.amount,
            originalAmount: row.original_amount
          });
        });
        
        resolve(result);
      });
    });
  }
}

module.exports = new ExpensePeopleRepository();
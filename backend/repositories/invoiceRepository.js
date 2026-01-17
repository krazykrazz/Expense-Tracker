const { getDatabase } = require('../database/db');
const logger = require('../config/logger');

/**
 * Repository for managing invoice metadata in the database
 * Handles CRUD operations for the expense_invoices table
 * Supports multiple invoices per expense with optional person linking
 */
class InvoiceRepository {
  /**
   * Create a new invoice record
   * @param {Object} invoiceData - Invoice metadata including optional personId
   * @returns {Promise<Object>} Created invoice with ID
   */
  async create(invoiceData) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO expense_invoices (
          expense_id, person_id, filename, original_filename, file_path, 
          file_size, mime_type, upload_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const uploadDate = invoiceData.uploadDate || new Date().toISOString();
      const params = [
        invoiceData.expenseId,
        invoiceData.personId || null,
        invoiceData.filename,
        invoiceData.originalFilename,
        invoiceData.filePath,
        invoiceData.fileSize,
        invoiceData.mimeType || 'application/pdf',
        uploadDate
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to create invoice record:', err);
          reject(err);
          return;
        }
        
        logger.debug('Created invoice record:', { id: this.lastID, expenseId: invoiceData.expenseId, personId: invoiceData.personId });
        
        // Return the created invoice with its ID
        resolve({
          id: this.lastID,
          expenseId: invoiceData.expenseId,
          personId: invoiceData.personId || null,
          filename: invoiceData.filename,
          originalFilename: invoiceData.originalFilename,
          filePath: invoiceData.filePath,
          fileSize: invoiceData.fileSize,
          mimeType: invoiceData.mimeType || 'application/pdf',
          uploadDate: uploadDate
        });
      });
    });
  }

  /**
   * Find invoice by expense ID (returns first invoice for backward compatibility)
   * @param {number} expenseId - Expense ID
   * @returns {Promise<Object|null>} Invoice record or null if not found
   */
  async findByExpenseId(expenseId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT ei.id, ei.expense_id, ei.person_id, ei.filename, ei.original_filename, ei.file_path,
               ei.file_size, ei.mime_type, ei.upload_date, p.name as person_name
        FROM expense_invoices ei
        LEFT JOIN people p ON ei.person_id = p.id
        WHERE ei.expense_id = ?
        ORDER BY ei.upload_date ASC
        LIMIT 1
      `;
      
      db.get(sql, [expenseId], (err, row) => {
        if (err) {
          logger.error('Failed to find invoice by expense ID:', err);
          reject(err);
          return;
        }
        
        if (row) {
          const invoice = {
            id: row.id,
            expenseId: row.expense_id,
            personId: row.person_id,
            personName: row.person_name,
            filename: row.filename,
            originalFilename: row.original_filename,
            filePath: row.file_path,
            fileSize: row.file_size,
            mimeType: row.mime_type,
            uploadDate: row.upload_date
          };
          
          resolve(invoice);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Find all invoices for an expense
   * @param {number} expenseId - Expense ID
   * @returns {Promise<Array>} Array of invoice records ordered by upload_date
   */
  async findAllByExpenseId(expenseId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT ei.id, ei.expense_id, ei.person_id, ei.filename, ei.original_filename, ei.file_path,
               ei.file_size, ei.mime_type, ei.upload_date, p.name as person_name
        FROM expense_invoices ei
        LEFT JOIN people p ON ei.person_id = p.id
        WHERE ei.expense_id = ?
        ORDER BY ei.upload_date ASC
      `;
      
      db.all(sql, [expenseId], (err, rows) => {
        if (err) {
          logger.error('Failed to find all invoices by expense ID:', err);
          reject(err);
          return;
        }
        
        const invoices = rows.map(row => ({
          id: row.id,
          expenseId: row.expense_id,
          personId: row.person_id,
          personName: row.person_name,
          filename: row.filename,
          originalFilename: row.original_filename,
          filePath: row.file_path,
          fileSize: row.file_size,
          mimeType: row.mime_type,
          uploadDate: row.upload_date
        }));
        
        logger.debug('Found invoices for expense:', { expenseId, count: invoices.length });
        resolve(invoices);
      });
    });
  }

  /**
   * Find invoice by ID
   * @param {number} id - Invoice ID
   * @returns {Promise<Object|null>} Invoice record or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT ei.id, ei.expense_id, ei.person_id, ei.filename, ei.original_filename, ei.file_path,
               ei.file_size, ei.mime_type, ei.upload_date, p.name as person_name
        FROM expense_invoices ei
        LEFT JOIN people p ON ei.person_id = p.id
        WHERE ei.id = ?
      `;
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          logger.error('Failed to find invoice by ID:', err);
          reject(err);
          return;
        }
        
        if (row) {
          const invoice = {
            id: row.id,
            expenseId: row.expense_id,
            personId: row.person_id,
            personName: row.person_name,
            filename: row.filename,
            originalFilename: row.original_filename,
            filePath: row.file_path,
            fileSize: row.file_size,
            mimeType: row.mime_type,
            uploadDate: row.upload_date
          };
          
          resolve(invoice);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Update invoice record
   * @param {number} id - Invoice ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated invoice or null if not found
   */
  async update(id, updateData) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      // Build dynamic update query
      const updateFields = [];
      const params = [];
      
      if (updateData.filename !== undefined) {
        updateFields.push('filename = ?');
        params.push(updateData.filename);
      }
      
      if (updateData.originalFilename !== undefined) {
        updateFields.push('original_filename = ?');
        params.push(updateData.originalFilename);
      }
      
      if (updateData.filePath !== undefined) {
        updateFields.push('file_path = ?');
        params.push(updateData.filePath);
      }
      
      if (updateData.fileSize !== undefined) {
        updateFields.push('file_size = ?');
        params.push(updateData.fileSize);
      }
      
      if (updateData.mimeType !== undefined) {
        updateFields.push('mime_type = ?');
        params.push(updateData.mimeType);
      }
      
      // Support updating personId (can be set to null)
      if ('personId' in updateData) {
        updateFields.push('person_id = ?');
        params.push(updateData.personId);
      }
      
      if (updateFields.length === 0) {
        logger.warn('No fields to update for invoice:', id);
        resolve(null);
        return;
      }
      
      params.push(id);
      
      const sql = `
        UPDATE expense_invoices 
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;
      
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to update invoice:', err);
          reject(err);
          return;
        }
        
        if (this.changes === 0) {
          resolve(null);
          return;
        }
        
        logger.debug('Updated invoice:', { id, changes: this.changes });
        
        // Return success indicator
        resolve(true);
      });
    });
  }

  /**
   * Update person association for an invoice
   * @param {number} id - Invoice ID
   * @param {number|null} personId - Person ID or null to unlink
   * @returns {Promise<boolean>} True if updated, false if not found
   */
  async updatePersonId(id, personId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE expense_invoices SET person_id = ? WHERE id = ?';
      
      db.run(sql, [personId, id], function(err) {
        if (err) {
          logger.error('Failed to update invoice person ID:', err);
          reject(err);
          return;
        }
        
        const updated = this.changes > 0;
        logger.debug('Update invoice person ID:', { id, personId, updated });
        resolve(updated);
      });
    });
  }

  /**
   * Delete all invoice records by expense ID
   * @param {number} expenseId - Expense ID
   * @returns {Promise<number>} Number of invoices deleted
   */
  async deleteByExpenseId(expenseId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM expense_invoices WHERE expense_id = ?';
      
      db.run(sql, [expenseId], function(err) {
        if (err) {
          logger.error('Failed to delete invoices by expense ID:', err);
          reject(err);
          return;
        }
        
        logger.debug('Delete invoices by expense ID:', { expenseId, deletedCount: this.changes });
        resolve(this.changes);
      });
    });
  }

  /**
   * Delete invoice record by ID
   * @param {number} id - Invoice ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM expense_invoices WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          logger.error('Failed to delete invoice by ID:', err);
          reject(err);
          return;
        }
        
        const deleted = this.changes > 0;
        logger.debug('Delete invoice by ID:', { id, deleted, changes: this.changes });
        resolve(deleted);
      });
    });
  }

  /**
   * Get invoice count for an expense
   * @param {number} expenseId - Expense ID
   * @returns {Promise<number>} Count of invoices
   */
  async getCountByExpenseId(expenseId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM expense_invoices WHERE expense_id = ?';
      
      db.get(sql, [expenseId], (err, row) => {
        if (err) {
          logger.error('Failed to get invoice count by expense ID:', err);
          reject(err);
          return;
        }
        
        const count = row ? row.count : 0;
        logger.debug('Invoice count for expense:', { expenseId, count });
        resolve(count);
      });
    });
  }

  /**
   * Clear person associations when person is removed from expense
   * @param {number} expenseId - Expense ID
   * @param {number} personId - Person ID being removed
   * @returns {Promise<number>} Number of invoices updated
   */
  async clearPersonIdForExpense(expenseId, personId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE expense_invoices SET person_id = NULL WHERE expense_id = ? AND person_id = ?';
      
      db.run(sql, [expenseId, personId], function(err) {
        if (err) {
          logger.error('Failed to clear person ID for expense invoices:', err);
          reject(err);
          return;
        }
        
        logger.debug('Cleared person ID for expense invoices:', { expenseId, personId, updatedCount: this.changes });
        resolve(this.changes);
      });
    });
  }

  /**
   * Check if expense has an invoice
   * @param {number} expenseId - Expense ID
   * @returns {Promise<boolean>} True if expense has invoice
   */
  async hasInvoice(expenseId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT 1 FROM expense_invoices WHERE expense_id = ? LIMIT 1';
      
      db.get(sql, [expenseId], (err, row) => {
        if (err) {
          logger.error('Failed to check if expense has invoice:', err);
          reject(err);
          return;
        }
        
        const hasInvoice = !!row;
        logger.debug('Check expense has invoice:', { expenseId, hasInvoice });
        resolve(hasInvoice);
      });
    });
  }

  /**
   * Get all expense IDs that have invoices
   * @returns {Promise<Array>} Array of expense IDs
   */
  async getExpenseIdsWithInvoices() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT DISTINCT expense_id FROM expense_invoices ORDER BY expense_id';
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          logger.error('Failed to get expense IDs with invoices:', err);
          reject(err);
          return;
        }
        
        const expenseIds = rows.map(row => row.expense_id);
        logger.debug('Found expense IDs with invoices:', { count: expenseIds.length });
        resolve(expenseIds);
      });
    });
  }

  /**
   * Get invoice statistics
   * @returns {Promise<Object>} Statistics about invoices
   */
  async getStatistics() {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as totalInvoices,
          SUM(file_size) as totalSize,
          AVG(file_size) as averageSize,
          MIN(upload_date) as oldestUpload,
          MAX(upload_date) as newestUpload
        FROM expense_invoices
      `;
      
      db.get(sql, [], (err, row) => {
        if (err) {
          logger.error('Failed to get invoice statistics:', err);
          reject(err);
          return;
        }
        
        const stats = {
          totalInvoices: row.totalInvoices || 0,
          totalSize: row.totalSize || 0,
          totalSizeMB: row.totalSize ? Math.round(row.totalSize / (1024 * 1024) * 100) / 100 : 0,
          averageSize: row.averageSize || 0,
          averageSizeMB: row.averageSize ? Math.round(row.averageSize / (1024 * 1024) * 100) / 100 : 0,
          oldestUpload: row.oldestUpload,
          newestUpload: row.newestUpload
        };
        
        logger.debug('Invoice statistics:', stats);
        resolve(stats);
      });
    });
  }

  /**
   * Find invoices by date range
   * @param {string} startDate - Start date (ISO string)
   * @param {string} endDate - End date (ISO string)
   * @returns {Promise<Array>} Array of invoices
   */
  async findByDateRange(startDate, endDate) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT ei.id, ei.expense_id, ei.person_id, ei.filename, ei.original_filename, ei.file_path,
               ei.file_size, ei.mime_type, ei.upload_date, p.name as person_name
        FROM expense_invoices ei
        LEFT JOIN people p ON ei.person_id = p.id
        WHERE ei.upload_date >= ? AND ei.upload_date <= ?
        ORDER BY ei.upload_date DESC
      `;
      
      db.all(sql, [startDate, endDate], (err, rows) => {
        if (err) {
          logger.error('Failed to find invoices by date range:', err);
          reject(err);
          return;
        }
        
        const invoices = rows.map(row => ({
          id: row.id,
          expenseId: row.expense_id,
          personId: row.person_id,
          personName: row.person_name,
          filename: row.filename,
          originalFilename: row.original_filename,
          filePath: row.file_path,
          fileSize: row.file_size,
          mimeType: row.mime_type,
          uploadDate: row.upload_date
        }));
        
        logger.debug('Found invoices by date range:', { 
          startDate, 
          endDate, 
          count: invoices.length 
        });
        resolve(invoices);
      });
    });
  }
}

module.exports = new InvoiceRepository();
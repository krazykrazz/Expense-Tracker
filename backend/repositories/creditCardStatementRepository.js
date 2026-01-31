const { getDatabase } = require('../database/db');
const logger = require('../config/logger');

/**
 * Repository for managing credit card statements in the database
 * Handles CRUD operations for the credit_card_statements table
 * Manages file path storage similar to invoiceRepository
 */
class CreditCardStatementRepository {
  /**
   * Create a new credit card statement record
   * @param {Object} statement - Statement data including file metadata
   * @returns {Promise<Object>} Created statement with ID
   */
  async create(statement) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO credit_card_statements (
          payment_method_id, statement_date, statement_period_start, statement_period_end,
          filename, original_filename, file_path, file_size, mime_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        statement.payment_method_id,
        statement.statement_date,
        statement.statement_period_start,
        statement.statement_period_end,
        statement.filename,
        statement.original_filename,
        statement.file_path,
        statement.file_size,
        statement.mime_type || 'application/pdf'
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to create credit card statement:', err);
          reject(err);
          return;
        }
        
        logger.debug('Created credit card statement:', { 
          id: this.lastID, 
          paymentMethodId: statement.payment_method_id,
          statementDate: statement.statement_date 
        });
        
        resolve({
          id: this.lastID,
          payment_method_id: statement.payment_method_id,
          statement_date: statement.statement_date,
          statement_period_start: statement.statement_period_start,
          statement_period_end: statement.statement_period_end,
          filename: statement.filename,
          original_filename: statement.original_filename,
          file_path: statement.file_path,
          file_size: statement.file_size,
          mime_type: statement.mime_type || 'application/pdf'
        });
      });
    });
  }

  /**
   * Find all statements for a specific payment method
   * Returns statements in reverse chronological order (most recent first)
   * @param {number} paymentMethodId - Payment method ID
   * @returns {Promise<Array>} Array of statement records
   */
  async findByPaymentMethodId(paymentMethodId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM credit_card_statements 
        WHERE payment_method_id = ?
        ORDER BY statement_date DESC, created_at DESC
      `;
      
      db.all(sql, [paymentMethodId], (err, rows) => {
        if (err) {
          logger.error('Failed to find statements by payment method ID:', err);
          reject(err);
          return;
        }
        
        const statements = (rows || []).map(row => ({
          id: row.id,
          paymentMethodId: row.payment_method_id,
          statementDate: row.statement_date,
          statementPeriodStart: row.statement_period_start,
          statementPeriodEnd: row.statement_period_end,
          filename: row.filename,
          originalFilename: row.original_filename,
          filePath: row.file_path,
          fileSize: row.file_size,
          mimeType: row.mime_type,
          createdAt: row.created_at
        }));
        
        logger.debug('Found credit card statements:', { 
          paymentMethodId, 
          count: statements.length 
        });
        resolve(statements);
      });
    });
  }

  /**
   * Find a statement by ID
   * @param {number} id - Statement ID
   * @returns {Promise<Object|null>} Statement record or null if not found
   */
  async findById(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM credit_card_statements WHERE id = ?';
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          logger.error('Failed to find statement by ID:', err);
          reject(err);
          return;
        }
        
        if (!row) {
          resolve(null);
          return;
        }
        
        resolve({
          id: row.id,
          paymentMethodId: row.payment_method_id,
          statementDate: row.statement_date,
          statementPeriodStart: row.statement_period_start,
          statementPeriodEnd: row.statement_period_end,
          filename: row.filename,
          originalFilename: row.original_filename,
          filePath: row.file_path,
          fileSize: row.file_size,
          mimeType: row.mime_type,
          createdAt: row.created_at
        });
      });
    });
  }

  /**
   * Delete a statement record
   * Note: This only deletes the database record, not the file itself
   * File deletion should be handled by the service layer
   * @param {number} id - Statement ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM credit_card_statements WHERE id = ?';
      
      db.run(sql, [id], function(err) {
        if (err) {
          logger.error('Failed to delete credit card statement:', err);
          reject(err);
          return;
        }
        
        const deleted = this.changes > 0;
        logger.debug('Delete credit card statement:', { id, deleted });
        resolve(deleted);
      });
    });
  }

  /**
   * Delete all statements for a payment method
   * Note: This only deletes database records, not files
   * @param {number} paymentMethodId - Payment method ID
   * @returns {Promise<number>} Number of statements deleted
   */
  async deleteByPaymentMethodId(paymentMethodId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM credit_card_statements WHERE payment_method_id = ?';
      
      db.run(sql, [paymentMethodId], function(err) {
        if (err) {
          logger.error('Failed to delete statements by payment method ID:', err);
          reject(err);
          return;
        }
        
        logger.debug('Delete statements by payment method ID:', { 
          paymentMethodId, 
          deletedCount: this.changes 
        });
        resolve(this.changes);
      });
    });
  }

  /**
   * Get statement count for a payment method
   * @param {number} paymentMethodId - Payment method ID
   * @returns {Promise<number>} Count of statements
   */
  async getCountByPaymentMethodId(paymentMethodId) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM credit_card_statements WHERE payment_method_id = ?';
      
      db.get(sql, [paymentMethodId], (err, row) => {
        if (err) {
          logger.error('Failed to get statement count:', err);
          reject(err);
          return;
        }
        
        const count = row ? row.count : 0;
        logger.debug('Statement count for payment method:', { paymentMethodId, count });
        resolve(count);
      });
    });
  }

  /**
   * Find statements by date range
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of statement records
   */
  async findByDateRange(paymentMethodId, startDate, endDate) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM credit_card_statements 
        WHERE payment_method_id = ?
          AND statement_date >= ?
          AND statement_date <= ?
        ORDER BY statement_date DESC
      `;
      
      db.all(sql, [paymentMethodId, startDate, endDate], (err, rows) => {
        if (err) {
          logger.error('Failed to find statements by date range:', err);
          reject(err);
          return;
        }
        
        const statements = (rows || []).map(row => ({
          id: row.id,
          paymentMethodId: row.payment_method_id,
          statementDate: row.statement_date,
          statementPeriodStart: row.statement_period_start,
          statementPeriodEnd: row.statement_period_end,
          filename: row.filename,
          originalFilename: row.original_filename,
          filePath: row.file_path,
          fileSize: row.file_size,
          mimeType: row.mime_type,
          createdAt: row.created_at
        }));
        
        logger.debug('Found statements in date range:', { 
          paymentMethodId, 
          startDate, 
          endDate, 
          count: statements.length 
        });
        resolve(statements);
      });
    });
  }

  /**
   * Check if a statement exists for a specific period
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} statementPeriodStart - Period start date
   * @param {string} statementPeriodEnd - Period end date
   * @returns {Promise<boolean>} True if statement exists for this period
   */
  async existsForPeriod(paymentMethodId, statementPeriodStart, statementPeriodEnd) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 1 FROM credit_card_statements 
        WHERE payment_method_id = ?
          AND statement_period_start = ?
          AND statement_period_end = ?
        LIMIT 1
      `;
      
      db.get(sql, [paymentMethodId, statementPeriodStart, statementPeriodEnd], (err, row) => {
        if (err) {
          logger.error('Failed to check statement existence:', err);
          reject(err);
          return;
        }
        
        resolve(!!row);
      });
    });
  }
}

module.exports = new CreditCardStatementRepository();

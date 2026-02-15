const creditCardStatementRepository = require('../repositories/creditCardStatementRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const activityLogService = require('./activityLogService');
const fileStorage = require('../utils/fileStorage');
const fileValidation = require('../utils/fileValidation');
const { getStatementsPath } = require('../config/paths');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');

/**
 * Service for managing credit card statements
 * Handles file upload, storage, retrieval, and deletion with proper validation
 * Reuses file validation patterns from invoiceService
 */
class CreditCardStatementService {
  constructor() {
    // Base directory for statement storage
    this.baseStatementDir = getStatementsPath();
    this.initializeStorage();
  }

  /**
   * Initialize file storage directories
   */
  async initializeStorage() {
    try {
      await fs.promises.mkdir(this.baseStatementDir, { recursive: true });
      logger.debug('Statement storage directory initialized:', this.baseStatementDir);
    } catch (error) {
      logger.error('Failed to initialize statement storage:', error);
    }
  }

  /**
   * Generate file path for statement storage
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} originalFilename - Original filename
   * @param {string} statementDate - Statement date (YYYY-MM-DD)
   * @returns {Object} { filename, relativePath, fullPath, directoryPath }
   */
  generateFilePath(paymentMethodId, originalFilename, statementDate) {
    const date = new Date(statementDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(originalFilename).toLowerCase();
    const filename = `statement_${paymentMethodId}_${year}${month}_${timestamp}${ext}`;
    
    // Organize by payment method and year
    const relativePath = path.join(String(paymentMethodId), String(year), filename);
    const directoryPath = path.join(this.baseStatementDir, String(paymentMethodId), String(year));
    const fullPath = path.join(this.baseStatementDir, relativePath);
    
    return {
      filename,
      relativePath,
      fullPath,
      directoryPath
    };
  }

  /**
   * Upload a credit card statement
   * @param {number} paymentMethodId - Payment method ID
   * @param {Object} file - Multer file object
   * @param {string} statementDate - Statement date (YYYY-MM-DD)
   * @param {string} statementPeriodStart - Period start date (YYYY-MM-DD)
   * @param {string} statementPeriodEnd - Period end date (YYYY-MM-DD)
   * @returns {Promise<Object>} Created statement metadata
   */
  async uploadStatement(paymentMethodId, file, statementDate, statementPeriodStart, statementPeriodEnd) {
    // Validate input parameters
    if (!paymentMethodId || !file) {
      throw new Error('Payment method ID and file are required');
    }

    if (!statementDate || !statementPeriodStart || !statementPeriodEnd) {
      throw new Error('Statement date and period dates are required');
    }

    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(statementDate) || !dateRegex.test(statementPeriodStart) || !dateRegex.test(statementPeriodEnd)) {
      throw new Error('Dates must be in YYYY-MM-DD format');
    }

    let finalFilePath = null;

    try {
      // Verify payment method exists and is a credit card
      const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
      if (!paymentMethod) {
        throw new Error('Payment method not found');
      }

      if (paymentMethod.type !== 'credit_card') {
        throw new Error('Statements can only be uploaded for credit card payment methods');
      }

      // Validate file
      const validation = await fileValidation.validateFileBuffer(file.buffer, file.originalname);
      if (!validation.isValid) {
        throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
      }

      // Log validation warnings if any
      if (validation.warnings && validation.warnings.length > 0) {
        logger.warn('File validation warnings:', {
          paymentMethodId,
          filename: file.originalname,
          warnings: validation.warnings
        });
      }

      // Generate file paths
      const filePaths = this.generateFilePath(paymentMethodId, file.originalname, statementDate);

      // Ensure destination directory exists
      await fs.promises.mkdir(filePaths.directoryPath, { recursive: true });

      // Write file to final location
      finalFilePath = filePaths.fullPath;
      await fs.promises.writeFile(finalFilePath, file.buffer);

      // Validate the stored file content
      const contentValidation = await fileValidation.validateFileContent(finalFilePath);
      if (!contentValidation.isValid) {
        await this.deleteFile(finalFilePath);
        throw new Error(`File content validation failed: ${contentValidation.errors.join(', ')}`);
      }

      // Get file stats
      const fileStats = await fs.promises.stat(finalFilePath);

      // Create database record
      const statementData = {
        payment_method_id: paymentMethodId,
        statement_date: statementDate,
        statement_period_start: statementPeriodStart,
        statement_period_end: statementPeriodEnd,
        filename: filePaths.filename,
        original_filename: file.originalname,
        file_path: filePaths.relativePath,
        file_size: fileStats.size,
        mime_type: file.mimetype || 'application/pdf'
      };

      let statement;
      try {
        statement = await creditCardStatementRepository.create(statementData);
      } catch (dbError) {
        await this.deleteFile(finalFilePath);
        logger.error('Database operation failed during statement upload:', dbError);
        throw new Error('Failed to save statement metadata. Please try again.');
      }

      logger.info('Statement uploaded successfully:', {
        paymentMethodId,
        statementId: statement.id,
        filename: statement.filename,
        size: statement.file_size
      });

      // Log activity event (fire-and-forget)
      await activityLogService.logEvent(
        'credit_card_statement_uploaded',
        'credit_card_statement',
        statement.id,
        `Uploaded statement "${file.originalname}" for ${paymentMethod.display_name}`,
        {
          paymentMethodId,
          statementDate,
          filename: file.originalname,
          cardName: paymentMethod.display_name
        }
      );

      return statement;

    } catch (error) {
      logger.error('Statement upload failed:', { paymentMethodId, error: error.message });

      // Cleanup on error
      if (finalFilePath) {
        await this.deleteFile(finalFilePath).catch(err =>
          logger.warn('Failed to cleanup file:', { finalFilePath, error: err.message })
        );
      }

      throw error;
    }
  }

  /**
   * Get all statements for a credit card
   * @param {number} paymentMethodId - Payment method ID
   * @returns {Promise<Array>} Array of statement metadata
   */
  async getStatements(paymentMethodId) {
    if (!paymentMethodId) {
      throw new Error('Payment method ID is required');
    }

    // Verify payment method exists
    const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
    if (!paymentMethod) {
      throw new Error('Payment method not found');
    }

    const statements = await creditCardStatementRepository.findByPaymentMethodId(paymentMethodId);

    logger.debug('Retrieved statements:', {
      paymentMethodId,
      count: statements.length
    });

    return statements;
  }

  /**
   * Get a statement by ID with file path
   * @param {number} statementId - Statement ID
   * @returns {Promise<Object>} Statement with file path
   */
  async downloadStatement(statementId) {
    if (!statementId) {
      throw new Error('Statement ID is required');
    }

    const statement = await creditCardStatementRepository.findById(statementId);
    if (!statement) {
      throw new Error('Statement not found');
    }

    // Build full file path
    const fullFilePath = path.join(this.baseStatementDir, statement.filePath);

    // Verify file exists
    try {
      await fs.promises.access(fullFilePath);
    } catch (error) {
      logger.error('Statement file not found on disk:', { statementId, filePath: fullFilePath });
      throw new Error('Statement file not found. The file may have been moved or deleted.');
    }

    // Get current file stats
    const fileStats = await fs.promises.stat(fullFilePath);

    return {
      ...statement,
      fullFilePath,
      fileStats
    };
  }

  /**
   * Delete a statement
   * @param {number} statementId - Statement ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteStatement(statementId) {
    if (!statementId) {
      throw new Error('Statement ID is required');
    }

    // Get statement metadata
    const statement = await creditCardStatementRepository.findById(statementId);
    if (!statement) {
      return false;
    }

    // Build full file path
    const fullFilePath = path.join(this.baseStatementDir, statement.filePath);

    // Delete file from storage
    await this.deleteFile(fullFilePath).catch(err =>
      logger.warn('Failed to delete statement file:', { fullFilePath, error: err.message })
    );

    // Delete database record
    const deleted = await creditCardStatementRepository.delete(statementId);

    if (deleted) {
      // Look up card name for activity log
      const paymentMethod = await paymentMethodRepository.findById(statement.paymentMethodId);
      const cardName = paymentMethod ? paymentMethod.display_name : 'Unknown';

      logger.info('Statement deleted successfully:', {
        statementId,
        paymentMethodId: statement.paymentMethodId
      });

      // Log activity event (fire-and-forget)
      await activityLogService.logEvent(
        'credit_card_statement_deleted',
        'credit_card_statement',
        statementId,
        `Deleted statement "${statement.originalFilename}" from ${cardName}`,
        {
          paymentMethodId: statement.paymentMethodId,
          statementDate: statement.statementDate,
          filename: statement.originalFilename,
          cardName
        }
      );
    }

    return deleted;
  }

  /**
   * Get statement metadata by ID
   * @param {number} statementId - Statement ID
   * @returns {Promise<Object|null>} Statement metadata or null
   */
  async getStatementById(statementId) {
    if (!statementId) {
      throw new Error('Statement ID is required');
    }

    return creditCardStatementRepository.findById(statementId);
  }

  /**
   * Delete a file safely
   * @param {string} filePath - Path to file
   * @returns {Promise<void>}
   */
  async deleteFile(filePath) {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, that's fine
    }
  }

  /**
   * Check if a statement exists for a specific period
   * @param {number} paymentMethodId - Payment method ID
   * @param {string} statementPeriodStart - Period start date
   * @param {string} statementPeriodEnd - Period end date
   * @returns {Promise<boolean>} True if statement exists
   */
  async existsForPeriod(paymentMethodId, statementPeriodStart, statementPeriodEnd) {
    return creditCardStatementRepository.existsForPeriod(
      paymentMethodId,
      statementPeriodStart,
      statementPeriodEnd
    );
  }

  /**
   * Get statement count for a payment method
   * @param {number} paymentMethodId - Payment method ID
   * @returns {Promise<number>} Count of statements
   */
  async getStatementCount(paymentMethodId) {
    return creditCardStatementRepository.getCountByPaymentMethodId(paymentMethodId);
  }
}

module.exports = new CreditCardStatementService();

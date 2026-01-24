const invoiceRepository = require('../repositories/invoiceRepository');
const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const fileStorage = require('../utils/fileStorage');
const fileValidation = require('../utils/fileValidation');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');

/**
 * Service for managing invoice file operations
 * Handles file upload, storage, retrieval, and deletion with proper validation
 */
class InvoiceService {
  constructor() {
    // Initialize file storage directories on service creation
    this.initializeStorage();
  }

  /**
   * Initialize file storage directories
   */
  async initializeStorage() {
    try {
      await fileStorage.initializeDirectories();
    } catch (error) {
      logger.error('Failed to initialize invoice storage:', error);
    }
  }

  /**
   * Upload invoice for an expense with optional person link
   * @param {number} expenseId - Expense ID
   * @param {Object} file - Multer file object
   * @param {number|null} personId - Optional person ID to link
   * @param {number} userId - User ID (for future use)
   * @returns {Promise<Object>} Created invoice metadata
   */
  async uploadInvoice(expenseId, file, personId = null, userId = null) {
    // Validate input parameters first
    if (!expenseId || !file) {
      throw new Error('Expense ID and file are required');
    }

    let tempFilePath = null;
    let finalFilePath = null;

    try {
      // Verify expense exists and is a medical expense
      await this.validateExpenseForInvoice(expenseId);

      // Validate person belongs to expense if personId is provided
      if (personId !== null) {
        await this.validatePersonBelongsToExpense(expenseId, personId);
      }

      // Note: Removed single-invoice restriction to support multiple invoices per expense

      // Comprehensive file validation (using buffer for memory storage)
      const validation = await fileValidation.validateFileBuffer(file.buffer, file.originalname);
      if (!validation.isValid) {
        throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
      }

      // Log validation warnings if any
      if (validation.warnings && validation.warnings.length > 0) {
        logger.warn('File validation warnings:', { 
          expenseId, 
          filename: file.originalname, 
          warnings: validation.warnings 
        });
      }

      // Generate file paths
      const expense = await expenseRepository.findById(expenseId);
      const expenseDate = new Date(expense.date);
      const filePaths = fileStorage.generateFilePath(expenseId, file.originalname, expenseDate);

      // Ensure destination directory exists
      await fileStorage.ensureDirectoryExists(filePaths.directoryPath);

      // Write file buffer directly to final location (no temp file needed)
      finalFilePath = filePaths.fullPath;
      
      try {
        await fs.promises.writeFile(finalFilePath, file.buffer);
      } catch (writeError) {
        logger.error('Failed to write file to final location:', writeError);
        throw new Error('Failed to store invoice file. Please try again.');
      }

      // Validate the stored file content with additional checks
      const contentValidation = await fileValidation.validateFileContent(finalFilePath);
      if (!contentValidation.isValid) {
        // Clean up the file if validation fails
        await fileStorage.deleteFile(finalFilePath);
        throw new Error(`File content validation failed: ${contentValidation.errors.join(', ')}`);
      }

      // Additional security check: verify file hasn't been corrupted during transfer
      const fileStats = await fileStorage.getFileStats(finalFilePath);
      if (file.size && Math.abs(fileStats.size - file.size) > 100) { // Allow small differences
        await fileStorage.deleteFile(finalFilePath);
        throw new Error('File corruption detected during upload. Please try again.');
      }

      // Create database record with transaction-like behavior
      const invoiceData = {
        expenseId: expenseId,
        personId: personId,
        filename: filePaths.filename,
        originalFilename: file.originalname,
        filePath: filePaths.relativePath,
        fileSize: fileStats.size,
        mimeType: file.mimetype || 'application/pdf',
        uploadDate: new Date().toISOString()
      };

      let invoice;
      try {
        invoice = await invoiceRepository.create(invoiceData);
      } catch (dbError) {
        // Clean up file if database operation fails
        await fileStorage.deleteFile(finalFilePath);
        logger.error('Database operation failed during invoice upload:', dbError);
        throw new Error('Failed to save invoice metadata. Please try again.');
      }

      // Final verification: ensure everything is consistent
      const verificationCheck = await this.verifyInvoiceIntegrity(invoice.id);
      if (!verificationCheck.isValid) {
        // Clean up both file and database record
        await fileStorage.deleteFile(finalFilePath);
        await invoiceRepository.deleteById(invoice.id);
        throw new Error(`Invoice integrity check failed: ${verificationCheck.errors.join(', ')}`);
      }

      logger.info('Invoice uploaded successfully:', { 
        expenseId, 
        invoiceId: invoice.id, 
        filename: invoice.filename,
        size: invoice.fileSize,
        originalSize: file.size,
        personId: personId
      });

      return invoice;

    } catch (error) {
      logger.error('Invoice upload failed:', { expenseId, error: error.message, stack: error.stack });
      
      // Comprehensive cleanup on any error
      const cleanupPromises = [];
      
      if (tempFilePath) {
        cleanupPromises.push(
          fileStorage.deleteFile(tempFilePath).catch(err => 
            logger.warn('Failed to cleanup temp file:', { tempFilePath, error: err.message })
          )
        );
      }
      
      if (finalFilePath) {
        cleanupPromises.push(
          fileStorage.deleteFile(finalFilePath).catch(err => 
            logger.warn('Failed to cleanup final file:', { finalFilePath, error: err.message })
          )
        );
      }

      // Wait for cleanup to complete
      await Promise.all(cleanupPromises);

      throw error;
    }
  }

  /**
   * Get invoice file and metadata for an expense
   * @param {number} expenseId - Expense ID
   * @param {number} userId - User ID (for future use)
   * @returns {Promise<Object>} Invoice file path and metadata
   */
  async getInvoice(expenseId, userId = null) {
    try {
      // Validate input
      if (!expenseId) {
        throw new Error('Expense ID is required');
      }

      // Verify expense exists and user has access
      await this.validateExpenseAccess(expenseId, userId);

      // Get invoice metadata from database
      const invoice = await invoiceRepository.findByExpenseId(expenseId);
      if (!invoice) {
        throw new Error('No invoice found for this expense');
      }

      // Build full file path
      const fullFilePath = path.join(fileStorage.baseInvoiceDir, invoice.filePath);

      // Verify file exists
      const fileExists = await fileStorage.fileExists(fullFilePath);
      if (!fileExists) {
        logger.error('Invoice file not found on disk:', { expenseId, filePath: fullFilePath });
        throw new Error('Invoice file not found. The file may have been moved or deleted.');
      }

      // Get current file stats
      const fileStats = await fileStorage.getFileStats(fullFilePath);

      return {
        ...invoice,
        fullFilePath,
        fileStats
      };

    } catch (error) {
      logger.error('Failed to get invoice:', { expenseId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete invoice for an expense
   * @param {number} expenseId - Expense ID
   * @param {number} userId - User ID (for future use)
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteInvoice(expenseId, userId = null) {
    try {
      // Validate input
      if (!expenseId) {
        throw new Error('Expense ID is required');
      }

      // Verify expense exists and user has access
      await this.validateExpenseAccess(expenseId, userId);

      // Get invoice metadata
      const invoice = await invoiceRepository.findByExpenseId(expenseId);
      if (!invoice) {
        return false;
      }

      // Build full file path
      const fullFilePath = path.join(fileStorage.baseInvoiceDir, invoice.filePath);

      // Delete file from storage (don't fail if file doesn't exist)
      try {
        await fileStorage.deleteFile(fullFilePath);
      } catch (fileError) {
        logger.warn('Failed to delete invoice file (continuing with database cleanup):', fileError);
      }

      // Delete database record
      const deleted = await invoiceRepository.deleteByExpenseId(expenseId);

      if (deleted) {
        logger.info('Invoice deleted successfully:', { expenseId, invoiceId: invoice.id });
      }

      return deleted;

    } catch (error) {
      logger.error('Failed to delete invoice:', { expenseId, error: error.message });
      throw error;
    }
  }

  /**
   * Get invoice metadata without file content
   * @param {number} expenseId - Expense ID
   * @returns {Promise<Object|null>} Invoice metadata or null if not found
   */
  async getInvoiceMetadata(expenseId) {
    try {
      // Validate input
      if (!expenseId) {
        throw new Error('Expense ID is required');
      }

      // Check if expense exists first
      const expense = await expenseRepository.findById(expenseId);
      if (!expense) {
        throw new Error('Expense not found');
      }

      // Get invoice metadata from database
      const invoice = await invoiceRepository.findByExpenseId(expenseId);

      return invoice;

    } catch (error) {
      logger.error('Failed to get invoice metadata:', { expenseId, error: error.message });
      throw error;
    }
  }

  /**
   * Get all invoices for an expense
   * @param {number} expenseId - Expense ID
   * @returns {Promise<Array>} Array of invoice metadata with person info
   */
  async getInvoicesForExpense(expenseId) {
    try {
      // Validate input
      if (!expenseId) {
        throw new Error('Expense ID is required');
      }

      // Check if expense exists first
      const expense = await expenseRepository.findById(expenseId);
      if (!expense) {
        throw new Error('Expense not found');
      }

      // Get all invoices for the expense
      const invoices = await invoiceRepository.findAllByExpenseId(expenseId);

      logger.debug('Retrieved invoices for expense:', { expenseId, count: invoices.length });

      return invoices;

    } catch (error) {
      logger.error('Failed to get invoices for expense:', { expenseId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete a specific invoice by ID
   * @param {number} invoiceId - Invoice ID
   * @param {number} userId - User ID (for future use)
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteInvoiceById(invoiceId, userId = null) {
    try {
      // Validate input
      if (!invoiceId) {
        throw new Error('Invoice ID is required');
      }

      // Get invoice metadata
      const invoice = await invoiceRepository.findById(invoiceId);
      if (!invoice) {
        return false;
      }

      // Verify expense exists and user has access
      await this.validateExpenseAccess(invoice.expenseId, userId);

      // Build full file path
      const fullFilePath = path.join(fileStorage.baseInvoiceDir, invoice.filePath);

      // Delete file from storage (don't fail if file doesn't exist)
      try {
        await fileStorage.deleteFile(fullFilePath);
      } catch (fileError) {
        logger.warn('Failed to delete invoice file (continuing with database cleanup):', fileError);
      }

      // Delete database record
      const deleted = await invoiceRepository.deleteById(invoiceId);

      if (deleted) {
        logger.info('Invoice deleted successfully:', { invoiceId, expenseId: invoice.expenseId });
      }

      return deleted;

    } catch (error) {
      logger.error('Failed to delete invoice by ID:', { invoiceId, error: error.message });
      throw error;
    }
  }

  /**
   * Update person link for an invoice
   * @param {number} invoiceId - Invoice ID
   * @param {number|null} personId - Person ID or null to unlink
   * @returns {Promise<Object>} Updated invoice
   */
  async updateInvoicePersonLink(invoiceId, personId) {
    try {
      // Validate input
      if (!invoiceId) {
        throw new Error('Invoice ID is required');
      }

      // Get invoice metadata
      const invoice = await invoiceRepository.findById(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Validate person belongs to expense if personId is provided
      if (personId !== null) {
        await this.validatePersonBelongsToExpense(invoice.expenseId, personId);
      }

      // Update person association
      const updated = await invoiceRepository.updatePersonId(invoiceId, personId);
      if (!updated) {
        throw new Error('Failed to update invoice person link');
      }

      // Get updated invoice
      const updatedInvoice = await invoiceRepository.findById(invoiceId);

      logger.info('Invoice person link updated:', { invoiceId, personId, expenseId: invoice.expenseId });

      return updatedInvoice;

    } catch (error) {
      logger.error('Failed to update invoice person link:', { invoiceId, personId, error: error.message });
      throw error;
    }
  }

  /**
   * Get invoice by ID with file path
   * @param {number} invoiceId - Invoice ID
   * @param {number} userId - User ID (for future use)
   * @returns {Promise<Object>} Invoice file path and metadata
   */
  async getInvoiceById(invoiceId, userId = null) {
    try {
      // Validate input
      if (!invoiceId) {
        throw new Error('Invoice ID is required');
      }

      // Get invoice metadata from database
      const invoice = await invoiceRepository.findById(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Verify expense exists and user has access
      await this.validateExpenseAccess(invoice.expenseId, userId);

      // Build full file path
      const fullFilePath = path.join(fileStorage.baseInvoiceDir, invoice.filePath);

      // Verify file exists
      const fileExists = await fileStorage.fileExists(fullFilePath);
      if (!fileExists) {
        logger.error('Invoice file not found on disk:', { invoiceId, filePath: fullFilePath });
        throw new Error('Invoice file not found. The file may have been moved or deleted.');
      }

      // Get current file stats
      const fileStats = await fileStorage.getFileStats(fullFilePath);

      return {
        ...invoice,
        fullFilePath,
        fileStats
      };

    } catch (error) {
      logger.error('Failed to get invoice by ID:', { invoiceId, error: error.message });
      throw error;
    }
  }

  /**
   * Replace existing invoice with a new one
   * @param {number} expenseId - Expense ID
   * @param {Object} file - New file to upload
   * @param {number|null} personId - Optional person ID to link
   * @param {number} userId - User ID (for future use)
   * @returns {Promise<Object>} New invoice metadata
   */
  async replaceInvoice(expenseId, file, personId = null, userId = null) {
    try {
      // Delete existing invoice first
      await this.deleteInvoice(expenseId, userId);

      // Upload new invoice with optional person link
      const newInvoice = await this.uploadInvoice(expenseId, file, personId, userId);

      logger.info('Invoice replaced successfully:', { expenseId, newInvoiceId: newInvoice.id });

      return newInvoice;

    } catch (error) {
      logger.error('Failed to replace invoice:', { expenseId, error: error.message });
      throw error;
    }
  }

  /**
   * Check if expense has an invoice
   * @param {number} expenseId - Expense ID
   * @returns {Promise<boolean>} True if expense has invoice
   */
  async hasInvoice(expenseId) {
    try {
      return await invoiceRepository.hasInvoice(expenseId);
    } catch (error) {
      logger.error('Failed to check if expense has invoice:', { expenseId, error: error.message });
      throw error;
    }
  }

  /**
   * Clean up orphaned invoice files (files without database records)
   * @returns {Promise<number>} Number of files cleaned up
   */
  async cleanupOrphanedFiles() {
    logger.info('Starting cleanup of orphaned invoice files');

    try {
      // Get all expense IDs that have invoices in the database
      const expenseIdsWithInvoices = await invoiceRepository.getExpenseIdsWithInvoices();

      // Clean up files that don't have corresponding database records
      const cleanedCount = await fileStorage.cleanupOrphanedFiles(async () => {
        return expenseIdsWithInvoices;
      });

      logger.info('Orphaned file cleanup completed:', { cleanedCount });
      return cleanedCount;

    } catch (error) {
      logger.error('Failed to cleanup orphaned files:', error);
      throw error;
    }
  }

  /**
   * Get invoice storage statistics
   * @returns {Promise<Object>} Storage statistics
   */
  async getStorageStatistics() {
    try {
      const [dbStats, fileStats] = await Promise.all([
        invoiceRepository.getStatistics(),
        fileStorage.getStorageStats()
      ]);

      return {
        database: dbStats,
        fileSystem: fileStats,
        consistency: {
          dbCount: dbStats.totalInvoices,
          fileCount: fileStats.totalFiles,
          isConsistent: dbStats.totalInvoices === fileStats.totalFiles
        }
      };

    } catch (error) {
      logger.error('Failed to get storage statistics:', error);
      throw error;
    }
  }

  /**
   * Validate that expense exists and is eligible for invoice attachment
   * @param {number} expenseId - Expense ID to validate
   * @throws {Error} If expense is not valid for invoice attachment
   */
  async validateExpenseForInvoice(expenseId) {
    const expense = await expenseRepository.findById(expenseId);
    
    if (!expense) {
      throw new Error('Expense not found');
    }

    // Check if expense is a tax-deductible expense (Tax - Medical or Tax - Donation)
    if (expense.type !== 'Tax - Medical' && expense.type !== 'Tax - Donation') {
      throw new Error('Invoices can only be attached to tax-deductible expenses (Tax - Medical or Tax - Donation)');
    }

    return expense;
  }

  /**
   * Validate that user has access to the expense
   * @param {number} expenseId - Expense ID
   * @param {number} userId - User ID (for future multi-user support)
   * @throws {Error} If user doesn't have access
   */
  async validateExpenseAccess(expenseId, userId = null) {
    // For now, just verify expense exists since this is a single-user application
    // In the future, this could include user ownership checks
    const expense = await expenseRepository.findById(expenseId);
    
    if (!expense) {
      throw new Error('Expense not found');
    }

    // Future: Add user ownership validation here
    // if (userId && expense.userId !== userId) {
    //   throw new Error('You do not have permission to access this expense');
    // }

    return expense;
  }

  /**
   * Validate that a person is assigned to an expense
   * @param {number} expenseId - Expense ID
   * @param {number} personId - Person ID to validate
   * @throws {Error} If person is not assigned to the expense
   */
  async validatePersonBelongsToExpense(expenseId, personId) {
    const people = await expensePeopleRepository.getPeopleForExpense(expenseId);
    
    // Note: getPeopleForExpense returns 'id' (not 'personId') for frontend compatibility
    const personAssigned = people.some(p => p.id === personId);
    
    if (!personAssigned) {
      throw new Error('Person is not assigned to this expense');
    }

    return true;
  }

  /**
   * Verify invoice integrity (file exists and matches database record)
   * @param {number} invoiceId - Invoice ID to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyInvoiceIntegrity(invoiceId) {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // Get invoice from database
      const invoice = await invoiceRepository.findById(invoiceId);
      if (!invoice) {
        result.isValid = false;
        result.errors.push('Invoice not found in database');
        return result;
      }

      // Check if file exists
      const fullFilePath = path.join(fileStorage.baseInvoiceDir, invoice.filePath);
      const fileExists = await fileStorage.fileExists(fullFilePath);
      
      if (!fileExists) {
        result.isValid = false;
        result.errors.push('Invoice file not found on disk');
        return result;
      }

      // Verify file size matches database record
      const fileStats = await fileStorage.getFileStats(fullFilePath);
      if (Math.abs(fileStats.size - invoice.fileSize) > 100) { // Allow small differences
        result.warnings.push(`File size mismatch: DB=${invoice.fileSize}, Disk=${fileStats.size}`);
      }

      // Verify file is still a valid PDF
      const contentValidation = await fileValidation.validateFileContent(fullFilePath);
      if (!contentValidation.isValid) {
        result.isValid = false;
        result.errors.push(...contentValidation.errors);
      }

      return result;

    } catch (error) {
      logger.error('Invoice integrity verification failed:', { invoiceId, error });
      result.isValid = false;
      result.errors.push(`Verification failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Batch verify multiple invoices
   * @param {number[]} invoiceIds - Array of invoice IDs to verify
   * @returns {Promise<Object>} Batch verification results
   */
  async batchVerifyInvoices(invoiceIds = null) {
    try {
      // If no specific IDs provided, verify all invoices
      if (!invoiceIds) {
        const allInvoices = await invoiceRepository.findAll();
        invoiceIds = allInvoices.map(inv => inv.id);
      }

      const results = {
        total: invoiceIds.length,
        valid: 0,
        invalid: 0,
        warnings: 0,
        details: []
      };

      for (const invoiceId of invoiceIds) {
        const verification = await this.verifyInvoiceIntegrity(invoiceId);
        
        const detail = {
          invoiceId,
          isValid: verification.isValid,
          errors: verification.errors,
          warnings: verification.warnings
        };

        results.details.push(detail);

        if (verification.isValid) {
          results.valid++;
        } else {
          results.invalid++;
        }

        if (verification.warnings && verification.warnings.length > 0) {
          results.warnings++;
        }
      }

      logger.info('Batch invoice verification completed:', {
        total: results.total,
        valid: results.valid,
        invalid: results.invalid,
        warnings: results.warnings
      });

      return results;

    } catch (error) {
      logger.error('Batch invoice verification failed:', error);
      throw error;
    }
  }

  /**
   * Get detailed file validation info for debugging
   * @param {number} expenseId - Expense ID
   * @returns {Promise<Object>} Detailed validation info
   */
  async getFileValidationInfo(expenseId) {
    try {
      const invoice = await invoiceRepository.findByExpenseId(expenseId);
      if (!invoice) {
        throw new Error('No invoice found for this expense');
      }

      const fullFilePath = path.join(fileStorage.baseInvoiceDir, invoice.filePath);
      
      // Get comprehensive file info
      const [fileExists, fileStats, contentValidation] = await Promise.all([
        fileStorage.fileExists(fullFilePath),
        fileStorage.getFileStats(fullFilePath).catch(() => null),
        fileValidation.validateFileContent(fullFilePath).catch(err => ({ 
          isValid: false, 
          errors: [err.message] 
        }))
      ]);

      return {
        invoice,
        file: {
          path: fullFilePath,
          exists: fileExists,
          stats: fileStats,
          validation: contentValidation
        },
        integrity: await this.verifyInvoiceIntegrity(invoice.id)
      };

    } catch (error) {
      logger.error('Failed to get file validation info:', { expenseId, error });
      throw error;
    }
  }

  /**
   * Validate invoice service configuration
   * @returns {Promise<Object>} Validation results
   */
  async validateConfiguration() {
    const results = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // Check if storage directories exist and are writable
      await fileStorage.initializeDirectories();
      
      // Check file size limits
      const limits = fileValidation.getFileSizeLimits();
      if (limits.maxSize < 1024 * 1024) { // Less than 1MB
        results.warnings.push('Maximum file size is very small (< 1MB)');
      }

      // Check allowed file types
      const allowedTypes = fileValidation.getAllowedFileTypes();
      if (!allowedTypes.extensions.includes('.pdf')) {
        results.errors.push('PDF files are not in allowed file types');
        results.isValid = false;
      }

      // Test temp directory write permissions
      try {
        const testFile = path.join(fileStorage.baseInvoiceDir, 'temp', 'test-write.tmp');
        await fs.promises.writeFile(testFile, 'test');
        await fs.promises.unlink(testFile);
      } catch (writeError) {
        results.errors.push('Cannot write to temporary directory');
        results.isValid = false;
      }

      logger.debug('Invoice service configuration validation:', results);

    } catch (error) {
      results.errors.push(`Configuration validation failed: ${error.message}`);
      results.isValid = false;
    }

    return results;
  }

  /**
   * Security audit of invoice system
   * @returns {Promise<Object>} Security audit results
   */
  async performSecurityAudit() {
    const audit = {
      timestamp: new Date().toISOString(),
      passed: true,
      issues: [],
      recommendations: []
    };

    try {
      // Check for files with suspicious names or locations
      const allInvoices = await invoiceRepository.findAll();
      
      for (const invoice of allInvoices) {
        const fullPath = path.join(fileStorage.baseInvoiceDir, invoice.filePath);
        
        // Check if file path contains suspicious elements
        if (invoice.filePath.includes('..') || 
            invoice.filePath.includes('\\') || 
            invoice.filePath.startsWith('/')) {
          audit.issues.push({
            type: 'PATH_TRAVERSAL',
            invoiceId: invoice.id,
            expenseId: invoice.expenseId,
            issue: 'Suspicious file path detected',
            path: invoice.filePath
          });
          audit.passed = false;
        }

        // Check if file exists where it should
        const fileExists = await fileStorage.fileExists(fullPath);
        if (!fileExists) {
          audit.issues.push({
            type: 'MISSING_FILE',
            invoiceId: invoice.id,
            expenseId: invoice.expenseId,
            issue: 'Database record exists but file is missing',
            path: fullPath
          });
        }

        // Check file permissions (if on Unix-like system)
        if (fileExists && process.platform !== 'win32') {
          try {
            const stats = await fs.promises.stat(fullPath);
            const mode = stats.mode & parseInt('777', 8);
            if (mode & parseInt('002', 8)) { // World writable
              audit.issues.push({
                type: 'INSECURE_PERMISSIONS',
                invoiceId: invoice.id,
                expenseId: invoice.expenseId,
                issue: 'File is world-writable',
                path: fullPath,
                permissions: mode.toString(8)
              });
            }
          } catch (permError) {
            // Ignore permission check errors
          }
        }
      }

      // Check for orphaned files
      const orphanedFiles = await fileStorage.findOrphanedFiles(async () => {
        return allInvoices.map(inv => inv.expenseId);
      });

      if (orphanedFiles.length > 0) {
        audit.issues.push({
          type: 'ORPHANED_FILES',
          issue: `Found ${orphanedFiles.length} orphaned files`,
          files: orphanedFiles.slice(0, 10) // Limit to first 10 for logging
        });
      }

      // Security recommendations
      if (audit.issues.length === 0) {
        audit.recommendations.push('Consider implementing file integrity checksums');
        audit.recommendations.push('Consider adding virus scanning for uploaded files');
        audit.recommendations.push('Consider implementing file encryption at rest');
      }

      logger.info('Security audit completed:', {
        passed: audit.passed,
        issueCount: audit.issues.length,
        recommendationCount: audit.recommendations.length
      });

      return audit;

    } catch (error) {
      logger.error('Security audit failed:', error);
      audit.passed = false;
      audit.issues.push({
        type: 'AUDIT_ERROR',
        issue: `Security audit failed: ${error.message}`
      });
      return audit;
    }
  }
}

module.exports = new InvoiceService();
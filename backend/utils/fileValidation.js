const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

/**
 * File validation utilities for invoice uploads
 * Handles PDF validation, size checks, and security validation
 */
class FileValidationUtils {
  constructor() {
    // PDF magic numbers (file signatures)
    this.PDF_SIGNATURES = [
      Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
    ];
    
    // File size limits
    this.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    this.MIN_FILE_SIZE = 100; // 100 bytes minimum
    
    // Allowed MIME types
    this.ALLOWED_MIME_TYPES = [
      'application/pdf'
    ];
    
    // Allowed file extensions
    this.ALLOWED_EXTENSIONS = ['.pdf'];
  }

  /**
   * Validate uploaded file comprehensively
   * @param {Object} file - Multer file object or file info
   * @param {string} filePath - Path to file for content validation
   * @returns {Object} Validation result with success/error info
   */
  async validateFile(file, filePath = null) {
    const result = {
      isValid: false,
      errors: [],
      warnings: [],
      fileInfo: {
        originalName: file.originalname || file.filename,
        size: file.size,
        mimeType: file.mimetype || 'application/pdf'
      }
    };

    try {
      // Basic file object validation
      if (!file) {
        result.errors.push('No file provided');
        return result;
      }

      // File size validation
      const sizeValidation = this.validateFileSize(file.size);
      if (!sizeValidation.isValid) {
        result.errors.push(...sizeValidation.errors);
      }

      // File extension validation
      const extensionValidation = this.validateFileExtension(file.originalname || file.filename);
      if (!extensionValidation.isValid) {
        result.errors.push(...extensionValidation.errors);
      }

      // MIME type validation
      const mimeValidation = this.validateMimeType(file.mimetype);
      if (!mimeValidation.isValid) {
        result.errors.push(...mimeValidation.errors);
      }

      // Content validation (if file path provided)
      if (filePath && result.errors.length === 0) {
        const contentValidation = await this.validateFileContent(filePath);
        if (!contentValidation.isValid) {
          result.errors.push(...contentValidation.errors);
        }
        if (contentValidation.warnings) {
          result.warnings.push(...contentValidation.warnings);
        }
      }

      // Security validation
      const securityValidation = this.validateFileSecurity(file.originalname || file.filename);
      if (!securityValidation.isValid) {
        result.errors.push(...securityValidation.errors);
      }

      result.isValid = result.errors.length === 0;

      return result;
    } catch (error) {
      logger.error('File validation error:', error);
      result.errors.push('File validation failed due to system error');
      return result;
    }
  }

  /**
   * Validate file buffer (for memory storage uploads)
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Original filename
   * @returns {Object} Validation result
   */
  async validateFileBuffer(buffer, filename) {
    const result = {
      isValid: false,
      errors: [],
      warnings: [],
      fileInfo: {
        originalName: filename,
        size: buffer ? buffer.length : 0,
        mimeType: 'application/pdf'
      }
    };

    try {
      // Basic buffer validation
      if (!buffer || !Buffer.isBuffer(buffer)) {
        result.errors.push('No valid file buffer provided');
        return result;
      }

      // File size validation
      const sizeValidation = this.validateFileSize(buffer.length);
      if (!sizeValidation.isValid) {
        result.errors.push(...sizeValidation.errors);
      }

      // File extension validation
      const extensionValidation = this.validateFileExtension(filename);
      if (!extensionValidation.isValid) {
        result.errors.push(...extensionValidation.errors);
      }

      // Security validation
      const securityValidation = this.validateFileSecurity(filename);
      if (!securityValidation.isValid) {
        result.errors.push(...securityValidation.errors);
      }

      // Content validation from buffer
      if (result.errors.length === 0) {
        const contentValidation = await this.validateBufferContent(buffer);
        if (!contentValidation.isValid) {
          result.errors.push(...contentValidation.errors);
        }
        if (contentValidation.warnings) {
          result.warnings.push(...contentValidation.warnings);
        }
      }

      result.isValid = result.errors.length === 0;

      return result;
    } catch (error) {
      logger.error('File buffer validation error:', error);
      result.errors.push('File validation failed due to system error');
      return result;
    }
  }

  /**
   * Validate buffer content (PDF magic numbers and structure)
   * @param {Buffer} buffer - File buffer
   * @returns {Object} Validation result
   */
  async validateBufferContent(buffer) {
    const result = { isValid: true, errors: [], warnings: [] };

    try {
      // Check PDF magic number
      const isPDF = this.PDF_SIGNATURES.some(signature => 
        buffer.subarray(0, signature.length).equals(signature)
      );

      if (!isPDF) {
        result.isValid = false;
        result.errors.push('File is not a valid PDF (invalid file signature)');
        return result;
      }

      // Basic PDF structure validation from buffer
      const contentStr = buffer.toString('binary');

      // Check for PDF version
      const versionMatch = contentStr.match(/%PDF-(\d+\.\d+)/);
      if (!versionMatch) {
        result.errors.push('Invalid PDF: No version header found');
        result.isValid = false;
        return result;
      }

      // Check for EOF marker
      if (!contentStr.includes('%%EOF')) {
        result.warnings.push('PDF may be incomplete: No EOF marker found');
      }

      // Check for basic PDF objects
      if (!contentStr.includes('obj') || !contentStr.includes('endobj')) {
        result.errors.push('Invalid PDF: No PDF objects found');
        result.isValid = false;
      }

      // Check buffer size
      if (buffer.length < 100) {
        result.errors.push('PDF file appears to be corrupted or incomplete');
        result.isValid = false;
      }

      return result;
    } catch (error) {
      logger.error('Buffer content validation error:', error);
      result.isValid = false;
      result.errors.push('Failed to validate file content');
      return result;
    }
  }

  /**
   * Validate file size
   * @param {number} size - File size in bytes
   * @returns {Object} Validation result
   */
  validateFileSize(size) {
    const result = { isValid: true, errors: [] };

    if (!size || size <= 0) {
      result.isValid = false;
      result.errors.push('File size is invalid or zero');
      return result;
    }

    if (size < this.MIN_FILE_SIZE) {
      result.isValid = false;
      result.errors.push(`File is too small (minimum ${this.MIN_FILE_SIZE} bytes)`);
    }

    if (size > this.MAX_FILE_SIZE) {
      result.isValid = false;
      const maxSizeMB = Math.round(this.MAX_FILE_SIZE / (1024 * 1024));
      result.errors.push(`File is too large (maximum ${maxSizeMB}MB allowed)`);
    }

    return result;
  }

  /**
   * Validate file extension
   * @param {string} filename - Original filename
   * @returns {Object} Validation result
   */
  validateFileExtension(filename) {
    const result = { isValid: true, errors: [] };

    if (!filename) {
      result.isValid = false;
      result.errors.push('Filename is required');
      return result;
    }

    const extension = path.extname(filename).toLowerCase();
    
    if (!extension) {
      result.isValid = false;
      result.errors.push('File must have an extension');
      return result;
    }

    if (!this.ALLOWED_EXTENSIONS.includes(extension)) {
      result.isValid = false;
      result.errors.push(`Only PDF files are allowed (got ${extension})`);
    }

    return result;
  }

  /**
   * Validate MIME type
   * @param {string} mimeType - File MIME type
   * @returns {Object} Validation result
   */
  validateMimeType(mimeType) {
    const result = { isValid: true, errors: [] };

    if (!mimeType) {
      result.isValid = false;
      result.errors.push('MIME type is required');
      return result;
    }

    if (!this.ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      result.isValid = false;
      result.errors.push(`Invalid file type: ${mimeType}. Only PDF files are allowed.`);
    }

    return result;
  }

  /**
   * Validate file content by checking magic numbers and basic PDF structure
   * @param {string} filePath - Path to file
   * @returns {Object} Validation result
   */
  async validateFileContent(filePath) {
    const result = { isValid: true, errors: [], warnings: [] };

    try {
      // Check if file exists
      const exists = await this.fileExists(filePath);
      if (!exists) {
        result.isValid = false;
        result.errors.push('File not found for content validation');
        return result;
      }

      // Read first few bytes to check magic number
      const buffer = Buffer.alloc(8);
      const fd = await fs.promises.open(filePath, 'r');
      
      try {
        await fd.read(buffer, 0, 8, 0);
      } finally {
        await fd.close();
      }

      // Check PDF magic number
      const isPDF = this.PDF_SIGNATURES.some(signature => 
        buffer.subarray(0, signature.length).equals(signature)
      );

      if (!isPDF) {
        result.isValid = false;
        result.errors.push('File is not a valid PDF (invalid file signature)');
        return result;
      }

      // Basic PDF structure validation
      const structureValidation = await this.validatePDFStructure(filePath);
      if (!structureValidation.isValid) {
        result.errors.push(...structureValidation.errors);
        result.isValid = false;
      }
      if (structureValidation.warnings) {
        result.warnings.push(...structureValidation.warnings);
      }

      return result;
    } catch (error) {
      logger.error('Content validation error:', error);
      result.isValid = false;
      result.errors.push('Failed to validate file content');
      return result;
    }
  }

  /**
   * Basic PDF structure validation
   * @param {string} filePath - Path to PDF file
   * @returns {Object} Validation result
   */
  async validatePDFStructure(filePath) {
    const result = { isValid: true, errors: [], warnings: [] };

    try {
      // Read file content
      const content = await fs.promises.readFile(filePath);
      const contentStr = content.toString('binary');

      // Check for PDF version
      const versionMatch = contentStr.match(/%PDF-(\d+\.\d+)/);
      if (!versionMatch) {
        result.errors.push('Invalid PDF: No version header found');
        result.isValid = false;
        return result;
      }

      // Check for EOF marker
      if (!contentStr.includes('%%EOF')) {
        result.warnings.push('PDF may be incomplete: No EOF marker found');
      }

      // Check for basic PDF objects
      if (!contentStr.includes('obj') || !contentStr.includes('endobj')) {
        result.errors.push('Invalid PDF: No PDF objects found');
        result.isValid = false;
      }

      // Check file size vs content
      if (content.length < 100) {
        result.errors.push('PDF file appears to be corrupted or incomplete');
        result.isValid = false;
      }

      return result;
    } catch (error) {
      logger.error('PDF structure validation error:', error);
      result.isValid = false;
      result.errors.push('Failed to validate PDF structure');
      return result;
    }
  }

  /**
   * Validate file security (filename, path traversal, etc.)
   * @param {string} filename - Original filename
   * @returns {Object} Validation result
   */
  validateFileSecurity(filename) {
    const result = { isValid: true, errors: [] };

    if (!filename) {
      result.isValid = false;
      result.errors.push('Filename is required for security validation');
      return result;
    }

    // Check for path traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      result.isValid = false;
      result.errors.push('Filename contains invalid path characters');
    }

    // Check for dangerous characters
    const dangerousChars = /[<>:"|?*\x00-\x1f]/;
    if (dangerousChars.test(filename)) {
      result.isValid = false;
      result.errors.push('Filename contains dangerous characters');
    }

    // Check filename length
    if (filename.length > 255) {
      result.isValid = false;
      result.errors.push('Filename is too long (maximum 255 characters)');
    }

    // Check for reserved names (Windows)
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    const baseName = path.basename(filename, path.extname(filename)).toUpperCase();
    if (reservedNames.includes(baseName)) {
      result.isValid = false;
      result.errors.push('Filename uses a reserved system name');
    }

    return result;
  }

  /**
   * Check if file exists
   * @param {string} filePath - Path to check
   * @returns {boolean} True if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file size limits for client-side validation
   * @returns {Object} Size limits
   */
  getFileSizeLimits() {
    return {
      maxSize: this.MAX_FILE_SIZE,
      maxSizeMB: Math.round(this.MAX_FILE_SIZE / (1024 * 1024)),
      minSize: this.MIN_FILE_SIZE
    };
  }

  /**
   * Get allowed file types for client-side validation
   * @returns {Object} Allowed types
   */
  getAllowedFileTypes() {
    return {
      extensions: [...this.ALLOWED_EXTENSIONS],
      mimeTypes: [...this.ALLOWED_MIME_TYPES]
    };
  }
}

module.exports = new FileValidationUtils();
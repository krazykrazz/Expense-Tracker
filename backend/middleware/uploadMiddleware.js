const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fileValidation = require('../utils/fileValidation');
const logger = require('../config/logger');
const { getConfigDir } = require('../config/paths');

/**
 * Enhanced multer configuration for secure PDF invoice uploads
 * Includes comprehensive validation, security measures, and progress tracking
 */
class UploadMiddleware {
  constructor() {
    // Use centralized config directory (handles containerized vs development environments)
    const configDir = getConfigDir();
    this.tempDir = path.join(configDir, 'invoices', 'temp');
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.allowedMimeTypes = ['application/pdf'];
    this.allowedExtensions = ['.pdf'];
    
    logger.info('Upload middleware initialized:', { tempDir: this.tempDir });
    
    // Ensure temp directory exists
    this.ensureTempDirectory();
  }

  /**
   * Ensure temporary upload directory exists
   */
  ensureTempDirectory() {
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true, mode: 0o755 });
        logger.info('Created temporary upload directory:', this.tempDir);
      }
    } catch (error) {
      logger.error('Failed to create temp directory:', error);
      throw new Error('Upload system initialization failed');
    }
  }

  /**
   * Generate secure filename with collision prevention
   * @param {Object} file - Multer file object
   * @returns {string} Secure filename
   */
  generateSecureFilename(file) {
    // Generate cryptographically secure random string
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    
    // Sanitize original filename
    const sanitizedName = this.sanitizeFilename(file.originalname);
    const extension = path.extname(sanitizedName).toLowerCase();
    const baseName = path.basename(sanitizedName, extension);
    
    // Limit base name length
    const truncatedBaseName = baseName.substring(0, 50);
    
    return `temp-${timestamp}-${randomBytes}-${truncatedBaseName}${extension}`;
  }

  /**
   * Sanitize filename for security
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename
   */
  sanitizeFilename(filename) {
    if (!filename) return 'unnamed.pdf';
    
    // Remove dangerous characters and normalize
    return filename
      .replace(/[<>:"|?*\x00-\x1f]/g, '') // Remove dangerous chars
      .replace(/[\/\\]/g, '_') // Replace path separators
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_{2,}/g, '_') // Collapse multiple underscores
      .replace(/^[._]+|[._]+$/g, '') // Remove leading/trailing dots and underscores
      .substring(0, 255); // Limit length
  }

  /**
   * Enhanced file filter with comprehensive validation
   * @param {Object} req - Express request object
   * @param {Object} file - Multer file object
   * @param {Function} cb - Callback function
   */
  async fileFilter(req, file, cb) {
    try {
      // Basic null checks
      if (!file || !file.originalname) {
        return cb(new Error('Invalid file object'), false);
      }

      // Extension validation
      const fileExtension = path.extname(file.originalname).toLowerCase();
      if (!this.allowedExtensions.includes(fileExtension)) {
        return cb(new Error(`Invalid file extension. Only ${this.allowedExtensions.join(', ')} files are allowed`), false);
      }

      // MIME type validation
      if (!this.allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error(`Invalid MIME type: ${file.mimetype}. Only PDF files are allowed`), false);
      }

      // Security validation
      const securityValidation = fileValidation.validateFileSecurity(file.originalname);
      if (!securityValidation.isValid) {
        return cb(new Error(`Security validation failed: ${securityValidation.errors.join(', ')}`), false);
      }

      // Pre-validate file size if available
      if (file.size && file.size > this.maxFileSize) {
        const maxSizeMB = Math.round(this.maxFileSize / (1024 * 1024));
        return cb(new Error(`File too large. Maximum size is ${maxSizeMB}MB`), false);
      }

      // Additional filename validation
      if (file.originalname.length > 255) {
        return cb(new Error('Filename is too long (maximum 255 characters)'), false);
      }

      // Check for suspicious file patterns
      if (this.isSuspiciousFile(file.originalname)) {
        return cb(new Error('File appears to be suspicious or potentially harmful'), false);
      }

      cb(null, true);

    } catch (error) {
      logger.error('File filter error:', error);
      cb(new Error('File validation failed due to system error'), false);
    }
  }

  /**
   * Check for suspicious file patterns
   * @param {string} filename - Filename to check
   * @returns {boolean} True if file appears suspicious
   */
  isSuspiciousFile(filename) {
    const suspiciousPatterns = [
      /\.exe$/i,
      /\.bat$/i,
      /\.cmd$/i,
      /\.scr$/i,
      /\.vbs$/i,
      /\.js$/i,
      /\.jar$/i,
      /\.com$/i,
      /\.pif$/i,
      /\.msi$/i,
      /\.dll$/i,
      /^\./, // Hidden files
      /\.(pdf|PDF)\./, // Double extensions like file.pdf.exe
    ];

    return suspiciousPatterns.some(pattern => pattern.test(filename));
  }

  /**
   * Configure multer storage with security measures
   * Using memoryStorage to avoid cross-device link errors (EXDEV)
   * when temp and final directories are on different filesystems
   */
  getStorage() {
    // Use memory storage to avoid EXDEV errors with Docker volumes
    return multer.memoryStorage();
  }

  /**
   * Get multer configuration with all security settings
   */
  getMulterConfig() {
    return multer({
      storage: this.getStorage(),
      fileFilter: this.fileFilter.bind(this),
      limits: {
        fileSize: this.maxFileSize,
        files: 1, // Only one file per request
        fieldSize: 1024 * 1024, // 1MB field size limit
        fieldNameSize: 100, // Field name size limit
        fields: 10, // Maximum number of non-file fields
        parts: 20 // Maximum number of parts
      }
    });
  }

  /**
   * Enhanced error handling middleware for multer errors
   * @param {Error} error - Multer error
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  handleMulterError(error, req, res, next) {
    logger.error('Upload middleware error:', {
      error: error.message,
      code: error.code,
      field: error.field,
      storageErrors: error.storageErrors
    });

    // Clean up any temporary files on error
    if (req.file && req.file.path) {
      this.cleanupTempFile(req.file.path);
    }

    if (error instanceof multer.MulterError) {
      switch (error.code) {
        case 'LIMIT_FILE_SIZE':
          return res.status(413).json({
            success: false,
            error: 'File too large. Maximum size is 10MB',
            code: 'FILE_TOO_LARGE'
          });
        case 'LIMIT_FILE_COUNT':
          return res.status(400).json({
            success: false,
            error: 'Too many files. Only one file allowed per upload',
            code: 'TOO_MANY_FILES'
          });
        case 'LIMIT_FIELD_COUNT':
          return res.status(400).json({
            success: false,
            error: 'Too many form fields',
            code: 'TOO_MANY_FIELDS'
          });
        case 'LIMIT_FIELD_KEY':
          return res.status(400).json({
            success: false,
            error: 'Field name too long',
            code: 'FIELD_NAME_TOO_LONG'
          });
        case 'LIMIT_FIELD_VALUE':
          return res.status(400).json({
            success: false,
            error: 'Field value too long',
            code: 'FIELD_VALUE_TOO_LONG'
          });
        case 'LIMIT_UNEXPECTED_FILE':
          return res.status(400).json({
            success: false,
            error: 'Unexpected file field. Use "invoice" field name',
            code: 'UNEXPECTED_FILE_FIELD'
          });
        case 'LIMIT_PART_COUNT':
          return res.status(400).json({
            success: false,
            error: 'Too many parts in multipart request',
            code: 'TOO_MANY_PARTS'
          });
        default:
          return res.status(400).json({
            success: false,
            error: `Upload error: ${error.message}`,
            code: 'UPLOAD_ERROR'
          });
      }
    }

    // Handle custom validation errors
    if (error.message.includes('Invalid file extension') ||
        error.message.includes('Invalid MIME type') ||
        error.message.includes('Security validation failed') ||
        error.message.includes('File too large') ||
        error.message.includes('Filename is too long') ||
        error.message.includes('suspicious')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'VALIDATION_ERROR'
      });
    }

    // Handle system errors
    if (error.message.includes('system error') ||
        error.message.includes('initialization failed')) {
      return res.status(500).json({
        success: false,
        error: 'Upload system temporarily unavailable',
        code: 'SYSTEM_ERROR'
      });
    }

    // Pass other errors to the next middleware
    next(error);
  }

  /**
   * Clean up temporary file
   * @param {string} filePath - Path to temporary file
   */
  cleanupTempFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug('Cleaned up temporary file:', filePath);
      }
    } catch (error) {
      logger.error('Failed to cleanup temporary file:', { filePath, error });
    }
  }

  /**
   * Request validation middleware for upload endpoints
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  validateUploadRequest(req, res, next) {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Rate limiting info (if implemented)
    const userAgent = req.get('User-Agent') || 'unknown';
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Log upload attempt with security info (debug level - verbose request details)
    logger.debug('Invoice upload request:', {
      expenseId: req.body.expenseId,
      userAgent: userAgent.substring(0, 200), // Limit log size
      ip: clientIP,
      timestamp: new Date().toISOString(),
      contentLength: req.get('Content-Length')
    });
    
    // Basic request validation
    if (req.get('Content-Type') && !req.get('Content-Type').includes('multipart/form-data')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid content type. Use multipart/form-data for file uploads',
        code: 'INVALID_CONTENT_TYPE'
      });
    }
    
    next();
  }

  /**
   * Progress tracking middleware (for future enhancement)
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  trackUploadProgress(req, res, next) {
    // This is a placeholder for future upload progress tracking
    // Could be enhanced with WebSocket or Server-Sent Events
    
    const contentLength = parseInt(req.get('Content-Length') || '0');
    if (contentLength > 1024 * 1024) { // 1MB threshold
      logger.debug('Large file upload detected:', {
        contentLength,
        expenseId: req.body.expenseId
      });
    }
    
    next();
  }

  /**
   * Concurrent upload protection middleware
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Next middleware
   */
  protectConcurrentUploads(req, res, next) {
    // Simple in-memory tracking (could be enhanced with Redis for production)
    const expenseId = req.body.expenseId;
    const clientIP = req.ip;
    
    if (expenseId) {
      const uploadKey = `upload_${expenseId}_${clientIP}`;
      
      // Check if upload is already in progress (this is a simplified check)
      // In production, you might want to use a more sophisticated locking mechanism
      if (req.app.locals.activeUploads && req.app.locals.activeUploads.has(uploadKey)) {
        return res.status(409).json({
          success: false,
          error: 'Upload already in progress for this expense',
          code: 'UPLOAD_IN_PROGRESS'
        });
      }
      
      // Mark upload as active
      if (!req.app.locals.activeUploads) {
        req.app.locals.activeUploads = new Set();
      }
      req.app.locals.activeUploads.add(uploadKey);
      
      // Clean up on response finish
      res.on('finish', () => {
        if (req.app.locals.activeUploads) {
          req.app.locals.activeUploads.delete(uploadKey);
        }
      });
    }
    
    next();
  }
}

// Create singleton instance
const uploadMiddleware = new UploadMiddleware();

module.exports = {
  upload: uploadMiddleware.getMulterConfig(),
  handleMulterError: uploadMiddleware.handleMulterError.bind(uploadMiddleware),
  validateUploadRequest: uploadMiddleware.validateUploadRequest.bind(uploadMiddleware),
  trackUploadProgress: uploadMiddleware.trackUploadProgress.bind(uploadMiddleware),
  protectConcurrentUploads: uploadMiddleware.protectConcurrentUploads.bind(uploadMiddleware),
  cleanupTempFile: uploadMiddleware.cleanupTempFile.bind(uploadMiddleware)
};
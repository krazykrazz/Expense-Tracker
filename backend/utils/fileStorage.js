const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const { getConfigDir } = require('../config/paths');

/**
 * File storage utilities for invoice management
 * Handles directory creation, file path generation, and cleanup operations
 */
class FileStorageUtils {
  constructor() {
    // Use centralized config directory (handles containerized vs development environments)
    const configDir = getConfigDir();
    this.baseInvoiceDir = path.join(configDir, 'invoices');
    this.tempDir = path.join(this.baseInvoiceDir, 'temp');
    
    logger.debug('Invoice storage initialized:', { 
      baseDir: this.baseInvoiceDir,
      tempDir: this.tempDir 
    });
  }

  /**
   * Initialize the invoice storage directory structure
   * Creates base directories with proper permissions
   */
  async initializeDirectories() {
    try {
      // Create base invoice directory
      await this.ensureDirectoryExists(this.baseInvoiceDir);
      
      // Create temp directory for uploads
      await this.ensureDirectoryExists(this.tempDir);
      
      logger.debug('Invoice storage directories initialized');
    } catch (error) {
      logger.error('Failed to initialize invoice directories:', error);
      throw error;
    }
  }

  /**
   * Generate organized directory path for a given date
   * Format: /config/invoices/YYYY/MM/
   * @param {Date} date - Date for directory organization
   * @returns {string} Directory path
   */
  generateDirectoryPath(date = new Date()) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return path.join(this.baseInvoiceDir, String(year), month);
  }

  /**
   * Generate unique filename for invoice
   * Format: {expense_id}_{timestamp}_{sanitized_original_name}.pdf
   * @param {number} expenseId - Expense ID
   * @param {string} originalFilename - Original filename
   * @returns {string} Sanitized unique filename
   */
  generateFilename(expenseId, originalFilename) {
    const timestamp = Date.now();
    const sanitizedName = this.sanitizeFilename(originalFilename);
    const extension = path.extname(sanitizedName).toLowerCase();
    const baseName = path.basename(sanitizedName, extension);
    
    return `${expenseId}_${timestamp}_${baseName}${extension}`;
  }

  /**
   * Sanitize filename to remove dangerous characters
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename
   */
  sanitizeFilename(filename) {
    if (!filename) return 'invoice.pdf';
    
    // Remove path separators and dangerous characters
    let sanitized = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    
    // Remove multiple consecutive underscores
    sanitized = sanitized.replace(/_+/g, '_');
    
    // Remove leading/trailing underscores and dots
    sanitized = sanitized.replace(/^[._]+|[._]+$/g, '');
    
    // Ensure it's not empty and has reasonable length
    if (!sanitized || sanitized.length === 0) {
      sanitized = 'invoice';
    }
    
    // Limit length (keep extension)
    const extension = path.extname(sanitized);
    const baseName = path.basename(sanitized, extension);
    const maxBaseLength = 100;
    
    if (baseName.length > maxBaseLength) {
      sanitized = baseName.substring(0, maxBaseLength) + extension;
    }
    
    // Ensure PDF extension
    if (!extension || extension.toLowerCase() !== '.pdf') {
      sanitized += '.pdf';
    }
    
    return sanitized;
  }

  /**
   * Generate full file path for invoice storage
   * @param {number} expenseId - Expense ID
   * @param {string} originalFilename - Original filename
   * @param {Date} date - Date for directory organization
   * @returns {Object} Object with directory path, filename, and full path
   */
  generateFilePath(expenseId, originalFilename, date = new Date()) {
    const directoryPath = this.generateDirectoryPath(date);
    const filename = this.generateFilename(expenseId, originalFilename);
    const fullPath = path.join(directoryPath, filename);
    
    return {
      directoryPath,
      filename,
      fullPath,
      relativePath: path.relative(this.baseInvoiceDir, fullPath)
    };
  }

  /**
   * Generate temporary file path for uploads
   * @param {string} originalFilename - Original filename
   * @returns {Object} Object with temp directory and file paths
   */
  generateTempFilePath(originalFilename) {
    const timestamp = Date.now();
    const sanitizedName = this.sanitizeFilename(originalFilename);
    const filename = `temp_${timestamp}_${sanitizedName}`;
    const fullPath = path.join(this.tempDir, filename);
    
    return {
      directoryPath: this.tempDir,
      filename,
      fullPath,
      relativePath: path.relative(this.baseInvoiceDir, fullPath)
    };
  }

  /**
   * Ensure directory exists, create if it doesn't
   * @param {string} dirPath - Directory path to create
   */
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.promises.access(dirPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.promises.mkdir(dirPath, { recursive: true, mode: 0o755 });
      } else {
        throw error;
      }
    }
  }

  /**
   * Move file from temporary location to final storage
   * Uses copy + delete to handle cross-device moves (EXDEV error)
   * @param {string} tempPath - Temporary file path
   * @param {string} finalPath - Final storage path
   */
  async moveFromTemp(tempPath, finalPath) {
    try {
      // Ensure destination directory exists
      const destDir = path.dirname(finalPath);
      await this.ensureDirectoryExists(destDir);
      
      // Copy file to final location (handles cross-device moves)
      await fs.promises.copyFile(tempPath, finalPath);
      
      // Delete temp file after successful copy
      await fs.promises.unlink(tempPath);
    } catch (error) {
      logger.error('Failed to move file from temp:', error);
      // Clean up partial copy if it exists
      try {
        await fs.promises.unlink(finalPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Delete file safely
   * @param {string} filePath - Path to file to delete
   */
  async deleteFile(filePath) {
    try {
      await fs.promises.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to delete file:', error);
        throw error;
      }
      // File doesn't exist, which is fine for deletion
    }
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
   * Get file stats (size, dates, etc.)
   * @param {string} filePath - Path to file
   * @returns {Object} File stats
   */
  async getFileStats(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isFile: stats.isFile()
      };
    } catch (error) {
      logger.error('Failed to get file stats:', error);
      throw error;
    }
  }

  /**
   * Clean up temporary files older than specified age
   * @param {number} maxAgeHours - Maximum age in hours (default: 24)
   */
  async cleanupTempFiles(maxAgeHours = 24) {
    try {
      const files = await fs.promises.readdir(this.tempDir);
      const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
      const now = Date.now();
      
      let cleanedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.promises.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await this.deleteFile(filePath);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} temporary files`);
      }
      
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup temp files:', error);
      throw error;
    }
  }

  /**
   * Clean up orphaned invoice files (files without database records)
   * @param {Function} getValidExpenseIds - Function that returns array of valid expense IDs
   */
  async cleanupOrphanedFiles(getValidExpenseIds) {
    try {
      const validIds = await getValidExpenseIds();
      const validIdSet = new Set(validIds.map(id => String(id)));
      
      let cleanedCount = 0;
      
      // Walk through year directories
      const years = await this.getDirectoryContents(this.baseInvoiceDir);
      
      for (const year of years) {
        const yearPath = path.join(this.baseInvoiceDir, year);
        if (year === 'temp') continue; // Skip temp directory
        
        const months = await this.getDirectoryContents(yearPath);
        
        for (const month of months) {
          const monthPath = path.join(yearPath, month);
          const files = await this.getDirectoryContents(monthPath);
          
          for (const file of files) {
            // Extract expense ID from filename (format: {expense_id}_{timestamp}_{name}.pdf)
            const expenseId = file.split('_')[0];
            
            if (!validIdSet.has(expenseId)) {
              const filePath = path.join(monthPath, file);
              await this.deleteFile(filePath);
              cleanedCount++;
            }
          }
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} orphaned invoice files`);
      }
      
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup orphaned files:', error);
      throw error;
    }
  }

  /**
   * Get directory contents safely
   * @param {string} dirPath - Directory path
   * @returns {Array} Array of directory contents
   */
  async getDirectoryContents(dirPath) {
    try {
      const stats = await fs.promises.stat(dirPath);
      if (!stats.isDirectory()) {
        return [];
      }
      return await fs.promises.readdir(dirPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get storage usage statistics
   * @returns {Object} Storage usage information
   */
  async getStorageStats() {
    try {
      let totalFiles = 0;
      let totalSize = 0;
      
      const years = await this.getDirectoryContents(this.baseInvoiceDir);
      
      for (const year of years) {
        if (year === 'temp') continue;
        
        const yearPath = path.join(this.baseInvoiceDir, year);
        const months = await this.getDirectoryContents(yearPath);
        
        for (const month of months) {
          const monthPath = path.join(yearPath, month);
          const files = await this.getDirectoryContents(monthPath);
          
          for (const file of files) {
            const filePath = path.join(monthPath, file);
            const stats = await fs.promises.stat(filePath);
            if (stats.isFile()) {
              totalFiles++;
              totalSize += stats.size;
            }
          }
        }
      }
      
      return {
        totalFiles,
        totalSize,
        totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100
      };
    } catch (error) {
      logger.error('Failed to get storage stats:', error);
      throw error;
    }
  }
}

module.exports = new FileStorageUtils();
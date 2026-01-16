const cron = require('node-cron');
const logger = require('../config/logger');
const fileStorage = require('./fileStorage');
const { getDatabase } = require('../database/db');

/**
 * Invoice file cleanup utilities
 * Handles scheduled cleanup of temporary files and orphaned invoices
 */
class InvoiceCleanupUtils {
  constructor() {
    this.cleanupJob = null;
    this.isRunning = false;
  }

  /**
   * Start scheduled cleanup jobs
   * @param {Object} options - Cleanup configuration
   */
  startScheduledCleanup(options = {}) {
    const {
      tempFileCleanupHours = 24,
      orphanedFileCleanupDays = 7,
      cronSchedule = '0 2 * * *' // Daily at 2 AM
    } = options;

    if (this.cleanupJob) {
      logger.warn('Cleanup job already running, stopping existing job');
      this.stopScheduledCleanup();
    }

    this.cleanupJob = cron.schedule(cronSchedule, async () => {
      if (this.isRunning) {
        logger.warn('Cleanup job already in progress, skipping this run');
        return;
      }

      try {
        this.isRunning = true;
        logger.info('Starting scheduled invoice cleanup');

        // Clean up temporary files
        const tempCleaned = await fileStorage.cleanupTempFiles(tempFileCleanupHours);
        
        // Clean up orphaned files
        const orphanedCleaned = await this.cleanupOrphanedFiles();

        logger.info('Scheduled cleanup completed', {
          tempFilesCleaned: tempCleaned,
          orphanedFilesCleaned: orphanedCleaned
        });

      } catch (error) {
        logger.error('Scheduled cleanup failed:', error);
      } finally {
        this.isRunning = false;
      }
    }, {
      scheduled: false,
      timezone: 'America/Toronto' // Adjust timezone as needed
    });

    this.cleanupJob.start();
    logger.info('Invoice cleanup job scheduled', { cronSchedule });
  }

  /**
   * Stop scheduled cleanup jobs
   */
  stopScheduledCleanup() {
    if (this.cleanupJob) {
      this.cleanupJob.stop();
      this.cleanupJob = null;
      logger.info('Invoice cleanup job stopped');
    }
  }

  /**
   * Clean up orphaned invoice files (files without database records)
   * @returns {number} Number of files cleaned up
   */
  async cleanupOrphanedFiles() {
    try {
      const validExpenseIds = await this.getValidExpenseIds();
      const cleanedCount = await fileStorage.cleanupOrphanedFiles(() => validExpenseIds);
      
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
   * Get list of valid expense IDs from database
   * @returns {Array} Array of expense IDs
   */
  async getValidExpenseIds() {
    return new Promise((resolve, reject) => {
      getDatabase()
        .then(db => {
          db.all('SELECT id FROM expenses', [], (err, rows) => {
            if (err) {
              reject(err);
              return;
            }
            
            const ids = rows.map(row => row.id);
            resolve(ids);
          });
        })
        .catch(reject);
    });
  }

  /**
   * Perform manual cleanup of all temporary and orphaned files
   * @param {Object} options - Cleanup options
   * @returns {Object} Cleanup results
   */
  async performManualCleanup(options = {}) {
    const {
      cleanTempFiles = true,
      cleanOrphanedFiles = true,
      tempFileMaxAge = 1 // 1 hour for manual cleanup
    } = options;

    const results = {
      tempFilesCleaned: 0,
      orphanedFilesCleaned: 0,
      errors: []
    };

    try {
      if (cleanTempFiles) {
        try {
          results.tempFilesCleaned = await fileStorage.cleanupTempFiles(tempFileMaxAge);
        } catch (error) {
          results.errors.push(`Temp file cleanup failed: ${error.message}`);
        }
      }

      if (cleanOrphanedFiles) {
        try {
          results.orphanedFilesCleaned = await this.cleanupOrphanedFiles();
        } catch (error) {
          results.errors.push(`Orphaned file cleanup failed: ${error.message}`);
        }
      }

      logger.info('Manual cleanup completed', results);
      return results;

    } catch (error) {
      logger.error('Manual cleanup failed:', error);
      results.errors.push(`General cleanup error: ${error.message}`);
      return results;
    }
  }

  /**
   * Get cleanup statistics
   * @returns {Object} Cleanup statistics
   */
  async getCleanupStats() {
    try {
      const storageStats = await fileStorage.getStorageStats();
      const tempFiles = await this.getTempFileStats();
      
      return {
        storage: storageStats,
        tempFiles,
        lastCleanup: this.lastCleanupTime || null,
        isScheduled: !!this.cleanupJob,
        isRunning: this.isRunning
      };
    } catch (error) {
      logger.error('Failed to get cleanup stats:', error);
      throw error;
    }
  }

  /**
   * Get temporary file statistics
   * @returns {Object} Temp file stats
   */
  async getTempFileStats() {
    try {
      const tempDir = fileStorage.tempDir;
      const files = await fileStorage.getDirectoryContents(tempDir);
      
      let totalSize = 0;
      let oldFiles = 0;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      const now = Date.now();

      for (const file of files) {
        const filePath = require('path').join(tempDir, file);
        const stats = await fileStorage.getFileStats(filePath);
        totalSize += stats.size;
        
        if (now - stats.modified.getTime() > maxAge) {
          oldFiles++;
        }
      }

      return {
        totalFiles: files.length,
        totalSize,
        totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
        oldFiles
      };
    } catch (error) {
      logger.error('Failed to get temp file stats:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        totalSizeMB: 0,
        oldFiles: 0,
        error: error.message
      };
    }
  }

  /**
   * Validate invoice file integrity
   * @param {string} filePath - Path to invoice file
   * @returns {Object} Validation result
   */
  async validateInvoiceFile(filePath) {
    try {
      const exists = await fileStorage.fileExists(filePath);
      if (!exists) {
        return {
          isValid: false,
          error: 'File does not exist'
        };
      }

      const stats = await fileStorage.getFileStats(filePath);
      
      // Basic validation
      if (stats.size === 0) {
        return {
          isValid: false,
          error: 'File is empty'
        };
      }

      if (stats.size > 10 * 1024 * 1024) { // 10MB limit
        return {
          isValid: false,
          error: 'File is too large'
        };
      }

      return {
        isValid: true,
        size: stats.size,
        created: stats.created,
        modified: stats.modified
      };

    } catch (error) {
      logger.error('File validation error:', error);
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Emergency cleanup - remove all temporary files regardless of age
   * @returns {number} Number of files removed
   */
  async emergencyCleanup() {
    try {
      logger.warn('Performing emergency cleanup of all temporary files');
      
      const tempDir = fileStorage.tempDir;
      const files = await fileStorage.getDirectoryContents(tempDir);
      
      let removedCount = 0;
      for (const file of files) {
        const filePath = require('path').join(tempDir, file);
        try {
          await fileStorage.deleteFile(filePath);
          removedCount++;
        } catch (error) {
          logger.error(`Failed to delete temp file ${filePath}:`, error);
        }
      }

      logger.warn(`Emergency cleanup completed: ${removedCount} files removed`);
      return removedCount;

    } catch (error) {
      logger.error('Emergency cleanup failed:', error);
      throw error;
    }
  }
}

module.exports = new InvoiceCleanupUtils();
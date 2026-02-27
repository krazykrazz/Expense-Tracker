const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('../database/db');
const { getBackupPath, getBackupConfigPath, getInvoicesPath, getStatementsPath } = require('../config/paths');
const logger = require('../config/logger');
const archiveUtils = require('../utils/archiveUtils');
const activityLogService = require('./activityLogService');

class BackupService {
  constructor() {
    this.scheduledJob = null;
    this.loadConfig();
  }

  /**
   * Load backup configuration
   */
  loadConfig() {
    try {
      const configPath = getBackupConfigPath();
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        this.config = JSON.parse(data);
      } else {
        this.config = {
          enabled: false,
          schedule: 'daily',
          time: '02:00',
          targetPath: getBackupPath(),
          keepLastN: 7,
          lastBackup: null
        };
        this.saveConfig();
      }
    } catch (error) {
      logger.error('Error loading backup config:', error);
      this.config = {
        enabled: false,
        schedule: 'daily',
        time: '02:00',
        targetPath: getBackupPath(),
        keepLastN: 7,
        lastBackup: null
      };
    }
  }

  /**
   * Save backup configuration
   */
  saveConfig() {
    try {
      const configPath = getBackupConfigPath();
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      logger.error('Error saving backup config:', error);
      throw error;
    }
  }

  /**
   * Get current backup configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update backup configuration
   */
  updateConfig(newConfig) {
    // Validate targetPath if provided (SEC-004: path traversal prevention)
    if (newConfig.targetPath !== undefined) {
      this._validateTargetPath(newConfig.targetPath);
    }

    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    
    // Restart scheduler with new config
    if (this.config.enabled) {
      this.startScheduler();
    } else {
      this.stopScheduler();
    }
    
    return this.config;
  }

  /**
   * Validate that a target path is within the allowed base configuration directory.
   * Prevents path traversal attacks (SEC-004).
   * @param {string} targetPath - The path to validate
   * @throws {Error} If the path resolves outside the allowed directory
   */
  _validateTargetPath(targetPath) {
    const { getConfigDir } = require('../config/paths');
    const configDir = getConfigDir();
    const resolvedBase = path.resolve(configDir);
    const resolvedTarget = path.resolve(targetPath);

    if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
      const error = new Error('Target path must be within the configuration directory');
      error.statusCode = 400;
      throw error;
    }
  }

  /**
   * Perform a comprehensive backup
   * Creates tar.gz archive with database, invoices, and config
   * @param {string} targetPath - Optional custom backup path
   * @returns {Promise<{success: boolean, filename: string, path: string, timestamp: string, size: number}>}
   */
  async performBackup(targetPath = null) {
    try {
      // Check if database exists
      if (!fs.existsSync(DB_PATH)) {
        throw new Error('Database file not found');
      }

      // Run integrity check before backup (BUG-007 fix)
      try {
        const { getDatabase } = require('../database/db');
        const db = await getDatabase();
        const integrityResult = await new Promise((resolve, reject) => {
          db.get('PRAGMA integrity_check', (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        if (!integrityResult || integrityResult.integrity_check !== 'ok') {
          logger.warn('Database integrity check failed before backup:', integrityResult);
        }
      } catch (integrityError) {
        logger.warn('Could not run integrity check before backup:', integrityError.message);
      }

      // Use configured backup path or default from paths module
      const backupPath = targetPath || this.config.targetPath || getBackupPath();
      
      logger.debug('Backup path being used:', backupPath);
      
      // Create backup directory if it doesn't exist
      if (!fs.existsSync(backupPath)) {
        try {
          fs.mkdirSync(backupPath, { recursive: true });
        } catch (error) {
          throw new Error(`Cannot create backup directory at "${backupPath}": ${error.message}`);
        }
      }

      // Generate filename with version, optional SHA, and timestamp
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
      const packageJson = require('../package.json');
      const version = packageJson.version || 'unknown';
      const gitCommit = process.env.GIT_COMMIT;
      const shaSuffix = gitCommit && gitCommit !== 'unknown' ? `-${gitCommit.substring(0, 7)}` : '';
      const filename = `expense-tracker-backup-v${version}${shaSuffix}-${timestamp}.tar.gz`;
      const fullPath = path.join(backupPath, filename);

      // Checkpoint WAL to ensure all data is flushed to the main database file
      // This is critical for backup integrity when WAL mode is enabled
      try {
        const { getDatabase } = require('../database/db');
        const db = await getDatabase();
        await new Promise((resolve, reject) => {
          db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
            if (err) {
              logger.warn('WAL checkpoint before backup failed:', err.message);
              resolve(); // Non-fatal: proceed with backup anyway
            } else {
              logger.debug('WAL checkpoint completed before backup');
              resolve();
            }
          });
        });
        // Do NOT close this connection — in test environments getDatabase()
        // returns a singleton, and closing it causes SQLITE_MISUSE on all
        // subsequent queries.  On Windows the open handle also prevents
        // stale WAL files from being cleaned up during restore.  The
        // checkpoint already flushed all data to the main DB file, so the
        // archive will capture a consistent snapshot.
      } catch (checkpointError) {
        logger.warn('Could not run WAL checkpoint before backup:', checkpointError.message);
      }

      // Collect entries for the archive
      const entries = [];

      // Always include database
      entries.push({
        source: DB_PATH,
        archivePath: 'database/expenses.db'
      });

      // Include invoices directory if it exists and has content
      const invoicesPath = getInvoicesPath();
      if (fs.existsSync(invoicesPath)) {
        const invoiceContents = this._getDirectoryContents(invoicesPath);
        if (invoiceContents.length > 0) {
          entries.push({
            source: invoicesPath,
            archivePath: 'invoices'
          });
        } else {
          logger.debug('Invoice directory is empty, skipping in backup');
        }
      } else {
        logger.debug('Invoice directory does not exist, skipping in backup');
      }

      // Include credit card statements directory if it exists and has content
      const statementsPath = getStatementsPath();
      if (fs.existsSync(statementsPath)) {
        const statementContents = this._getDirectoryContents(statementsPath);
        if (statementContents.length > 0) {
          entries.push({
            source: statementsPath,
            archivePath: 'statements'
          });
        } else {
          logger.debug('Statements directory is empty, skipping in backup');
        }
      } else {
        logger.debug('Statements directory does not exist, skipping in backup');
      }

      // Include backup config if it exists
      const configPath = getBackupConfigPath();
      if (fs.existsSync(configPath)) {
        entries.push({
          source: configPath,
          archivePath: 'config/backupConfig.json'
        });
      }

      // Create the archive
      const archiveResult = await archiveUtils.createArchive(fullPath, entries);

      // Update last backup time
      this.config.lastBackup = new Date().toISOString();
      this.saveConfig();

      // Clean up old backups
      this.cleanupOldBackups(backupPath);

      // Log backup creation event (fire-and-forget, don't let logging failures affect backup)
      try {
        await activityLogService.logEvent(
          'backup_created',
          'system',
          null,
          `Created backup: ${filename}`,
          {
            filename,
            size: archiveResult.size
          }
        );
      } catch (logError) {
        logger.warn('Failed to log backup creation event:', logError);
      }

      return {
        success: true,
        filename,
        path: fullPath,
        timestamp: this.config.lastBackup,
        size: archiveResult.size
      };
    } catch (error) {
      logger.error('Backup error:', error);
      throw error;
    }
  }

  /**
   * Get contents of a directory (non-recursive, just to check if empty)
   * @param {string} dirPath - Directory path
   * @returns {Array<string>} List of items in directory
   * @private
   */
  _getDirectoryContents(dirPath) {
    try {
      return fs.readdirSync(dirPath).filter(item => {
        // Exclude temp directory
        return item !== 'temp';
      });
    } catch (error) {
      logger.warn('Error reading directory:', error.message);
      return [];
    }
  }

  /**
   * Count PDF statement files in the statements directory
   * @returns {Promise<number>} Number of PDF files
   * @private
   */
  async _countStatementFiles() {
    try {
      const statementsPath = getStatementsPath();
      if (!fs.existsSync(statementsPath)) {
        return 0;
      }
      
      let count = 0;
      const countFilesRecursively = (dirPath) => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            countFilesRecursively(fullPath);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
            count++;
          }
        }
      };
      
      countFilesRecursively(statementsPath);
      return count;
    } catch (error) {
      logger.warn('Error counting statement files:', error.message);
      return 0;
    }
  }

  /**
   * Clean up old backups, keeping only the last N
   */
  cleanupOldBackups(backupPath) {
    try {
      if (!this.config.keepLastN || this.config.keepLastN <= 0) {
        return;
      }

      // Get all backup files (support both old .db and new .tar.gz formats)
      const files = fs.readdirSync(backupPath)
        .filter(file => file.startsWith('expense-tracker-backup-') && 
                       (file.endsWith('.tar.gz') || file.endsWith('.db')))
        .map(file => ({
          name: file,
          path: path.join(backupPath, file),
          time: fs.statSync(path.join(backupPath, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time); // Sort by newest first

      // Delete old backups
      if (files.length > this.config.keepLastN) {
        const filesToDelete = files.slice(this.config.keepLastN);
        filesToDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
            logger.info(`Deleted old backup: ${file.name}`);
          } catch (error) {
            logger.error(`Error deleting backup ${file.name}:`, error);
          }
        });
      }
    } catch (error) {
      logger.error('Error cleaning up old backups:', error);
    }
  }

  /**
   * Calculate next backup time based on schedule
   */
  getNextBackupTime() {
    if (!this.config.enabled) {
      return null;
    }

    const now = new Date();
    const [hours, minutes] = this.config.time.split(':').map(Number);
    
    let nextBackup = new Date();
    nextBackup.setHours(hours, minutes, 0, 0);

    // If the time has passed today, schedule for tomorrow
    if (nextBackup <= now) {
      nextBackup.setDate(nextBackup.getDate() + 1);
    }

    return nextBackup;
  }

  /**
   * Start the backup scheduler
   */
  startScheduler() {
    this.stopScheduler(); // Clear any existing scheduler

    if (!this.config.enabled) {
      return;
    }

    const MIN_BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

    const checkAndBackup = () => {
      const nextBackup = this.getNextBackupTime();
      if (!nextBackup) return;

      const now = new Date();
      const timeUntilBackup = nextBackup.getTime() - now.getTime();

      logger.info(`Next backup scheduled for: ${nextBackup.toLocaleString()}`);

      this.scheduledJob = setTimeout(async () => {
        // Guard against duplicate backups caused by setTimeout timer drift.
        // setTimeout can fire a few seconds early, causing a backup at e.g. 1:59:55,
        // then getNextBackupTime() still sees today's 2:00:00 as future and schedules
        // another immediate backup. Skip if last backup was less than 5 minutes ago.
        if (this.config.lastBackup) {
          const timeSinceLastBackup = Date.now() - new Date(this.config.lastBackup).getTime();
          if (timeSinceLastBackup < MIN_BACKUP_INTERVAL_MS) {
            logger.info(`Skipping scheduled backup — last backup was ${Math.round(timeSinceLastBackup / 1000)}s ago (minimum interval: ${MIN_BACKUP_INTERVAL_MS / 1000}s)`);
            checkAndBackup();
            return;
          }
        }

        logger.info('Performing scheduled backup...');
        try {
          const result = await this.performBackup();
          logger.info('Scheduled backup completed:', result.filename);
        } catch (error) {
          logger.error('Scheduled backup failed:', error);
        }
        
        // Schedule next backup
        checkAndBackup();
      }, timeUntilBackup);
    };

    checkAndBackup();
  }

  /**
   * Stop the backup scheduler
   */
  stopScheduler() {
    if (this.scheduledJob) {
      clearTimeout(this.scheduledJob);
      this.scheduledJob = null;
      logger.info('Backup scheduler stopped');
    }
  }

  /**
   * Restore from an archive backup
   * Extracts and restores the database, invoice files, credit card statements, and configuration
   * @param {string} backupPath - Path to the backup archive file
   * @param {Object} options - Optional parameters
   * @param {boolean} options.skipExtensionCheck - Skip .tar.gz extension check (for temp files from uploads)
   * @returns {Promise<{success: boolean, filesRestored: number, message: string}>}
   */
  async restoreBackup(backupPath, options = {}) {
    if (!backupPath) {
      throw new Error('Backup file path is required');
    }

    // Verify backup file exists
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }

    // Verify it's a tar.gz file (skip for temp files from uploads where controller already validated)
    if (!options.skipExtensionCheck && !backupPath.endsWith('.tar.gz')) {
      throw new Error('Invalid backup file format. Expected .tar.gz archive');
    }

    try {
      // Create a temporary extraction directory
      const tempExtractPath = path.join(path.dirname(backupPath), `restore_temp_${Date.now()}`);
      
      try {
        // Extract the archive to temp directory
        const extractResult = await archiveUtils.extractArchive(backupPath, tempExtractPath);
        
        if (!extractResult.success) {
          throw new Error('Failed to extract backup archive');
        }

        let filesRestored = 0;

        // Restore database
        const extractedDbPath = path.join(tempExtractPath, 'database', 'expenses.db');
        if (fs.existsSync(extractedDbPath)) {
          // Remove stale WAL and SHM files before restoring
          // These can contain outdated data that conflicts with the restored database
          const walPath = DB_PATH + '-wal';
          const shmPath = DB_PATH + '-shm';
          try {
            if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
            if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
          } catch (cleanupErr) {
            logger.warn('Could not remove WAL/SHM files before restore:', cleanupErr.message);
          }
          
          fs.copyFileSync(extractedDbPath, DB_PATH);
          filesRestored++;
          logger.info('Database restored successfully');
        } else {
          logger.warn('No database file found in backup archive');
        }

        // Restore invoices (preserving directory structure)
        // Check for both new 'invoices/' and old 'uploads/' paths for backward compatibility
        const extractedInvoicesPath = path.join(tempExtractPath, 'invoices');
        const extractedUploadsPath = path.join(tempExtractPath, 'uploads');
        const invoicesPath = getInvoicesPath();
        
        if (fs.existsSync(extractedInvoicesPath)) {
          const invoiceFilesRestored = await this._restoreDirectory(extractedInvoicesPath, invoicesPath);
          filesRestored += invoiceFilesRestored;
          logger.info(`Invoices restored: ${invoiceFilesRestored} files`);
        } else if (fs.existsSync(extractedUploadsPath)) {
          // Handle old backup format with 'uploads/' directory
          const invoiceFilesRestored = await this._restoreDirectory(extractedUploadsPath, invoicesPath);
          filesRestored += invoiceFilesRestored;
          logger.info(`Invoices restored from legacy 'uploads/' path: ${invoiceFilesRestored} files`);
        } else {
          logger.debug('No invoices directory found in backup archive');
        }

        // Restore credit card statements (preserving directory structure)
        const extractedStatementsPath = path.join(tempExtractPath, 'statements');
        const statementsPath = getStatementsPath();
        
        if (fs.existsSync(extractedStatementsPath)) {
          const statementFilesRestored = await this._restoreDirectory(extractedStatementsPath, statementsPath);
          filesRestored += statementFilesRestored;
          logger.info(`Credit card statements restored: ${statementFilesRestored} files`);
        } else {
          logger.debug('No statements directory found in backup archive');
        }

        // Restore config
        const extractedConfigPath = path.join(tempExtractPath, 'config', 'backupConfig.json');
        if (fs.existsSync(extractedConfigPath)) {
          const configPath = getBackupConfigPath();
          const configDir = path.dirname(configPath);
          if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
          }
          fs.copyFileSync(extractedConfigPath, configPath);
          filesRestored++;
          logger.info('Configuration restored successfully');
          
          // Reload config after restore
          this.loadConfig();
        } else {
          logger.debug('No configuration file found in backup archive');
        }

        // Check if payment method migration is needed
        // This handles restoring from backups created before the configurable payment methods feature
        await this._checkAndRunPaymentMethodMigration();

        // Log backup restoration event (fire-and-forget, don't let logging failures affect restore)
        try {
          await activityLogService.logEvent(
            'backup_restored',
            'system',
            null,
            `Restored backup: ${path.basename(backupPath)}`,
            {
              filename: path.basename(backupPath),
              filesRestored
            }
          );
        } catch (logError) {
          logger.warn('Failed to log backup restoration event:', logError);
        }

        return {
          success: true,
          filesRestored,
          message: `Restore completed successfully. ${filesRestored} files restored.`
        };
      } finally {
        // Clean up temp extraction directory
        if (fs.existsSync(tempExtractPath)) {
          await fs.promises.rm(tempExtractPath, { recursive: true, force: true });
        }
      }
    } catch (error) {
      logger.error('Restore error:', error);
      throw error;
    }
  }

  /**
   * Recursively restore a directory, counting files restored
   * @param {string} srcDir - Source directory
   * @param {string} destDir - Destination directory
   * @returns {Promise<number>} Number of files restored
   * @private
   */
  async _restoreDirectory(srcDir, destDir) {
    let filesRestored = 0;

    // Ensure destination directory exists
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const entries = fs.readdirSync(srcDir, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (entry.isDirectory()) {
        // Recursively restore subdirectory
        filesRestored += await this._restoreDirectory(srcPath, destPath);
      } else {
        // Copy file with retry for Windows file-locking issues
        const destFileDir = path.dirname(destPath);
        if (!fs.existsSync(destFileDir)) {
          fs.mkdirSync(destFileDir, { recursive: true });
        }
        
        let copied = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            fs.copyFileSync(srcPath, destPath);
            copied = true;
            break;
          } catch (err) {
            if ((err.code === 'EBUSY' || err.code === 'EPERM') && attempt < 2) {
              // Wait briefly and retry on Windows file-locking errors
              await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
            } else {
              throw err;
            }
          }
        }
        if (copied) {
          filesRestored++;
        }
      }
    }

    return filesRestored;
  }

  /**
   * Get list of existing backups
   */
  getBackupList() {
    try {
      const backupPath = this.config.targetPath || getBackupPath();
      
      if (!fs.existsSync(backupPath)) {
        return [];
      }

      // Support both old .db and new .tar.gz formats
      // Old: expense-tracker-backup-2026-02-13_10-54-19.tar.gz
      // New: expense-tracker-backup-v5.11.2-1a99337-2026-02-13_10-54-19.tar.gz
      const files = fs.readdirSync(backupPath)
        .filter(file => file.startsWith('expense-tracker-backup-') && 
                       (file.endsWith('.tar.gz') || file.endsWith('.db')))
        .map(file => {
          const stats = fs.statSync(path.join(backupPath, file));
          // Extract version and SHA from new format filenames
          const metaMatch = file.match(/expense-tracker-backup-v([\d.]+?)(?:-([a-f0-9]{7}))?-\d{4}/);
          return {
            name: file,
            size: stats.size,
            created: stats.mtime.toISOString(),
            path: path.join(backupPath, file),
            type: file.endsWith('.tar.gz') ? 'archive' : 'database',
            version: metaMatch ? metaMatch[1] : null,
            sha: metaMatch ? metaMatch[2] || null : null
          };
        })
        .sort((a, b) => new Date(b.created) - new Date(a.created));

      return files;
    } catch (error) {
      logger.error('Error getting backup list:', error);
      return [];
    }
  }

  /**
   * Get backup storage statistics
   * @returns {Promise<{totalBackupSize: number, totalBackupSizeMB: number, backupCount: number, invoiceStorageSize: number, invoiceStorageSizeMB: number, invoiceCount: number, expenseCount: number, databaseSize: number, databaseSizeMB: number, statementCount: number, paymentMethodCount: number, creditCardPaymentCount: number}>}
   */
  async getStorageStats() {
    try {
      const fileStorage = require('../utils/fileStorage');
      const { getDatabase } = require('../database/db');
      const { getDatabasePath } = require('../config/paths');
      
      // Get backup statistics
      const backupList = this.getBackupList();
      const totalBackupSize = backupList.reduce((sum, backup) => sum + backup.size, 0);
      const backupCount = backupList.length;
      
      // Get invoice storage statistics
      const invoiceStats = await fileStorage.getStorageStats();
      
      // Get database counts
      let expenseCount = 0;
      let statementCount = 0;
      let paymentMethodCount = 0;
      let creditCardPaymentCount = 0;
      
      try {
        const db = await getDatabase();
        
        // Get expense count
        expenseCount = await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM expenses', [], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.count : 0);
          });
        });
        
        // Get credit card statement count (PDF files in statements directory)
        statementCount = await this._countStatementFiles();
        
        // Get payment method count
        paymentMethodCount = await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM payment_methods', [], (err, row) => {
            if (err) {
              logger.debug('payment_methods table may not exist:', err.message);
              resolve(0);
            } else {
              resolve(row ? row.count : 0);
            }
          });
        });
        
        // Get credit card payment count
        creditCardPaymentCount = await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM credit_card_payments', [], (err, row) => {
            if (err) {
              logger.debug('credit_card_payments table may not exist:', err.message);
              resolve(0);
            } else {
              resolve(row ? row.count : 0);
            }
          });
        });
      } catch (dbError) {
        logger.warn('Could not get database counts:', dbError);
      }
      
      // Get database file size
      let databaseSize = 0;
      try {
        const dbPath = getDatabasePath();
        if (fs.existsSync(dbPath)) {
          const dbStats = fs.statSync(dbPath);
          databaseSize = dbStats.size;
        }
      } catch (fsError) {
        logger.warn('Could not get database size:', fsError);
      }
      
      return {
        totalBackupSize,
        totalBackupSizeMB: Math.round(totalBackupSize / (1024 * 1024) * 100) / 100,
        backupCount,
        invoiceStorageSize: invoiceStats.totalSize,
        invoiceStorageSizeMB: invoiceStats.totalSizeMB,
        invoiceCount: invoiceStats.totalFiles,
        expenseCount,
        databaseSize,
        databaseSizeMB: Math.round(databaseSize / (1024 * 1024) * 100) / 100,
        statementCount,
        paymentMethodCount,
        creditCardPaymentCount
      };
    } catch (error) {
      logger.error('Error getting storage stats:', error);
      throw error;
    }
  }

  /**
   * Check if payment method migration is needed and run it if so
   * This handles restoring from backups created before the configurable payment methods feature.
   * With the consolidated schema, initializeDatabase() already creates all tables
   * and seeds default payment methods, so this is a lightweight safety check.
   * @private
   */
  async _checkAndRunPaymentMethodMigration() {
    try {
      const { getDatabase, initializeDatabase } = require('../database/db');
      
      // Reinitialize database connection to work with restored database
      // initializeDatabase() runs the full consolidated schema + runMigrations
      await initializeDatabase();
      const db = await getDatabase();
      
      // Verify payment_methods table exists and has data
      const paymentMethodCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM payment_methods', (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.count : 0);
        });
      });
      
      if (paymentMethodCount === 0) {
        logger.warn('Payment methods table is empty after initialization — this should not happen with consolidated schema');
      } else {
        logger.debug('Payment methods verified in restored database:', { count: paymentMethodCount });
      }

      // Re-initialize auth state from restored database to prevent stale cache.
      // Without this, restoring a pre-auth backup into a password-protected system
      // leaves the in-memory auth cache thinking a password is still set, causing lockout.
      const authService = require('./authService');
      await authService.initializeDefaultUser();
      logger.info('Auth state re-initialized after backup restore');
    } catch (error) {
      logger.error('Error checking payment methods after restore:', error);
      // Don't throw - migration failure shouldn't fail the entire restore
    }
  }
}

module.exports = new BackupService();

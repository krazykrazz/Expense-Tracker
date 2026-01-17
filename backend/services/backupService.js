const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('../database/db');
const { getBackupPath, getBackupConfigPath, getInvoicesPath } = require('../config/paths');
const logger = require('../config/logger');
const archiveUtils = require('../utils/archiveUtils');

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

      // Generate filename with timestamp (format: YYYY-MM-DD_HH-mm-ss)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
      const filename = `expense-tracker-backup-${timestamp}.tar.gz`;
      const fullPath = path.join(backupPath, filename);

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

    const checkAndBackup = () => {
      const nextBackup = this.getNextBackupTime();
      if (!nextBackup) return;

      const now = new Date();
      const timeUntilBackup = nextBackup.getTime() - now.getTime();

      logger.info(`Next backup scheduled for: ${nextBackup.toLocaleString()}`);

      this.scheduledJob = setTimeout(async () => {
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
   * Extracts and restores the database, invoice files, and configuration
   * @param {string} backupPath - Path to the backup archive file
   * @returns {Promise<{success: boolean, filesRestored: number, message: string}>}
   */
  async restoreBackup(backupPath) {
    if (!backupPath) {
      throw new Error('Backup file path is required');
    }

    // Verify backup file exists
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }

    // Verify it's a tar.gz file
    if (!backupPath.endsWith('.tar.gz')) {
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
          fs.copyFileSync(extractedDbPath, DB_PATH);
          filesRestored++;
          logger.info('Database restored successfully');
        } else {
          logger.warn('No database file found in backup archive');
        }

        // Restore invoices (preserving directory structure)
        const extractedInvoicesPath = path.join(tempExtractPath, 'invoices');
        if (fs.existsSync(extractedInvoicesPath)) {
          const invoicesPath = getInvoicesPath();
          const invoiceFilesRestored = await this._restoreDirectory(extractedInvoicesPath, invoicesPath);
          filesRestored += invoiceFilesRestored;
          logger.info(`Invoices restored: ${invoiceFilesRestored} files`);
        } else {
          logger.debug('No invoices directory found in backup archive');
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
        // Copy file
        const destFileDir = path.dirname(destPath);
        if (!fs.existsSync(destFileDir)) {
          fs.mkdirSync(destFileDir, { recursive: true });
        }
        fs.copyFileSync(srcPath, destPath);
        filesRestored++;
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
      const files = fs.readdirSync(backupPath)
        .filter(file => file.startsWith('expense-tracker-backup-') && 
                       (file.endsWith('.tar.gz') || file.endsWith('.db')))
        .map(file => {
          const stats = fs.statSync(path.join(backupPath, file));
          return {
            name: file,
            size: stats.size,
            created: stats.mtime.toISOString(),
            path: path.join(backupPath, file),
            type: file.endsWith('.tar.gz') ? 'archive' : 'database'
          };
        })
        .sort((a, b) => new Date(b.created) - new Date(a.created));

      return files;
    } catch (error) {
      logger.error('Error getting backup list:', error);
      return [];
    }
  }
}

module.exports = new BackupService();

const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('../database/db');

const CONFIG_PATH = path.join(__dirname, '../config/backupConfig.json');

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
      if (fs.existsSync(CONFIG_PATH)) {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        this.config = JSON.parse(data);
      } else {
        this.config = {
          enabled: false,
          schedule: 'daily',
          time: '02:00',
          targetPath: '',
          keepLastN: 7,
          lastBackup: null
        };
        this.saveConfig();
      }
    } catch (error) {
      console.error('Error loading backup config:', error);
      this.config = {
        enabled: false,
        schedule: 'daily',
        time: '02:00',
        targetPath: '',
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
      const configDir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Error saving backup config:', error);
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
   * Perform a backup
   */
  async performBackup(targetPath = null) {
    try {
      // Check if database exists
      if (!fs.existsSync(DB_PATH)) {
        throw new Error('Database file not found');
      }

      // Determine target path
      let backupPath = targetPath || this.config.targetPath || path.join(__dirname, '../backups');
      
      // If targetPath is not absolute, use default
      if (this.config.targetPath && !path.isAbsolute(this.config.targetPath)) {
        console.warn(`Backup path "${this.config.targetPath}" is not absolute. Using default location.`);
        backupPath = path.join(__dirname, '../backups');
      }
      
      console.log('Backup path being used:', backupPath);
      
      // Create backup directory if it doesn't exist
      if (!fs.existsSync(backupPath)) {
        try {
          fs.mkdirSync(backupPath, { recursive: true });
        } catch (error) {
          throw new Error(`Cannot create backup directory at "${backupPath}": ${error.message}`);
        }
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
      const filename = `expense-tracker-backup-${timestamp}.db`;
      const fullPath = path.join(backupPath, filename);

      // Copy database file
      fs.copyFileSync(DB_PATH, fullPath);

      // Update last backup time
      this.config.lastBackup = new Date().toISOString();
      this.saveConfig();

      // Clean up old backups
      this.cleanupOldBackups(backupPath);

      return {
        success: true,
        filename,
        path: fullPath,
        timestamp: this.config.lastBackup
      };
    } catch (error) {
      console.error('Backup error:', error);
      throw error;
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

      // Get all backup files
      const files = fs.readdirSync(backupPath)
        .filter(file => file.startsWith('expense-tracker-backup-') && file.endsWith('.db'))
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
            console.log(`Deleted old backup: ${file.name}`);
          } catch (error) {
            console.error(`Error deleting backup ${file.name}:`, error);
          }
        });
      }
    } catch (error) {
      console.error('Error cleaning up old backups:', error);
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

      console.log(`Next backup scheduled for: ${nextBackup.toLocaleString()}`);

      this.scheduledJob = setTimeout(async () => {
        console.log('Performing scheduled backup...');
        try {
          const result = await this.performBackup();
          console.log('Scheduled backup completed:', result.filename);
        } catch (error) {
          console.error('Scheduled backup failed:', error);
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
      console.log('Backup scheduler stopped');
    }
  }

  /**
   * Get list of existing backups
   */
  getBackupList() {
    try {
      const backupPath = this.config.targetPath || path.join(__dirname, '../backups');
      
      if (!fs.existsSync(backupPath)) {
        return [];
      }

      const files = fs.readdirSync(backupPath)
        .filter(file => file.startsWith('expense-tracker-backup-') && file.endsWith('.db'))
        .map(file => {
          const stats = fs.statSync(path.join(backupPath, file));
          return {
            name: file,
            size: stats.size,
            created: stats.mtime.toISOString(),
            path: path.join(backupPath, file)
          };
        })
        .sort((a, b) => new Date(b.created) - new Date(a.created));

      return files;
    } catch (error) {
      console.error('Error getting backup list:', error);
      return [];
    }
  }
}

module.exports = new BackupService();

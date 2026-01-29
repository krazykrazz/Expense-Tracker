const backupService = require('../services/backupService');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('../database/db');

/**
 * Get backup configuration
 * GET /api/backup/config
 */
async function getBackupConfig(req, res) {
  try {
    const config = backupService.getConfig();
    const nextBackup = backupService.getNextBackupTime();
    
    res.status(200).json({
      ...config,
      nextBackup: nextBackup ? nextBackup.toISOString() : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update backup configuration
 * PUT /api/backup/config
 */
async function updateBackupConfig(req, res) {
  try {
    const newConfig = req.body;
    
    // Validate target path if provided
    if (newConfig.targetPath) {
      const targetPath = path.resolve(newConfig.targetPath);
      
      // Try to create directory if it doesn't exist
      if (!fs.existsSync(targetPath)) {
        try {
          fs.mkdirSync(targetPath, { recursive: true });
        } catch (error) {
          return res.status(400).json({ 
            error: `Cannot create backup directory: ${error.message}` 
          });
        }
      }
      
      // Check if directory is writable
      try {
        fs.accessSync(targetPath, fs.constants.W_OK);
      } catch (error) {
        return res.status(400).json({ 
          error: 'Backup directory is not writable' 
        });
      }
    }
    
    const updatedConfig = backupService.updateConfig(newConfig);
    const nextBackup = backupService.getNextBackupTime();
    
    res.status(200).json({
      ...updatedConfig,
      nextBackup: nextBackup ? nextBackup.toISOString() : null,
      message: 'Backup configuration updated successfully'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Perform manual backup
 * POST /api/backup/manual
 */
async function performManualBackup(req, res) {
  try {
    const result = await backupService.performBackup();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Download comprehensive backup archive (tar.gz with database, invoices, config)
 * GET /api/backup
 */
async function downloadBackup(req, res) {
  try {
    // Create a temporary backup archive for download
    const os = require('os');
    const tempDir = path.join(os.tmpdir(), 'expense-tracker-download');
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `expense-tracker-backup-${timestamp}.tar.gz`;
    const tempFilePath = path.join(tempDir, filename);

    // Create the backup archive
    const result = await backupService.performBackup(tempDir);
    
    // The backup service creates a file with its own timestamp, rename it
    const createdFile = result.path;
    if (createdFile !== tempFilePath && fs.existsSync(createdFile)) {
      fs.renameSync(createdFile, tempFilePath);
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the archive file
    const fileStream = fs.createReadStream(tempFilePath);
    
    fileStream.on('end', () => {
      // Clean up temp file after download
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp backup file:', cleanupError.message);
      }
    });

    fileStream.on('error', (error) => {
      logger.error('Error streaming backup file:', error);
      res.status(500).json({ error: 'Failed to download backup' });
    });

    fileStream.pipe(res);
  } catch (error) {
    logger.error('Download backup error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get list of backups
 * GET /api/backup/list
 */
async function getBackupList(req, res) {
  try {
    const backups = backupService.getBackupList();
    res.status(200).json(backups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get storage statistics
 * GET /api/backup/stats
 */
async function getStorageStats(req, res) {
  try {
    const stats = await backupService.getStorageStats();
    res.status(200).json(stats);
  } catch (error) {
    logger.error('Error getting storage stats:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Restore from existing backup archive by filename
 * POST /api/backup/restore-archive
 * Body: { filename: "expense-tracker-backup-2025-01-15_14-30-00.tar.gz" }
 */
async function restoreFromArchive(req, res) {
  const { filename } = req.body;

  if (!filename) {
    return res.status(400).json({ error: 'Backup filename is required' });
  }

  // Validate filename format to prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid backup filename' });
  }

  // Verify it's a tar.gz file
  if (!filename.endsWith('.tar.gz')) {
    return res.status(400).json({ error: 'Invalid backup file format. Expected .tar.gz archive' });
  }

  try {
    // Get the backup path from config
    const backupPath = backupService.getConfig().targetPath || require('../config/paths').getBackupPath();
    const fullPath = path.join(backupPath, filename);

    // Verify the file exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    // Perform the restore
    const result = await backupService.restoreBackup(fullPath);

    res.status(200).json({
      success: result.success,
      filesRestored: result.filesRestored,
      message: result.message
    });
  } catch (error) {
    logger.error('Restore from archive error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Restore from backup file (supports both .tar.gz archives and legacy .db files)
 * POST /api/backup/restore
 */
async function restoreBackup(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No backup file uploaded' });
  }

  try {
    const uploadedFile = req.file.path;
    const originalName = req.file.originalname || '';
    
    // Determine file type
    const isTarGz = originalName.endsWith('.tar.gz') || originalName.endsWith('.tgz');
    const isDb = originalName.endsWith('.db');
    
    if (!isTarGz && !isDb) {
      fs.unlinkSync(uploadedFile);
      return res.status(400).json({ 
        error: 'Invalid backup file format. Must be .tar.gz archive or .db database file.' 
      });
    }

    if (isTarGz) {
      // Handle .tar.gz archive restore
      logger.info('Restoring from .tar.gz archive:', originalName);
      
      // Verify it's a valid gzip file
      const archiveUtils = require('../utils/archiveUtils');
      try {
        const contents = await archiveUtils.listArchiveContents(uploadedFile);
        logger.debug('Archive contents:', contents.map(c => c.name));
      } catch (archiveError) {
        fs.unlinkSync(uploadedFile);
        return res.status(400).json({ 
          error: 'Invalid or corrupted backup archive.' 
        });
      }

      // Perform the restore using backupService
      // Skip extension check since temp file doesn't have .tar.gz extension
      const result = await backupService.restoreBackup(uploadedFile, { skipExtensionCheck: true });
      
      // Clean up uploaded file
      fs.unlinkSync(uploadedFile);

      // Re-initialize database to ensure schema is up to date
      const { initializeDatabase } = require('../database/db');
      await initializeDatabase();

      res.status(200).json({ 
        success: true,
        message: `Backup restored successfully. ${result.filesRestored} files restored.`,
        filesRestored: result.filesRestored
      });
    } else {
      // Handle legacy .db file restore
      logger.info('Restoring from legacy .db file:', originalName);
      
      // Check if database file exists
      if (!fs.existsSync(DB_PATH)) {
        fs.unlinkSync(uploadedFile);
        return res.status(404).json({ error: 'Database file not found' });
      }
      
      // Validate that it's a SQLite database file
      const fileBuffer = fs.readFileSync(uploadedFile);
      const header = fileBuffer.toString('utf8', 0, 16);
      
      if (!header.startsWith('SQLite format 3')) {
        fs.unlinkSync(uploadedFile);
        return res.status(400).json({ error: 'Invalid backup file. Must be a SQLite database.' });
      }

      // Create a backup of current database before restoring
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
      const preRestoreBackup = path.join(path.dirname(DB_PATH), `pre-restore-backup-${timestamp}.db`);
      fs.copyFileSync(DB_PATH, preRestoreBackup);

      // Replace current database with uploaded backup
      fs.copyFileSync(uploadedFile, DB_PATH);
      
      // Clean up uploaded file
      fs.unlinkSync(uploadedFile);

      // Re-initialize database to ensure schema is up to date
      const { initializeDatabase } = require('../database/db');
      await initializeDatabase();

      res.status(200).json({ 
        success: true,
        message: 'Database restored successfully. Schema updated to current version.',
        preRestoreBackup: path.basename(preRestoreBackup),
        note: 'Note: This was a database-only restore. Invoice files were not included.'
      });
    }
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    logger.error('Restore error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getBackupConfig,
  updateBackupConfig,
  performManualBackup,
  downloadBackup,
  getBackupList,
  getStorageStats,
  restoreBackup,
  restoreFromArchive
};

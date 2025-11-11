const backupService = require('../services/backupService');
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
 * Download backup file (legacy endpoint for browser download)
 * GET /api/backup
 */
async function downloadBackup(req, res) {
  try {
    // Check if database file exists
    if (!fs.existsSync(DB_PATH)) {
      return res.status(404).json({ error: 'Database file not found' });
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `expense-tracker-backup-${timestamp}.db`;

    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the database file
    const fileStream = fs.createReadStream(DB_PATH);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming database file:', error);
      res.status(500).json({ error: 'Failed to backup database' });
    });
  } catch (error) {
    console.error('Backup error:', error);
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
 * Restore from backup file
 * POST /api/backup/restore
 */
async function restoreBackup(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No backup file uploaded' });
  }

  try {
    // Check if database file exists
    if (!fs.existsSync(DB_PATH)) {
      return res.status(404).json({ error: 'Database file not found' });
    }

    const uploadedFile = req.file.path;
    
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

    res.status(200).json({ 
      message: 'Backup restored successfully',
      preRestoreBackup: path.basename(preRestoreBackup)
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Restore error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getBackupConfig,
  updateBackupConfig,
  performManualBackup,
  downloadBackup,
  getBackupList,
  restoreBackup
};

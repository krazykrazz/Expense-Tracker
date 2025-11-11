const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backupController');
const multer = require('multer');

// Configure multer for backup file upload
const upload = multer({ dest: 'uploads/' });

// Get backup configuration
router.get('/backup/config', backupController.getBackupConfig);

// Update backup configuration
router.put('/backup/config', backupController.updateBackupConfig);

// Perform manual backup
router.post('/backup/manual', backupController.performManualBackup);

// Get list of backups
router.get('/backup/list', backupController.getBackupList);

// Restore from backup
router.post('/backup/restore', upload.single('backup'), backupController.restoreBackup);

// Legacy download endpoint
router.get('/backup', backupController.downloadBackup);

module.exports = router;

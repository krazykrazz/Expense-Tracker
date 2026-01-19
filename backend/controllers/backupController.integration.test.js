/**
 * Backup API Integration Tests
 * 
 * NOTE: These tests work with real files and the production database,
 * so they skip the in-memory test database setup.
 */

// Skip in-memory test database - backup tests need real file operations
process.env.SKIP_TEST_DB = 'true';

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');
const backupRoutes = require('../routes/backupRoutes');
const backupService = require('../services/backupService');
const { getBackupPath, getInvoicesPath } = require('../config/paths');
const { initializeDatabase } = require('../database/db');

// Create test app
const app = express();
app.use(express.json());
app.use('/api', backupRoutes);

describe('Backup API Integration Tests', () => {
  const testBackupPath = path.join(__dirname, '../../test-api-backups');
  const testInvoicesPath = getInvoicesPath();
  let originalConfig;
  let testBackupFilename;

  beforeAll(async () => {
    // Initialize the real database for backup tests
    await initializeDatabase();
    
    // Save original config
    originalConfig = backupService.getConfig();
    
    // Create test directories
    if (!fs.existsSync(testBackupPath)) {
      fs.mkdirSync(testBackupPath, { recursive: true });
    }
    
    // Update config to use test path
    backupService.updateConfig({ targetPath: testBackupPath });
  });

  afterAll(async () => {
    // Restore original config
    backupService.updateConfig({ targetPath: originalConfig.targetPath });
    
    // Clean up test directories
    if (fs.existsSync(testBackupPath)) {
      try {
        await fs.promises.rm(testBackupPath, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  beforeEach(async () => {
    // Create a backup for testing restore operations
    const result = await backupService.performBackup(testBackupPath);
    testBackupFilename = result.filename;
  });

  describe('GET /api/backup/stats', () => {
    it('should return storage statistics', async () => {
      const response = await request(app)
        .get('/api/backup/stats')
        .expect(200);

      expect(response.body).toHaveProperty('totalBackupSize');
      expect(response.body).toHaveProperty('totalBackupSizeMB');
      expect(response.body).toHaveProperty('backupCount');
      expect(response.body).toHaveProperty('invoiceStorageSize');
      expect(response.body).toHaveProperty('invoiceStorageSizeMB');
      expect(response.body).toHaveProperty('invoiceCount');
      
      expect(typeof response.body.totalBackupSize).toBe('number');
      expect(typeof response.body.backupCount).toBe('number');
      expect(response.body.backupCount).toBeGreaterThanOrEqual(1);
    });

    it('should return accurate backup count', async () => {
      // Get current backup list
      const backups = backupService.getBackupList();
      
      const response = await request(app)
        .get('/api/backup/stats')
        .expect(200);

      expect(response.body.backupCount).toBe(backups.length);
    });
  });

  describe('POST /api/backup/restore-archive', () => {
    it('should restore from valid backup archive', async () => {
      const response = await request(app)
        .post('/api/backup/restore-archive')
        .send({ filename: testBackupFilename })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.filesRestored).toBeGreaterThanOrEqual(1);
      expect(response.body.message).toContain('Restore completed successfully');
    });

    it('should return 400 when filename is missing', async () => {
      const response = await request(app)
        .post('/api/backup/restore-archive')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('Backup filename is required');
    });

    it('should return 400 for invalid filename format', async () => {
      const response = await request(app)
        .post('/api/backup/restore-archive')
        .send({ filename: 'invalid-backup.db' })
        .expect(400);

      expect(response.body.error).toContain('Invalid backup file format');
    });

    it('should return 404 for non-existent backup file', async () => {
      const response = await request(app)
        .post('/api/backup/restore-archive')
        .send({ filename: 'expense-tracker-backup-9999-12-31_23-59-59.tar.gz' })
        .expect(404);

      expect(response.body.error).toContain('Backup file not found');
    });

    it('should reject path traversal attempts', async () => {
      const response = await request(app)
        .post('/api/backup/restore-archive')
        .send({ filename: '../../../etc/passwd.tar.gz' })
        .expect(400);

      expect(response.body.error).toContain('Invalid backup filename');
    });

    it('should reject filenames with forward slashes', async () => {
      const response = await request(app)
        .post('/api/backup/restore-archive')
        .send({ filename: 'path/to/backup.tar.gz' })
        .expect(400);

      expect(response.body.error).toContain('Invalid backup filename');
    });

    it('should reject filenames with backslashes', async () => {
      const response = await request(app)
        .post('/api/backup/restore-archive')
        .send({ filename: 'path\\to\\backup.tar.gz' })
        .expect(400);

      expect(response.body.error).toContain('Invalid backup filename');
    });
  });
});

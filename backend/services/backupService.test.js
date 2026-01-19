/**
 * Tests for Backup Service
 * 
 * NOTE: These tests work with real files and the production database,
 * so they skip the in-memory test database setup.
 */

// Skip in-memory test database - backup tests need real file operations
process.env.SKIP_TEST_DB = 'true';

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const backupService = require('./backupService');
const archiveUtils = require('../utils/archiveUtils');
const { getInvoicesPath } = require('../config/paths');
const { initializeDatabase } = require('../database/db');

describe('BackupService - Archive Backup', () => {
  const testBackupPath = path.join(__dirname, '../../test-backups');
  const testExtractPath = path.join(__dirname, '../../test-extract');
  
  beforeAll(async () => {
    // Initialize the real database for backup tests
    await initializeDatabase();
    
    // Create test directories
    if (!fs.existsSync(testBackupPath)) {
      fs.mkdirSync(testBackupPath, { recursive: true });
    }
    if (!fs.existsSync(testExtractPath)) {
      fs.mkdirSync(testExtractPath, { recursive: true });
    }
  });

  afterAll(async () => {
    // Clean up test directories
    await cleanupDirectory(testBackupPath);
    await cleanupDirectory(testExtractPath);
  });

  async function cleanupDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
      try {
        await fs.promises.rm(dirPath, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  test('backup creates tar.gz archive', async () => {
    const result = await backupService.performBackup(testBackupPath);
    
    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/^expense-tracker-backup-.*\.tar\.gz$/);
    expect(result.path).toBeDefined();
    expect(fs.existsSync(result.path)).toBe(true);
    expect(result.size).toBeGreaterThan(0);
  });

  test('backup archive contains database file', async () => {
    const result = await backupService.performBackup(testBackupPath);
    
    expect(result.success).toBe(true);

    // List archive contents
    const contents = await archiveUtils.listArchiveContents(result.path);
    
    // Check that database is included
    const hasDatabase = contents.some(item => 
      item.name.includes('database/expenses.db') || item.name === 'database/expenses.db'
    );
    expect(hasDatabase).toBe(true);
  });

  test('backup archive can be extracted and contains valid database', async () => {
    const result = await backupService.performBackup(testBackupPath);
    
    expect(result.success).toBe(true);

    // Extract the archive
    const extractResult = await archiveUtils.extractArchive(result.path, testExtractPath);
    expect(extractResult.success).toBe(true);

    // Verify extracted database exists
    const extractedDbPath = path.join(testExtractPath, 'database', 'expenses.db');
    expect(fs.existsSync(extractedDbPath)).toBe(true);

    // Open the extracted database and verify it's valid
    const db = new sqlite3.Database(extractedDbPath);
    
    const tableExists = await new Promise((resolve, reject) => {
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'",
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });

    db.close();

    expect(tableExists).toBe(true);
  });

  test('backup file preserves budget data', async () => {
    const budgetRepository = require('../repositories/budgetRepository');
    
    // Create a test budget with valid category
    const testBudget = await budgetRepository.create({
      year: 2099,
      month: 12,
      category: 'Groceries',
      limit: 999.99
    });

    try {
      // Perform a backup
      const result = await backupService.performBackup(testBackupPath);
      expect(result.success).toBe(true);

      // Extract the archive
      const extractResult = await archiveUtils.extractArchive(result.path, testExtractPath);
      expect(extractResult.success).toBe(true);

      // Open the extracted database and verify budget data exists
      const extractedDbPath = path.join(testExtractPath, 'database', 'expenses.db');
      const db = new sqlite3.Database(extractedDbPath);
      
      const budgetData = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM budgets WHERE id = ?',
          [testBudget.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      db.close();

      expect(budgetData).toBeDefined();
      expect(budgetData.category).toBe('Groceries');
      expect(budgetData.limit).toBe(999.99);
    } finally {
      // Clean up test budget
      await budgetRepository.delete(testBudget.id);
    }
  });

  test('getBackupList returns tar.gz files', async () => {
    // Create a backup first
    await backupService.performBackup(testBackupPath);
    
    // Update config to use test path
    const originalConfig = backupService.getConfig();
    backupService.updateConfig({ targetPath: testBackupPath });
    
    try {
      const backups = backupService.getBackupList();
      
      expect(backups.length).toBeGreaterThan(0);
      expect(backups[0].name).toMatch(/\.tar\.gz$/);
      expect(backups[0].type).toBe('archive');
      expect(backups[0].size).toBeGreaterThan(0);
    } finally {
      // Restore original config
      backupService.updateConfig({ targetPath: originalConfig.targetPath });
    }
  });
});

describe('BackupService - Restore Functionality', () => {
  const testBackupPath = path.join(__dirname, '../../test-restore-backups');
  const testInvoicesPath = getInvoicesPath();
  
  beforeAll(() => {
    if (!fs.existsSync(testBackupPath)) {
      fs.mkdirSync(testBackupPath, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(testBackupPath)) {
      try {
        await fs.promises.rm(testBackupPath, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  test('restoreBackup restores database from archive', async () => {
    const budgetRepository = require('../repositories/budgetRepository');
    
    // Create a test budget
    const testBudget = await budgetRepository.create({
      year: 2098,
      month: 6,
      category: 'Gas',
      limit: 500.00
    });

    try {
      // Perform a backup
      const backupResult = await backupService.performBackup(testBackupPath);
      expect(backupResult.success).toBe(true);

      // Delete the test budget
      await budgetRepository.delete(testBudget.id);
      
      // Verify it's deleted
      const deletedBudget = await budgetRepository.findById(testBudget.id);
      expect(deletedBudget).toBeNull();

      // Restore from backup
      const restoreResult = await backupService.restoreBackup(backupResult.path);
      
      expect(restoreResult.success).toBe(true);
      expect(restoreResult.filesRestored).toBeGreaterThanOrEqual(1);
      expect(restoreResult.message).toContain('Restore completed successfully');

      // Reinitialize database connection after restore
      const { initializeDatabase } = require('../database/db');
      await initializeDatabase();

      // Verify budget is restored
      const restoredBudget = await budgetRepository.findById(testBudget.id);
      expect(restoredBudget).not.toBeNull();
      expect(restoredBudget.category).toBe('Gas');
      expect(restoredBudget.limit).toBe(500.00);
    } finally {
      // Clean up
      try {
        await budgetRepository.delete(testBudget.id);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  test('restoreBackup restores invoice files with directory structure', async () => {
    // Create test invoice files
    const testYear = '2097';
    const testMonth = '03';
    const testInvoiceDir = path.join(testInvoicesPath, testYear, testMonth);
    const testInvoiceFile = path.join(testInvoiceDir, 'test_restore_invoice.pdf');
    
    try {
      // Create test invoice
      await fs.promises.mkdir(testInvoiceDir, { recursive: true });
      await fs.promises.writeFile(testInvoiceFile, '%PDF-1.4 test restore content');

      // Perform backup
      const backupResult = await backupService.performBackup(testBackupPath);
      expect(backupResult.success).toBe(true);

      // Delete the test invoice
      await fs.promises.unlink(testInvoiceFile);
      expect(fs.existsSync(testInvoiceFile)).toBe(false);

      // Restore from backup
      const restoreResult = await backupService.restoreBackup(backupResult.path);
      
      expect(restoreResult.success).toBe(true);
      expect(restoreResult.filesRestored).toBeGreaterThanOrEqual(1);

      // Verify invoice is restored with correct directory structure
      expect(fs.existsSync(testInvoiceFile)).toBe(true);
      const content = await fs.promises.readFile(testInvoiceFile, 'utf8');
      expect(content).toBe('%PDF-1.4 test restore content');
    } finally {
      // Clean up
      try {
        await fs.promises.unlink(testInvoiceFile);
        await fs.promises.rmdir(testInvoiceDir);
        await fs.promises.rmdir(path.join(testInvoicesPath, testYear));
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  test('restoreBackup throws error for missing backup file', async () => {
    await expect(backupService.restoreBackup('/nonexistent/backup.tar.gz'))
      .rejects.toThrow('Backup file not found');
  });

  test('restoreBackup throws error for invalid file format', async () => {
    // Create a non-tar.gz file
    const invalidFile = path.join(testBackupPath, 'invalid.db');
    await fs.promises.writeFile(invalidFile, 'not a tar.gz file');

    try {
      await expect(backupService.restoreBackup(invalidFile))
        .rejects.toThrow('Invalid backup file format');
    } finally {
      await fs.promises.unlink(invalidFile);
    }
  });

  test('restoreBackup throws error when path is not provided', async () => {
    await expect(backupService.restoreBackup(null))
      .rejects.toThrow('Backup file path is required');
    
    await expect(backupService.restoreBackup(''))
      .rejects.toThrow('Backup file path is required');
  });

  test('restoreBackup returns correct file count', async () => {
    // Create test invoice files
    const testYear = '2096';
    const testMonth = '05';
    const testInvoiceDir = path.join(testInvoicesPath, testYear, testMonth);
    const testInvoiceFile1 = path.join(testInvoiceDir, 'invoice1.pdf');
    const testInvoiceFile2 = path.join(testInvoiceDir, 'invoice2.pdf');
    
    try {
      // Create test invoices
      await fs.promises.mkdir(testInvoiceDir, { recursive: true });
      await fs.promises.writeFile(testInvoiceFile1, '%PDF-1.4 invoice 1');
      await fs.promises.writeFile(testInvoiceFile2, '%PDF-1.4 invoice 2');

      // Perform backup
      const backupResult = await backupService.performBackup(testBackupPath);
      expect(backupResult.success).toBe(true);

      // Delete the test invoices
      await fs.promises.unlink(testInvoiceFile1);
      await fs.promises.unlink(testInvoiceFile2);

      // Restore from backup
      const restoreResult = await backupService.restoreBackup(backupResult.path);
      
      expect(restoreResult.success).toBe(true);
      // Should restore at least: database (1) + 2 invoice files = 3
      // Plus config if it exists
      expect(restoreResult.filesRestored).toBeGreaterThanOrEqual(3);
    } finally {
      // Clean up
      try {
        await fs.promises.unlink(testInvoiceFile1);
        await fs.promises.unlink(testInvoiceFile2);
        await fs.promises.rmdir(testInvoiceDir);
        await fs.promises.rmdir(path.join(testInvoicesPath, testYear));
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });
});

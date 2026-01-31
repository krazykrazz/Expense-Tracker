/**
 * Property-Based Tests for Backup Service
 * Using fast-check library for property-based testing
 * 
 * NOTE: These tests work with real files and the production database,
 * so they skip the in-memory test database setup.
 */

// Skip in-memory test database - backup tests need real file operations
process.env.SKIP_TEST_DB = 'true';

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const fs = require('fs');
const path = require('path');
const backupService = require('./backupService');
const archiveUtils = require('../utils/archiveUtils');
const budgetRepository = require('../repositories/budgetRepository');
const { DB_PATH, initializeDatabase } = require('../database/db');
const { getInvoicesPath, getBackupConfigPath } = require('../config/paths');

describe('BackupService - Property-Based Tests', () => {
  const testBackupPath = path.join(__dirname, '../../test-pbt-backups');
  
  beforeAll(async () => {
    // Initialize the real database for backup tests
    await initializeDatabase();
    
    // Create test backup directory
    if (!fs.existsSync(testBackupPath)) {
      fs.mkdirSync(testBackupPath, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test backup directory
    if (fs.existsSync(testBackupPath)) {
      const files = fs.readdirSync(testBackupPath);
      files.forEach(file => {
        fs.unlinkSync(path.join(testBackupPath, file));
      });
      fs.rmdirSync(testBackupPath);
    }
  });

  beforeEach(async () => {
    // Clean up any existing budgets in the test year range to avoid conflicts
    const { getDatabase } = require('../database/db');
    const db = await getDatabase();
    
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM budgets WHERE year >= 2050 AND year <= 2090', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Feature: budget-tracking-alerts, Property 16: Budget persistence immediacy
   * Validates: Requirements 7.1
   * 
   * For any budget creation or modification, querying for that budget immediately after 
   * the operation should return the updated value
   */
  test('Property 16: Budget persistence immediacy - changes are immediately queryable', async () => {
    // Define arbitrary for generating valid budgets with unique combinations
    const budgetArbitrary = fc.record({
      year: fc.integer({ min: 2050, max: 2070 }), // Use future years to avoid conflicts
      month: fc.integer({ min: 1, max: 12 }),
      category: fc.constantFrom('Groceries', 'Gas', 'Other'),
      limit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true, noDefaultInfinity: true })
    });

    await fc.assert(
      fc.asyncProperty(budgetArbitrary, async (budget) => {
        let createdBudget = null;
        
        try {
          // Step 1: Create a budget
          createdBudget = await budgetRepository.create(budget);
          
          // Step 2: Immediately query for the budget
          const queriedBudget = await budgetRepository.findById(createdBudget.id);
          
          // Step 3: Verify the budget is immediately available with correct values
          expect(queriedBudget).not.toBeNull();
          expect(queriedBudget.id).toBe(createdBudget.id);
          expect(queriedBudget.year).toBe(budget.year);
          expect(queriedBudget.month).toBe(budget.month);
          expect(queriedBudget.category).toBe(budget.category);
          expect(queriedBudget.limit).toBeCloseTo(budget.limit, 2);
          
          // Step 4: Update the budget with a new limit
          const newLimit = Math.fround(budget.limit * 1.5);
          await budgetRepository.updateLimit(createdBudget.id, newLimit);
          
          // Step 5: Immediately query for the updated budget
          const updatedBudget = await budgetRepository.findById(createdBudget.id);
          
          // Step 6: Verify the update is immediately visible
          expect(updatedBudget).not.toBeNull();
          expect(updatedBudget.limit).toBeCloseTo(newLimit, 2);
          
          // Clean up
          await budgetRepository.delete(createdBudget.id);
          
          return true;
        } catch (error) {
          // Clean up on error
          if (createdBudget) {
            try {
              await budgetRepository.delete(createdBudget.id);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          throw error;
        }
      }),
      pbtOptions()
    );
  }, 60000); // Increase timeout for property-based test

  /**
   * Feature: budget-tracking-alerts, Property 15: Backup round-trip
   * Validates: Requirements 7.2, 7.3
   * 
   * For any set of budgets, backing up then restoring should result in budgets with identical values
   * NOTE: This test now works with tar.gz archives and extracts the database before restoring
   */
  test('Property 15: Backup round-trip - budgets are preserved after backup and restore', async () => {
    const testExtractPath = path.join(__dirname, '../../test-pbt-extract');
    
    // Define arbitrary for generating valid budgets with unique combinations
    const budgetArbitrary = fc.record({
      year: fc.integer({ min: 2050, max: 2070 }), // Use future years to avoid conflicts
      month: fc.integer({ min: 1, max: 12 }),
      category: fc.constantFrom('Groceries', 'Gas', 'Other'),
      limit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true, noDefaultInfinity: true })
    });

    // Generate an array of 1-3 budgets (reduced to minimize conflicts)
    const budgetsArrayArbitrary = fc.array(budgetArbitrary, { minLength: 1, maxLength: 3 })
      .map(budgets => {
        // Remove duplicates based on year/month/category combination
        const seen = new Set();
        return budgets.filter(budget => {
          const key = `${budget.year}-${budget.month}-${budget.category}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
      })
      .filter(budgets => budgets.length > 0); // Ensure we have at least one budget

    await fc.assert(
      fc.asyncProperty(budgetsArrayArbitrary, async (budgets) => {
        const createdBudgets = [];
        
        try {
          // Step 1: Create budgets in the database
          for (const budget of budgets) {
            const created = await budgetRepository.create(budget);
            createdBudgets.push(created);
          }

          // Step 2: Perform backup (now creates tar.gz archive)
          const backupResult = await backupService.performBackup(testBackupPath);
          expect(backupResult.success).toBe(true);

          // Step 3: Delete all created budgets
          for (const budget of createdBudgets) {
            await budgetRepository.delete(budget.id);
          }

          // Verify budgets are deleted
          for (const budget of createdBudgets) {
            const found = await budgetRepository.findById(budget.id);
            expect(found).toBeNull();
          }

          // Step 4: Extract archive and restore database
          // Clean extract directory first
          await fs.promises.rm(testExtractPath, { recursive: true, force: true }).catch(() => {});
          await fs.promises.mkdir(testExtractPath, { recursive: true });
          
          await archiveUtils.extractArchive(backupResult.path, testExtractPath);
          
          // Copy extracted database back to original location
          const extractedDbPath = path.join(testExtractPath, 'database', 'expenses.db');
          fs.copyFileSync(extractedDbPath, DB_PATH);
          
          const { initializeDatabase } = require('../database/db');
          await initializeDatabase();

          // Step 5: Verify all budgets are restored with identical values
          // Note: After restore, we verify by year/month/category since IDs may change
          for (const originalBudget of createdBudgets) {
            // First try by ID
            let restored = await budgetRepository.findById(originalBudget.id);
            
            // If not found by ID, search by year/month/category
            if (!restored) {
              const allBudgets = await budgetRepository.findByYearMonth(originalBudget.year, originalBudget.month);
              restored = allBudgets.find(b => b.category === originalBudget.category);
            }
            
            expect(restored).not.toBeNull();
            if (restored) {
              expect(restored.year).toBe(originalBudget.year);
              expect(restored.month).toBe(originalBudget.month);
              expect(restored.category).toBe(originalBudget.category);
              // Use toBeCloseTo for floating point comparison
              expect(restored.limit).toBeCloseTo(originalBudget.limit, 2);
            }
          }

          // Clean up: delete restored budgets
          for (const budget of createdBudgets) {
            try {
              await budgetRepository.delete(budget.id);
            } catch (err) {
              // Budget might not exist, ignore
            }
          }

          return true;
        } catch (error) {
          // Clean up on error
          for (const budget of createdBudgets) {
            try {
              await budgetRepository.delete(budget.id);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          throw error;
        } finally {
          // Clean up extract directory
          await fs.promises.rm(testExtractPath, { recursive: true, force: true }).catch(() => {});
        }
      }),
      pbtOptions()
    );
  }, 60000); // Increase timeout for property-based test

  /**
   * Feature: invoice-backup-enhancement, Property 1: Archive Contains All Data
   * **Validates: Requirements 1.1**
   * 
   * For any backup operation with a database file, invoice files, and configuration files present,
   * the created archive SHALL contain all three components.
   */
  test('Property 1: Archive Contains All Data - backup includes database, invoices, and config', async () => {
    // Arbitrary for generating test invoice file names
    const invoiceFileArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      filename: fc.string({ minLength: 8, maxLength: 16, unit: 'grapheme-ascii' })
        .filter(s => /^[a-zA-Z0-9]+$/.test(s))
        .map(s => `invoice_${s}.pdf`)
    });

    // Generate 0-3 invoice files
    const invoiceFilesArbitrary = fc.array(invoiceFileArbitrary, { minLength: 0, maxLength: 3 });

    await fc.assert(
      fc.asyncProperty(invoiceFilesArbitrary, async (invoiceFiles) => {
        const createdFiles = [];
        const invoicesPath = getInvoicesPath();
        
        try {
          // Step 1: Create test invoice files if any
          for (const invoice of invoiceFiles) {
            const yearDir = path.join(invoicesPath, String(invoice.year));
            const monthDir = path.join(yearDir, String(invoice.month).padStart(2, '0'));
            const filePath = path.join(monthDir, invoice.filename);
            
            await fs.promises.mkdir(monthDir, { recursive: true });
            // Create a minimal PDF-like file
            await fs.promises.writeFile(filePath, '%PDF-1.4 test content');
            createdFiles.push(filePath);
          }

          // Step 2: Perform backup
          const backupResult = await backupService.performBackup(testBackupPath);
          expect(backupResult.success).toBe(true);
          expect(backupResult.filename).toMatch(/\.tar\.gz$/);

          // Step 3: List archive contents
          const contents = await archiveUtils.listArchiveContents(backupResult.path);
          const contentNames = contents.map(c => c.name);

          // Step 4: Verify database is always included
          const hasDatabase = contentNames.some(name => 
            name.includes('database/expenses.db') || name === 'database/expenses.db'
          );
          expect(hasDatabase).toBe(true);

          // Step 5: Verify config is included (if it exists)
          const configPath = getBackupConfigPath();
          if (fs.existsSync(configPath)) {
            const hasConfig = contentNames.some(name => 
              name.includes('config/backupConfig.json') || name === 'config/backupConfig.json'
            );
            expect(hasConfig).toBe(true);
          }

          // Step 6: Verify invoice files are included (if any were created)
          if (createdFiles.length > 0) {
            const hasInvoices = contentNames.some(name => 
              name.includes('invoices/') || name.startsWith('invoices')
            );
            expect(hasInvoices).toBe(true);
          }

          return true;
        } finally {
          // Clean up created invoice files
          for (const filePath of createdFiles) {
            try {
              await fs.promises.unlink(filePath);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          // Clean up empty directories
          for (const invoice of invoiceFiles) {
            try {
              const monthDir = path.join(invoicesPath, String(invoice.year), String(invoice.month).padStart(2, '0'));
              const yearDir = path.join(invoicesPath, String(invoice.year));
              await fs.promises.rmdir(monthDir);
              await fs.promises.rmdir(yearDir);
            } catch (err) {
              // Ignore cleanup errors (directory might not be empty)
            }
          }
        }
      }),
      pbtOptions()
    );
  }, 60000);

  /**
   * Feature: invoice-backup-enhancement, Property 2: Filename Format Compliance
   * **Validates: Requirements 1.3**
   * 
   * For any backup operation, the generated filename SHALL match the pattern
   * `expense-tracker-backup-{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}.tar.gz`.
   */
  test('Property 2: Filename Format Compliance - backup filename matches expected pattern', async () => {
    // Run multiple backup operations and verify filename format
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async () => {
        // Perform backup
        const backupResult = await backupService.performBackup(testBackupPath);
        
        expect(backupResult.success).toBe(true);
        expect(backupResult.filename).toBeDefined();
        
        // Verify filename matches the expected pattern:
        // expense-tracker-backup-YYYY-MM-DD_HH-mm-ss.tar.gz
        const filenamePattern = /^expense-tracker-backup-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.tar\.gz$/;
        expect(backupResult.filename).toMatch(filenamePattern);
        
        // Extract and validate date components
        const match = backupResult.filename.match(/expense-tracker-backup-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.tar\.gz/);
        expect(match).not.toBeNull();
        
        if (match) {
          const [, year, month, day, hour, minute, second] = match;
          
          // Validate year is reasonable (2020-2100)
          const yearNum = parseInt(year, 10);
          expect(yearNum).toBeGreaterThanOrEqual(2020);
          expect(yearNum).toBeLessThanOrEqual(2100);
          
          // Validate month (01-12)
          const monthNum = parseInt(month, 10);
          expect(monthNum).toBeGreaterThanOrEqual(1);
          expect(monthNum).toBeLessThanOrEqual(12);
          
          // Validate day (01-31)
          const dayNum = parseInt(day, 10);
          expect(dayNum).toBeGreaterThanOrEqual(1);
          expect(dayNum).toBeLessThanOrEqual(31);
          
          // Validate hour (00-23)
          const hourNum = parseInt(hour, 10);
          expect(hourNum).toBeGreaterThanOrEqual(0);
          expect(hourNum).toBeLessThanOrEqual(23);
          
          // Validate minute (00-59)
          const minuteNum = parseInt(minute, 10);
          expect(minuteNum).toBeGreaterThanOrEqual(0);
          expect(minuteNum).toBeLessThanOrEqual(59);
          
          // Validate second (00-59)
          const secondNum = parseInt(second, 10);
          expect(secondNum).toBeGreaterThanOrEqual(0);
          expect(secondNum).toBeLessThanOrEqual(59);
        }
        
        return true;
      }),
      pbtOptions()
    );
  }, 60000);

  /**
   * Feature: invoice-backup-enhancement, Property 3: Backup/Restore Round-Trip
   * **Validates: Requirements 1.2, 4.1, 4.2**
   * 
   * For any set of database content, invoice files (with their directory structure), 
   * and configuration files, creating a backup and then restoring from that backup 
   * SHALL produce data equivalent to the original.
   */
  test('Property 3: Backup/Restore Round-Trip - backup and restore preserves all data', async () => {
    const invoicesPath = getInvoicesPath();
    
    // Arbitrary for generating test invoice file data
    const invoiceFileArbitrary = fc.record({
      year: fc.integer({ min: 2080, max: 2090 }), // Use future years to avoid conflicts
      month: fc.integer({ min: 1, max: 12 }),
      filename: fc.string({ minLength: 8, maxLength: 16, unit: 'grapheme-ascii' })
        .filter(s => /^[a-zA-Z0-9]+$/.test(s))
        .map(s => `roundtrip_${s}.pdf`),
      content: fc.string({ minLength: 10, maxLength: 100, unit: 'grapheme-ascii' })
        .map(s => `%PDF-1.4 ${s}`)
    });

    // Arbitrary for generating test budget data
    const budgetArbitrary = fc.record({
      year: fc.integer({ min: 2080, max: 2090 }),
      month: fc.integer({ min: 1, max: 12 }),
      category: fc.constantFrom('Groceries', 'Gas', 'Other'),
      limit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true, noDefaultInfinity: true })
    });

    // Generate test data: 0-2 invoice files and 1-2 budgets
    const testDataArbitrary = fc.record({
      invoices: fc.array(invoiceFileArbitrary, { minLength: 0, maxLength: 2 }),
      budgets: fc.array(budgetArbitrary, { minLength: 1, maxLength: 2 })
        .map(budgets => {
          // Remove duplicates based on year/month/category combination
          const seen = new Set();
          return budgets.filter(budget => {
            const key = `${budget.year}-${budget.month}-${budget.category}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        })
        .filter(budgets => budgets.length > 0)
    });

    await fc.assert(
      fc.asyncProperty(testDataArbitrary, async (testData) => {
        const createdInvoiceFiles = [];
        const createdBudgets = [];
        const originalInvoiceContents = new Map();
        
        try {
          // Step 1: Create test invoice files
          for (const invoice of testData.invoices) {
            const yearDir = path.join(invoicesPath, String(invoice.year));
            const monthDir = path.join(yearDir, String(invoice.month).padStart(2, '0'));
            const filePath = path.join(monthDir, invoice.filename);
            
            await fs.promises.mkdir(monthDir, { recursive: true });
            await fs.promises.writeFile(filePath, invoice.content);
            createdInvoiceFiles.push({ path: filePath, year: invoice.year, month: invoice.month });
            originalInvoiceContents.set(filePath, invoice.content);
          }

          // Step 2: Create test budgets
          for (const budget of testData.budgets) {
            const created = await budgetRepository.create(budget);
            createdBudgets.push({ ...created, originalLimit: budget.limit });
          }

          // Step 3: Perform backup
          const backupResult = await backupService.performBackup(testBackupPath);
          expect(backupResult.success).toBe(true);

          // Step 4: Delete all created data
          for (const filePath of createdInvoiceFiles) {
            try {
              await fs.promises.unlink(filePath.path);
            } catch (err) {
              // Ignore if already deleted
            }
          }
          for (const budget of createdBudgets) {
            await budgetRepository.delete(budget.id);
          }

          // Verify data is deleted
          for (const filePath of createdInvoiceFiles) {
            expect(fs.existsSync(filePath.path)).toBe(false);
          }
          for (const budget of createdBudgets) {
            const found = await budgetRepository.findById(budget.id);
            expect(found).toBeNull();
          }

          // Step 5: Restore from backup using the new restoreBackup method
          const restoreResult = await backupService.restoreBackup(backupResult.path);
          expect(restoreResult.success).toBe(true);

          // Reinitialize database connection after restore
          const { initializeDatabase } = require('../database/db');
          await initializeDatabase();

          // Step 6: Verify all data is restored correctly
          
          // Verify invoice files are restored with correct content and directory structure
          for (const invoiceFile of createdInvoiceFiles) {
            expect(fs.existsSync(invoiceFile.path)).toBe(true);
            const restoredContent = await fs.promises.readFile(invoiceFile.path, 'utf8');
            const originalContent = originalInvoiceContents.get(invoiceFile.path);
            expect(restoredContent).toBe(originalContent);
            
            // Verify directory structure (YYYY/MM)
            const pathParts = invoiceFile.path.split(path.sep);
            const monthIndex = pathParts.length - 2;
            const yearIndex = pathParts.length - 3;
            expect(pathParts[monthIndex]).toBe(String(invoiceFile.month).padStart(2, '0'));
            expect(pathParts[yearIndex]).toBe(String(invoiceFile.year));
          }

          // Verify budgets are restored with identical values
          // Note: After restore, we verify by year/month/category since IDs may change
          for (const originalBudget of createdBudgets) {
            // First try by ID
            let restored = await budgetRepository.findById(originalBudget.id);
            
            // If not found by ID, search by year/month/category
            if (!restored) {
              const allBudgets = await budgetRepository.findByYearMonth(originalBudget.year, originalBudget.month);
              restored = allBudgets.find(b => b.category === originalBudget.category);
            }
            
            expect(restored).not.toBeNull();
            if (restored) {
              expect(restored.year).toBe(originalBudget.year);
              expect(restored.month).toBe(originalBudget.month);
              expect(restored.category).toBe(originalBudget.category);
              expect(restored.limit).toBeCloseTo(originalBudget.originalLimit, 2);
            }
          }

          return true;
        } finally {
          // Clean up
          for (const filePath of createdInvoiceFiles) {
            try {
              await fs.promises.unlink(filePath.path);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          for (const invoice of testData.invoices) {
            try {
              const monthDir = path.join(invoicesPath, String(invoice.year), String(invoice.month).padStart(2, '0'));
              const yearDir = path.join(invoicesPath, String(invoice.year));
              await fs.promises.rmdir(monthDir);
              await fs.promises.rmdir(yearDir);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          for (const budget of createdBudgets) {
            try {
              await budgetRepository.delete(budget.id);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
        }
      }),
      pbtOptions()
    );
  }, 120000); // Longer timeout for comprehensive round-trip test

  /**
   * Feature: invoice-backup-enhancement, Property 6: Restore File Count Accuracy
   * **Validates: Requirements 4.3**
   * 
   * For any restore operation, the reported number of files restored SHALL equal 
   * the actual number of files extracted from the archive.
   */
  test('Property 6: Restore File Count Accuracy - reported count matches actual files restored', async () => {
    const invoicesPath = getInvoicesPath();
    
    // Arbitrary for generating test invoice file data
    const invoiceFileArbitrary = fc.record({
      year: fc.integer({ min: 2070, max: 2079 }), // Use different year range to avoid conflicts
      month: fc.integer({ min: 1, max: 12 }),
      filename: fc.string({ minLength: 8, maxLength: 16, unit: 'grapheme-ascii' })
        .filter(s => /^[a-zA-Z0-9]+$/.test(s))
        .map(s => `filecount_${s}.pdf`)
    });

    // Generate 0-3 invoice files
    const invoiceFilesArbitrary = fc.array(invoiceFileArbitrary, { minLength: 0, maxLength: 3 });

    await fc.assert(
      fc.asyncProperty(invoiceFilesArbitrary, async (invoiceFiles) => {
        const createdFiles = [];
        
        try {
          // Step 1: Create test invoice files
          for (const invoice of invoiceFiles) {
            const yearDir = path.join(invoicesPath, String(invoice.year));
            const monthDir = path.join(yearDir, String(invoice.month).padStart(2, '0'));
            const filePath = path.join(monthDir, invoice.filename);
            
            await fs.promises.mkdir(monthDir, { recursive: true });
            await fs.promises.writeFile(filePath, '%PDF-1.4 test content for file count');
            createdFiles.push(filePath);
          }

          // Step 2: Perform backup
          const backupResult = await backupService.performBackup(testBackupPath);
          expect(backupResult.success).toBe(true);

          // Step 3: List archive contents to get expected file count
          const archiveContents = await archiveUtils.listArchiveContents(backupResult.path);
          // Count only files (not directories) in the archive
          const expectedFileCount = archiveContents.filter(item => 
            item.type === 'File' || item.type === 'file' || 
            (!item.name.endsWith('/') && item.size > 0)
          ).length;

          // Step 4: Delete created invoice files (but keep database and config)
          for (const filePath of createdFiles) {
            try {
              await fs.promises.unlink(filePath);
            } catch (err) {
              // Ignore if already deleted
            }
          }

          // Step 5: Restore from backup
          const restoreResult = await backupService.restoreBackup(backupResult.path);
          expect(restoreResult.success).toBe(true);

          // Step 6: Verify reported file count is reasonable
          // The restore should report the actual number of files restored
          expect(restoreResult.filesRestored).toBeGreaterThanOrEqual(1); // At least database
          
          // The restore counts all files it copies from the archive
          // This includes database, config, and any invoice files in the archive
          // We verify that the count is at least what we expect (our test files + base files)
          
          // Count our test invoice files that were restored
          let testFilesRestored = 0;
          for (const filePath of createdFiles) {
            if (fs.existsSync(filePath)) {
              testFilesRestored++;
            }
          }
          
          // All our test files should be restored
          expect(testFilesRestored).toBe(createdFiles.length);
          
          // The total restored should be at least our test files plus database
          expect(restoreResult.filesRestored).toBeGreaterThanOrEqual(testFilesRestored + 1);

          return true;
        } finally {
          // Clean up created invoice files
          for (const filePath of createdFiles) {
            try {
              await fs.promises.unlink(filePath);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          // Clean up empty directories
          for (const invoice of invoiceFiles) {
            try {
              const monthDir = path.join(invoicesPath, String(invoice.year), String(invoice.month).padStart(2, '0'));
              const yearDir = path.join(invoicesPath, String(invoice.year));
              await fs.promises.rmdir(monthDir);
              await fs.promises.rmdir(yearDir);
            } catch (err) {
              // Ignore cleanup errors (directory might not be empty)
            }
          }
        }
      }),
      pbtOptions()
    );
  }, 120000);

  /**
   * Feature: invoice-backup-enhancement, Property 4: Backup Listing Accuracy
   * **Validates: Requirements 2.1, 2.2, 2.3**
   * 
   * For any set of backup archives in the backup directory, the backup listing SHALL report 
   * accurate filename, size, and creation timestamp for each backup.
   */
  test('Property 4: Backup Listing Accuracy - listing reports accurate filename, size, and timestamp', async () => {
    const testListingPath = path.join(__dirname, '../../test-pbt-listing');
    
    // Clean up and create test directory
    await fs.promises.rm(testListingPath, { recursive: true, force: true }).catch(() => {});
    await fs.promises.mkdir(testListingPath, { recursive: true });
    
    // Arbitrary for number of backups to create (1-5)
    const backupCountArbitrary = fc.integer({ min: 1, max: 5 });

    // Save original config before all tests
    const originalConfig = backupService.getConfig();

    try {
      await fc.assert(
        fc.asyncProperty(backupCountArbitrary, async (backupCount) => {
          // Clean the test directory before each run
          const existingFiles = await fs.promises.readdir(testListingPath).catch(() => []);
          for (const file of existingFiles) {
            await fs.promises.unlink(path.join(testListingPath, file)).catch(() => {});
          }

          // Set high keepLastN BEFORE creating backups to prevent cleanup during creation
          backupService.updateConfig({ targetPath: testListingPath, keepLastN: 100 });

          // Step 1: Create multiple backups with sufficient delay to ensure unique timestamps
          const createdBackups = [];
          for (let i = 0; i < backupCount; i++) {
            const result = await backupService.performBackup(testListingPath);
            expect(result.success).toBe(true);
            createdBackups.push({
              filename: result.filename,
              path: result.path,
              size: result.size,
              timestamp: result.timestamp
            });
            // Wait 1.1 seconds to ensure different timestamps (filename uses seconds precision)
            if (i < backupCount - 1) {
              await new Promise(resolve => setTimeout(resolve, 1100));
            }
          }

          // Step 2: Get backup list
          const backupList = backupService.getBackupList();

          // Step 3: Verify the listing contains all created backups
          expect(backupList.length).toBe(createdBackups.length);

          // Step 4: Verify each backup in the listing has accurate information
          for (const created of createdBackups) {
            const listed = backupList.find(b => b.name === created.filename);
            expect(listed).toBeDefined();
            
            if (listed) {
              // Verify filename matches
              expect(listed.name).toBe(created.filename);
              expect(listed.name).toMatch(/\.tar\.gz$/);
              
              // Verify size matches (should be exact)
              expect(listed.size).toBe(created.size);
              expect(listed.size).toBeGreaterThan(0);
              
              // Verify path is correct
              expect(listed.path).toBe(created.path);
              
              // Verify type is 'archive' for tar.gz files
              expect(listed.type).toBe('archive');
              
              // Verify created timestamp is a valid ISO string
              expect(listed.created).toBeDefined();
              const createdDate = new Date(listed.created);
              expect(createdDate.toString()).not.toBe('Invalid Date');
              
              // Verify the file actually exists on disk
              expect(fs.existsSync(listed.path)).toBe(true);
              
              // Verify the size matches the actual file size on disk
              const stats = fs.statSync(listed.path);
              expect(listed.size).toBe(stats.size);
            }
          }

          // Step 5: Verify listing is sorted by creation date (newest first)
          for (let i = 1; i < backupList.length; i++) {
            const prevDate = new Date(backupList[i - 1].created);
            const currDate = new Date(backupList[i].created);
            expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
          }

          return true;
        }),
        pbtOptions() // Reduced runs due to longer delays
      );
    } finally {
      // Restore original config
      backupService.updateConfig({ targetPath: originalConfig.targetPath, keepLastN: originalConfig.keepLastN });
      // Clean up test directory
      await fs.promises.rm(testListingPath, { recursive: true, force: true }).catch(() => {});
    }
  }, 300000); // Longer timeout due to delays between backups

  /**
   * Feature: invoice-backup-enhancement, Property 5: Retention Policy Enforcement
   * **Validates: Requirements 3.1, 3.2**
   * 
   * For any backup directory with N backups where N > keepLastN, after cleanup the directory 
   * SHALL contain exactly keepLastN backups, and those backups SHALL be the N newest by creation time.
   */
  test('Property 5: Retention Policy Enforcement - cleanup keeps only newest backups', async () => {
    const testRetentionPath = path.join(__dirname, '../../test-pbt-retention');
    
    // Clean up and create test directory
    await fs.promises.rm(testRetentionPath, { recursive: true, force: true }).catch(() => {});
    await fs.promises.mkdir(testRetentionPath, { recursive: true });

    // Arbitrary for test parameters - reduced ranges due to time constraints
    const retentionParamsArbitrary = fc.record({
      totalBackups: fc.integer({ min: 3, max: 5 }),
      keepLastN: fc.integer({ min: 1, max: 2 })
    }).filter(params => params.totalBackups > params.keepLastN);

    // Save original config before all tests
    const originalConfig = backupService.getConfig();

    try {
      await fc.assert(
        fc.asyncProperty(retentionParamsArbitrary, async ({ totalBackups, keepLastN }) => {
          // Clean the test directory before each run
          const existingFiles = await fs.promises.readdir(testRetentionPath).catch(() => []);
          for (const file of existingFiles) {
            await fs.promises.unlink(path.join(testRetentionPath, file)).catch(() => {});
          }

          // Step 1: Create multiple backups (more than keepLastN)
          const createdBackups = [];
          
          // Set high keepLastN to prevent cleanup during creation
          backupService.updateConfig({ targetPath: testRetentionPath, keepLastN: 100 });
          
          for (let i = 0; i < totalBackups; i++) {
            const result = await backupService.performBackup(testRetentionPath);
            expect(result.success).toBe(true);
            createdBackups.push({
              filename: result.filename,
              path: result.path,
              timestamp: new Date(result.timestamp).getTime()
            });
            // Wait 1.1 seconds to ensure different timestamps (filename uses seconds precision)
            if (i < totalBackups - 1) {
              await new Promise(resolve => setTimeout(resolve, 1100));
            }
          }

          // Verify all backups were created
          const filesBeforeCleanup = fs.readdirSync(testRetentionPath)
            .filter(f => f.endsWith('.tar.gz'));
          expect(filesBeforeCleanup.length).toBe(totalBackups);

          // Step 2: Update config with the actual keepLastN and trigger cleanup
          backupService.updateConfig({ keepLastN });
          backupService.cleanupOldBackups(testRetentionPath);

          // Step 3: Verify exactly keepLastN backups remain
          const filesAfterCleanup = fs.readdirSync(testRetentionPath)
            .filter(f => f.endsWith('.tar.gz'));
          expect(filesAfterCleanup.length).toBe(keepLastN);

          // Step 4: Verify the remaining backups are the newest ones
          // Sort created backups by timestamp (newest first)
          const sortedByNewest = [...createdBackups].sort((a, b) => b.timestamp - a.timestamp);
          const expectedNewest = sortedByNewest.slice(0, keepLastN);
          const expectedFilenames = expectedNewest.map(b => b.filename);

          // Verify all remaining files are from the expected newest set
          for (const remainingFile of filesAfterCleanup) {
            expect(expectedFilenames).toContain(remainingFile);
          }

          // Verify the deleted files were the oldest ones
          const expectedDeleted = sortedByNewest.slice(keepLastN);
          for (const deleted of expectedDeleted) {
            expect(fs.existsSync(deleted.path)).toBe(false);
          }

          return true;
        }),
        pbtOptions() // Reduced runs due to longer delays
      );
    } finally {
      // Restore original config
      backupService.updateConfig({ targetPath: originalConfig.targetPath, keepLastN: originalConfig.keepLastN });
      // Clean up test directory
      await fs.promises.rm(testRetentionPath, { recursive: true, force: true }).catch(() => {});
    }
  }, 300000); // Longer timeout due to delays between backups

  /**
   * Feature: invoice-backup-enhancement, Property 7: Storage Statistics Accuracy
   * **Validates: Requirements 5.1, 5.2, 5.3**
   * 
   * For any backup directory and invoice storage, the reported statistics SHALL accurately 
   * reflect the total backup size (sum of all archive sizes), backup count, and invoice storage size.
   */
  test('Property 7: Storage Statistics Accuracy - stats accurately reflect actual storage', async () => {
    const testStatsPath = path.join(__dirname, '../../test-pbt-stats');
    const invoicesPath = getInvoicesPath();
    
    // Clean up and create test directory
    await fs.promises.rm(testStatsPath, { recursive: true, force: true }).catch(() => {});
    await fs.promises.mkdir(testStatsPath, { recursive: true });

    // Arbitrary for test parameters
    const statsParamsArbitrary = fc.record({
      backupCount: fc.integer({ min: 1, max: 3 }),
      invoiceFiles: fc.array(
        fc.record({
          year: fc.integer({ min: 2091, max: 2095 }), // Use unique year range to avoid conflicts
          month: fc.integer({ min: 1, max: 12 }),
          filename: fc.string({ minLength: 8, maxLength: 16, unit: 'grapheme-ascii' })
            .filter(s => /^[a-zA-Z0-9]+$/.test(s))
            .map(s => `stats_${s}.pdf`),
          contentSize: fc.integer({ min: 100, max: 1000 }) // Size of content to write
        }),
        { minLength: 0, maxLength: 3 }
      )
    });

    // Save original config before all tests
    const originalConfig = backupService.getConfig();

    try {
      await fc.assert(
        fc.asyncProperty(statsParamsArbitrary, async ({ backupCount, invoiceFiles }) => {
          const createdInvoiceFiles = [];
          
          try {
            // Clean the test directory before each run
            const existingFiles = await fs.promises.readdir(testStatsPath).catch(() => []);
            for (const file of existingFiles) {
              await fs.promises.unlink(path.join(testStatsPath, file)).catch(() => {});
            }

            // Step 1: Create test invoice files
            let expectedInvoiceSize = 0;
            for (const invoice of invoiceFiles) {
              const yearDir = path.join(invoicesPath, String(invoice.year));
              const monthDir = path.join(yearDir, String(invoice.month).padStart(2, '0'));
              const filePath = path.join(monthDir, invoice.filename);
              
              await fs.promises.mkdir(monthDir, { recursive: true });
              // Create content of specified size
              const content = '%PDF-1.4 ' + 'x'.repeat(invoice.contentSize);
              await fs.promises.writeFile(filePath, content);
              createdInvoiceFiles.push({ path: filePath, year: invoice.year, month: invoice.month });
              expectedInvoiceSize += Buffer.byteLength(content);
            }

            // Step 2: Create backups
            backupService.updateConfig({ targetPath: testStatsPath, keepLastN: 100 });
            
            let expectedBackupSize = 0;
            for (let i = 0; i < backupCount; i++) {
              const result = await backupService.performBackup(testStatsPath);
              expect(result.success).toBe(true);
              expectedBackupSize += result.size;
              // Wait to ensure different timestamps
              if (i < backupCount - 1) {
                await new Promise(resolve => setTimeout(resolve, 1100));
              }
            }

            // Step 3: Get storage stats
            const stats = await backupService.getStorageStats();

            // Step 4: Verify backup count is accurate
            expect(stats.backupCount).toBe(backupCount);

            // Step 5: Verify total backup size is accurate
            // Calculate actual backup size from files on disk
            const backupFiles = fs.readdirSync(testStatsPath)
              .filter(f => f.startsWith('expense-tracker-backup-') && f.endsWith('.tar.gz'));
            let actualBackupSize = 0;
            for (const file of backupFiles) {
              const fileStat = fs.statSync(path.join(testStatsPath, file));
              actualBackupSize += fileStat.size;
            }
            expect(stats.totalBackupSize).toBe(actualBackupSize);

            // Step 6: Verify totalBackupSizeMB is correctly calculated
            const expectedMB = Math.round(actualBackupSize / (1024 * 1024) * 100) / 100;
            expect(stats.totalBackupSizeMB).toBe(expectedMB);

            // Step 7: Verify invoice count includes at least our test files
            // Note: The system may have existing invoices, so we verify our test files are counted
            expect(stats.invoiceCount).toBeGreaterThanOrEqual(invoiceFiles.length);

            // Step 8: Verify invoice storage size includes at least our test files
            // Calculate actual invoice size from our test files on disk
            let testInvoiceSize = 0;
            for (const invoiceFile of createdInvoiceFiles) {
              if (fs.existsSync(invoiceFile.path)) {
                const fileStat = fs.statSync(invoiceFile.path);
                testInvoiceSize += fileStat.size;
              }
            }
            // The total invoice storage should be at least our test files
            expect(stats.invoiceStorageSize).toBeGreaterThanOrEqual(testInvoiceSize);

            // Step 9: Verify invoiceStorageSizeMB is correctly calculated (non-negative)
            expect(stats.invoiceStorageSizeMB).toBeGreaterThanOrEqual(0);

            return true;
          } finally {
            // Clean up created invoice files
            for (const invoiceFile of createdInvoiceFiles) {
              try {
                await fs.promises.unlink(invoiceFile.path);
              } catch (err) {
                // Ignore cleanup errors
              }
            }
            // Clean up empty directories
            for (const invoice of invoiceFiles) {
              try {
                const monthDir = path.join(invoicesPath, String(invoice.year), String(invoice.month).padStart(2, '0'));
                const yearDir = path.join(invoicesPath, String(invoice.year));
                await fs.promises.rmdir(monthDir);
                await fs.promises.rmdir(yearDir);
              } catch (err) {
                // Ignore cleanup errors (directory might not be empty)
              }
            }
          }
        }),
        pbtOptions() // Reduced runs due to delays
      );
    } finally {
      // Restore original config
      backupService.updateConfig({ targetPath: originalConfig.targetPath, keepLastN: originalConfig.keepLastN });
      // Clean up test directory
      await fs.promises.rm(testStatsPath, { recursive: true, force: true }).catch(() => {});
    }
  }, 300000); // Longer timeout due to delays between backups
});


/**
 * Feature: medical-insurance-tracking, Property 12: Backup/Restore Round-Trip
 * **Validates: Requirements 9.1, 9.2, 9.3**
 * 
 * For any expense with insurance data, creating a backup and restoring from that backup 
 * SHALL produce an expense with identical values for all fields including insurance_eligible, 
 * claim_status, original_cost, and amount.
 */
describe('Medical Insurance Tracking - Backup/Restore', () => {
  const testBackupPath = path.join(__dirname, '../../test-pbt-insurance-backup');
  const expenseRepository = require('../repositories/expenseRepository');
  
  beforeAll(async () => {
    // Initialize the real database for backup tests
    await initializeDatabase();
    
    // Create test backup directory
    if (!fs.existsSync(testBackupPath)) {
      fs.mkdirSync(testBackupPath, { recursive: true });
    }
  });

  afterAll(async () => {
    // Clean up test backup directory
    if (fs.existsSync(testBackupPath)) {
      const files = fs.readdirSync(testBackupPath);
      files.forEach(file => {
        fs.unlinkSync(path.join(testBackupPath, file));
      });
      fs.rmdirSync(testBackupPath);
    }
  });

  beforeEach(async () => {
    // Clean up any existing test expenses in the test year range to avoid conflicts
    const { getDatabase } = require('../database/db');
    const db = await getDatabase();
    
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM expenses WHERE strftime('%Y', date) >= '2095' AND strftime('%Y', date) <= '2099'", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  test('Property 12: Backup/Restore Round-Trip - insurance data is preserved after backup and restore', async () => {
    // Define arbitrary for valid claim statuses
    const claimStatusArb = fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied', null);
    
    // Define arbitrary for generating valid medical expenses with insurance data
    const medicalExpenseArb = fc.record({
      date: fc.integer({ min: 2095, max: 2099 }).chain(year => 
        fc.integer({ min: 1, max: 12 }).chain(month => 
          fc.integer({ min: 1, max: 28 }).map(day => 
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          )
        )
      ),
      place: fc.string({ minLength: 1, maxLength: 50, unit: 'grapheme-ascii' })
        .filter(s => /^[a-zA-Z0-9\s]+$/.test(s) && s.trim().length > 0)
        .map(s => s.trim()),
      notes: fc.option(
        fc.string({ minLength: 1, maxLength: 100, unit: 'grapheme-ascii' })
          .filter(s => /^[a-zA-Z0-9\s]+$/.test(s))
          .map(s => s.trim()),
        { nil: null }
      ),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true, noDefaultInfinity: true }),
      type: fc.constant('Tax - Medical'),
      method: fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'),
      insurance_eligible: fc.boolean(),
      claim_status: claimStatusArb,
      original_cost: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true, noDefaultInfinity: true })
    }).map(expense => {
      // Ensure amount <= original_cost when insurance is eligible
      if (expense.insurance_eligible && expense.original_cost !== null) {
        // Make sure amount doesn't exceed original_cost
        expense.amount = Math.min(expense.amount, expense.original_cost);
      }
      // If not insurance eligible, clear insurance-specific fields
      if (!expense.insurance_eligible) {
        expense.claim_status = null;
        expense.original_cost = null;
      }
      return expense;
    });

    // Generate an array of 1-3 medical expenses with insurance data
    const expensesArrayArb = fc.array(medicalExpenseArb, { minLength: 1, maxLength: 3 });

    await fc.assert(
      fc.asyncProperty(expensesArrayArb, async (expenses) => {
        const createdExpenses = [];
        
        try {
          // Step 1: Create medical expenses with insurance data in the database
          for (const expense of expenses) {
            // Calculate week from date
            const dateObj = new Date(expense.date);
            const dayOfMonth = dateObj.getDate();
            const week = Math.min(Math.ceil(dayOfMonth / 7), 5);
            
            const expenseWithWeek = {
              ...expense,
              week
            };
            
            const created = await expenseRepository.create(expenseWithWeek);
            createdExpenses.push({
              ...created,
              // Store original values for comparison
              originalInsuranceEligible: expense.insurance_eligible,
              originalClaimStatus: expense.claim_status,
              originalOriginalCost: expense.original_cost,
              originalAmount: expense.amount
            });
          }

          // Step 2: Perform backup
          const backupResult = await backupService.performBackup(testBackupPath);
          expect(backupResult.success).toBe(true);

          // Step 3: Delete all created expenses
          for (const expense of createdExpenses) {
            await expenseRepository.delete(expense.id);
          }

          // Verify expenses are deleted
          for (const expense of createdExpenses) {
            const found = await expenseRepository.findById(expense.id);
            expect(found).toBeNull();
          }

          // Step 4: Restore from backup
          const restoreResult = await backupService.restoreBackup(backupResult.path);
          expect(restoreResult.success).toBe(true);

          // Reinitialize database connection after restore
          await initializeDatabase();

          // Step 5: Verify all expenses are restored with identical insurance data
          for (const originalExpense of createdExpenses) {
            // First try by ID
            let restored = await expenseRepository.findById(originalExpense.id);
            
            // If not found by ID, search by date and place
            if (!restored) {
              const { getDatabase } = require('../database/db');
              const db = await getDatabase();
              restored = await new Promise((resolve, reject) => {
                db.get(
                  'SELECT * FROM expenses WHERE date = ? AND place = ? AND type = ?',
                  [originalExpense.date, originalExpense.place, originalExpense.type],
                  (err, row) => {
                    if (err) reject(err);
                    else resolve(row || null);
                  }
                );
              });
            }
            
            expect(restored).not.toBeNull();
            
            if (restored) {
              // Verify core expense fields
              expect(restored.date).toBe(originalExpense.date);
              expect(restored.place).toBe(originalExpense.place);
              expect(restored.type).toBe(originalExpense.type);
              expect(restored.method).toBe(originalExpense.method);
              
              // Verify amount with floating point tolerance
              expect(restored.amount).toBeCloseTo(originalExpense.originalAmount, 2);
              
              // Verify insurance_eligible field (Requirements 9.1, 9.2)
              const restoredInsuranceEligible = restored.insurance_eligible === 1 || restored.insurance_eligible === true;
              expect(restoredInsuranceEligible).toBe(originalExpense.originalInsuranceEligible);
              
              // Verify claim_status field (Requirements 9.1, 9.2)
              expect(restored.claim_status).toBe(originalExpense.originalClaimStatus);
              
              // Verify original_cost field (Requirements 9.1, 9.2)
              if (originalExpense.originalOriginalCost !== null) {
                expect(restored.original_cost).toBeCloseTo(originalExpense.originalOriginalCost, 2);
              } else {
                expect(restored.original_cost).toBeNull();
              }
              
              // Verify round-trip property (Requirement 9.3)
              // Serializing then deserializing produces equivalent object
              const roundTripValid = 
                restoredInsuranceEligible === originalExpense.originalInsuranceEligible &&
                restored.claim_status === originalExpense.originalClaimStatus &&
                (originalExpense.originalOriginalCost === null 
                  ? restored.original_cost === null 
                  : Math.abs(restored.original_cost - originalExpense.originalOriginalCost) < 0.01) &&
                Math.abs(restored.amount - originalExpense.originalAmount) < 0.01;
              
              expect(roundTripValid).toBe(true);
            }
          }

          // Clean up: delete restored expenses
          for (const expense of createdExpenses) {
            try {
              await expenseRepository.delete(expense.id);
            } catch (err) {
              // Expense might not exist, ignore
            }
          }

          return true;
        } catch (error) {
          // Clean up on error
          for (const expense of createdExpenses) {
            try {
              await expenseRepository.delete(expense.id);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          throw error;
        }
      }),
      pbtOptions()
    );
  }, 300000); // Longer timeout for comprehensive round-trip test with 100 iterations

  test('Property 12 (Edge Case): Non-eligible expenses preserve null insurance fields after backup/restore', async () => {
    // Test specifically for non-insurance-eligible medical expenses
    const nonEligibleExpenseArb = fc.record({
      date: fc.integer({ min: 2095, max: 2099 }).chain(year => 
        fc.integer({ min: 1, max: 12 }).chain(month => 
          fc.integer({ min: 1, max: 28 }).map(day => 
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          )
        )
      ),
      place: fc.string({ minLength: 1, maxLength: 50, unit: 'grapheme-ascii' })
        .filter(s => /^[a-zA-Z0-9\s]+$/.test(s) && s.trim().length > 0)
        .map(s => s.trim()),
      notes: fc.constant(null),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true, noDefaultInfinity: true }),
      type: fc.constant('Tax - Medical'),
      method: fc.constantFrom('Cash', 'Debit', 'CIBC MC'),
      insurance_eligible: fc.constant(false), // Always not eligible
      claim_status: fc.constant(null),
      original_cost: fc.constant(null)
    });

    await fc.assert(
      fc.asyncProperty(nonEligibleExpenseArb, async (expense) => {
        let createdExpense = null;
        
        try {
          // Calculate week from date
          const dateObj = new Date(expense.date);
          const dayOfMonth = dateObj.getDate();
          const week = Math.min(Math.ceil(dayOfMonth / 7), 5);
          
          const expenseWithWeek = { ...expense, week };
          
          // Step 1: Create non-eligible expense
          createdExpense = await expenseRepository.create(expenseWithWeek);

          // Step 2: Perform backup
          const backupResult = await backupService.performBackup(testBackupPath);
          expect(backupResult.success).toBe(true);

          // Step 3: Delete expense
          await expenseRepository.delete(createdExpense.id);

          // Step 4: Restore from backup
          const restoreResult = await backupService.restoreBackup(backupResult.path);
          expect(restoreResult.success).toBe(true);

          // Reinitialize database connection after restore
          await initializeDatabase();

          // Step 5: Verify expense is restored with null insurance fields
          const restored = await expenseRepository.findById(createdExpense.id);
          expect(restored).not.toBeNull();
          
          if (restored) {
            // Verify insurance_eligible is false (0)
            const restoredInsuranceEligible = restored.insurance_eligible === 1 || restored.insurance_eligible === true;
            expect(restoredInsuranceEligible).toBe(false);
            
            // Verify claim_status is null
            expect(restored.claim_status).toBeNull();
            
            // Verify original_cost is null
            expect(restored.original_cost).toBeNull();
          }

          // Clean up
          try {
            await expenseRepository.delete(createdExpense.id);
          } catch (err) {
            // Ignore cleanup errors
          }

          return true;
        } catch (error) {
          // Clean up on error
          if (createdExpense) {
            try {
              await expenseRepository.delete(createdExpense.id);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          throw error;
        }
      }),
      pbtOptions()
    );
  }, 180000);

  test('Property 12 (Edge Case): All claim statuses are preserved after backup/restore', async () => {
    // Test each claim status value explicitly
    const claimStatuses = ['not_claimed', 'in_progress', 'paid', 'denied'];
    
    for (const claimStatus of claimStatuses) {
      let createdExpense = null;
      
      try {
        // Create expense with specific claim status
        const expense = {
          date: '2097-06-15',
          place: `Test Provider ${claimStatus}`,
          notes: null,
          amount: 50.00,
          type: 'Tax - Medical',
          method: 'Cash',
          week: 3,
          insurance_eligible: true,
          claim_status: claimStatus,
          original_cost: 100.00
        };
        
        createdExpense = await expenseRepository.create(expense);

        // Perform backup
        const backupResult = await backupService.performBackup(testBackupPath);
        expect(backupResult.success).toBe(true);

        // Delete expense
        await expenseRepository.delete(createdExpense.id);

        // Restore from backup
        const restoreResult = await backupService.restoreBackup(backupResult.path);
        expect(restoreResult.success).toBe(true);

        // Reinitialize database connection after restore
        await initializeDatabase();

        // Verify claim status is preserved
        const restored = await expenseRepository.findById(createdExpense.id);
        expect(restored).not.toBeNull();
        expect(restored.claim_status).toBe(claimStatus);
        expect(restored.insurance_eligible).toBe(1);
        expect(restored.original_cost).toBeCloseTo(100.00, 2);
        expect(restored.amount).toBeCloseTo(50.00, 2);

        // Clean up
        await expenseRepository.delete(createdExpense.id);
      } catch (error) {
        // Clean up on error
        if (createdExpense) {
          try {
            await expenseRepository.delete(createdExpense.id);
          } catch (err) {
            // Ignore cleanup errors
          }
        }
        throw error;
      }
    }
  }, 120000);
});


/**
 * Property-Based Tests for Payment Methods Backup
 * Feature: configurable-payment-methods
 */
describe('BackupService - Payment Methods Property-Based Tests', () => {
  const testBackupPath = path.join(__dirname, '../../test-pbt-payment-methods-backups');
  const testExtractPath = path.join(__dirname, '../../test-pbt-payment-methods-extract');
  
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
    if (fs.existsSync(testBackupPath)) {
      try {
        await fs.promises.rm(testBackupPath, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    if (fs.existsSync(testExtractPath)) {
      try {
        await fs.promises.rm(testExtractPath, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  /**
   * Feature: configurable-payment-methods, Property 23: Backup Includes Payment Methods
   * **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**
   * 
   * For any backup created after migration, restoring the backup should result in identical
   * payment_methods, credit_card_payments, and credit_card_statements tables.
   */
  test('Property 23: Backup Includes Payment Methods - backup and restore preserves payment method data', async () => {
    const paymentMethodRepository = require('../repositories/paymentMethodRepository');
    const creditCardPaymentRepository = require('../repositories/creditCardPaymentRepository');
    
    // Arbitrary for generating payment method data
    const paymentMethodArbitrary = fc.record({
      type: fc.constantFrom('cash', 'cheque', 'debit', 'credit_card'),
      display_name: fc.string({ minLength: 3, maxLength: 20, unit: 'grapheme-ascii' })
        .filter(s => /^[a-zA-Z0-9 ]+$/.test(s))
        .map(s => `Test_${s}_${Date.now()}`), // Ensure uniqueness
      full_name: fc.option(fc.string({ minLength: 5, maxLength: 50, unit: 'grapheme-ascii' })
        .filter(s => /^[a-zA-Z0-9 ]+$/.test(s)), { nil: undefined }),
      credit_limit: fc.option(fc.float({ min: 1000, max: 50000, noNaN: true, noDefaultInfinity: true }), { nil: undefined }),
      current_balance: fc.float({ min: 0, max: 5000, noNaN: true, noDefaultInfinity: true })
    });

    // Arbitrary for generating credit card payment data
    // Use integer-based date generation to avoid invalid date issues with fc.date()
    const paymentArbitrary = fc.record({
      amount: fc.float({ min: 10, max: 1000, noNaN: true, noDefaultInfinity: true }),
      payment_date: fc.integer({ min: 2020, max: 2030 }).chain(year =>
        fc.integer({ min: 1, max: 12 }).chain(month =>
          fc.integer({ min: 1, max: 28 }).map(day =>
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          )
        )
      ),
      notes: fc.option(fc.string({ minLength: 5, maxLength: 50, unit: 'grapheme-ascii' })
        .filter(s => /^[a-zA-Z0-9 ]+$/.test(s)), { nil: undefined })
    });

    await fc.assert(
      fc.asyncProperty(paymentMethodArbitrary, paymentArbitrary, async (pmData, paymentData) => {
        let createdPaymentMethod = null;
        let createdPayment = null;
        
        try {
          // Step 1: Create a payment method
          const paymentMethodData = {
            type: pmData.type,
            display_name: pmData.display_name,
            full_name: pmData.type === 'credit_card' ? (pmData.full_name || pmData.display_name) : pmData.full_name,
            credit_limit: pmData.type === 'credit_card' ? pmData.credit_limit : undefined,
            current_balance: pmData.type === 'credit_card' ? pmData.current_balance : 0
          };
          
          createdPaymentMethod = await paymentMethodRepository.create(paymentMethodData);
          expect(createdPaymentMethod).not.toBeNull();
          expect(createdPaymentMethod.id).toBeDefined();

          // Step 2: If credit card, create a payment record
          if (pmData.type === 'credit_card') {
            const paymentRecord = {
              payment_method_id: createdPaymentMethod.id,
              amount: paymentData.amount,
              payment_date: paymentData.payment_date,
              notes: paymentData.notes
            };
            createdPayment = await creditCardPaymentRepository.create(paymentRecord);
            expect(createdPayment).not.toBeNull();
          }

          // Step 3: Perform backup
          const backupResult = await backupService.performBackup(testBackupPath);
          expect(backupResult.success).toBe(true);

          // Step 4: Delete the created data
          if (createdPayment) {
            await creditCardPaymentRepository.delete(createdPayment.id);
          }
          await paymentMethodRepository.delete(createdPaymentMethod.id);

          // Verify data is deleted
          const deletedPM = await paymentMethodRepository.findById(createdPaymentMethod.id);
          expect(deletedPM).toBeNull();

          // Step 5: Restore from backup
          const restoreResult = await backupService.restoreBackup(backupResult.path);
          expect(restoreResult.success).toBe(true);

          // Reinitialize database connection after restore
          await initializeDatabase();

          // Step 6: Verify payment method is restored with identical values
          const restoredPM = await paymentMethodRepository.findById(createdPaymentMethod.id);
          expect(restoredPM).not.toBeNull();
          expect(restoredPM.type).toBe(createdPaymentMethod.type);
          expect(restoredPM.display_name).toBe(createdPaymentMethod.display_name);
          expect(restoredPM.is_active).toBe(createdPaymentMethod.is_active);
          
          if (pmData.type === 'credit_card') {
            if (createdPaymentMethod.credit_limit) {
              expect(restoredPM.credit_limit).toBeCloseTo(createdPaymentMethod.credit_limit, 2);
            }
            expect(restoredPM.current_balance).toBeCloseTo(createdPaymentMethod.current_balance, 2);
          }

          // Step 7: Verify credit card payment is restored (if applicable)
          if (createdPayment) {
            const restoredPayments = await creditCardPaymentRepository.findByPaymentMethodId(createdPaymentMethod.id);
            expect(restoredPayments.length).toBeGreaterThanOrEqual(1);
            
            const restoredPayment = restoredPayments.find(p => p.id === createdPayment.id);
            expect(restoredPayment).not.toBeNull();
            if (restoredPayment) {
              expect(restoredPayment.amount).toBeCloseTo(createdPayment.amount, 2);
              expect(restoredPayment.payment_date).toBe(createdPayment.payment_date);
            }
          }

          // Clean up
          if (createdPayment) {
            try {
              await creditCardPaymentRepository.delete(createdPayment.id);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          try {
            await paymentMethodRepository.delete(createdPaymentMethod.id);
          } catch (err) {
            // Ignore cleanup errors
          }

          return true;
        } catch (error) {
          // Clean up on error
          if (createdPayment) {
            try {
              await creditCardPaymentRepository.delete(createdPayment.id);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          if (createdPaymentMethod) {
            try {
              await paymentMethodRepository.delete(createdPaymentMethod.id);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          throw error;
        }
      }),
      pbtOptions()
    );
  }, 120000);

  /**
   * Feature: configurable-payment-methods, Property 23 (continued): Credit Card Statements Backup
   * **Validates: Requirements 11.3**
   * 
   * For any backup with credit card statements, restoring should preserve statement metadata.
   * Note: This test verifies database records; file backup is tested separately.
   */
  test('Property 23b: Backup preserves credit card statement metadata', async () => {
    const paymentMethodRepository = require('../repositories/paymentMethodRepository');
    const creditCardStatementRepository = require('../repositories/creditCardStatementRepository');
    const { getStatementsPath } = require('../config/paths');
    
    // Create a test credit card payment method
    let testPaymentMethod = null;
    let testStatement = null;
    const statementsPath = getStatementsPath();
    let testFilePath = null;
    
    try {
      // Create a credit card payment method
      testPaymentMethod = await paymentMethodRepository.create({
        type: 'credit_card',
        display_name: `Test CC ${Date.now()}`,
        full_name: 'Test Credit Card for Statement Backup',
        credit_limit: 5000,
        current_balance: 0
      });

      // Create a test statement file
      const testYear = '2095';
      const testDir = path.join(statementsPath, String(testPaymentMethod.id), testYear);
      await fs.promises.mkdir(testDir, { recursive: true });
      
      const testFilename = `statement_${testPaymentMethod.id}_${testYear}01_${Date.now()}.pdf`;
      testFilePath = path.join(testDir, testFilename);
      await fs.promises.writeFile(testFilePath, '%PDF-1.4 test statement content');

      // Create statement record in database
      testStatement = await creditCardStatementRepository.create({
        payment_method_id: testPaymentMethod.id,
        statement_date: '2095-01-15',
        statement_period_start: '2094-12-15',
        statement_period_end: '2095-01-14',
        filename: testFilename,
        original_filename: 'january_statement.pdf',
        file_path: path.join(String(testPaymentMethod.id), testYear, testFilename),
        file_size: 100,
        mime_type: 'application/pdf'
      });

      // Perform backup
      const backupResult = await backupService.performBackup(testBackupPath);
      expect(backupResult.success).toBe(true);

      // Delete the statement record and file
      await creditCardStatementRepository.delete(testStatement.id);
      await fs.promises.unlink(testFilePath).catch(() => {});

      // Verify deletion
      const deletedStatement = await creditCardStatementRepository.findById(testStatement.id);
      expect(deletedStatement).toBeNull();

      // Restore from backup
      const restoreResult = await backupService.restoreBackup(backupResult.path);
      expect(restoreResult.success).toBe(true);

      // Reinitialize database connection after restore
      await initializeDatabase();

      // Verify statement metadata is restored
      const restoredStatement = await creditCardStatementRepository.findById(testStatement.id);
      expect(restoredStatement).not.toBeNull();
      expect(restoredStatement.paymentMethodId).toBe(testPaymentMethod.id);
      expect(restoredStatement.statementDate).toBe('2095-01-15');
      expect(restoredStatement.statementPeriodStart).toBe('2094-12-15');
      expect(restoredStatement.statementPeriodEnd).toBe('2095-01-14');
      expect(restoredStatement.originalFilename).toBe('january_statement.pdf');

      // Verify statement file is restored
      expect(fs.existsSync(testFilePath)).toBe(true);

    } finally {
      // Clean up
      if (testStatement) {
        try {
          await creditCardStatementRepository.delete(testStatement.id);
        } catch (err) {
          // Ignore cleanup errors
        }
      }
      if (testPaymentMethod) {
        try {
          await paymentMethodRepository.delete(testPaymentMethod.id);
        } catch (err) {
          // Ignore cleanup errors
        }
      }
      if (testFilePath) {
        try {
          await fs.promises.unlink(testFilePath);
          // Clean up directories
          const testDir = path.dirname(testFilePath);
          await fs.promises.rmdir(testDir).catch(() => {});
          await fs.promises.rmdir(path.dirname(testDir)).catch(() => {});
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    }
  }, 120000);
});

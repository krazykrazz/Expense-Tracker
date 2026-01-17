/**
 * Property-Based Tests for Backup Service
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const backupService = require('./backupService');
const archiveUtils = require('../utils/archiveUtils');
const budgetRepository = require('../repositories/budgetRepository');
const { DB_PATH } = require('../database/db');
const { getInvoicesPath, getBackupConfigPath } = require('../config/paths');

describe('BackupService - Property-Based Tests', () => {
  const testBackupPath = path.join(__dirname, '../../test-pbt-backups');
  
  beforeAll(() => {
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
      db.run('DELETE FROM budgets WHERE year >= 2050 AND year <= 2070', (err) => {
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
      { numRuns: 100 }
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
          for (const originalBudget of createdBudgets) {
            const restored = await budgetRepository.findById(originalBudget.id);
            
            expect(restored).not.toBeNull();
            expect(restored.year).toBe(originalBudget.year);
            expect(restored.month).toBe(originalBudget.month);
            expect(restored.category).toBe(originalBudget.category);
            // Use toBeCloseTo for floating point comparison
            expect(restored.limit).toBeCloseTo(originalBudget.limit, 2);
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
      { numRuns: 100 }
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
      { numRuns: 100 }
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
      { numRuns: 100 }
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
          for (const originalBudget of createdBudgets) {
            const restored = await budgetRepository.findById(originalBudget.id);
            expect(restored).not.toBeNull();
            expect(restored.year).toBe(originalBudget.year);
            expect(restored.month).toBe(originalBudget.month);
            expect(restored.category).toBe(originalBudget.category);
            expect(restored.limit).toBeCloseTo(originalBudget.originalLimit, 2);
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
      { numRuns: 100 }
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

          // Step 6: Verify reported file count matches expected
          // The restore should report the actual number of files restored
          expect(restoreResult.filesRestored).toBeGreaterThanOrEqual(1); // At least database
          
          // Count actual files that were restored
          let actualFilesRestored = 0;
          
          // Count database (always 1)
          if (fs.existsSync(DB_PATH)) {
            actualFilesRestored++;
          }
          
          // Count invoice files
          for (const filePath of createdFiles) {
            if (fs.existsSync(filePath)) {
              actualFilesRestored++;
            }
          }
          
          // Count config file
          const configPath = getBackupConfigPath();
          if (fs.existsSync(configPath)) {
            actualFilesRestored++;
          }

          // The reported count should match what we can verify was restored
          // Note: The restore counts all files it copies, which should match
          // the files we can verify exist after restore
          expect(restoreResult.filesRestored).toBe(actualFilesRestored);

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
      { numRuns: 100 }
    );
  }, 120000);
});

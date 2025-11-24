const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const backupService = require('./backupService');
const { DB_PATH } = require('../database/db');
const { getBackupPath } = require('../config/paths');

describe('BackupService - Budget Table Integration', () => {
  const testBackupPath = path.join(__dirname, '../../test-backups');
  
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

  test('backup file includes budgets table', async () => {
    // Perform a backup
    const result = await backupService.performBackup(testBackupPath);
    
    expect(result.success).toBe(true);
    expect(result.path).toBeDefined();
    expect(fs.existsSync(result.path)).toBe(true);

    // Open the backup file and verify budgets table exists
    const db = new sqlite3.Database(result.path);
    
    const tableExists = await new Promise((resolve, reject) => {
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'",
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
    
    // Create a test budget
    const testBudget = await budgetRepository.create({
      year: 2025,
      month: 11,
      category: 'Groceries',
      limit: 500.00
    });

    // Perform a backup
    const result = await backupService.performBackup(testBackupPath);
    
    expect(result.success).toBe(true);

    // Open the backup file and verify budget data exists
    const db = new sqlite3.Database(result.path);
    
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
    expect(budgetData.limit).toBe(500.00);

    // Clean up test budget
    await budgetRepository.delete(testBudget.id);
  });

  test('restore recreates budgets correctly', async () => {
    const budgetRepository = require('../repositories/budgetRepository');
    
    // Create test budgets
    const budget1 = await budgetRepository.create({
      year: 2025,
      month: 11,
      category: 'Groceries',
      limit: 500.00
    });
    
    const budget2 = await budgetRepository.create({
      year: 2025,
      month: 11,
      category: 'Gas',
      limit: 200.00
    });

    // Perform a backup
    const backupResult = await backupService.performBackup(testBackupPath);
    expect(backupResult.success).toBe(true);

    // Delete the budgets from the main database
    await budgetRepository.delete(budget1.id);
    await budgetRepository.delete(budget2.id);

    // Verify budgets are deleted
    const budgetsAfterDelete = await budgetRepository.findByYearMonth(2025, 11);
    expect(budgetsAfterDelete.length).toBe(0);

    // Restore from backup by copying the backup file over the main database
    const { initializeDatabase } = require('../database/db');
    fs.copyFileSync(backupResult.path, DB_PATH);
    await initializeDatabase();

    // Verify budgets are restored
    const budgetsAfterRestore = await budgetRepository.findByYearMonth(2025, 11);
    expect(budgetsAfterRestore.length).toBe(2);
    
    const restoredFood = budgetsAfterRestore.find(b => b.category === 'Groceries');
    const restoredGas = budgetsAfterRestore.find(b => b.category === 'Gas');
    
    expect(restoredFood).toBeDefined();
    expect(restoredFood.limit).toBe(500.00);
    
    expect(restoredGas).toBeDefined();
    expect(restoredGas.limit).toBe(200.00);

    // Clean up test budgets
    await budgetRepository.delete(restoredFood.id);
    await budgetRepository.delete(restoredGas.id);
  });
});


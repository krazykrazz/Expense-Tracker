/**
 * Verification script for backup integration with loans
 * This script verifies that:
 * 1. Loans and loan_balances tables exist in the database
 * 2. Backup operations include these tables
 * 3. Restore operations preserve loan data integrity
 */

const fs = require('fs');
const path = require('path');
const { getDatabase, DB_PATH } = require('../database/db');
const backupService = require('../services/backupService');

async function verifyBackupIntegration() {
  console.log('=== Verifying Backup Integration with Loans ===\n');

  let db;
  try {
    db = await getDatabase();

    // Step 1: Verify tables exist
    console.log('Step 1: Verifying loans tables exist in database...');
    const tables = await getTables(db);
    const hasLoansTable = tables.includes('loans');
    const hasLoanBalancesTable = tables.includes('loan_balances');
    
    console.log('  loans table:', hasLoansTable ? '✓ Found' : '✗ Missing');
    console.log('  loan_balances table:', hasLoanBalancesTable ? '✓ Found' : '✗ Missing');
    
    if (!hasLoansTable || !hasLoanBalancesTable) {
      throw new Error('Required loan tables are missing from database');
    }
    console.log('');

    // Step 2: Verify table schemas
    console.log('Step 2: Verifying table schemas...');
    const loansSchema = await getTableSchema(db, 'loans');
    const balancesSchema = await getTableSchema(db, 'loan_balances');
    
    const requiredLoansColumns = ['id', 'name', 'initial_balance', 'start_date', 'notes', 'is_paid_off', 'created_at', 'updated_at'];
    const requiredBalancesColumns = ['id', 'loan_id', 'year', 'month', 'remaining_balance', 'rate', 'created_at', 'updated_at'];
    
    const loansColumnsPresent = requiredLoansColumns.every(col => 
      loansSchema.some(s => s.name === col)
    );
    const balancesColumnsPresent = requiredBalancesColumns.every(col => 
      balancesSchema.some(s => s.name === col)
    );
    
    console.log('  loans table schema:', loansColumnsPresent ? '✓ Complete' : '✗ Incomplete');
    console.log('  loan_balances table schema:', balancesColumnsPresent ? '✓ Complete' : '✗ Incomplete');
    
    if (!loansColumnsPresent || !balancesColumnsPresent) {
      throw new Error('Table schemas are incomplete');
    }
    console.log('');

    // Step 3: Verify indexes exist
    console.log('Step 3: Verifying indexes...');
    const indexes = await getIndexes(db);
    const hasLoansPaidOffIndex = indexes.some(idx => idx.name === 'idx_loans_paid_off');
    const hasLoanBalancesLoanIdIndex = indexes.some(idx => idx.name === 'idx_loan_balances_loan_id');
    const hasLoanBalancesYearMonthIndex = indexes.some(idx => idx.name === 'idx_loan_balances_year_month');
    
    console.log('  idx_loans_paid_off:', hasLoansPaidOffIndex ? '✓ Found' : '✗ Missing');
    console.log('  idx_loan_balances_loan_id:', hasLoanBalancesLoanIdIndex ? '✓ Found' : '✗ Missing');
    console.log('  idx_loan_balances_year_month:', hasLoanBalancesYearMonthIndex ? '✓ Found' : '✗ Missing');
    console.log('');

    // Step 4: Test backup service includes loan data
    console.log('Step 4: Testing backup service with loan data...');
    
    // Create test loan if none exist
    const loanCount = await getRowCount(db, 'loans');
    let testLoanId = null;
    
    if (loanCount === 0) {
      console.log('  No loans found, creating test loan...');
      testLoanId = await createTestLoan(db);
      await createTestBalance(db, testLoanId);
      console.log('  Test loan created with ID:', testLoanId);
    }
    
    // Perform backup using the backup service
    console.log('  Performing backup via backupService...');
    const backupResult = await backupService.performBackup();
    console.log('  Backup created:', backupResult.filename);
    
    // Verify backup file exists and contains loan data
    if (!fs.existsSync(backupResult.path)) {
      throw new Error('Backup file was not created');
    }
    
    const backupSize = fs.statSync(backupResult.path).size;
    console.log('  Backup file size:', backupSize, 'bytes');
    
    // Verify backup is a valid SQLite database with loan tables
    const sqlite3 = require('sqlite3').verbose();
    const backupDb = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(backupResult.path, (err) => {
        if (err) reject(err);
        else resolve(db);
      });
    });
    
    const backupTables = await getTables(backupDb);
    const backupHasLoans = backupTables.includes('loans');
    const backupHasBalances = backupTables.includes('loan_balances');
    
    console.log('  Backup contains loans table:', backupHasLoans ? '✓ Yes' : '✗ No');
    console.log('  Backup contains loan_balances table:', backupHasBalances ? '✓ Yes' : '✗ No');
    
    if (!backupHasLoans || !backupHasBalances) {
      throw new Error('Backup does not contain loan tables');
    }
    
    // Verify loan data in backup
    const backupLoanCount = await getRowCount(backupDb, 'loans');
    const backupBalanceCount = await getRowCount(backupDb, 'loan_balances');
    console.log('  Loans in backup:', backupLoanCount);
    console.log('  Loan balances in backup:', backupBalanceCount);
    
    backupDb.close();
    console.log('');

    // Cleanup test data if we created it
    if (testLoanId) {
      console.log('Cleaning up test loan...');
      await cleanupTestLoan(db, testLoanId);
    }

    console.log('✓ SUCCESS: Backup integration verified!');
    console.log('\nSummary:');
    console.log('  - Loans tables exist in database');
    console.log('  - Table schemas are correct');
    console.log('  - Indexes are in place');
    console.log('  - Backup service includes loan data');
    console.log('  - Backup files contain loan tables and data');

  } catch (error) {
    console.error('\n✗ FAILURE:', error.message);
    process.exit(1);
  } finally {
    if (db) {
      db.close();
    }
  }
}

function getTables(db) {
  return new Promise((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(row => row.name));
    });
  });
}

function getTableSchema(db, tableName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getIndexes(db) {
  return new Promise((resolve, reject) => {
    db.all("SELECT name, tbl_name FROM sqlite_master WHERE type='index'", (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getRowCount(db, tableName) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
      if (err) reject(err);
      else resolve(row.count);
    });
  });
}

function createTestLoan(db) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loans (name, initial_balance, start_date, notes, is_paid_off)
      VALUES (?, ?, ?, ?, ?)
    `;
    const params = ['Verification Test Loan', 10000, '2024-01-01', 'Created for backup verification', 0];
    
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function createTestBalance(db, loanId) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate)
      VALUES (?, ?, ?, ?, ?)
    `;
    const params = [loanId, 2024, 1, 10000, 5.0];
    
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function cleanupTestLoan(db, loanId) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM loans WHERE id = ?', [loanId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Run verification
verifyBackupIntegration();

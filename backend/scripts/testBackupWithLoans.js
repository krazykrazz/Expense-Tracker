/**
 * Test script to verify backup and restore operations include loan data
 * This script:
 * 1. Creates test loan data
 * 2. Performs a backup
 * 3. Modifies the data
 * 4. Restores from backup
 * 5. Verifies the original data is restored
 */

const fs = require('fs');
const path = require('path');
const { getDatabase, DB_PATH } = require('../database/db');

const TEST_BACKUP_PATH = path.join(__dirname, '../backups/test-backup.db');

async function runTest() {
  console.log('=== Testing Backup and Restore with Loan Data ===\n');

  let db;
  try {
    db = await getDatabase();

    // Step 1: Create test loan data
    console.log('Step 1: Creating test loan data...');
    const loanId = await createTestLoan(db);
    await createTestBalances(db, loanId);
    
    const originalData = await getLoanData(db, loanId);
    console.log('Original loan data created:');
    console.log('  Loan:', originalData.loan);
    console.log('  Balances:', originalData.balances.length, 'entries');
    console.log('');

    // Step 2: Perform backup
    console.log('Step 2: Performing backup...');
    await performBackup();
    console.log('  Backup created at:', TEST_BACKUP_PATH);
    console.log('');

    // Step 3: Modify the data
    console.log('Step 3: Modifying loan data...');
    await modifyLoanData(db, loanId);
    const modifiedData = await getLoanData(db, loanId);
    console.log('  Modified loan name:', modifiedData.loan.name);
    console.log('  Modified balances count:', modifiedData.balances.length);
    console.log('');

    // Step 4: Restore from backup
    console.log('Step 4: Restoring from backup...');
    db.close();
    await restoreFromBackup();
    db = await getDatabase();
    console.log('  Database restored from backup');
    console.log('');

    // Step 5: Verify restored data
    console.log('Step 5: Verifying restored data...');
    const restoredData = await getLoanData(db, loanId);
    
    const loanMatches = restoredData.loan.name === originalData.loan.name &&
                        restoredData.loan.initial_balance === originalData.loan.initial_balance;
    const balancesMatch = restoredData.balances.length === originalData.balances.length;
    
    console.log('  Loan data matches:', loanMatches ? '✓' : '✗');
    console.log('  Balance count matches:', balancesMatch ? '✓' : '✗');
    
    if (loanMatches && balancesMatch) {
      console.log('\n✓ SUCCESS: Backup and restore working correctly with loan data!');
    } else {
      console.log('\n✗ FAILURE: Data mismatch after restore');
      console.log('Original:', originalData);
      console.log('Restored:', restoredData);
    }

    // Cleanup
    console.log('\nCleaning up test data...');
    await cleanupTestData(db, loanId);
    if (fs.existsSync(TEST_BACKUP_PATH)) {
      fs.unlinkSync(TEST_BACKUP_PATH);
    }
    console.log('Test cleanup complete');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    if (db) {
      db.close();
    }
  }
}

function createTestLoan(db) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loans (name, initial_balance, start_date, notes, is_paid_off)
      VALUES (?, ?, ?, ?, ?)
    `;
    const params = ['Test Loan for Backup', 50000, '2024-01-01', 'Test loan for backup verification', 0];
    
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function createTestBalances(db, loanId) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const balances = [
      [loanId, 2024, 1, 50000, 5.5],
      [loanId, 2024, 2, 48500, 5.5],
      [loanId, 2024, 3, 47000, 5.75]
    ];
    
    let completed = 0;
    balances.forEach(params => {
      db.run(sql, params, (err) => {
        if (err) reject(err);
        completed++;
        if (completed === balances.length) resolve();
      });
    });
  });
}

function getLoanData(db, loanId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM loans WHERE id = ?', [loanId], (err, loan) => {
      if (err) {
        reject(err);
        return;
      }
      
      db.all('SELECT * FROM loan_balances WHERE loan_id = ? ORDER BY year, month', [loanId], (err, balances) => {
        if (err) reject(err);
        else resolve({ loan, balances });
      });
    });
  });
}

function modifyLoanData(db, loanId) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE loans SET name = ? WHERE id = ?', ['Modified Loan Name', loanId], (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      db.run('DELETE FROM loan_balances WHERE loan_id = ? AND month = 3', [loanId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

function performBackup() {
  return new Promise((resolve, reject) => {
    try {
      const backupDir = path.dirname(TEST_BACKUP_PATH);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      fs.copyFileSync(DB_PATH, TEST_BACKUP_PATH);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function restoreFromBackup() {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(TEST_BACKUP_PATH)) {
        reject(new Error('Backup file not found'));
        return;
      }
      fs.copyFileSync(TEST_BACKUP_PATH, DB_PATH);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function cleanupTestData(db, loanId) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM loans WHERE id = ?', [loanId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Run the test
runTest();

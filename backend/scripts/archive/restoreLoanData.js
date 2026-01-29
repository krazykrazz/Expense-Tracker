/**
 * Script to restore loan data from backup
 * Run with: node scripts/restoreLoanData.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const BACKUP_PATH = process.env.BACKUP_PATH || '/data/backups/expense-tracker-auto-migration-2025-11-24T14-17-41-362Z.db';
const PROD_PATH = process.env.PROD_PATH || '/data/database/expenses.db';

console.log('Restoring loan data...');
console.log('Backup:', BACKUP_PATH);
console.log('Production:', PROD_PATH);

const backupDb = new sqlite3.Database(BACKUP_PATH, sqlite3.OPEN_READONLY);
const prodDb = new sqlite3.Database(PROD_PATH);

// Get loans from backup
backupDb.all('SELECT * FROM loans', (err, loans) => {
  if (err) {
    console.error('Error reading loans from backup:', err);
    process.exit(1);
  }
  
  console.log(`Found ${loans.length} loans to restore`);
  
  // Get loan_balances from backup
  backupDb.all('SELECT * FROM loan_balances', (err, balances) => {
    if (err) {
      console.error('Error reading loan_balances from backup:', err);
      process.exit(1);
    }
    
    console.log(`Found ${balances.length} loan_balances to restore`);
    
    // Insert loans
    let loansInserted = 0;
    let loansProcessed = 0;
    
    if (loans.length === 0) {
      console.log('No loans to restore');
      backupDb.close();
      prodDb.close();
      return;
    }
    
    loans.forEach(loan => {
      // Insert without estimated_months_left since prod schema might not have it
      prodDb.run(
        `INSERT INTO loans (id, name, initial_balance, start_date, notes, loan_type, is_paid_off, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [loan.id, loan.name, loan.initial_balance, loan.start_date, loan.notes, loan.loan_type, loan.is_paid_off, loan.created_at, loan.updated_at],
        function(err) {
          loansProcessed++;
          if (err) {
            console.error(`Error inserting loan "${loan.name}":`, err.message);
          } else {
            loansInserted++;
            console.log(`Inserted loan: ${loan.name} (ID: ${loan.id})`);
          }
          
          // After all loans are processed, insert balances
          if (loansProcessed === loans.length) {
            console.log(`\nLoans: ${loansInserted}/${loans.length} inserted`);
            
            if (balances.length === 0) {
              console.log('No balances to restore');
              backupDb.close();
              prodDb.close();
              return;
            }
            
            let balancesInserted = 0;
            let balancesProcessed = 0;
            
            balances.forEach(bal => {
              prodDb.run(
                `INSERT INTO loan_balances (id, loan_id, year, month, remaining_balance, rate, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [bal.id, bal.loan_id, bal.year, bal.month, bal.remaining_balance, bal.rate, bal.created_at, bal.updated_at],
                function(err) {
                  balancesProcessed++;
                  if (err) {
                    console.error(`Error inserting balance for loan ${bal.loan_id} (${bal.year}-${bal.month}):`, err.message);
                  } else {
                    balancesInserted++;
                  }
                  
                  // After all balances are processed, close databases
                  if (balancesProcessed === balances.length) {
                    console.log(`Balances: ${balancesInserted}/${balances.length} inserted`);
                    console.log('\n✓ Restore complete!');
                    backupDb.close();
                    prodDb.close();
                  }
                }
              );
            });
          }
        }
      );
    });
  });
});

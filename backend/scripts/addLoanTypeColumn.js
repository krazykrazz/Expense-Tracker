const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../database/expenses.db');
const BACKUP_PATH = path.join(__dirname, '../database/expenses_backup_before_loan_type.db');

console.log('=== Add Loan Type Column Migration ===\n');

// Create backup
console.log('Step 1: Creating backup...');
if (fs.existsSync(DB_PATH)) {
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  console.log(`✓ Backup created at: ${BACKUP_PATH}\n`);
} else {
  console.error('✗ Database file not found!');
  process.exit(1);
}

// Open database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('✗ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✓ Connected to database\n');
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON', (err) => {
  if (err) {
    console.error('✗ Error enabling foreign keys:', err.message);
    process.exit(1);
  }
});

// Check if column already exists
db.get("PRAGMA table_info(loans)", (err, row) => {
  if (err) {
    console.error('✗ Error checking table structure:', err.message);
    db.close();
    process.exit(1);
  }
});

db.all("PRAGMA table_info(loans)", (err, rows) => {
  if (err) {
    console.error('✗ Error checking table structure:', err.message);
    db.close();
    process.exit(1);
  }

  const hasLoanType = rows.some(row => row.name === 'loan_type');

  if (hasLoanType) {
    console.log('✓ loan_type column already exists. No migration needed.\n');
    db.close();
    process.exit(0);
  }

  console.log('Step 2: Adding loan_type column...');

  // Add the loan_type column with default value 'loan'
  db.run(`
    ALTER TABLE loans 
    ADD COLUMN loan_type TEXT NOT NULL DEFAULT 'loan' 
    CHECK(loan_type IN ('loan', 'line_of_credit'))
  `, (err) => {
    if (err) {
      console.error('✗ Error adding loan_type column:', err.message);
      console.log('\nRestoring from backup...');
      db.close(() => {
        fs.copyFileSync(BACKUP_PATH, DB_PATH);
        console.log('✓ Database restored from backup');
        process.exit(1);
      });
      return;
    }

    console.log('✓ loan_type column added successfully\n');

    // Verify the change
    console.log('Step 3: Verifying migration...');
    db.all("PRAGMA table_info(loans)", (err, rows) => {
      if (err) {
        console.error('✗ Error verifying migration:', err.message);
        db.close();
        process.exit(1);
      }

      console.log('\nCurrent loans table structure:');
      rows.forEach(row => {
        console.log(`  - ${row.name} (${row.type})${row.notnull ? ' NOT NULL' : ''}${row.dflt_value ? ` DEFAULT ${row.dflt_value}` : ''}`);
      });

      // Check existing loans
      db.get("SELECT COUNT(*) as count FROM loans", (err, result) => {
        if (err) {
          console.error('✗ Error counting loans:', err.message);
          db.close();
          process.exit(1);
        }

        console.log(`\n✓ Migration completed successfully!`);
        console.log(`  - ${result.count} existing loan(s) defaulted to type 'loan'`);
        console.log(`  - Backup saved at: ${BACKUP_PATH}`);
        console.log('\nYou can now use loan types: "loan" or "line_of_credit"\n');

        db.close();
        process.exit(0);
      });
    });
  });
});

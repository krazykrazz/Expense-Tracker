const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/expenses.db');

console.log('\n=== Checking Loan Types in Database ===\n');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Check table structure
db.all("PRAGMA table_info(loans)", (err, columns) => {
  if (err) {
    console.error('Error getting table info:', err);
    db.close();
    process.exit(1);
  }

  console.log('Loans table columns:');
  columns.forEach(col => {
    console.log(`  - ${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
  });

  const hasLoanType = columns.some(col => col.name === 'loan_type');
  
  if (!hasLoanType) {
    console.log('\n⚠️  WARNING: loan_type column does not exist!');
    console.log('   Run: node backend/scripts/addLoanTypeColumn.js\n');
    db.close();
    process.exit(0);
  }

  console.log('\n✓ loan_type column exists\n');

  // Get all loans
  db.all("SELECT id, name, initial_balance, loan_type, is_paid_off FROM loans", (err, loans) => {
    if (err) {
      console.error('Error getting loans:', err);
      db.close();
      process.exit(1);
    }

    if (loans.length === 0) {
      console.log('No loans found in database.\n');
      db.close();
      process.exit(0);
    }

    console.log(`Found ${loans.length} loan(s):\n`);
    loans.forEach(loan => {
      console.log(`ID: ${loan.id}`);
      console.log(`  Name: ${loan.name}`);
      console.log(`  Initial Balance: $${loan.initial_balance}`);
      console.log(`  Type: ${loan.loan_type || '(null)'}`);
      console.log(`  Paid Off: ${loan.is_paid_off ? 'Yes' : 'No'}`);
      console.log('');
    });

    // Check for any loans without loan_type
    const loansWithoutType = loans.filter(l => !l.loan_type);
    if (loansWithoutType.length > 0) {
      console.log(`⚠️  WARNING: ${loansWithoutType.length} loan(s) have NULL loan_type!`);
      console.log('   These should have been set to "loan" by the migration.\n');
    }

    db.close();
    process.exit(0);
  });
});

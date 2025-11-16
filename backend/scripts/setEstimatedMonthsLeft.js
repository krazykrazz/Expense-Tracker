const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/expenses.db');

// ============================================
// EDIT THESE VALUES FOR YOUR LOANS
// ============================================
const loanUpdates = {
  'Green Homes': 120,  // Set to desired months, or null to skip
  'Soers': 24          // Set to desired months, or null to skip
};
// ============================================

async function setEstimatedMonthsLeft() {
  console.log('Setting estimated_months_left for existing loans...\n');

  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      process.exit(1);
    }
  });

  // Get all active loans of type 'loan'
  db.all(
    `SELECT id, name, loan_type, initial_balance, start_date, estimated_months_left 
     FROM loans 
     WHERE is_paid_off = 0 AND loan_type = 'loan'
     ORDER BY id`,
    [],
    async (err, loans) => {
      if (err) {
        console.error('Error fetching loans:', err.message);
        db.close();
        process.exit(1);
      }

      if (loans.length === 0) {
        console.log('No active traditional loans found.');
        db.close();
        return;
      }

      console.log('Current loans:\n');
      loans.forEach(loan => {
        console.log(`  - ${loan.name} (ID: ${loan.id})`);
        console.log(`    Initial Balance: $${loan.initial_balance.toFixed(2)}`);
        console.log(`    Start Date: ${loan.start_date}`);
        console.log(`    Current Estimated Months: ${loan.estimated_months_left || 'Not set'}`);
        console.log('');
      });

      console.log('Applying updates...\n');

      let updateCount = 0;
      for (const loan of loans) {
        const newValue = loanUpdates[loan.name];
        
        if (newValue === undefined) {
          console.log(`  ${loan.name}: No update specified (skipped)`);
          continue;
        }

        if (newValue === null) {
          console.log(`  ${loan.name}: Set to skip (null)`);
          continue;
        }

        // Update the loan
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE loans SET estimated_months_left = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newValue, loan.id],
            (err) => {
              if (err) {
                console.log(`  ${loan.name}: ❌ Error - ${err.message}`);
                reject(err);
              } else {
                console.log(`  ${loan.name}: ✓ Updated to ${newValue} months`);
                updateCount++;
                resolve();
              }
            }
          );
        });
      }

      console.log(`\n✅ Updated ${updateCount} loan(s)`);
      
      // Show final results
      db.all(
        `SELECT id, name, estimated_months_left 
         FROM loans 
         WHERE is_paid_off = 0 AND loan_type = 'loan'
         ORDER BY id`,
        [],
        (err, updatedLoans) => {
          if (!err) {
            console.log('\nFinal values:');
            updatedLoans.forEach(loan => {
              console.log(`  - ${loan.name}: ${loan.estimated_months_left !== null ? loan.estimated_months_left + ' months' : 'Not set'}`);
            });
          }
          
          db.close();
        }
      );
    }
  );
}

setEstimatedMonthsLeft().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

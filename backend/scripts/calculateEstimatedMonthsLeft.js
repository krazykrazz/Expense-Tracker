const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/expenses.db');

/**
 * Calculate estimated months left based on balance history
 * Uses linear regression on the most recent balance entries to estimate paydown rate
 */
function calculateEstimatedMonths(balanceHistory, currentBalance) {
  if (balanceHistory.length < 2) {
    return null; // Need at least 2 data points
  }

  if (currentBalance <= 0) {
    return 0; // Already paid off
  }

  // Sort by date (year, month)
  const sorted = balanceHistory.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  // Use the most recent entries (up to 12 months for better accuracy)
  const recentEntries = sorted.slice(-12);

  if (recentEntries.length < 2) {
    return null;
  }

  // Calculate average monthly paydown
  let totalPaydown = 0;
  let monthCount = 0;

  for (let i = 1; i < recentEntries.length; i++) {
    const prev = recentEntries[i - 1];
    const curr = recentEntries[i];
    
    // Calculate months between entries
    const monthsDiff = (curr.year - prev.year) * 12 + (curr.month - prev.month);
    
    if (monthsDiff > 0) {
      const balanceChange = prev.remaining_balance - curr.remaining_balance;
      const monthlyPaydown = balanceChange / monthsDiff;
      
      // Only count if balance is decreasing (positive paydown)
      if (monthlyPaydown > 0) {
        totalPaydown += monthlyPaydown;
        monthCount++;
      }
    }
  }

  if (monthCount === 0 || totalPaydown <= 0) {
    return null; // No positive paydown trend
  }

  const avgMonthlyPaydown = totalPaydown / monthCount;
  const estimatedMonths = Math.ceil(currentBalance / avgMonthlyPaydown);

  return estimatedMonths;
}

async function calculateAndUpdateEstimatedMonths() {
  console.log('Calculating estimated_months_left based on balance history...\n');

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

      console.log('Analyzing loans...\n');

      let updateCount = 0;

      for (const loan of loans) {
        console.log(`${loan.name} (ID: ${loan.id})`);
        console.log(`  Initial Balance: $${loan.initial_balance.toFixed(2)}`);
        console.log(`  Start Date: ${loan.start_date}`);

        // Get balance history for this loan
        const balanceHistory = await new Promise((resolve, reject) => {
          db.all(
            `SELECT year, month, remaining_balance, rate
             FROM loan_balances
             WHERE loan_id = ?
             ORDER BY year, month`,
            [loan.id],
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            }
          );
        });

        console.log(`  Balance History Entries: ${balanceHistory.length}`);

        if (balanceHistory.length === 0) {
          console.log(`  ⚠️  No balance history - cannot calculate`);
          console.log(`  Current Estimated Months: ${loan.estimated_months_left || 'Not set'}`);
          console.log('');
          continue;
        }

        // Get current balance (most recent entry)
        const currentBalance = balanceHistory[balanceHistory.length - 1].remaining_balance;
        console.log(`  Current Balance: $${currentBalance.toFixed(2)}`);

        // Calculate estimated months
        const estimatedMonths = calculateEstimatedMonths(balanceHistory, currentBalance);

        if (estimatedMonths === null) {
          console.log(`  ⚠️  Cannot calculate - need at least 2 entries with positive paydown`);
          console.log(`  Current Estimated Months: ${loan.estimated_months_left || 'Not set'}`);
          console.log('');
          continue;
        }

        if (estimatedMonths === 0) {
          console.log(`  ✓ Loan is paid off!`);
          console.log('');
          continue;
        }

        console.log(`  📊 Calculated Estimated Months: ${estimatedMonths}`);
        console.log(`  Previous Value: ${loan.estimated_months_left || 'Not set'}`);

        // Update the loan
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE loans SET estimated_months_left = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [estimatedMonths, loan.id],
            (err) => {
              if (err) {
                console.log(`  ❌ Error updating: ${err.message}`);
                reject(err);
              } else {
                console.log(`  ✅ Updated to ${estimatedMonths} months`);
                updateCount++;
                resolve();
              }
            }
          );
        });

        console.log('');
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

calculateAndUpdateEstimatedMonths().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

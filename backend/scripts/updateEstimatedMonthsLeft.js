const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const readline = require('readline');

const DB_PATH = path.join(__dirname, '../database/expenses.db');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function updateEstimatedMonthsLeft() {
  console.log('Updating estimated_months_left for existing loans...\n');

  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      process.exit(1);
    }
  });

  // Get all active loans of type 'loan' (not line_of_credit)
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
        rl.close();
        return;
      }

      console.log('Found the following active traditional loans:\n');
      loans.forEach((loan, index) => {
        console.log(`${index + 1}. ${loan.name}`);
        console.log(`   ID: ${loan.id}`);
        console.log(`   Initial Balance: $${loan.initial_balance.toFixed(2)}`);
        console.log(`   Start Date: ${loan.start_date}`);
        console.log(`   Current Estimated Months: ${loan.estimated_months_left || 'Not set'}`);
        console.log('');
      });

      console.log('Enter estimated months left for each loan (or press Enter to skip):\n');

      for (const loan of loans) {
        const answer = await question(`${loan.name} - Estimated months left: `);
        
        if (answer.trim() === '') {
          console.log('  Skipped\n');
          continue;
        }

        const months = parseInt(answer);
        if (isNaN(months) || months < 0) {
          console.log('  Invalid input, skipped\n');
          continue;
        }

        // Update the loan
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE loans SET estimated_months_left = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [months, loan.id],
            (err) => {
              if (err) {
                console.log(`  Error updating: ${err.message}\n`);
                reject(err);
              } else {
                console.log(`  ✓ Updated to ${months} months\n`);
                resolve();
              }
            }
          );
        });
      }

      console.log('\n✅ Update complete!');
      
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
              console.log(`  - ${loan.name}: ${loan.estimated_months_left || 'Not set'} months`);
            });
          }
          
          db.close();
          rl.close();
        }
      );
    }
  );
}

updateEstimatedMonthsLeft().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

const { getDatabase } = require('../database/db');
const { calculateWeek } = require('../utils/dateUtils');

async function fixWeeks() {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    // Get all expenses
    db.all('SELECT id, date FROM expenses', [], (err, expenses) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log(`Found ${expenses.length} expenses to update`);
      
      let updated = 0;
      let errors = 0;
      
      // Update each expense with correct week
      expenses.forEach((expense, index) => {
        const correctWeek = calculateWeek(expense.date);
        
        db.run(
          'UPDATE expenses SET week = ? WHERE id = ?',
          [correctWeek, expense.id],
          (err) => {
            if (err) {
              console.error(`Error updating expense ${expense.id}:`, err);
              errors++;
            } else {
              updated++;
            }
            
            // Check if this is the last one
            if (index === expenses.length - 1) {
              console.log(`\nUpdate complete!`);
              console.log(`Successfully updated: ${updated}`);
              console.log(`Errors: ${errors}`);
              resolve({ updated, errors });
            }
          }
        );
      });
      
      if (expenses.length === 0) {
        console.log('No expenses to update');
        resolve({ updated: 0, errors: 0 });
      }
    });
  });
}

// Run the fix
fixWeeks()
  .then(() => {
    console.log('\nWeek fix completed successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error fixing weeks:', err);
    process.exit(1);
  });

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getDatabasePath } = require('../config/paths');

// Database path - use the same path as the main application
const dbPath = getDatabasePath();

// Sample data arrays
const places = [
  'Walmart', 'Target', 'Costco', 'Amazon', 'Starbucks', 'McDonald\'s', 'Subway', 'Pizza Hut',
  'Home Depot', 'Lowe\'s', 'Best Buy', 'GameStop', 'Barnes & Noble', 'CVS Pharmacy', 'Walgreens',
  'Shell Gas Station', 'Chevron', 'Exxon', 'BP Gas', 'Safeway', 'Kroger', 'Whole Foods',
  'Trader Joe\'s', 'Chipotle', 'Panera Bread', 'Olive Garden', 'Red Lobster', 'Applebee\'s',
  'TGI Friday\'s', 'Chili\'s', 'Denny\'s', 'IHOP', 'Buffalo Wild Wings', 'KFC', 'Taco Bell',
  'Burger King', 'Wendy\'s', 'In-N-Out', 'Five Guys', 'Shake Shack', 'Dairy Queen'
];

const categories = [
  'Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing', 'Housing', 'Utilities',
  'Insurance', 'Personal Care', 'Pet Care', 'Recreation Activities', 'Subscriptions',
  'Vehicle Maintenance', 'Gifts', 'Other', 'Tax - Medical', 'Tax - Donation'
];

const paymentMethods = [
  'Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'
];

const notes = [
  'Weekly grocery shopping', 'Monthly subscription', 'Birthday gift', 'Car maintenance',
  'Doctor visit', 'Prescription medication', 'Charity donation', 'Family dinner',
  'Work lunch', 'Gas for road trip', 'New winter clothes', 'Home improvement',
  'Pet food and supplies', 'Movie night', 'Coffee with friends', 'Gym membership',
  'Phone bill', 'Internet service', 'Electricity bill', 'Water bill', 'Insurance premium',
  'Oil change', 'Tire replacement', 'Emergency repair', 'Holiday shopping',
  'School supplies', 'Office supplies', 'Cleaning supplies', 'Garden supplies',
  'Sports equipment', 'Books and magazines', 'Streaming service', 'Music subscription'
];

// Helper function to get random item from array
function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Helper function to get random amount based on category
function getRandomAmount(category) {
  const ranges = {
    'Groceries': [25, 150],
    'Dining Out': [15, 80],
    'Gas': [30, 90],
    'Entertainment': [10, 60],
    'Clothing': [20, 200],
    'Housing': [800, 2500],
    'Utilities': [50, 300],
    'Insurance': [100, 500],
    'Personal Care': [10, 100],
    'Pet Care': [20, 150],
    'Recreation Activities': [25, 200],
    'Subscriptions': [5, 50],
    'Vehicle Maintenance': [50, 800],
    'Gifts': [15, 300],
    'Other': [10, 100],
    'Tax - Medical': [25, 500],
    'Tax - Donation': [20, 1000]
  };
  
  const range = ranges[category] || [10, 100];
  return (Math.random() * (range[1] - range[0]) + range[0]).toFixed(2);
}

// Helper function to get random date in the last 6 months
function getRandomDate() {
  const now = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(now.getMonth() - 6);
  
  const randomTime = sixMonthsAgo.getTime() + Math.random() * (now.getTime() - sixMonthsAgo.getTime());
  const randomDate = new Date(randomTime);
  
  return randomDate.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Helper function to calculate week number
function getWeekNumber(dateString) {
  const date = new Date(dateString);
  const dayOfMonth = date.getDate();
  return Math.ceil(dayOfMonth / 7);
}

// Main seeding function
async function seedTestData() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
    });

    // Generate 50 random expenses
    const expenses = [];
    for (let i = 0; i < 50; i++) {
      const category = getRandomItem(categories);
      const date = getRandomDate();
      
      expenses.push({
        date: date,
        place: getRandomItem(places),
        notes: getRandomItem(notes),
        amount: parseFloat(getRandomAmount(category)),
        type: category,
        week: getWeekNumber(date),
        method: getRandomItem(paymentMethods)
      });
    }

    // Sort expenses by date
    expenses.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Insert expenses
    const insertExpense = db.prepare(`
      INSERT INTO expenses (date, place, notes, amount, type, week, method) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let insertedCount = 0;
    expenses.forEach(expense => {
      insertExpense.run(
        expense.date,
        expense.place,
        expense.notes,
        expense.amount,
        expense.type,
        expense.week,
        expense.method,
        function(err) {
          if (err) {
            console.error('Error inserting expense:', err);
          } else {
            insertedCount++;
          }
        }
      );
    });

    insertExpense.finalize((err) => {
      if (err) {
        console.error('Error finalizing expense insertion:', err);
        reject(err);
        return;
      }

      // Add some monthly income data
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;

      // Check if income_sources table exists, if not skip
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='income_sources'", (err, row) => {
        if (err) {
          console.error('Error checking for income_sources table:', err);
          reject(err);
          return;
        }

        if (row) {
          const insertIncome = db.prepare(`
            INSERT OR REPLACE INTO income_sources (year, month, name, amount, category) 
            VALUES (?, ?, ?, ?, ?)
          `);

          // Add income for current month and previous months
          for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
            const targetDate = new Date(currentYear, currentMonth - 1 - monthOffset, 1);
            const year = targetDate.getFullYear();
            const month = targetDate.getMonth() + 1;

            insertIncome.run(year, month, 'Primary Job', 4500.00, 'Salary');
            insertIncome.run(year, month, 'Side Business', 800.00, 'Other');
          }

          insertIncome.finalize();
        }

        // Check if fixed_expenses table exists, if not skip
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='fixed_expenses'", (err, row) => {
          if (err) {
            console.error('Error checking for fixed_expenses table:', err);
            reject(err);
            return;
          }

          if (row) {
            const insertFixedExpense = db.prepare(`
              INSERT OR REPLACE INTO fixed_expenses (year, month, name, amount, category, payment_type) 
              VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
              const targetDate = new Date(currentYear, currentMonth - 1 - monthOffset, 1);
              const year = targetDate.getFullYear();
              const month = targetDate.getMonth() + 1;

              insertFixedExpense.run(year, month, 'Rent', 1200.00, 'Housing', 'Auto-Pay');
              insertFixedExpense.run(year, month, 'Internet', 75.00, 'Utilities', 'Credit Card');
              insertFixedExpense.run(year, month, 'Phone', 85.00, 'Utilities', 'Credit Card');
              insertFixedExpense.run(year, month, 'Netflix', 15.99, 'Subscriptions', 'Credit Card');
              insertFixedExpense.run(year, month, 'Spotify', 9.99, 'Subscriptions', 'Credit Card');
            }

            insertFixedExpense.finalize();
          }

          console.log(`✅ Successfully seeded test data:`);
          console.log(`   - ${insertedCount} expenses`);
          console.log(`   - Income data (if table exists)`);
          console.log(`   - Fixed expenses (if table exists)`);
          console.log(`\n🎯 Ready to test sticky summary scrolling!`);
          console.log(`   - Floating button should appear (>10 expenses)`);
          console.log(`   - Summary panel should scroll independently`);
          console.log(`   - Try different screen sizes for responsive behavior`);

          db.close((err) => {
            if (err) {
              console.error('Error closing database:', err);
              reject(err);
            } else {
              console.log('\n📊 Database connection closed');
              resolve();
            }
          });
        });
      });
    });
  });
}

// Run the seeding
if (require.main === module) {
  seedTestData()
    .then(() => {
      console.log('\n🚀 Test data seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error seeding test data:', error);
      process.exit(1);
    });
}

module.exports = { seedTestData };
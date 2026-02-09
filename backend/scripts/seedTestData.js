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

/**
 * Payment methods configuration for seeding
 * These match the migration mapping in migrations.js
 * @see backend/database/migrations.js - migratePaymentMethods()
 */
const paymentMethodsConfig = [
  { id: 1, type: 'cash', display_name: 'Cash', full_name: 'Cash' },
  { id: 2, type: 'debit', display_name: 'Debit', full_name: 'Debit' },
  { id: 3, type: 'cheque', display_name: 'Cheque', full_name: 'Cheque' },
  { id: 4, type: 'credit_card', display_name: 'Credit Card 1', full_name: 'Credit Card 1' },
  { id: 5, type: 'credit_card', display_name: 'Credit Card 2', full_name: 'Credit Card 2' },
  { id: 6, type: 'credit_card', display_name: 'Credit Card 3', full_name: 'Credit Card 3' },
  { id: 7, type: 'credit_card', display_name: 'Credit Card 4', full_name: 'Credit Card 4' }
];

// Legacy payment method names for backward compatibility
const paymentMethodNames = paymentMethodsConfig.map(pm => pm.display_name);

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

// Helper function to get random payment method with both name and ID
function getRandomPaymentMethod() {
  const pm = getRandomItem(paymentMethodsConfig);
  return { id: pm.id, name: pm.display_name };
}

// Helper function to get payment method ID by display name
function getPaymentMethodId(displayName) {
  const pm = paymentMethodsConfig.find(p => p.display_name === displayName);
  return pm ? pm.id : null;
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

/**
 * Seed payment methods into the database
 * Creates the default payment methods if they don't exist
 * @param {sqlite3.Database} db - Database connection
 * @returns {Promise<void>}
 */
function seedPaymentMethods(db) {
  return new Promise((resolve, reject) => {
    // Check if payment_methods table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_methods'", (err, row) => {
      if (err) {
        console.error('Error checking for payment_methods table:', err);
        reject(err);
        return;
      }

      if (!row) {
        console.log('   - payment_methods table does not exist, skipping payment method seeding');
        resolve();
        return;
      }

      // Check if payment methods already exist
      db.get('SELECT COUNT(*) as count FROM payment_methods', (err, result) => {
        if (err) {
          console.error('Error checking payment_methods count:', err);
          reject(err);
          return;
        }

        if (result.count > 0) {
          console.log(`   - payment_methods already has ${result.count} records, skipping seeding`);
          resolve();
          return;
        }

        // Insert payment methods
        const insertPaymentMethod = db.prepare(`
          INSERT INTO payment_methods (id, type, display_name, full_name, is_active)
          VALUES (?, ?, ?, ?, 1)
        `);

        let insertedCount = 0;
        paymentMethodsConfig.forEach(pm => {
          insertPaymentMethod.run(pm.id, pm.type, pm.display_name, pm.full_name, function(err) {
            if (err) {
              console.error('Error inserting payment method:', err);
            } else {
              insertedCount++;
            }
          });
        });

        insertPaymentMethod.finalize((err) => {
          if (err) {
            console.error('Error finalizing payment method insertion:', err);
            reject(err);
            return;
          }
          console.log(`   - ${insertedCount} payment methods seeded`);
          resolve();
        });
      });
    });
  });
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

    // First, seed payment methods
    seedPaymentMethods(db)
      .then(() => {
        // Generate 50 random expenses
        const expenses = [];
        for (let i = 0; i < 50; i++) {
          const category = getRandomItem(categories);
          const date = getRandomDate();
          const paymentMethod = getRandomPaymentMethod();
          
          expenses.push({
            date: date,
            place: getRandomItem(places),
            notes: getRandomItem(notes),
            amount: parseFloat(getRandomAmount(category)),
            type: category,
            week: getWeekNumber(date),
            method: paymentMethod.name,
            payment_method_id: paymentMethod.id
          });
        }

        // Sort expenses by date
        expenses.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Check if expenses table has payment_method_id column
        db.all("PRAGMA table_info(expenses)", (err, columns) => {
          if (err) {
            console.error('Error checking expenses table schema:', err);
            reject(err);
            return;
          }

          const hasPaymentMethodId = columns.some(col => col.name === 'payment_method_id');
          
          // Insert expenses with or without payment_method_id based on schema
          const insertSQL = hasPaymentMethodId
            ? `INSERT INTO expenses (date, place, notes, amount, type, week, method, payment_method_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            : `INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`;
          
          const insertExpense = db.prepare(insertSQL);

          let insertedCount = 0;
          expenses.forEach(expense => {
            const params = hasPaymentMethodId
              ? [expense.date, expense.place, expense.notes, expense.amount, expense.type, expense.week, expense.method, expense.payment_method_id]
              : [expense.date, expense.place, expense.notes, expense.amount, expense.type, expense.week, expense.method];
            
            insertExpense.run(...params, function(err) {
              if (err) {
                console.error('Error inserting expense:', err);
              } else {
                insertedCount++;
              }
            });
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
                  // Check if fixed_expenses table has payment_method_id column
                  db.all("PRAGMA table_info(fixed_expenses)", (err, columns) => {
                    if (err) {
                      console.error('Error checking fixed_expenses table schema:', err);
                      reject(err);
                      return;
                    }

                    const hasPaymentMethodId = columns.some(col => col.name === 'payment_method_id');
                    
                    const insertFixedSQL = hasPaymentMethodId
                      ? `INSERT OR REPLACE INTO fixed_expenses (year, month, name, amount, category, payment_type, payment_method_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
                      : `INSERT OR REPLACE INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (?, ?, ?, ?, ?, ?)`;
                    
                    const insertFixedExpense = db.prepare(insertFixedSQL);

                    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
                      const targetDate = new Date(currentYear, currentMonth - 1 - monthOffset, 1);
                      const year = targetDate.getFullYear();
                      const month = targetDate.getMonth() + 1;

                      // Fixed expenses with payment method IDs
                      const fixedExpenses = [
                        { name: 'Rent', amount: 1200.00, category: 'Housing', payment_type: 'Debit', payment_method_id: 2 },
                        { name: 'Internet', amount: 75.00, category: 'Utilities', payment_type: 'Credit Card 1', payment_method_id: 4 },
                        { name: 'Phone', amount: 85.00, category: 'Utilities', payment_type: 'Credit Card 1', payment_method_id: 4 },
                        { name: 'Netflix', amount: 15.99, category: 'Subscriptions', payment_type: 'Credit Card 1', payment_method_id: 4 },
                        { name: 'Spotify', amount: 9.99, category: 'Subscriptions', payment_type: 'Credit Card 1', payment_method_id: 4 }
                      ];

                      fixedExpenses.forEach(fe => {
                        const params = hasPaymentMethodId
                          ? [year, month, fe.name, fe.amount, fe.category, fe.payment_type, fe.payment_method_id]
                          : [year, month, fe.name, fe.amount, fe.category, fe.payment_type];
                        insertFixedExpense.run(...params);
                      });
                    }

                    insertFixedExpense.finalize();
                    finishSeeding();
                  });
                } else {
                  finishSeeding();
                }

                function finishSeeding() {
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
                }
              });
            });
          });
        });
      })
      .catch(reject);
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

module.exports = { seedTestData, paymentMethodsConfig };

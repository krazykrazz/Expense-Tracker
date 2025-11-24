/**
 * Test script to verify Personal Care category migration
 * This script tests that the migration runs successfully and Personal Care category works
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { runMigrations } = require('../database/migrations');

async function testMigration() {
  console.log('Testing Personal Care category migration...\n');
  
  // Create a temporary test database
  const testDbPath = path.join(__dirname, 'test-personal-care.db');
  
  // Remove test database if it exists
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  
  const db = new sqlite3.Database(testDbPath);
  
  try {
    // Initialize database with basic structure (simulating state after all previous migrations)
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        // Create schema_migrations table and mark previous migrations as applied
        db.run(`
          CREATE TABLE schema_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            migration_name TEXT NOT NULL UNIQUE,
            applied_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) return reject(err);
          
          // Mark previous migrations as applied
          db.run(`INSERT INTO schema_migrations (migration_name) VALUES ('expand_expense_categories_v1')`, (err) => {
            if (err) return reject(err);
            db.run(`INSERT INTO schema_migrations (migration_name) VALUES ('add_clothing_category_v1')`, (err) => {
              if (err) return reject(err);
              db.run(`INSERT INTO schema_migrations (migration_name) VALUES ('remove_recurring_expenses_v1')`, (err) => {
                if (err) return reject(err);
                db.run(`INSERT INTO schema_migrations (migration_name) VALUES ('fix_category_constraints_v1')`, (err) => {
                  if (err) return reject(err);
                  
                  // Create expenses table without Personal Care (current state before our migration)
                  db.run(`
                    CREATE TABLE expenses (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      date TEXT NOT NULL,
                      place TEXT,
                      notes TEXT,
                      amount REAL NOT NULL,
                      type TEXT NOT NULL CHECK(type IN ('Clothing', 'Dining Out', 'Entertainment', 'Gas', 'Gifts', 'Groceries', 'Housing', 'Insurance', 'Pet Care', 'Recreation Activities', 'Subscriptions', 'Utilities', 'Vehicle Maintenance', 'Other', 'Tax - Donation', 'Tax - Medical')),
                      week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
                      method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
                      created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                  `, (err) => {
                    if (err) return reject(err);
                    
                    // Create budgets table without Personal Care
                    db.run(`
                      CREATE TABLE budgets (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        year INTEGER NOT NULL,
                        month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
                        category TEXT NOT NULL CHECK(category IN ('Clothing', 'Dining Out', 'Entertainment', 'Gas', 'Gifts', 'Groceries', 'Housing', 'Insurance', 'Pet Care', 'Recreation Activities', 'Subscriptions', 'Utilities', 'Vehicle Maintenance', 'Other')),
                        "limit" REAL NOT NULL CHECK("limit" > 0),
                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(year, month, category)
                      )
                    `, (err) => {
                      if (err) return reject(err);
                      
                      // Insert some test data
                      db.run(`
                        INSERT INTO expenses (date, place, notes, amount, type, week, method)
                        VALUES ('2025-01-15', 'Test Store', 'Test expense', 50.00, 'Groceries', 3, 'Debit')
                      `, (err) => {
                        if (err) return reject(err);
                        
                        db.run(`
                          INSERT INTO budgets (year, month, category, "limit")
                          VALUES (2025, 1, 'Groceries', 500.00)
                        `, (err) => {
                          if (err) return reject(err);
                          resolve();
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
    
    console.log('✓ Created test database with old schema');
    
    // Run migrations
    await runMigrations(db);
    
    console.log('\n✓ Migrations completed');
    
    // Test 1: Insert expense with Personal Care category
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO expenses (date, place, notes, amount, type, week, method)
        VALUES ('2025-01-20', 'Salon', 'Haircut', 45.00, 'Personal Care', 3, 'Debit')
      `, function(err) {
        if (err) {
          console.error('✗ Failed to insert Personal Care expense:', err.message);
          reject(err);
        } else {
          console.log('✓ Successfully inserted expense with Personal Care category (ID:', this.lastID + ')');
          resolve();
        }
      });
    });
    
    // Test 2: Insert budget with Personal Care category
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO budgets (year, month, category, "limit")
        VALUES (2025, 1, 'Personal Care', 100.00)
      `, function(err) {
        if (err) {
          console.error('✗ Failed to insert Personal Care budget:', err.message);
          reject(err);
        } else {
          console.log('✓ Successfully inserted budget with Personal Care category (ID:', this.lastID + ')');
          resolve();
        }
      });
    });
    
    // Test 3: Verify existing data is preserved
    await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
        if (err) {
          reject(err);
        } else {
          console.log('✓ Expenses table has', row.count, 'records (should be 2)');
          if (row.count !== 2) {
            console.error('✗ Expected 2 expenses, got', row.count);
          }
          resolve();
        }
      });
    });
    
    await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM budgets', (err, row) => {
        if (err) {
          reject(err);
        } else {
          console.log('✓ Budgets table has', row.count, 'records (should be 2)');
          if (row.count !== 2) {
            console.error('✗ Expected 2 budgets, got', row.count);
          }
          resolve();
        }
      });
    });
    
    // Test 4: Verify Personal Care data can be queried
    await new Promise((resolve, reject) => {
      db.get('SELECT * FROM expenses WHERE type = ?', ['Personal Care'], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          console.error('✗ Could not find Personal Care expense');
          reject(new Error('Personal Care expense not found'));
        } else {
          console.log('✓ Successfully queried Personal Care expense:', row.place, '-', row.amount);
          resolve();
        }
      });
    });
    
    await new Promise((resolve, reject) => {
      db.get('SELECT * FROM budgets WHERE category = ?', ['Personal Care'], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          console.error('✗ Could not find Personal Care budget');
          reject(new Error('Personal Care budget not found'));
        } else {
          console.log('✓ Successfully queried Personal Care budget: limit =', row.limit);
          resolve();
        }
      });
    });
    
    console.log('\n✅ All tests passed! Personal Care category migration is working correctly.\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    // Close database
    await new Promise((resolve) => {
      db.close(() => {
        // Clean up test database
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
          console.log('✓ Cleaned up test database');
        }
        resolve();
      });
    });
  }
}

// Run the test
testMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Script to test full database initialization including all migrations
 */

const { initializeDatabase } = require('../database/db');

async function testDatabaseInit() {
  console.log('Testing full database initialization...');
  
  try {
    const db = await initializeDatabase();
    
    console.log('✓ Database initialized successfully');
    
    // Check if our new tables exist
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='people'", (err, row) => {
      if (err) {
        console.error('✗ Error checking people table:', err.message);
        return;
      }
      
      if (row) {
        console.log('✓ People table exists after initialization');
      } else {
        console.log('✗ People table missing after initialization');
      }
      
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='expense_people'", (err, row) => {
        if (err) {
          console.error('✗ Error checking expense_people table:', err.message);
          return;
        }
        
        if (row) {
          console.log('✓ Expense_people table exists after initialization');
        } else {
          console.log('✗ Expense_people table missing after initialization');
        }
        
        // Check migration record
        db.get("SELECT * FROM schema_migrations WHERE migration_name = 'add_people_tables_v1'", (err, row) => {
          if (err) {
            console.error('✗ Error checking migration record:', err.message);
            return;
          }
          
          if (row) {
            console.log('✓ People migration record exists');
          } else {
            console.log('✗ People migration record missing');
          }
          
          console.log('\n✓ Database initialization test completed successfully');
          
          // Close database connection
          db.close((err) => {
            if (err) {
              console.error('Error closing database:', err.message);
              process.exit(1);
            }
            console.log('Database connection closed');
            process.exit(0);
          });
        });
      });
    });
    
  } catch (error) {
    console.error('✗ Database initialization failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  testDatabaseInit();
}

module.exports = { testDatabaseInit };
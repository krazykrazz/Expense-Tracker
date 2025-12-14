#!/usr/bin/env node

/**
 * Script to verify the people tables schema
 */

const { getDatabase } = require('../database/db');

async function checkPeopleSchema() {
  console.log('Checking people tables schema...');
  
  try {
    const db = await getDatabase();
    
    // Check if people table exists and get its schema
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='people'", (err, row) => {
      if (err) {
        console.error('Error checking people table:', err.message);
        return;
      }
      
      if (row) {
        console.log('\n✓ People table exists:');
        console.log(row.sql);
      } else {
        console.log('✗ People table not found');
      }
      
      // Check if expense_people table exists and get its schema
      db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='expense_people'", (err, row) => {
        if (err) {
          console.error('Error checking expense_people table:', err.message);
          return;
        }
        
        if (row) {
          console.log('\n✓ Expense_people table exists:');
          console.log(row.sql);
        } else {
          console.log('✗ Expense_people table not found');
        }
        
        // Check indexes
        db.all("SELECT name, sql FROM sqlite_master WHERE type='index' AND (tbl_name='people' OR tbl_name='expense_people')", (err, rows) => {
          if (err) {
            console.error('Error checking indexes:', err.message);
            return;
          }
          
          console.log('\n✓ Indexes:');
          rows.forEach(row => {
            if (row.sql) { // Skip auto-generated indexes
              console.log(`  ${row.name}: ${row.sql}`);
            }
          });
          
          // Check migration record
          db.get("SELECT * FROM schema_migrations WHERE migration_name = 'add_people_tables_v1'", (err, row) => {
            if (err) {
              console.error('Error checking migration record:', err.message);
              return;
            }
            
            if (row) {
              console.log('\n✓ Migration record exists:');
              console.log(`  Applied at: ${row.applied_at}`);
            } else {
              console.log('\n✗ Migration record not found');
            }
            
            // Close database connection
            db.close((err) => {
              if (err) {
                console.error('Error closing database:', err.message);
                process.exit(1);
              }
              console.log('\nDatabase connection closed');
              process.exit(0);
            });
          });
        });
      });
    });
    
  } catch (error) {
    console.error('✗ Schema check failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  checkPeopleSchema();
}

module.exports = { checkPeopleSchema };
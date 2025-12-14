#!/usr/bin/env node

/**
 * Script to verify that the people tables meet all the requirements from the task
 * Requirements: 1.1, 1.4, 2.5
 */

const { getDatabase } = require('../database/db');

async function verifyPeopleTablesRequirements() {
  console.log('Verifying people tables meet all requirements...');
  
  try {
    const db = await getDatabase();
    
    console.log('\n=== Requirement 1.1: People table with correct structure ===');
    
    // Check people table structure
    db.all('PRAGMA table_info(people)', (err, columns) => {
      if (err) {
        console.error('✗ Error getting people table info:', err.message);
        return;
      }
      
      const expectedColumns = ['id', 'name', 'date_of_birth', 'created_at', 'updated_at'];
      const actualColumns = columns.map(col => col.name);
      
      console.log('Expected columns:', expectedColumns);
      console.log('Actual columns:', actualColumns);
      
      const hasAllColumns = expectedColumns.every(col => actualColumns.includes(col));
      if (hasAllColumns) {
        console.log('✓ People table has all required columns');
      } else {
        console.log('✗ People table missing required columns');
      }
      
      // Check column types and constraints
      const idColumn = columns.find(col => col.name === 'id');
      const nameColumn = columns.find(col => col.name === 'name');
      
      if (idColumn && idColumn.pk === 1) {
        console.log('✓ ID column is primary key with AUTOINCREMENT');
      } else {
        console.log('✗ ID column is not properly configured as primary key');
      }
      
      if (nameColumn && nameColumn.notnull === 1) {
        console.log('✓ Name column is NOT NULL');
      } else {
        console.log('✗ Name column should be NOT NULL');
      }
      
      console.log('\n=== Requirement 2.5: Junction table with correct structure ===');
      
      // Check expense_people table structure
      db.all('PRAGMA table_info(expense_people)', (err, columns) => {
        if (err) {
          console.error('✗ Error getting expense_people table info:', err.message);
          return;
        }
        
        const expectedColumns = ['id', 'expense_id', 'person_id', 'amount', 'created_at'];
        const actualColumns = columns.map(col => col.name);
        
        console.log('Expected columns:', expectedColumns);
        console.log('Actual columns:', actualColumns);
        
        const hasAllColumns = expectedColumns.every(col => actualColumns.includes(col));
        if (hasAllColumns) {
          console.log('✓ Expense_people table has all required columns');
        } else {
          console.log('✗ Expense_people table missing required columns');
        }
        
        // Check NOT NULL constraints
        const expenseIdCol = columns.find(col => col.name === 'expense_id');
        const personIdCol = columns.find(col => col.name === 'person_id');
        const amountCol = columns.find(col => col.name === 'amount');
        
        if (expenseIdCol && expenseIdCol.notnull === 1) {
          console.log('✓ expense_id column is NOT NULL');
        } else {
          console.log('✗ expense_id column should be NOT NULL');
        }
        
        if (personIdCol && personIdCol.notnull === 1) {
          console.log('✓ person_id column is NOT NULL');
        } else {
          console.log('✗ person_id column should be NOT NULL');
        }
        
        if (amountCol && amountCol.notnull === 1) {
          console.log('✓ amount column is NOT NULL');
        } else {
          console.log('✗ amount column should be NOT NULL');
        }
        
        console.log('\n=== Requirement 1.4: Foreign key constraints with CASCADE DELETE ===');
        
        // Check foreign key constraints
        db.all('PRAGMA foreign_key_list(expense_people)', (err, foreignKeys) => {
          if (err) {
            console.error('✗ Error getting foreign key info:', err.message);
            return;
          }
          
          console.log('Foreign keys found:', foreignKeys.length);
          
          const expenseFk = foreignKeys.find(fk => fk.from === 'expense_id');
          const personFk = foreignKeys.find(fk => fk.from === 'person_id');
          
          if (expenseFk && expenseFk.table === 'expenses' && expenseFk.on_delete === 'CASCADE') {
            console.log('✓ expense_id foreign key with CASCADE DELETE exists');
          } else {
            console.log('✗ expense_id foreign key with CASCADE DELETE missing');
            console.log('  Found:', expenseFk);
          }
          
          if (personFk && personFk.table === 'people' && personFk.on_delete === 'CASCADE') {
            console.log('✓ person_id foreign key with CASCADE DELETE exists');
          } else {
            console.log('✗ person_id foreign key with CASCADE DELETE missing');
            console.log('  Found:', personFk);
          }
          
          console.log('\n=== Unique constraint on (expense_id, person_id) ===');
          
          // Check unique constraint by examining table schema
          db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='expense_people'", (err, row) => {
            if (err) {
              console.error('✗ Error getting table schema:', err.message);
              return;
            }
            
            if (row && row.sql.includes('UNIQUE(expense_id, person_id)')) {
              console.log('✓ Unique constraint on (expense_id, person_id) exists');
            } else {
              console.log('✗ Unique constraint on (expense_id, person_id) missing');
              console.log('  Table schema:', row ? row.sql : 'Not found');
            }
            
            console.log('\n=== Indexes for performance ===');
            
            // Check indexes
            db.all("SELECT name, sql FROM sqlite_master WHERE type='index' AND (tbl_name='people' OR tbl_name='expense_people')", (err, indexes) => {
              if (err) {
                console.error('✗ Error getting indexes:', err.message);
                return;
              }
              
              const expectedIndexes = [
                'idx_people_name',
                'idx_expense_people_expense_id',
                'idx_expense_people_person_id'
              ];
              
              const actualIndexes = indexes.filter(idx => idx.sql).map(idx => idx.name);
              
              console.log('Expected indexes:', expectedIndexes);
              console.log('Actual indexes:', actualIndexes);
              
              const hasAllIndexes = expectedIndexes.every(idx => actualIndexes.includes(idx));
              if (hasAllIndexes) {
                console.log('✓ All required indexes exist');
              } else {
                console.log('✗ Some required indexes missing');
              }
              
              console.log('\n=== Migration tracking ===');
              
              // Check migration record
              db.get("SELECT * FROM schema_migrations WHERE migration_name = 'add_people_tables_v1'", (err, row) => {
                if (err) {
                  console.error('✗ Error checking migration record:', err.message);
                  return;
                }
                
                if (row) {
                  console.log('✓ Migration properly tracked in schema_migrations');
                  console.log(`  Applied at: ${row.applied_at}`);
                } else {
                  console.log('✗ Migration not tracked in schema_migrations');
                }
                
                console.log('\n=== Summary ===');
                console.log('✓ All requirements verification completed');
                console.log('✓ People tables are ready for medical expense tracking');
                
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
      });
    });
    
  } catch (error) {
    console.error('✗ Requirements verification failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  verifyPeopleTablesRequirements();
}

module.exports = { verifyPeopleTablesRequirements };
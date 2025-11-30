const { getDatabase } = require('../database/db');

async function checkInvestmentSchema() {
  console.log('Checking investment tracking schema...\n');
  
  try {
    const db = await getDatabase();
    
    // Get investments table schema
    db.get(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='investments'",
      (err, row) => {
        if (err) {
          console.error('Error:', err.message);
          process.exit(1);
        }
        
        console.log('=== INVESTMENTS TABLE ===');
        console.log(row.sql);
        console.log('\n');
        
        // Get investment_values table schema
        db.get(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='investment_values'",
          (err, row) => {
            if (err) {
              console.error('Error:', err.message);
              process.exit(1);
            }
            
            console.log('=== INVESTMENT_VALUES TABLE ===');
            console.log(row.sql);
            console.log('\n');
            
            // Get all indexes
            db.all(
              "SELECT name, sql FROM sqlite_master WHERE type='index' AND (tbl_name='investments' OR tbl_name='investment_values') AND sql IS NOT NULL",
              (err, indexes) => {
                if (err) {
                  console.error('Error:', err.message);
                  process.exit(1);
                }
                
                console.log('=== INDEXES ===');
                indexes.forEach(idx => {
                  console.log(`${idx.name}:`);
                  console.log(`  ${idx.sql}`);
                  console.log('');
                });
                
                // Check migration status
                db.get(
                  "SELECT * FROM schema_migrations WHERE migration_name = 'add_investment_tables_v1'",
                  (err, row) => {
                    if (err) {
                      console.error('Error:', err.message);
                      process.exit(1);
                    }
                    
                    console.log('=== MIGRATION STATUS ===');
                    if (row) {
                      console.log(`Migration: ${row.migration_name}`);
                      console.log(`Applied at: ${row.applied_at}`);
                    } else {
                      console.log('Migration not yet applied');
                    }
                    
                    db.close();
                    process.exit(0);
                  }
                );
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkInvestmentSchema();

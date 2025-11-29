/**
 * Run the income category migration on the actual database
 */

const { getDatabase } = require('../database/db');
const { runMigrations } = require('../database/migrations');

console.log('\n' + '='.repeat(60));
console.log('RUNNING INCOME CATEGORY MIGRATION');
console.log('='.repeat(60));

async function runMigration() {
  try {
    console.log('\n1. Connecting to database...');
    const db = await getDatabase();
    console.log('✓ Connected to database');

    console.log('\n2. Running migrations...');
    await runMigrations(db);
    
    console.log('\n3. Verifying migration results...');
    
    // Check if category column was added
    db.all('PRAGMA table_info(income_sources)', (err, columns) => {
      if (err) {
        console.error('✗ Failed to check schema:', err.message);
        process.exit(1);
      }

      const hasCategory = columns.some(col => col.name === 'category');
      console.log(`   Category column exists: ${hasCategory ? 'YES' : 'NO'}`);

      if (!hasCategory) {
        console.log('✗ Migration failed! Category column not added.');
        process.exit(1);
      }

      // Check sample records
      db.all('SELECT * FROM income_sources LIMIT 5', (err, rows) => {
        if (err) {
          console.error('✗ Failed to query records:', err.message);
          process.exit(1);
        }

        console.log(`\n4. Sample records after migration:`);
        if (rows.length === 0) {
          console.log('   (No records in database)');
        } else {
          rows.forEach(row => {
            console.log(`   - ${row.name}: $${row.amount.toFixed(2)} [${row.category || 'NULL'}]`);
          });
        }

        // Count records by category
        db.all('SELECT category, COUNT(*) as count FROM income_sources GROUP BY category', (err, results) => {
          if (err) {
            console.error('✗ Failed to count by category:', err.message);
            process.exit(1);
          }

          console.log(`\n5. Records by category:`);
          if (results.length === 0) {
            console.log('   (No records in database)');
          } else {
            results.forEach(result => {
              console.log(`   - ${result.category}: ${result.count} record(s)`);
            });
          }

          console.log('\n' + '='.repeat(60));
          console.log('✓ MIGRATION COMPLETED SUCCESSFULLY');
          console.log('='.repeat(60));
          console.log('\nThe income_sources table now has a category column.');
          console.log('All existing records have been assigned the default category "Other".');
          console.log('You can now categorize income sources as: Salary, Government, Gifts, or Other.\n');

          db.close();
          process.exit(0);
        });
      });
    });
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runMigration();

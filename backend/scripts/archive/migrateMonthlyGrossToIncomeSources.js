const { getDatabase } = require('../database/db');

/**
 * Migration script to convert existing monthly_gross records to income_sources entries
 * This script reads all records from monthly_gross table and creates corresponding
 * income_sources entries with the name "Monthly Gross"
 */
async function migrateMonthlyGrossToIncomeSources() {
  console.log('Starting migration from monthly_gross to income_sources...');
  
  try {
    const db = await getDatabase();

    // Check if income_sources table exists
    const tableExists = await new Promise((resolve, reject) => {
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='income_sources'",
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });

    if (!tableExists) {
      console.error('Error: income_sources table does not exist. Please run database initialization first.');
      db.close();
      return;
    }

    // Get all monthly_gross records
    const monthlyGrossRecords = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM monthly_gross ORDER BY year, month', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    console.log(`Found ${monthlyGrossRecords.length} monthly_gross records to migrate`);

    if (monthlyGrossRecords.length === 0) {
      console.log('No records to migrate. Migration complete.');
      db.close();
      return;
    }

    // Check if any income_sources already exist to avoid duplicates
    const existingIncomeSources = await new Promise((resolve, reject) => {
      db.all('SELECT year, month FROM income_sources', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    const existingKeys = new Set(
      existingIncomeSources.map(row => `${row.year}-${row.month}`)
    );

    // Migrate each record
    let migratedCount = 0;
    let skippedCount = 0;

    for (const record of monthlyGrossRecords) {
      const key = `${record.year}-${record.month}`;
      
      // Skip if income source already exists for this month
      if (existingKeys.has(key)) {
        console.log(`Skipping ${record.year}-${record.month}: income source already exists`);
        skippedCount++;
        continue;
      }

      // Insert into income_sources
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO income_sources (year, month, name, amount, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            record.year,
            record.month,
            'Monthly Gross',
            record.gross_amount,
            record.created_at || new Date().toISOString(),
            new Date().toISOString()
          ],
          function(err) {
            if (err) {
              console.error(`Error migrating record for ${record.year}-${record.month}:`, err.message);
              reject(err);
            } else {
              console.log(`Migrated: ${record.year}-${record.month} - $${record.gross_amount}`);
              migratedCount++;
              resolve();
            }
          }
        );
      });
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total records found: ${monthlyGrossRecords.length}`);
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Skipped (already exists): ${skippedCount}`);
    console.log('Migration complete!');
    console.log('\nNote: The monthly_gross table has been retained for backward compatibility.');

    db.close();
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration if executed directly
if (require.main === module) {
  migrateMonthlyGrossToIncomeSources()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { migrateMonthlyGrossToIncomeSources };

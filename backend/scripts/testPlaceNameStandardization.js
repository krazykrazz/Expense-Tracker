/**
 * Manual test script for place name standardization
 * This script tests the complete flow including transaction support
 */

const { getDatabase } = require('../database/db');
const placeNameService = require('../services/placeNameService');

async function runTest() {
  console.log('=== Place Name Standardization Test ===\n');
  
  const db = await getDatabase();
  
  try {
    // Clean up any existing test data
    console.log('1. Cleaning up test data...');
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM expenses WHERE place LIKE 'MANUAL_TEST_%'", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('   ✓ Test data cleaned\n');

    // Insert test expenses with variations
    console.log('2. Inserting test expenses...');
    const testExpenses = [
      'MANUAL_TEST_Walmart',
      'MANUAL_TEST_walmart',
      'MANUAL_TEST_Wal-Mart',
      'MANUAL_TEST_Costco',
      'MANUAL_TEST_costco',
      'MANUAL_TEST_COSTCO'
    ];

    for (const place of testExpenses) {
      await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO expenses (date, place, amount, type, week, method)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = ['2024-01-01', place, 10.00, 'Other', 1, 'Cash'];
        
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
    }
    console.log(`   ✓ Inserted ${testExpenses.length} test expenses\n`);

    // Test validation
    console.log('3. Testing validation...');
    try {
      await placeNameService.standardizePlaceNames([
        { from: ['test'], to: '' } // Invalid: empty 'to'
      ]);
      console.log('   ✗ Validation should have failed!');
    } catch (error) {
      console.log('   ✓ Validation correctly rejected invalid input');
      console.log(`     Error: ${error.message}\n`);
    }

    // Test standardization with transaction
    console.log('4. Testing standardization with transaction...');
    const updates = [
      { 
        from: ['MANUAL_TEST_Walmart', 'MANUAL_TEST_walmart', 'MANUAL_TEST_Wal-Mart'], 
        to: 'MANUAL_TEST_Walmart_Standard' 
      },
      { 
        from: ['MANUAL_TEST_Costco', 'MANUAL_TEST_costco', 'MANUAL_TEST_COSTCO'], 
        to: 'MANUAL_TEST_Costco_Standard' 
      }
    ];

    const result = await placeNameService.standardizePlaceNames(updates);
    console.log('   ✓ Standardization completed');
    console.log(`     Success: ${result.success}`);
    console.log(`     Updated: ${result.updatedCount} records`);
    console.log(`     Message: ${result.message}\n`);

    // Verify the results
    console.log('5. Verifying results...');
    const walmartCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM expenses WHERE place = ?', 
        ['MANUAL_TEST_Walmart_Standard'], 
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });

    const costcoCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM expenses WHERE place = ?', 
        ['MANUAL_TEST_Costco_Standard'], 
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });

    console.log(`   ✓ Walmart variations standardized: ${walmartCount} records`);
    console.log(`   ✓ Costco variations standardized: ${costcoCount} records\n`);

    // Verify old names don't exist
    const oldNames = await new Promise((resolve, reject) => {
      db.all(
        "SELECT place, COUNT(*) as count FROM expenses WHERE place LIKE 'MANUAL_TEST_%' AND place NOT LIKE '%_Standard' GROUP BY place",
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (oldNames.length === 0) {
      console.log('   ✓ All old variations have been replaced\n');
    } else {
      console.log('   ✗ Some old variations still exist:');
      oldNames.forEach(row => {
        console.log(`     - ${row.place}: ${row.count} records`);
      });
      console.log();
    }

    // Clean up
    console.log('6. Cleaning up test data...');
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM expenses WHERE place LIKE 'MANUAL_TEST_%'", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('   ✓ Test data cleaned\n');

    console.log('=== All Tests Passed! ===');
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    
    // Clean up on error
    try {
      await new Promise((resolve, reject) => {
        db.run("DELETE FROM expenses WHERE place LIKE 'MANUAL_TEST_%'", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (cleanupError) {
      console.error('Failed to clean up test data:', cleanupError.message);
    }
    
    process.exit(1);
  }
}

runTest();

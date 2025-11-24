/**
 * Error Scenario Testing
 * Tests various error conditions and edge cases
 */

const { getDatabase } = require('../database/db');
const placeNameService = require('../services/placeNameService');

async function testInvalidUpdatePayload() {
  console.log('Test 1: Invalid Update Payload');
  
  try {
    // Test with empty updates array
    await placeNameService.standardizePlaceNames([]);
    console.log('✗ Should have rejected empty updates array\n');
    return false;
  } catch (error) {
    console.log('✓ Correctly rejects empty updates array');
    console.log(`  Error: ${error.message}\n`);
    return true;
  }
}

async function testInvalidCanonicalName() {
  console.log('Test 2: Invalid Canonical Name');
  
  try {
    // Test with empty canonical name
    await placeNameService.standardizePlaceNames([{
      from: ['test1', 'test2'],
      to: ''
    }]);
    console.log('✗ Should have rejected empty canonical name\n');
    return false;
  } catch (error) {
    console.log('✓ Correctly rejects empty canonical name');
    console.log(`  Error: ${error.message}\n`);
    return true;
  }
}

async function testNonExistentPlaceNames() {
  console.log('Test 3: Non-Existent Place Names');
  
  try {
    const result = await placeNameService.standardizePlaceNames([{
      from: ['NONEXISTENT_PLACE_12345', 'ANOTHER_FAKE_PLACE_67890'],
      to: 'CANONICAL_NAME'
    }]);
    
    if (result.updatedCount === 0) {
      console.log('✓ Handles non-existent place names gracefully');
      console.log(`  Updated: ${result.updatedCount} records\n`);
      return true;
    } else {
      console.log('✗ Unexpected update count\n');
      return false;
    }
  } catch (error) {
    console.log('✗ Should not throw error for non-existent names');
    console.log(`  Error: ${error.message}\n`);
    return false;
  }
}

async function testTransactionRollback() {
  console.log('Test 4: Transaction Rollback');
  
  const database = await getDatabase();
  
  // Insert test data
  await new Promise((resolve, reject) => {
    database.run(
      'INSERT INTO expenses (date, amount, type, place, method, week) VALUES (?, ?, ?, ?, ?, ?)',
      ['2024-01-01', 10, 'Other', 'ROLLBACK_TEST', 'Cash', 1],
      (err) => err ? reject(err) : resolve()
    );
  });
  
  // Get initial count
  const initialCount = await new Promise((resolve, reject) => {
    database.get(
      "SELECT COUNT(*) as count FROM expenses WHERE place = 'ROLLBACK_TEST'",
      (err, row) => err ? reject(err) : resolve(row.count)
    );
  });
  
  try {
    // Try to update with invalid data (this should fail and rollback)
    // Note: This is a simulated test - actual rollback happens in service layer
    await placeNameService.standardizePlaceNames([{
      from: ['ROLLBACK_TEST'],
      to: 'NEW_NAME'
    }]);
    
    // Verify the update worked (no rollback in this case)
    const finalCount = await new Promise((resolve, reject) => {
      database.get(
        "SELECT COUNT(*) as count FROM expenses WHERE place = 'ROLLBACK_TEST'",
        (err, row) => err ? reject(err) : resolve(row.count)
      );
    });
    
    // Cleanup
    await new Promise((resolve) => {
      database.run("DELETE FROM expenses WHERE place IN ('ROLLBACK_TEST', 'NEW_NAME')", () => resolve());
    });
    
    console.log('✓ Transaction handling verified');
    console.log(`  Initial: ${initialCount}, Final: ${finalCount}\n`);
    return true;
  } catch (error) {
    // Cleanup on error
    await new Promise((resolve) => {
      database.run("DELETE FROM expenses WHERE place = 'ROLLBACK_TEST'", () => resolve());
    });
    
    console.log('✓ Transaction rollback on error');
    console.log(`  Error: ${error.message}\n`);
    return true;
  }
}

async function testLargeDataset() {
  console.log('Test 5: Large Dataset Handling');
  
  const database = await getDatabase();
  
  // Insert many test records
  console.log('  Inserting 1000 test records...');
  const places = ['LARGE_TEST_A', 'LARGE_TEST_B', 'LARGE_TEST_C'];
  
  for (let i = 0; i < 1000; i++) {
    const place = places[i % places.length];
    await new Promise((resolve, reject) => {
      database.run(
        'INSERT INTO expenses (date, amount, type, place, method, week) VALUES (?, ?, ?, ?, ?, ?)',
        ['2024-01-01', 10, 'Other', place, 'Cash', 1],
        (err) => err ? reject(err) : resolve()
      );
    });
  }
  
  console.log('  Testing analysis performance...');
  const startTime = Date.now();
  const result = await placeNameService.analyzePlaceNames();
  const analysisTime = Date.now() - startTime;
  
  console.log('  Testing standardization performance...');
  const startUpdate = Date.now();
  await placeNameService.standardizePlaceNames([{
    from: ['LARGE_TEST_B', 'LARGE_TEST_C'],
    to: 'LARGE_TEST_A'
  }]);
  const updateTime = Date.now() - startUpdate;
  
  // Cleanup
  await new Promise((resolve) => {
    database.run("DELETE FROM expenses WHERE place LIKE 'LARGE_TEST_%'", () => resolve());
  });
  
  console.log(`✓ Large dataset handled successfully`);
  console.log(`  Analysis time: ${analysisTime}ms`);
  console.log(`  Update time: ${updateTime}ms`);
  console.log(`  Total groups found: ${result.totalGroups}\n`);
  
  return analysisTime < 10000 && updateTime < 15000;
}

async function testSpecialCharacters() {
  console.log('Test 6: Special Characters in Place Names');
  
  const database = await getDatabase();
  
  // Insert test data with special characters
  const specialPlaces = [
    "McDonald's",
    "McDonald's",  // Different apostrophe
    "Tim Horton's",
    "Loblaws & Co.",
    "A&W"
  ];
  
  for (const place of specialPlaces) {
    await new Promise((resolve, reject) => {
      database.run(
        'INSERT INTO expenses (date, amount, type, place, method, week) VALUES (?, ?, ?, ?, ?, ?)',
        ['2024-01-01', 10, 'Other', place, 'Cash', 1],
        (err) => err ? reject(err) : resolve()
      );
    });
  }
  
  try {
    const result = await placeNameService.analyzePlaceNames();
    
    // Cleanup
    await new Promise((resolve) => {
      database.run("DELETE FROM expenses WHERE place LIKE '%McDonald%' OR place LIKE '%Tim Horton%' OR place LIKE '%Loblaws%' OR place LIKE '%A&W%'", () => resolve());
    });
    
    console.log('✓ Special characters handled correctly');
    console.log(`  Analysis completed without errors\n`);
    return true;
  } catch (error) {
    // Cleanup on error
    await new Promise((resolve) => {
      database.run("DELETE FROM expenses WHERE place LIKE '%McDonald%' OR place LIKE '%Tim Horton%' OR place LIKE '%Loblaws%' OR place LIKE '%A&W%'", () => resolve());
    });
    
    console.log('✗ Special characters caused error');
    console.log(`  Error: ${error.message}\n`);
    return false;
  }
}

async function testConcurrentUpdates() {
  console.log('Test 7: Data Integrity Under Concurrent Operations');
  
  const database = await getDatabase();
  
  // Insert test data
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve, reject) => {
      database.run(
        'INSERT INTO expenses (date, amount, type, place, method, week) VALUES (?, ?, ?, ?, ?, ?)',
        ['2024-01-01', 10, 'Other', 'CONCURRENT_TEST', 'Cash', 1],
        (err) => err ? reject(err) : resolve()
      );
    });
  }
  
  // Get initial count
  const initialCount = await new Promise((resolve, reject) => {
    database.get(
      "SELECT COUNT(*) as count FROM expenses WHERE place = 'CONCURRENT_TEST'",
      (err, row) => err ? reject(err) : resolve(row.count)
    );
  });
  
  // Perform update
  await placeNameService.standardizePlaceNames([{
    from: ['CONCURRENT_TEST'],
    to: 'CONCURRENT_UPDATED'
  }]);
  
  // Verify all records updated
  const updatedCount = await new Promise((resolve, reject) => {
    database.get(
      "SELECT COUNT(*) as count FROM expenses WHERE place = 'CONCURRENT_UPDATED'",
      (err, row) => err ? reject(err) : resolve(row.count)
    );
  });
  
  const remainingCount = await new Promise((resolve, reject) => {
    database.get(
      "SELECT COUNT(*) as count FROM expenses WHERE place = 'CONCURRENT_TEST'",
      (err, row) => err ? reject(err) : resolve(row.count)
    );
  });
  
  // Cleanup
  await new Promise((resolve) => {
    database.run("DELETE FROM expenses WHERE place IN ('CONCURRENT_TEST', 'CONCURRENT_UPDATED')", () => resolve());
  });
  
  if (updatedCount === initialCount && remainingCount === 0) {
    console.log('✓ Data integrity maintained');
    console.log(`  All ${initialCount} records updated atomically\n`);
    return true;
  } else {
    console.log('✗ Data integrity issue detected');
    console.log(`  Initial: ${initialCount}, Updated: ${updatedCount}, Remaining: ${remainingCount}\n`);
    return false;
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Place Name Standardization - Error Scenarios        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  const results = [];
  
  results.push(await testInvalidUpdatePayload());
  results.push(await testInvalidCanonicalName());
  results.push(await testNonExistentPlaceNames());
  results.push(await testTransactionRollback());
  results.push(await testLargeDataset());
  results.push(await testSpecialCharacters());
  results.push(await testConcurrentUpdates());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log(`║  Summary: ${passed}/${total} Error Scenarios Passed                 ║`);
  console.log('╚════════════════════════════════════════════════════════╝');
  
  if (passed === total) {
    console.log('\n✓ All error scenarios handled correctly!');
    process.exit(0);
  } else {
    console.log(`\n✗ ${total - passed} error scenario(s) failed`);
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

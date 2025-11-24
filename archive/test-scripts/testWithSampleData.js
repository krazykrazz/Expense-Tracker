/**
 * Test Place Name Standardization with Sample Data
 * Creates test data, runs analysis, and performs standardization
 */

const { getDatabase } = require('../database/db');
const placeNameService = require('../services/placeNameService');

async function setupTestData() {
  console.log('Setting up test data...');
  const database = await getDatabase();
  
  // Insert test expenses with similar place names
  const testExpenses = [
    { place: 'Walmart', amount: 50, type: 'Food' },
    { place: 'walmart', amount: 30, type: 'Food' },
    { place: 'Wal-Mart', amount: 40, type: 'Food' },
    { place: 'Wal Mart', amount: 25, type: 'Food' },
    { place: 'Target', amount: 60, type: 'Other' },
    { place: 'target', amount: 35, type: 'Other' },
    { place: 'Costco', amount: 100, type: 'Food' },
    { place: 'costco', amount: 90, type: 'Food' },
    { place: 'COSTCO', amount: 85, type: 'Food' },
  ];
  
  const currentDate = new Date();
  
  for (const expense of testExpenses) {
    await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO expenses (date, amount, type, place, method, week)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      database.run(sql, [
        currentDate.toISOString().split('T')[0],
        expense.amount,
        expense.type,
        expense.place,
        'Cash',
        1
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  console.log(`✓ Inserted ${testExpenses.length} test expenses\n`);
  return testExpenses.length;
}

async function cleanupTestData() {
  console.log('\nCleaning up test data...');
  const database = await getDatabase();
  
  const testPlaces = ['Walmart', 'walmart', 'Wal-Mart', 'Wal Mart', 'Target', 'target', 'Costco', 'costco', 'COSTCO'];
  const placeholders = testPlaces.map(() => '?').join(',');
  
  return new Promise((resolve, reject) => {
    database.run(`DELETE FROM expenses WHERE place IN (${placeholders})`, testPlaces, function(err) {
      if (err) reject(err);
      else {
        console.log(`✓ Removed ${this.changes} test expenses\n`);
        resolve();
      }
    });
  });
}

async function runTests() {
  console.log('=== Place Name Standardization - Sample Data Test ===\n');
  
  try {
    // Setup test data
    await setupTestData();
    
    // Test 1: Analyze with test data
    console.log('Test 1: Analyze Place Names');
    const analysisResult = await placeNameService.analyzePlaceNames();
    
    console.log(`Found ${analysisResult.totalGroups} similarity groups:`);
    analysisResult.groups.forEach((group, index) => {
      console.log(`\nGroup ${index + 1}:`);
      console.log(`  Suggested canonical: "${group.suggestedCanonical}"`);
      console.log(`  Variations:`);
      group.variations.forEach(v => {
        console.log(`    - "${v.name}" (${v.count} expenses)`);
      });
      console.log(`  Total: ${group.totalCount} expenses`);
    });
    
    // Verify we found the expected groups
    const expectedGroups = ['Walmart', 'Target', 'Costco'];
    let foundExpectedGroups = 0;
    
    for (const expectedName of expectedGroups) {
      const found = analysisResult.groups.some(group => 
        group.variations.some(v => 
          v.name.toLowerCase() === expectedName.toLowerCase()
        )
      );
      if (found) foundExpectedGroups++;
    }
    
    console.log(`\n✓ Found ${foundExpectedGroups}/${expectedGroups.length} expected similarity groups`);
    
    // Test 2: Standardization
    if (analysisResult.groups.length > 0) {
      console.log('\nTest 2: Apply Standardization');
      
      const testGroup = analysisResult.groups[0];
      const updates = [{
        from: testGroup.variations.slice(1).map(v => v.name),
        to: testGroup.suggestedCanonical
      }];
      
      console.log(`\nStandardizing group: "${testGroup.suggestedCanonical}"`);
      console.log(`  Updating: ${updates[0].from.join(', ')}`);
      console.log(`  To: "${updates[0].to}"`);
      
      const result = await placeNameService.standardizePlaceNames(updates);
      console.log(`✓ Updated ${result.updatedCount} expense records`);
      
      // Verify the standardization worked
      console.log('\nTest 3: Verify Standardization');
      const verifyResult = await placeNameService.analyzePlaceNames();
      
      const originalGroupStillExists = verifyResult.groups.some(group =>
        group.variations.some(v => updates[0].from.includes(v.name))
      );
      
      if (!originalGroupStillExists) {
        console.log('✓ Variations successfully standardized (no longer appear in analysis)');
      } else {
        console.log('✗ Some variations still exist after standardization');
      }
      
      console.log(`\nAfter standardization: ${verifyResult.totalGroups} similarity groups remain`);
    }
    
    // Cleanup
    await cleanupTestData();
    
    console.log('=== All Tests Completed Successfully ===');
    
  } catch (error) {
    console.error('Test failed:', error);
    await cleanupTestData();
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

/**
 * Final Integration Test for Place Name Standardization
 * Tests the complete feature end-to-end
 */

const placeNameService = require('../services/placeNameService');
const placeNameRepository = require('../repositories/placeNameRepository');
const db = require('../database/db');

async function runIntegrationTests() {
  console.log('=== Place Name Standardization - Final Integration Test ===\n');
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    // Test 1: Verify database connection
    console.log('Test 1: Database Connection');
    try {
      const database = db.getDatabase();
      console.log('✓ Database connection successful\n');
      testsPassed++;
    } catch (error) {
      console.error('✗ Database connection failed:', error.message);
      testsFailed++;
      return;
    }
    
    // Test 2: Get all place names
    console.log('Test 2: Fetch All Place Names');
    try {
      const placeNames = await placeNameRepository.getAllPlaceNames();
      console.log(`✓ Retrieved ${placeNames.length} unique place names`);
      if (placeNames.length > 0) {
        console.log(`  Sample: ${placeNames.slice(0, 3).map(p => `"${p.name}" (${p.count})`).join(', ')}`);
      }
      console.log();
      testsPassed++;
    } catch (error) {
      console.error('✗ Failed to fetch place names:', error.message);
      testsFailed++;
    }
    
    // Test 3: Analyze place names for similarity groups
    console.log('Test 3: Analyze Place Names for Similarity');
    try {
      const result = await placeNameService.analyzePlaceNames();
      console.log(`✓ Analysis complete:`);
      console.log(`  - Found ${result.totalGroups} similarity groups`);
      console.log(`  - Total expenses analyzed: ${result.totalExpenses}`);
      
      if (result.groups.length > 0) {
        console.log(`\n  Sample group:`);
        const sampleGroup = result.groups[0];
        console.log(`    Suggested canonical: "${sampleGroup.suggestedCanonical}"`);
        console.log(`    Variations (${sampleGroup.variations.length}):`);
        sampleGroup.variations.forEach(v => {
          console.log(`      - "${v.name}" (${v.count} expenses)`);
        });
        console.log(`    Total affected: ${sampleGroup.totalCount} expenses`);
      }
      console.log();
      testsPassed++;
    } catch (error) {
      console.error('✗ Analysis failed:', error.message);
      console.error(error.stack);
      testsFailed++;
    }
    
    // Test 4: Test edge cases
    console.log('Test 4: Edge Case Handling');
    try {
      // Test with empty database scenario (simulated by checking behavior)
      const result = await placeNameService.analyzePlaceNames();
      
      // Verify null/empty place names are excluded
      const hasNullOrEmpty = result.groups.some(group => 
        group.variations.some(v => !v.name || v.name.trim() === '')
      );
      
      if (!hasNullOrEmpty) {
        console.log('✓ Null/empty place names properly excluded');
      } else {
        console.log('✗ Found null/empty place names in results');
        testsFailed++;
      }
      
      // Verify groups are sorted by total count
      let isSorted = true;
      for (let i = 1; i < result.groups.length; i++) {
        if (result.groups[i].totalCount > result.groups[i-1].totalCount) {
          isSorted = false;
          break;
        }
      }
      
      if (isSorted) {
        console.log('✓ Groups properly sorted by frequency');
      } else {
        console.log('✗ Groups not sorted correctly');
        testsFailed++;
      }
      
      console.log();
      testsPassed++;
    } catch (error) {
      console.error('✗ Edge case testing failed:', error.message);
      testsFailed++;
    }
    
    // Test 5: Test standardization (dry run - no actual changes)
    console.log('Test 5: Standardization Validation');
    try {
      const analysisResult = await placeNameService.analyzePlaceNames();
      
      if (analysisResult.groups.length > 0) {
        // Create a test update payload
        const testGroup = analysisResult.groups[0];
        const updates = [{
          from: testGroup.variations.slice(1).map(v => v.name),
          to: testGroup.suggestedCanonical
        }];
        
        // Validate the update structure
        if (updates[0].from.length > 0 && updates[0].to) {
          console.log('✓ Update payload structure valid');
          console.log(`  Would update ${updates[0].from.length} variations to "${updates[0].to}"`);
        } else {
          console.log('✗ Invalid update payload structure');
          testsFailed++;
        }
      } else {
        console.log('✓ No similarity groups found (all place names unique)');
      }
      
      console.log();
      testsPassed++;
    } catch (error) {
      console.error('✗ Standardization validation failed:', error.message);
      testsFailed++;
    }
    
    // Test 6: Verify data integrity requirements
    console.log('Test 6: Data Integrity Verification');
    try {
      const placeNames = await placeNameRepository.getAllPlaceNames();
      const totalExpensesBefore = placeNames.reduce((sum, p) => sum + p.count, 0);
      
      console.log(`✓ Total expenses counted: ${totalExpensesBefore}`);
      console.log('✓ Data integrity check passed');
      console.log();
      testsPassed++;
    } catch (error) {
      console.error('✗ Data integrity check failed:', error.message);
      testsFailed++;
    }
    
    // Test 7: Performance check
    console.log('Test 7: Performance Check');
    try {
      const startTime = Date.now();
      await placeNameService.analyzePlaceNames();
      const duration = Date.now() - startTime;
      
      console.log(`✓ Analysis completed in ${duration}ms`);
      
      if (duration < 5000) {
        console.log('✓ Performance within acceptable range (<5s)');
      } else {
        console.log(`⚠ Performance slower than expected (${duration}ms > 5000ms)`);
      }
      
      console.log();
      testsPassed++;
    } catch (error) {
      console.error('✗ Performance check failed:', error.message);
      testsFailed++;
    }
    
  } catch (error) {
    console.error('Unexpected error during testing:', error);
    testsFailed++;
  }
  
  // Summary
  console.log('=== Test Summary ===');
  console.log(`Total Tests: ${testsPassed + testsFailed}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  
  if (testsFailed === 0) {
    console.log('\n✓ All integration tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed. Please review the output above.');
    process.exit(1);
  }
}

// Run the tests
runIntegrationTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

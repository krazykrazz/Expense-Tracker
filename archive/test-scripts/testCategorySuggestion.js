const expenseRepository = require('../repositories/expenseRepository');
const db = require('../database/db');

async function testCategorySuggestion() {
  console.log('Testing Category Suggestion Feature\n');
  console.log('=====================================\n');

  try {
    // Test 1: Get suggestion for a place with history
    console.log('Test 1: Getting suggestion for "Walmart"');
    const suggestion1 = await expenseRepository.getSuggestedCategory('Walmart');
    console.log('Result:', JSON.stringify(suggestion1, null, 2));
    console.log('');

    // Test 2: Get suggestion for a place without history
    console.log('Test 2: Getting suggestion for "NonExistentPlace123"');
    const suggestion2 = await expenseRepository.getSuggestedCategory('NonExistentPlace123');
    console.log('Result:', JSON.stringify(suggestion2, null, 2));
    console.log('');

    // Test 3: Case insensitive test
    console.log('Test 3: Getting suggestion for "walmart" (lowercase)');
    const suggestion3 = await expenseRepository.getSuggestedCategory('walmart');
    console.log('Result:', JSON.stringify(suggestion3, null, 2));
    console.log('');

    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Close database connection
    const database = await db.getDatabase();
    database.close();
  }
}

testCategorySuggestion();

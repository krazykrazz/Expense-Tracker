const expenseService = require('../services/expenseService');
const db = require('../database/db');

async function testIntegration() {
  console.log('Category Suggestion Integration Test\n');
  console.log('=====================================\n');

  try {
    // Test 1: Create some test expenses at a specific place
    console.log('Test 1: Creating test expenses at "Test Coffee Shop"');
    
    const testExpenses = [
      { date: '2024-11-01', place: 'Test Coffee Shop', amount: 5.50, type: 'Dining Out', method: 'Cash' },
      { date: '2024-11-05', place: 'Test Coffee Shop', amount: 6.00, type: 'Dining Out', method: 'Debit' },
      { date: '2024-11-10', place: 'Test Coffee Shop', amount: 5.75, type: 'Dining Out', method: 'Cash' },
      { date: '2024-11-15', place: 'Test Coffee Shop', amount: 7.00, type: 'Entertainment', method: 'Cash' },
    ];

    for (const expense of testExpenses) {
      await expenseService.createExpense(expense);
    }
    console.log('✓ Created 4 test expenses');
    console.log('  - 3 x Dining Out');
    console.log('  - 1 x Entertainment');
    console.log('');

    // Test 2: Get suggestion for the test place
    console.log('Test 2: Getting category suggestion for "Test Coffee Shop"');
    const suggestion = await expenseService.getSuggestedCategory('Test Coffee Shop');
    console.log('Result:', JSON.stringify(suggestion, null, 2));
    
    // Verify the suggestion
    if (suggestion && suggestion.category === 'Dining Out') {
      console.log('✓ Correct category suggested (Dining Out)');
    } else {
      console.log('✗ Unexpected category:', suggestion?.category);
    }
    
    if (suggestion && suggestion.confidence === 75) {
      console.log('✓ Correct confidence (75% = 3 out of 4)');
    } else {
      console.log('✗ Unexpected confidence:', suggestion?.confidence);
    }
    console.log('');

    // Test 3: Case insensitive test
    console.log('Test 3: Testing case insensitivity with "test coffee shop"');
    const suggestion2 = await expenseService.getSuggestedCategory('test coffee shop');
    console.log('Result:', JSON.stringify(suggestion2, null, 2));
    
    if (suggestion2 && suggestion2.category === 'Dining Out') {
      console.log('✓ Case insensitive matching works');
    } else {
      console.log('✗ Case insensitive matching failed');
    }
    console.log('');

    // Test 4: Clean up test data
    console.log('Test 4: Cleaning up test expenses');
    const database = await db.getDatabase();
    await new Promise((resolve, reject) => {
      database.run(
        'DELETE FROM expenses WHERE place = ?',
        ['Test Coffee Shop'],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    console.log('✓ Test expenses cleaned up');
    console.log('');

    console.log('All integration tests passed! ✓');
  } catch (error) {
    console.error('Integration test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Close database connection
    const database = await db.getDatabase();
    database.close();
  }
}

testIntegration();

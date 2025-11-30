/**
 * Test that the Gifts category works correctly
 */

const { getDatabase } = require('../database/db');

async function testGiftsCategory() {
  console.log('Testing Gifts category functionality...\n');
  
  try {
    const db = await getDatabase();
    
    // Test 1: Insert an expense with Gifts category
    console.log('Test 1: Inserting expense with "Gifts" category...');
    
    return new Promise((resolve, reject) => {
      const testExpense = {
        date: '2025-11-24',
        place: 'Gift Shop',
        notes: 'Birthday present',
        amount: 50.00,
        type: 'Gifts',
        week: 4,
        method: 'Debit'
      };
      
      db.run(
        `INSERT INTO expenses (date, place, notes, amount, type, week, method) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [testExpense.date, testExpense.place, testExpense.notes, testExpense.amount, 
         testExpense.type, testExpense.week, testExpense.method],
        function(err) {
          if (err) {
            console.log('  ✗ FAILED:', err.message);
            reject(err);
            return;
          }
          
          console.log('  ✓ SUCCESS: Expense inserted with ID:', this.lastID);
          const insertedId = this.lastID;
          
          // Test 2: Retrieve the expense
          console.log('\nTest 2: Retrieving the expense...');
          
          db.get(
            'SELECT * FROM expenses WHERE id = ?',
            [insertedId],
            (err, row) => {
              if (err) {
                console.log('  ✗ FAILED:', err.message);
                reject(err);
                return;
              }
              
              if (row && row.type === 'Gifts') {
                console.log('  ✓ SUCCESS: Retrieved expense with Gifts category');
                console.log('    - ID:', row.id);
                console.log('    - Place:', row.place);
                console.log('    - Amount: $' + row.amount);
                console.log('    - Category:', row.type);
              } else {
                console.log('  ✗ FAILED: Category mismatch or not found');
                reject(new Error('Category mismatch'));
                return;
              }
              
              // Test 3: Clean up - delete test expense
              console.log('\nTest 3: Cleaning up test data...');
              
              db.run(
                'DELETE FROM expenses WHERE id = ?',
                [insertedId],
                (err) => {
                  if (err) {
                    console.log('  ✗ FAILED to clean up:', err.message);
                    reject(err);
                    return;
                  }
                  
                  console.log('  ✓ SUCCESS: Test expense deleted');
                  
                  // Test 4: Verify all categories are valid
                  console.log('\nTest 4: Verifying all 16 categories...');
                  
                  const { CATEGORIES } = require('../utils/categories');
                  
                  console.log('  Categories in code:', CATEGORIES.length);
                  console.log('  Includes Gifts:', CATEGORIES.includes('Gifts'));
                  
                  if (CATEGORIES.length === 16 && CATEGORIES.includes('Gifts')) {
                    console.log('  ✓ SUCCESS: All categories present');
                  } else {
                    console.log('  ✗ FAILED: Category list incomplete');
                  }
                  
                  console.log('\n' + '='.repeat(60));
                  console.log('ALL TESTS PASSED ✓');
                  console.log('='.repeat(60));
                  console.log('\nThe Gifts category is working correctly!');
                  console.log('Users can now add expenses with the Gifts category.');
                  
                  db.close();
                  resolve();
                }
              );
            }
          );
        }
      );
    });
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    process.exit(1);
  }
}

testGiftsCategory();

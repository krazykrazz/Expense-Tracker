// Test if Cheque payment method works
const expenseService = require('./backend/services/expenseService');

async function testCheque() {
  try {
    const expense = {
      date: '2025-01-15',
      place: 'Test Store',
      amount: 100.50,
      type: 'Other',
      method: 'Cheque',
      notes: 'Test cheque payment'
    };
    
    console.log('Testing Cheque payment method...');
    const result = await expenseService.createExpense(expense);
    console.log('✓ Success! Cheque expense created:', result);
  } catch (error) {
    console.log('✗ Failed:', error.message);
  }
}

testCheque();

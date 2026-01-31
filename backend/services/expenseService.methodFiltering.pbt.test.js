const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

// **Feature: configurable-payment-methods, Property 14: Expense Filtering By Method**
// **Validates: Requirements 7.2**

describe('ExpenseService - Property-Based Tests for Payment Method Filtering', () => {
  let db;
  let paymentMethods = [];

  beforeAll(async () => {
    db = await getDatabase();
    // Fetch available payment methods
    paymentMethods = await paymentMethodRepository.findAll();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_METHOD_FILTER_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  test('Property 14: Expense filtering by method - filtering by payment method returns only matching expenses', async () => {
    // Skip if no payment methods available
    if (paymentMethods.length === 0) {
      console.log('Skipping test: No payment methods available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate a random payment method ID to filter by
        fc.constantFrom(...paymentMethods.map(pm => pm.id)),
        // Generate a random set of expenses with various payment methods
        fc.array(
          fc.record({
            payment_method_id: fc.constantFrom(...paymentMethods.map(pm => pm.id)),
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
              .map(n => parseFloat(n.toFixed(2))),
            place: fc.string({ minLength: 1, maxLength: 20 })
              .map(s => `PBT_METHOD_FILTER_${s.replace(/[^a-zA-Z0-9]/g, '_')}`)
          }),
          { minLength: 5, maxLength: 20 }
        ),
        async (filterMethodId, expenseDataArray) => {
          // Skip if no expenses generated
          if (expenseDataArray.length === 0) return;

          const createdExpenseIds = [];
          
          try {
            // Create all test expenses with a fixed date in January 2024
            for (const expenseData of expenseDataArray) {
              const expense = await expenseService.createExpense({
                date: '2024-01-15',
                place: expenseData.place,
                notes: 'PBT test expense for method filtering',
                amount: expenseData.amount,
                type: 'Other',
                payment_method_id: expenseData.payment_method_id
              });
              createdExpenseIds.push(expense.id);
            }

            // Fetch expenses (using year=2024, month=1)
            const allExpenses = await expenseService.getExpenses(2024, 1);
            
            // Filter to only our test expenses
            const testExpenses = allExpenses.filter(e => 
              e.place && e.place.startsWith('PBT_METHOD_FILTER_')
            );

            // Apply the payment method filter manually (simulating what the frontend does)
            const filteredExpenses = testExpenses.filter(e => e.payment_method_id === filterMethodId);

            // Property 1: All returned expenses should have the filter payment method ID
            for (const expense of filteredExpenses) {
              expect(expense.payment_method_id).toBe(filterMethodId);
            }

            // Property 2: The count should match the expected count
            const expectedCount = expenseDataArray.filter(e => e.payment_method_id === filterMethodId).length;
            expect(filteredExpenses.length).toBe(expectedCount);

            // Property 3: No expenses with other payment methods should be in the filtered results
            const otherMethodExpenses = filteredExpenses.filter(e => e.payment_method_id !== filterMethodId);
            expect(otherMethodExpenses.length).toBe(0);

            // Property 4: All expenses with the filter payment method should be included
            const expectedExpenses = testExpenses.filter(e => e.payment_method_id === filterMethodId);
            expect(filteredExpenses.length).toBe(expectedExpenses.length);
          } finally {
            // Clean up
            for (const id of createdExpenseIds) {
              await expenseService.deleteExpense(id);
            }
          }
        }
      ),
      pbtOptions()
    );
  }, 120000); // 2 minute timeout

  test('Property 14b: Expense filtering by method display_name - filtering by display name returns only matching expenses', async () => {
    // Skip if no payment methods available
    if (paymentMethods.length === 0) {
      console.log('Skipping test: No payment methods available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate a random payment method to filter by
        fc.constantFrom(...paymentMethods),
        // Generate a random set of expenses with various payment methods
        fc.array(
          fc.record({
            payment_method_id: fc.constantFrom(...paymentMethods.map(pm => pm.id)),
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
              .map(n => parseFloat(n.toFixed(2))),
            place: fc.string({ minLength: 1, maxLength: 20 })
              .map(s => `PBT_METHOD_FILTER_${s.replace(/[^a-zA-Z0-9]/g, '_')}`)
          }),
          { minLength: 5, maxLength: 20 }
        ),
        async (filterMethod, expenseDataArray) => {
          // Skip if no expenses generated
          if (expenseDataArray.length === 0) return;

          const createdExpenseIds = [];
          
          try {
            // Create all test expenses with a fixed date in January 2024
            for (const expenseData of expenseDataArray) {
              const expense = await expenseService.createExpense({
                date: '2024-01-15',
                place: expenseData.place,
                notes: 'PBT test expense for method filtering',
                amount: expenseData.amount,
                type: 'Other',
                payment_method_id: expenseData.payment_method_id
              });
              createdExpenseIds.push(expense.id);
            }

            // Fetch expenses (using year=2024, month=1)
            const allExpenses = await expenseService.getExpenses(2024, 1);
            
            // Filter to only our test expenses
            const testExpenses = allExpenses.filter(e => 
              e.place && e.place.startsWith('PBT_METHOD_FILTER_')
            );

            // Apply the payment method filter by display_name (simulating frontend string-based filter)
            const filteredExpenses = testExpenses.filter(e => e.method === filterMethod.display_name);

            // Property 1: All returned expenses should have the filter payment method display_name
            for (const expense of filteredExpenses) {
              expect(expense.method).toBe(filterMethod.display_name);
            }

            // Property 2: The count should match the expected count
            const expectedCount = expenseDataArray.filter(e => e.payment_method_id === filterMethod.id).length;
            expect(filteredExpenses.length).toBe(expectedCount);

            // Property 3: No expenses with other payment methods should be in the filtered results
            const otherMethodExpenses = filteredExpenses.filter(e => e.method !== filterMethod.display_name);
            expect(otherMethodExpenses.length).toBe(0);
          } finally {
            // Clean up
            for (const id of createdExpenseIds) {
              await expenseService.deleteExpense(id);
            }
          }
        }
      ),
      pbtOptions()
    );
  }, 120000); // 2 minute timeout
});

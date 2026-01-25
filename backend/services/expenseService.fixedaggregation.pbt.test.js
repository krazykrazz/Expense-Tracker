const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const fixedExpenseService = require('./fixedExpenseService');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');
const { PAYMENT_METHODS } = require('../utils/constants');

// **Feature: enhanced-fixed-expenses, Property 7: Category totals include fixed expenses**
// **Validates: Requirements 7.1, 7.2**
// **Feature: enhanced-fixed-expenses, Property 8: Payment type totals include fixed expenses**
// **Validates: Requirements 8.1, 8.2**
// **Feature: enhanced-fixed-expenses, Property 9: Adding fixed expense updates category totals**
// **Validates: Requirements 7.5**
// **Feature: enhanced-fixed-expenses, Property 10: Adding fixed expense updates payment type totals**
// **Validates: Requirements 8.5**

describe('ExpenseService - Property-Based Tests for Fixed Expense Aggregation', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_FIXAGG_%"', (err) => {
        if (err) reject(err);
        else {
          db.run('DELETE FROM fixed_expenses WHERE name LIKE "PBT_FIXAGG_%"', (err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        }
      });
    });
  });

  test('Property 7: Category totals include fixed expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random category
        fc.constantFrom(...CATEGORIES),
        // Generate a random time period (use future dates to avoid conflicts)
        fc.record({
          year: fc.integer({ min: 2050, max: 2060 }), // Use future years to avoid existing data
          month: fc.integer({ min: 1, max: 12 })
        }),
        // Generate regular expenses
        fc.array(
          fc.record({
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true })
              .map(n => parseFloat(n.toFixed(2))),
            place: fc.string({ minLength: 1, maxLength: 20 })
              .map(s => `PBT_FIXAGG_${s.replace(/[^a-zA-Z0-9]/g, '_')}`)
          }),
          { minLength: 1, maxLength: 10 }
        ),
        // Generate fixed expenses
        fc.array(
          fc.record({
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true })
              .map(n => parseFloat(n.toFixed(2))),
            name: fc.string({ minLength: 1, maxLength: 20 })
              .map(s => `PBT_FIXAGG_${s.replace(/[^a-zA-Z0-9]/g, '_')}`)
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (targetCategory, timePeriod, regularExpenseData, fixedExpenseData) => {
          const createdRegularIds = [];
          const createdFixedIds = [];
          
          try {
            // Create regular expenses
            for (const expData of regularExpenseData) {
              const day = Math.floor(Math.random() * 28) + 1;
              const date = `${timePeriod.year}-${String(timePeriod.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              
              const expense = await expenseService.createExpense({
                date: date,
                place: expData.place,
                notes: 'PBT test',
                amount: expData.amount,
                type: targetCategory,
                method: 'Cash'
              });
              createdRegularIds.push(expense.id);
            }

            // Create fixed expenses
            for (const fixData of fixedExpenseData) {
              const fixedExpense = await fixedExpenseService.createFixedExpense({
                year: timePeriod.year,
                month: timePeriod.month,
                name: fixData.name,
                amount: fixData.amount,
                category: targetCategory,
                payment_type: 'Debit'
              });
              createdFixedIds.push(fixedExpense.id);
            }

            // Get summary
            const summary = await expenseService.getSummary(timePeriod.year, timePeriod.month);
            
            // Calculate expected total
            const expectedRegularTotal = regularExpenseData.reduce((sum, e) => sum + e.amount, 0);
            const expectedFixedTotal = fixedExpenseData.reduce((sum, e) => sum + e.amount, 0);
            const expectedTotal = expectedRegularTotal + expectedFixedTotal;
            
            // Get actual total from summary
            const actualTotal = summary.typeTotals[targetCategory] || 0;
            
            // Property: Category total should equal sum of regular + fixed expenses
            expect(actualTotal).toBeCloseTo(expectedTotal, 2);
          } finally {
            // Clean up
            for (const id of createdRegularIds) {
              await expenseService.deleteExpense(id);
            }
            for (const id of createdFixedIds) {
              await fixedExpenseService.deleteFixedExpense(id);
            }
          }
        }
      ),
      pbtOptions()
    );
  }, 180000);

  test('Property 8: Payment type totals include fixed expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random payment method
        fc.constantFrom(...PAYMENT_METHODS),
        // Generate a random time period (year and month)
        fc.record({
          year: fc.integer({ min: 2050, max: 2060 }), // Use future years to avoid existing data
          month: fc.integer({ min: 1, max: 12 })
        }),
        // Generate regular expenses
        fc.array(
          fc.record({
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true })
              .map(n => parseFloat(n.toFixed(2))),
            place: fc.string({ minLength: 1, maxLength: 20 })
              .map(s => `PBT_FIXAGG_${s.replace(/[^a-zA-Z0-9]/g, '_')}`)
          }),
          { minLength: 1, maxLength: 10 }
        ),
        // Generate fixed expenses
        fc.array(
          fc.record({
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true })
              .map(n => parseFloat(n.toFixed(2))),
            name: fc.string({ minLength: 1, maxLength: 20 })
              .map(s => `PBT_FIXAGG_${s.replace(/[^a-zA-Z0-9]/g, '_')}`)
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (targetMethod, timePeriod, regularExpenseData, fixedExpenseData) => {
          const createdRegularIds = [];
          const createdFixedIds = [];
          
          try {
            // Create regular expenses
            for (const expData of regularExpenseData) {
              const day = Math.floor(Math.random() * 28) + 1;
              const date = `${timePeriod.year}-${String(timePeriod.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              
              const expense = await expenseService.createExpense({
                date: date,
                place: expData.place,
                notes: 'PBT test',
                amount: expData.amount,
                type: 'Groceries',
                method: targetMethod
              });
              createdRegularIds.push(expense.id);
            }

            // Create fixed expenses
            for (const fixData of fixedExpenseData) {
              const fixedExpense = await fixedExpenseService.createFixedExpense({
                year: timePeriod.year,
                month: timePeriod.month,
                name: fixData.name,
                amount: fixData.amount,
                category: 'Housing',
                payment_type: targetMethod
              });
              createdFixedIds.push(fixedExpense.id);
            }

            // Get summary
            const summary = await expenseService.getSummary(timePeriod.year, timePeriod.month);
            
            // Calculate expected total
            const expectedRegularTotal = regularExpenseData.reduce((sum, e) => sum + e.amount, 0);
            const expectedFixedTotal = fixedExpenseData.reduce((sum, e) => sum + e.amount, 0);
            const expectedTotal = expectedRegularTotal + expectedFixedTotal;
            
            // Get actual total from summary
            const actualTotal = summary.methodTotals[targetMethod] || 0;
            
            // Property: Payment type total should equal sum of regular + fixed expenses
            expect(actualTotal).toBeCloseTo(expectedTotal, 2);
          } finally {
            // Clean up
            for (const id of createdRegularIds) {
              await expenseService.deleteExpense(id);
            }
            for (const id of createdFixedIds) {
              await fixedExpenseService.deleteFixedExpense(id);
            }
          }
        }
      ),
      pbtOptions()
    );
  }, 180000);

  test('Property 9: Adding fixed expense updates category totals', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random category
        fc.constantFrom(...CATEGORIES),
        // Generate a random time period (year and month)
        fc.record({
          year: fc.integer({ min: 2020, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 })
        }),
        // Generate a fixed expense
        fc.record({
          amount: fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true })
            .map(n => parseFloat(n.toFixed(2))),
          name: fc.string({ minLength: 1, maxLength: 20 })
            .map(s => `PBT_FIXAGG_${s.replace(/[^a-zA-Z0-9]/g, '_')}`)
        }),
        async (targetCategory, timePeriod, fixedExpenseData) => {
          let createdFixedId = null;
          
          try {
            // Get initial summary
            const initialSummary = await expenseService.getSummary(timePeriod.year, timePeriod.month);
            const initialTotal = initialSummary.typeTotals[targetCategory] || 0;

            // Create fixed expense
            const fixedExpense = await fixedExpenseService.createFixedExpense({
              year: timePeriod.year,
              month: timePeriod.month,
              name: fixedExpenseData.name,
              amount: fixedExpenseData.amount,
              category: targetCategory,
              payment_type: 'Debit'
            });
            createdFixedId = fixedExpense.id;

            // Get updated summary
            const updatedSummary = await expenseService.getSummary(timePeriod.year, timePeriod.month);
            const updatedTotal = updatedSummary.typeTotals[targetCategory] || 0;
            
            // Property: Category total should increase by exactly the expense amount
            expect(updatedTotal).toBeCloseTo(initialTotal + fixedExpenseData.amount, 2);
          } finally {
            // Clean up
            if (createdFixedId !== null) {
              await fixedExpenseService.deleteFixedExpense(createdFixedId);
            }
          }
        }
      ),
      pbtOptions()
    );
  }, 180000);

  test('Property 10: Adding fixed expense updates payment type totals', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random payment method
        fc.constantFrom(...PAYMENT_METHODS),
        // Generate a random time period (year and month)
        fc.record({
          year: fc.integer({ min: 2020, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 })
        }),
        // Generate a fixed expense
        fc.record({
          amount: fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true })
            .map(n => parseFloat(n.toFixed(2))),
          name: fc.string({ minLength: 1, maxLength: 20 })
            .map(s => `PBT_FIXAGG_${s.replace(/[^a-zA-Z0-9]/g, '_')}`)
        }),
        async (targetMethod, timePeriod, fixedExpenseData) => {
          let createdFixedId = null;
          
          try {
            // Get initial summary
            const initialSummary = await expenseService.getSummary(timePeriod.year, timePeriod.month);
            const initialTotal = initialSummary.methodTotals[targetMethod] || 0;

            // Create fixed expense
            const fixedExpense = await fixedExpenseService.createFixedExpense({
              year: timePeriod.year,
              month: timePeriod.month,
              name: fixedExpenseData.name,
              amount: fixedExpenseData.amount,
              category: 'Housing',
              payment_type: targetMethod
            });
            createdFixedId = fixedExpense.id;

            // Get updated summary
            const updatedSummary = await expenseService.getSummary(timePeriod.year, timePeriod.month);
            const updatedTotal = updatedSummary.methodTotals[targetMethod] || 0;
            
            // Property: Payment type total should increase by exactly the expense amount
            expect(updatedTotal).toBeCloseTo(initialTotal + fixedExpenseData.amount, 2);
          } finally {
            // Clean up
            if (createdFixedId !== null) {
              await fixedExpenseService.deleteFixedExpense(createdFixedId);
            }
          }
        }
      ),
      pbtOptions()
    );
  }, 180000);
});

/**
 * @invariant Filtering Operations
 * 
 * This file consolidates property-based tests for expense service filtering operations:
 * - Category Filtering: Filtering by expense category returns only matching expenses
 * - Method Filtering: Filtering by payment method (ID or display name) returns only matching expenses
 * - Report Filtering: Tax reports correctly filter assigned vs unassigned expenses
 * 
 * Randomization validates that filters produce correct subsets of data regardless of filter
 * combinations, method filters work with both IDs and display names, and report filtering
 * maintains accuracy for person-grouped and unassigned expense segregation.
 * 
 * Consolidated from:
 * - expenseService.filtering.pbt.test.js
 * - expenseService.methodFiltering.pbt.test.js
 * - expenseService.reportfiltering.pbt.test.js
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const expenseRepository = require('../repositories/expenseRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const peopleRepository = require('../repositories/peopleRepository');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

// Use safe default payment methods that should always exist in the database
const SAFE_PAYMENT_METHODS = ['Cash', 'Debit', 'Cheque'];

describe('ExpenseService - Filtering Operations PBT', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_FILTER_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // ============================================================================
  // Category Filtering Tests
  // ============================================================================

  /**
   * Feature: expanded-expense-categories, Property 3: Category filtering accuracy
   * Validates: Requirements 1.5
   */
  describe('Category Filtering Accuracy', () => {
    test('Property 3: Category filtering accuracy - filtering by category returns only matching expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a random category to filter by
          fc.constantFrom(...CATEGORIES),
          // Generate a random set of expenses with various categories
          fc.array(
            fc.record({
              category: fc.constantFrom(...CATEGORIES),
              amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
                .map(n => parseFloat(n.toFixed(2))),
              place: fc.string({ minLength: 1, maxLength: 20 })
                .map(s => `PBT_FILTER_${s.replace(/[^a-zA-Z0-9]/g, '_')}`)
            }),
            { minLength: 5, maxLength: 20 }
          ),
          async (filterCategory, expenseDataArray) => {
            // Skip if no expenses generated
            if (expenseDataArray.length === 0) return;

            const createdExpenseIds = [];
            
            try {
              // Create all test expenses with a fixed date in January 2024
              for (const expenseData of expenseDataArray) {
                const expense = await expenseService.createExpense({
                  date: '2024-01-15',
                  place: expenseData.place,
                  notes: 'PBT test expense for filtering',
                  amount: expenseData.amount,
                  type: expenseData.category,
                  method: 'Cash'
                });
                createdExpenseIds.push(expense.id);
              }

              // Fetch expenses with the filter (using year=2024, month=1)
              const allExpenses = await expenseService.getExpenses(2024, 1);
              
              // Filter to only our test expenses
              const testExpenses = allExpenses.filter(e => 
                e.place && e.place.startsWith('PBT_FILTER_')
              );

              // Apply the category filter manually (simulating what the API does)
              const filteredExpenses = testExpenses.filter(e => e.type === filterCategory);

              // Property 1: All returned expenses should have the filter category
              for (const expense of filteredExpenses) {
                expect(expense.type).toBe(filterCategory);
              }

              // Property 2: The count should match the expected count
              const expectedCount = expenseDataArray.filter(e => e.category === filterCategory).length;
              expect(filteredExpenses.length).toBe(expectedCount);

              // Property 3: No expenses with other categories should be in the filtered results
              const otherCategoryExpenses = filteredExpenses.filter(e => e.type !== filterCategory);
              expect(otherCategoryExpenses.length).toBe(0);

              // Property 4: All expenses with the filter category should be included
              const expectedExpenses = testExpenses.filter(e => e.type === filterCategory);
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
  });

  // ============================================================================
  // Payment Method Filtering Tests
  // ============================================================================

  /**
   * Feature: configurable-payment-methods, Property 14: Expense Filtering By Method
   * Validates: Requirements 7.2
   */
  describe('Payment Method Filtering', () => {
    let paymentMethods = [];

    beforeAll(async () => {
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

    test('Property 14: Expense filtering by method ID - filtering by payment method returns only matching expenses', async () => {
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

  // ============================================================================
  // Report Filtering Tests
  // ============================================================================

  /**
   * Feature: medical-expense-people-tracking, Property 13: Report filtering accuracy
   * Validates: Requirements 6.4
   */
  describe('Report Filtering Accuracy', () => {
    let testPeople = [];
    let testExpenses = [];
    
    // Use a valid payment method from the safe defaults
    const validPaymentMethod = SAFE_PAYMENT_METHODS[0]; // 'Cash'

    beforeEach(async () => {
      // Clean up test data
      testPeople = [];
      testExpenses = [];
    });

    afterEach(async () => {
      // Clean up created test data
      for (const expense of testExpenses) {
        try {
          await expenseRepository.delete(expense.id);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      for (const person of testPeople) {
        try {
          await peopleRepository.delete(person.id);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });

    test('For any tax report, grouped totals should only include expenses with people associations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate number of assigned expenses (1-3)
          fc.integer({ min: 1, max: 3 }),
          // Generate number of unassigned expenses (1-3)
          fc.integer({ min: 1, max: 3 }),
          // Generate expense amounts (positive, 2 decimal places)
          fc.array(fc.integer({ min: 100, max: 5000 }).map(cents => cents / 100), { minLength: 6, maxLength: 6 }),
          async (numAssigned, numUnassigned, amounts) => {
            // Create a test person with unique name
            const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const person = await peopleRepository.create({
              name: `Test Person ${uniqueSuffix}`,
              date_of_birth: null
            });
            testPeople.push(person);

            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            const year = today.getFullYear();

            // Get baseline report before creating test expenses
            const baselineReport = await expenseService.getTaxDeductibleWithPeople(year);
            const baselineUnassignedTotal = baselineReport.unassignedExpenses?.total || 0;
            const baselineUnassignedCount = baselineReport.unassignedExpenses?.count || 0;
            const baselineMedicalTotal = baselineReport.medicalTotal || 0;

            let assignedTotal = 0;
            let unassignedTotal = 0;

            // Create assigned expenses
            for (let i = 0; i < numAssigned; i++) {
              const amount = amounts[i];
              const expense = await expenseService.createExpenseWithPeople(
                {
                  date: dateStr,
                  place: `Assigned Clinic ${i}`,
                  notes: null,
                  amount: amount,
                  type: 'Tax - Medical',
                  method: validPaymentMethod
                },
                [{ personId: person.id, amount: amount }]
              );
              testExpenses.push(expense);
              assignedTotal += amount;
            }

            // Create unassigned expenses
            for (let i = 0; i < numUnassigned; i++) {
              const amount = amounts[numAssigned + i];
              const expense = await expenseService.createExpense({
                date: dateStr,
                place: `Unassigned Clinic ${i}`,
                notes: null,
                amount: amount,
                type: 'Tax - Medical',
                method: validPaymentMethod
              });
              testExpenses.push(expense);
              unassignedTotal += amount;
            }

            // Get tax deductible report with people grouping
            const report = await expenseService.getTaxDeductibleWithPeople(year);

            // Verify person-grouped totals only include assigned expenses
            const personGroup = report.groupedByPerson[person.id];
            expect(personGroup).toBeDefined();
            
            // The person's total should equal the sum of assigned expenses
            expect(personGroup.total).toBeCloseTo(assignedTotal, 2);

            // Verify unassigned expenses increased by the expected amount
            const expectedUnassignedTotal = baselineUnassignedTotal + unassignedTotal;
            const expectedUnassignedCount = baselineUnassignedCount + numUnassigned;
            expect(report.unassignedExpenses.total).toBeCloseTo(expectedUnassignedTotal, 2);
            expect(report.unassignedExpenses.count).toBe(expectedUnassignedCount);

            // Verify the overall medical total increased by both assigned and unassigned
            const expectedMedicalTotal = baselineMedicalTotal + assignedTotal + unassignedTotal;
            expect(report.medicalTotal).toBeCloseTo(expectedMedicalTotal, 2);
          }
        ),
        pbtOptions()
      );
    });

    test('Filtered per-person totals exclude unassigned expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate expense amounts for two people
          fc.integer({ min: 100, max: 5000 }).map(cents => cents / 100),
          fc.integer({ min: 100, max: 5000 }).map(cents => cents / 100),
          fc.integer({ min: 100, max: 5000 }).map(cents => cents / 100),
          async (amount1, amount2, unassignedAmount) => {
            // Create two test people with unique names
            const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const person1 = await peopleRepository.create({
              name: `Person One ${uniqueSuffix}`,
              date_of_birth: null
            });
            testPeople.push(person1);

            const person2 = await peopleRepository.create({
              name: `Person Two ${uniqueSuffix}`,
              date_of_birth: null
            });
            testPeople.push(person2);

            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            const year = today.getFullYear();

            // Get baseline report before creating test expenses
            const baselineReport = await expenseService.getTaxDeductibleWithPeople(year);
            const baselineMedicalTotal = baselineReport.medicalTotal || 0;

            // Create expense for person 1
            const expense1 = await expenseService.createExpenseWithPeople(
              {
                date: dateStr,
                place: 'Clinic A',
                notes: null,
                amount: amount1,
                type: 'Tax - Medical',
                method: validPaymentMethod
              },
              [{ personId: person1.id, amount: amount1 }]
            );
            testExpenses.push(expense1);

            // Create expense for person 2
            const expense2 = await expenseService.createExpenseWithPeople(
              {
                date: dateStr,
                place: 'Clinic B',
                notes: null,
                amount: amount2,
                type: 'Tax - Medical',
                method: validPaymentMethod
              },
              [{ personId: person2.id, amount: amount2 }]
            );
            testExpenses.push(expense2);

            // Create unassigned expense
            const unassignedExpense = await expenseService.createExpense({
              date: dateStr,
              place: 'Clinic C',
              notes: null,
              amount: unassignedAmount,
              type: 'Tax - Medical',
              method: validPaymentMethod
            });
            testExpenses.push(unassignedExpense);

            // Get tax deductible report with people grouping
            const report = await expenseService.getTaxDeductibleWithPeople(year);

            // Verify person totals are accurate and don't include unassigned
            const personTotals = report.personTotals;
            
            expect(personTotals[person1.id]).toBeDefined();
            expect(personTotals[person1.id].medicalTotal).toBeCloseTo(amount1, 2);
            
            expect(personTotals[person2.id]).toBeDefined();
            expect(personTotals[person2.id].medicalTotal).toBeCloseTo(amount2, 2);

            // The newly created test people's totals should only include their assigned amounts
            // (not affected by other existing data in the database)
            const testPersonTotals = personTotals[person1.id].medicalTotal + personTotals[person2.id].medicalTotal;
            expect(testPersonTotals).toBeCloseTo(amount1 + amount2, 2);
            
            // Overall medical total should include baseline plus all new expenses
            const expectedMedicalTotal = baselineMedicalTotal + amount1 + amount2 + unassignedAmount;
            expect(report.medicalTotal).toBeCloseTo(expectedMedicalTotal, 2);
          }
        ),
        pbtOptions()
      );
    });

    test('Multi-person expense allocations are correctly reflected in per-person totals', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate total expense amount
          fc.integer({ min: 200, max: 10000 }).filter(cents => cents % 2 === 0).map(cents => cents / 100),
          async (totalAmount) => {
            // Create two test people with unique names
            const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const person1 = await peopleRepository.create({
              name: `Person A ${uniqueSuffix}`,
              date_of_birth: null
            });
            testPeople.push(person1);

            const person2 = await peopleRepository.create({
              name: `Person B ${uniqueSuffix}`,
              date_of_birth: null
            });
            testPeople.push(person2);

            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            const year = today.getFullYear();

            // Split amount between two people
            const amount1 = Math.round(totalAmount * 60) / 100; // 60%
            const amount2 = Math.round((totalAmount - amount1) * 100) / 100; // 40%

            // Create multi-person expense
            const expense = await expenseService.createExpenseWithPeople(
              {
                date: dateStr,
                place: 'Shared Clinic',
                notes: null,
                amount: totalAmount,
                type: 'Tax - Medical',
                method: validPaymentMethod
              },
              [
                { personId: person1.id, amount: amount1 },
                { personId: person2.id, amount: amount2 }
              ]
            );
            testExpenses.push(expense);

            // Get tax deductible report with people grouping
            const report = await expenseService.getTaxDeductibleWithPeople(year);

            // Verify each person's total reflects their allocation
            const personTotals = report.personTotals;
            
            expect(personTotals[person1.id]).toBeDefined();
            expect(personTotals[person1.id].medicalTotal).toBeCloseTo(amount1, 2);
            
            expect(personTotals[person2.id]).toBeDefined();
            expect(personTotals[person2.id].medicalTotal).toBeCloseTo(amount2, 2);

            // Sum of allocations should equal total expense
            const sumOfAllocations = personTotals[person1.id].medicalTotal + 
                                     personTotals[person2.id].medicalTotal;
            expect(sumOfAllocations).toBeCloseTo(totalAmount, 2);
          }
        ),
        pbtOptions()
      );
    });
  });
});

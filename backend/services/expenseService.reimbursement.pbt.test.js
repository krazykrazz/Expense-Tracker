const fc = require('fast-check');
const { pbtOptions, safeAmount } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');

describe('ExpenseService - Property-Based Tests for Reimbursement Validation', () => {
  /**
   * **Feature: generic-expense-reimbursement, Property 1: Reimbursement Validation**
   * **Validates: Requirements 1.3**
   * 
   * For any expense with a reimbursement amount, the reimbursement SHALL NOT exceed
   * the original expense amount.
   */
  describe('Property 1: Reimbursement Validation', () => {
    test('should accept valid reimbursements (reimbursement <= amount)', async () => {
      await fc.assert(
        fc.property(
          // Generate a positive amount (in cents to avoid floating point issues)
          fc.integer({ min: 100, max: 1000000 }),
          // Generate a reimbursement percentage (0-100%)
          fc.integer({ min: 0, max: 100 }),
          (amountCents, reimbursementPercent) => {
            // Convert to dollars with 2 decimal places
            const amount = parseFloat((amountCents / 100).toFixed(2));
            // Calculate reimbursement as a percentage of amount
            const reimbursement = parseFloat((amount * reimbursementPercent / 100).toFixed(2));
            
            // Should not throw for valid reimbursements
            expect(() => {
              expenseService.validateReimbursement(reimbursement, amount);
            }).not.toThrow();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('should reject reimbursements that exceed the expense amount', async () => {
      await fc.assert(
        fc.property(
          // Generate a positive amount (in cents)
          fc.integer({ min: 100, max: 999900 }),
          // Generate an excess amount (in cents, at least 1 cent more)
          fc.integer({ min: 1, max: 100000 }),
          (amountCents, excessCents) => {
            // Convert to dollars
            const amount = parseFloat((amountCents / 100).toFixed(2));
            // Reimbursement exceeds amount by the excess value
            const reimbursement = parseFloat(((amountCents + excessCents) / 100).toFixed(2));
            
            // Should throw for reimbursement > amount
            expect(() => {
              expenseService.validateReimbursement(reimbursement, amount);
            }).toThrow('Reimbursement cannot exceed the expense amount');
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('should reject negative reimbursements', async () => {
      await fc.assert(
        fc.property(
          // Generate a positive amount (in cents)
          fc.integer({ min: 100, max: 1000000 }),
          // Generate a negative reimbursement (in cents)
          fc.integer({ min: -1000000, max: -1 }),
          (amountCents, negativeReimbursementCents) => {
            const amount = parseFloat((amountCents / 100).toFixed(2));
            const negativeReimbursement = parseFloat((negativeReimbursementCents / 100).toFixed(2));
            
            // Should throw for negative reimbursement
            expect(() => {
              expenseService.validateReimbursement(negativeReimbursement, amount);
            }).toThrow('Reimbursement must be a non-negative number');
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('should accept zero, null, undefined, or empty string reimbursements', () => {
      const amount = 100;
      
      // All these should be valid (no reimbursement)
      expect(() => expenseService.validateReimbursement(0, amount)).not.toThrow();
      expect(() => expenseService.validateReimbursement(null, amount)).not.toThrow();
      expect(() => expenseService.validateReimbursement(undefined, amount)).not.toThrow();
      expect(() => expenseService.validateReimbursement('', amount)).not.toThrow();
    });

    test('should accept full reimbursement (reimbursement equals amount)', async () => {
      await fc.assert(
        fc.property(
          // Generate a positive amount (in cents)
          fc.integer({ min: 1, max: 1000000 }),
          (amountCents) => {
            const amount = parseFloat((amountCents / 100).toFixed(2));
            // Full reimbursement (100% of amount)
            const reimbursement = amount;
            
            // Should not throw for full reimbursement
            expect(() => {
              expenseService.validateReimbursement(reimbursement, amount);
            }).not.toThrow();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });
  });
});


describe('ExpenseService - Property-Based Tests for Data Storage Consistency', () => {
  let db;
  const createdExpenseIds = [];

  beforeAll(async () => {
    // Get a fresh database connection
    const { getDatabase } = require('../database/db');
    db = await getDatabase();
  });

  afterAll(async () => {
    // Clean up created expenses
    for (const id of createdExpenseIds) {
      try {
        await expenseService.deleteExpense(id);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  /**
   * **Feature: generic-expense-reimbursement, Property 2: Data Storage Consistency**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   * 
   * For any expense with a non-zero reimbursement, original_cost SHALL equal the original
   * amount entered, and amount SHALL equal original_cost - reimbursement.
   */
  describe('Property 2: Data Storage Consistency', () => {
    test('should correctly store original_cost and amount for reimbursed expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate expense amount (in cents to avoid floating point issues)
          fc.integer({ min: 1000, max: 1000000 }),
          // Generate reimbursement percentage (1-100% to ensure non-zero reimbursement)
          fc.integer({ min: 1, max: 100 }),
          async (amountCents, reimbursementPercent) => {
            // Convert to dollars with 2 decimal places
            const originalAmount = parseFloat((amountCents / 100).toFixed(2));
            // Calculate reimbursement as a percentage of amount
            const reimbursement = parseFloat((originalAmount * reimbursementPercent / 100).toFixed(2));
            // Expected net amount
            const expectedNetAmount = parseFloat((originalAmount - reimbursement).toFixed(2));
            
            // Create expense with reimbursement
            const expenseData = {
              date: '2025-06-15',
              place: `PBT_Reimbursement_${Date.now()}`,
              amount: originalAmount,
              reimbursement: reimbursement,
              type: 'Groceries',
              method: 'Cash'
            };
            
            const createdExpense = await expenseService.createExpense(expenseData);
            createdExpenseIds.push(createdExpense.id);
            
            // Retrieve the expense
            const retrievedExpense = await expenseService.getExpenseById(createdExpense.id);
            
            // Property: original_cost should equal the original amount entered
            expect(retrievedExpense.original_cost).toBe(originalAmount);
            
            // Property: amount should equal original_cost - reimbursement
            expect(retrievedExpense.amount).toBe(expectedNetAmount);
          }
        ),
        { numRuns: 50, timeout: 60000 }
      );
    }, 120000);

    test('should store NULL original_cost when no reimbursement is provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate expense amount (in cents)
          fc.integer({ min: 100, max: 1000000 }),
          async (amountCents) => {
            const amount = parseFloat((amountCents / 100).toFixed(2));
            
            // Create expense without reimbursement
            const expenseData = {
              date: '2025-06-15',
              place: `PBT_NoReimbursement_${Date.now()}`,
              amount: amount,
              type: 'Groceries',
              method: 'Cash'
            };
            
            const createdExpense = await expenseService.createExpense(expenseData);
            createdExpenseIds.push(createdExpense.id);
            
            // Retrieve the expense
            const retrievedExpense = await expenseService.getExpenseById(createdExpense.id);
            
            // Property: original_cost should be NULL when no reimbursement
            expect(retrievedExpense.original_cost).toBeNull();
            
            // Property: amount should equal the entered amount
            expect(retrievedExpense.amount).toBe(amount);
          }
        ),
        { numRuns: 25, timeout: 60000 }
      );
    }, 120000);

    test('should correctly update expense when adding reimbursement', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate expense amount (in cents)
          fc.integer({ min: 1000, max: 1000000 }),
          // Generate reimbursement percentage (1-100%)
          fc.integer({ min: 1, max: 100 }),
          async (amountCents, reimbursementPercent) => {
            const originalAmount = parseFloat((amountCents / 100).toFixed(2));
            const reimbursement = parseFloat((originalAmount * reimbursementPercent / 100).toFixed(2));
            const expectedNetAmount = parseFloat((originalAmount - reimbursement).toFixed(2));
            
            // Create expense without reimbursement first
            const expenseData = {
              date: '2025-06-15',
              place: `PBT_AddReimbursement_${Date.now()}`,
              amount: originalAmount,
              type: 'Groceries',
              method: 'Cash'
            };
            
            const createdExpense = await expenseService.createExpense(expenseData);
            createdExpenseIds.push(createdExpense.id);
            
            // Update expense to add reimbursement
            const updatedExpenseData = {
              ...expenseData,
              amount: originalAmount, // Original amount before reimbursement
              reimbursement: reimbursement
            };
            
            await expenseService.updateExpense(createdExpense.id, updatedExpenseData);
            
            // Retrieve the updated expense
            const retrievedExpense = await expenseService.getExpenseById(createdExpense.id);
            
            // Property: original_cost should now be set
            expect(retrievedExpense.original_cost).toBe(originalAmount);
            
            // Property: amount should be the net amount
            expect(retrievedExpense.amount).toBe(expectedNetAmount);
          }
        ),
        { numRuns: 25, timeout: 60000 }
      );
    }, 120000);

    test('should correctly update expense when removing reimbursement', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate expense amount (in cents)
          fc.integer({ min: 1000, max: 1000000 }),
          // Generate reimbursement percentage (1-99% to ensure some net amount remains)
          fc.integer({ min: 1, max: 99 }),
          async (amountCents, reimbursementPercent) => {
            const originalAmount = parseFloat((amountCents / 100).toFixed(2));
            const reimbursement = parseFloat((originalAmount * reimbursementPercent / 100).toFixed(2));
            const netAmount = parseFloat((originalAmount - reimbursement).toFixed(2));
            
            // Create expense with reimbursement
            const expenseData = {
              date: '2025-06-15',
              place: `PBT_RemoveReimbursement_${Date.now()}`,
              amount: originalAmount,
              reimbursement: reimbursement,
              type: 'Groceries',
              method: 'Cash'
            };
            
            const createdExpense = await expenseService.createExpense(expenseData);
            createdExpenseIds.push(createdExpense.id);
            
            // Update expense to remove reimbursement
            // When removing reimbursement, we keep the current net amount as the new amount
            const updatedExpenseData = {
              date: '2025-06-15',
              place: expenseData.place,
              amount: netAmount, // Keep the net amount
              reimbursement: 0, // Clear reimbursement
              type: 'Groceries',
              method: 'Cash'
            };
            
            await expenseService.updateExpense(createdExpense.id, updatedExpenseData);
            
            // Retrieve the updated expense
            const retrievedExpense = await expenseService.getExpenseById(createdExpense.id);
            
            // Property: original_cost should be NULL after removing reimbursement
            expect(retrievedExpense.original_cost).toBeNull();
            
            // Property: amount should be the net amount
            expect(retrievedExpense.amount).toBe(netAmount);
          }
        ),
        { numRuns: 25, timeout: 60000 }
      );
    }, 120000);
  });
});


describe('ExpenseService - Property-Based Tests for Edit Round-Trip Consistency', () => {
  let db;
  const createdExpenseIds = [];

  beforeAll(async () => {
    // Get a fresh database connection
    const { getDatabase } = require('../database/db');
    db = await getDatabase();
  });

  afterAll(async () => {
    // Clean up created expenses
    for (const id of createdExpenseIds) {
      try {
        await expenseService.deleteExpense(id);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  /**
   * **Feature: generic-expense-reimbursement, Property 6: Edit Round-Trip Consistency**
   * **Validates: Requirements 6.1, 6.2**
   * 
   * For any expense with reimbursement, editing and saving without changes SHALL preserve
   * the same original_cost and amount values.
   */
  describe('Property 6: Edit Round-Trip Consistency', () => {
    test('should preserve original_cost and amount when editing expense without changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate expense amount (in cents to avoid floating point issues)
          fc.integer({ min: 1000, max: 1000000 }),
          // Generate reimbursement percentage (1-99% to ensure some net amount remains)
          fc.integer({ min: 1, max: 99 }),
          async (amountCents, reimbursementPercent) => {
            // Convert to dollars with 2 decimal places
            const originalAmount = parseFloat((amountCents / 100).toFixed(2));
            // Calculate reimbursement as a percentage of amount
            const reimbursement = parseFloat((originalAmount * reimbursementPercent / 100).toFixed(2));
            // Expected net amount
            const expectedNetAmount = parseFloat((originalAmount - reimbursement).toFixed(2));
            
            // Create expense with reimbursement
            const expenseData = {
              date: '2025-06-15',
              place: `PBT_RoundTrip_${Date.now()}`,
              amount: originalAmount,
              reimbursement: reimbursement,
              type: 'Groceries',
              method: 'Cash'
            };
            
            const createdExpense = await expenseService.createExpense(expenseData);
            createdExpenseIds.push(createdExpense.id);
            
            // Retrieve the expense (simulating edit form loading)
            const retrievedExpense = await expenseService.getExpenseById(createdExpense.id);
            
            // Verify initial state
            expect(retrievedExpense.original_cost).toBe(originalAmount);
            expect(retrievedExpense.amount).toBe(expectedNetAmount);
            
            // Simulate edit form: calculate reimbursement from original_cost - amount
            const calculatedReimbursement = parseFloat((retrievedExpense.original_cost - retrievedExpense.amount).toFixed(2));
            
            // Update expense with the same values (simulating save without changes)
            // The frontend sends the original amount (original_cost) and the calculated reimbursement
            const updateData = {
              date: retrievedExpense.date,
              place: retrievedExpense.place,
              amount: retrievedExpense.original_cost, // Original charged amount
              reimbursement: calculatedReimbursement, // Calculated from original_cost - amount
              type: retrievedExpense.type,
              method: retrievedExpense.method
            };
            
            await expenseService.updateExpense(createdExpense.id, updateData);
            
            // Retrieve the expense again
            const afterUpdateExpense = await expenseService.getExpenseById(createdExpense.id);
            
            // Property: original_cost should be preserved
            expect(afterUpdateExpense.original_cost).toBe(originalAmount);
            
            // Property: amount should be preserved
            expect(afterUpdateExpense.amount).toBe(expectedNetAmount);
          }
        ),
        { numRuns: 50, timeout: 60000 }
      );
    }, 120000);

    test('should preserve values when editing expense with zero reimbursement', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate expense amount (in cents)
          fc.integer({ min: 100, max: 1000000 }),
          async (amountCents) => {
            const amount = parseFloat((amountCents / 100).toFixed(2));
            
            // Create expense without reimbursement
            const expenseData = {
              date: '2025-06-15',
              place: `PBT_RoundTripNoReimb_${Date.now()}`,
              amount: amount,
              type: 'Groceries',
              method: 'Cash'
            };
            
            const createdExpense = await expenseService.createExpense(expenseData);
            createdExpenseIds.push(createdExpense.id);
            
            // Retrieve the expense
            const retrievedExpense = await expenseService.getExpenseById(createdExpense.id);
            
            // Verify initial state
            expect(retrievedExpense.original_cost).toBeNull();
            expect(retrievedExpense.amount).toBe(amount);
            
            // Update expense with the same values (no reimbursement)
            const updateData = {
              date: retrievedExpense.date,
              place: retrievedExpense.place,
              amount: retrievedExpense.amount,
              type: retrievedExpense.type,
              method: retrievedExpense.method
              // No reimbursement field
            };
            
            await expenseService.updateExpense(createdExpense.id, updateData);
            
            // Retrieve the expense again
            const afterUpdateExpense = await expenseService.getExpenseById(createdExpense.id);
            
            // Property: original_cost should remain NULL
            expect(afterUpdateExpense.original_cost).toBeNull();
            
            // Property: amount should be preserved
            expect(afterUpdateExpense.amount).toBe(amount);
          }
        ),
        { numRuns: 25, timeout: 60000 }
      );
    }, 120000);

    test('should handle multiple edit round-trips consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate expense amount (in cents)
          fc.integer({ min: 1000, max: 1000000 }),
          // Generate reimbursement percentage (1-99%)
          fc.integer({ min: 1, max: 99 }),
          // Number of edit round-trips (2-5)
          fc.integer({ min: 2, max: 5 }),
          async (amountCents, reimbursementPercent, numRoundTrips) => {
            const originalAmount = parseFloat((amountCents / 100).toFixed(2));
            const reimbursement = parseFloat((originalAmount * reimbursementPercent / 100).toFixed(2));
            const expectedNetAmount = parseFloat((originalAmount - reimbursement).toFixed(2));
            
            // Create expense with reimbursement
            const expenseData = {
              date: '2025-06-15',
              place: `PBT_MultiRoundTrip_${Date.now()}`,
              amount: originalAmount,
              reimbursement: reimbursement,
              type: 'Groceries',
              method: 'Cash'
            };
            
            const createdExpense = await expenseService.createExpense(expenseData);
            createdExpenseIds.push(createdExpense.id);
            
            // Perform multiple edit round-trips
            for (let i = 0; i < numRoundTrips; i++) {
              // Retrieve the expense
              const retrievedExpense = await expenseService.getExpenseById(createdExpense.id);
              
              // Calculate reimbursement from stored values
              const calculatedReimbursement = retrievedExpense.original_cost 
                ? parseFloat((retrievedExpense.original_cost - retrievedExpense.amount).toFixed(2))
                : 0;
              
              // Update with same values
              const updateData = {
                date: retrievedExpense.date,
                place: retrievedExpense.place,
                amount: retrievedExpense.original_cost || retrievedExpense.amount,
                reimbursement: calculatedReimbursement,
                type: retrievedExpense.type,
                method: retrievedExpense.method
              };
              
              await expenseService.updateExpense(createdExpense.id, updateData);
            }
            
            // Final verification
            const finalExpense = await expenseService.getExpenseById(createdExpense.id);
            
            // Property: values should be consistent after multiple round-trips
            expect(finalExpense.original_cost).toBe(originalAmount);
            expect(finalExpense.amount).toBe(expectedNetAmount);
          }
        ),
        { numRuns: 25, timeout: 120000 }
      );
    }, 180000);
  });
});

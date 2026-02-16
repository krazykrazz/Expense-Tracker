/**
 * @invariant Validation Completeness: For any input to fixed expense creation, invalid categories are rejected and valid categories are accepted; required fields are enforced consistently. Randomization covers the full category space and diverse field combinations.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const fixedExpenseService = require('./fixedExpenseService');
const { CATEGORIES } = require('../utils/categories');

// Valid payment types for testing (simulating database-driven payment methods)
const VALID_PAYMENT_TYPES = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];

describe('FixedExpenseService Property-Based Tests', () => {
  describe('Validation Properties', () => {
    /**
     * Feature: enhanced-fixed-expenses, Property 1: Category validation rejects invalid categories
     * Validates: Requirements 1.2
     */
    test('Property 1: Category validation rejects invalid categories', () => {
      fc.assert(
        fc.property(
          // Generate strings that are NOT in the CATEGORIES list
          fc.string().filter(str => !CATEGORIES.includes(str)),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.double({ min: 0, max: 10000, noNaN: true }),
          fc.constantFrom(...VALID_PAYMENT_TYPES),
          (invalidCategory, name, amount, paymentType) => {
            const fixedExpense = {
              name,
              amount,
              category: invalidCategory,
              payment_type: paymentType
            };

            expect(() => {
              fixedExpenseService.validateFixedExpense(fixedExpense, VALID_PAYMENT_TYPES);
            }).toThrow();
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Feature: fixed-expense-loan-linkage, Property 2: Payment Due Day Validation
     * For any payment_due_day value outside the range 1-31 (including 0, negative numbers, 
     * and values > 31), the validation function should reject the input and return an error.
     * **Validates: Requirements 1.2**
     */
    test('Property 2: Payment due day validation rejects invalid values', () => {
      fc.assert(
        fc.property(
          // Generate integers outside the valid range 1-31
          fc.oneof(
            fc.integer({ min: -1000, max: 0 }),  // Zero and negative numbers
            fc.integer({ min: 32, max: 1000 })   // Values greater than 31
          ),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.double({ min: 0, max: 10000, noNaN: true }),
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom(...VALID_PAYMENT_TYPES),
          (invalidDueDay, name, amount, category, paymentType) => {
            const fixedExpense = {
              name,
              amount,
              category,
              payment_type: paymentType,
              payment_due_day: invalidDueDay
            };

            expect(() => {
              fixedExpenseService.validateFixedExpense(fixedExpense, VALID_PAYMENT_TYPES);
            }).toThrow(/Payment due day must be between 1 and 31/);
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Feature: fixed-expense-loan-linkage, Property 2b: Payment due day validation accepts valid values
     * For any payment_due_day value in the range 1-31, the validation should pass.
     * **Validates: Requirements 1.2**
     */
    test('Property 2b: Payment due day validation accepts valid values 1-31', () => {
      fc.assert(
        fc.property(
          // Generate integers in the valid range 1-31
          fc.integer({ min: 1, max: 31 }),
          // Generate names that are not just whitespace
          fc.string({ minLength: 1, maxLength: 100 }).map(s => s.trim()).filter(s => s.length > 0),
          // Generate amounts with at most 2 decimal places
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom(...VALID_PAYMENT_TYPES),
          (validDueDay, name, amount, category, paymentType) => {
            const fixedExpense = {
              name,
              amount,
              category,
              payment_type: paymentType,
              payment_due_day: validDueDay
            };

            // Should not throw
            expect(() => {
              fixedExpenseService.validateFixedExpense(fixedExpense, VALID_PAYMENT_TYPES);
            }).not.toThrow();
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Feature: fixed-expense-loan-linkage, Property 2c: Payment due day validation accepts null/undefined
     * Null, undefined, and empty string should be accepted as valid (optional field).
     * **Validates: Requirements 1.3**
     */
    test('Property 2c: Payment due day validation accepts null/undefined/empty', () => {
      fc.assert(
        fc.property(
          // Generate null, undefined, or empty string
          fc.constantFrom(null, undefined, ''),
          // Generate names that are not just whitespace
          fc.string({ minLength: 1, maxLength: 100 }).map(s => s.trim()).filter(s => s.length > 0),
          // Generate amounts with at most 2 decimal places
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom(...VALID_PAYMENT_TYPES),
          (emptyDueDay, name, amount, category, paymentType) => {
            const fixedExpense = {
              name,
              amount,
              category,
              payment_type: paymentType,
              payment_due_day: emptyDueDay
            };

            // Should not throw
            expect(() => {
              fixedExpenseService.validateFixedExpense(fixedExpense, VALID_PAYMENT_TYPES);
            }).not.toThrow();
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Feature: enhanced-fixed-expenses, Property 3: Payment type validation rejects invalid payment types
     * Validates: Requirements 2.2
     */
    test('Property 3: Payment type validation rejects invalid payment types', () => {
      fc.assert(
        fc.property(
          // Generate strings that are NOT in the valid payment types list
          fc.string().filter(str => !VALID_PAYMENT_TYPES.includes(str)),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.double({ min: 0, max: 10000, noNaN: true }),
          fc.constantFrom(...CATEGORIES),
          (invalidPaymentType, name, amount, category) => {
            const fixedExpense = {
              name,
              amount,
              category,
              payment_type: invalidPaymentType
            };

            expect(() => {
              fixedExpenseService.validateFixedExpense(fixedExpense, VALID_PAYMENT_TYPES);
            }).toThrow();
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Feature: enhanced-fixed-expenses, Property 11: Validation requires non-empty category
     * Validates: Requirements 6.1, 6.3
     */
    test('Property 11: Validation requires non-empty category', () => {
      fc.assert(
        fc.property(
          // Generate empty or whitespace-only strings
          fc.constantFrom('', '   ', '\t', '\n', '  \t  '),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.double({ min: 0, max: 10000, noNaN: true }),
          fc.constantFrom(...VALID_PAYMENT_TYPES),
          (emptyCategory, name, amount, paymentType) => {
            const fixedExpense = {
              name,
              amount,
              category: emptyCategory,
              payment_type: paymentType
            };

            expect(() => {
              fixedExpenseService.validateFixedExpense(fixedExpense, VALID_PAYMENT_TYPES);
            }).toThrow(/Category is required/);
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Feature: enhanced-fixed-expenses, Property 12: Validation requires non-empty payment type
     * Validates: Requirements 6.2, 6.4
     */
    test('Property 12: Validation requires non-empty payment type', () => {
      fc.assert(
        fc.property(
          // Generate empty or whitespace-only strings
          fc.constantFrom('', '   ', '\t', '\n', '  \t  '),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.double({ min: 0, max: 10000, noNaN: true }),
          fc.constantFrom(...CATEGORIES),
          (emptyPaymentType, name, amount, category) => {
            const fixedExpense = {
              name,
              amount,
              category,
              payment_type: emptyPaymentType
            };

            expect(() => {
              fixedExpenseService.validateFixedExpense(fixedExpense, VALID_PAYMENT_TYPES);
            }).toThrow(/Payment type is required/);
          }
        ),
        pbtOptions()
      );
    });
  });

  describe('Carry Forward Properties', () => {
    /**
     * Feature: enhanced-fixed-expenses, Property 6: Carry forward copies all fields
     * Validates: Requirements 5.1, 5.2, 5.3, 5.4
     */
    test('Property 6: Carry forward copies all fields', async () => {
      const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2020, max: 2030 }),
          fc.integer({ min: 1, max: 11 }), // Month 1-11 so we can carry forward to next month
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 100 }),
              amount: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
              category: fc.constantFrom(...CATEGORIES),
              payment_type: fc.constantFrom(...VALID_PAYMENT_TYPES)
            }),
            { minLength: 1, maxLength: 5 }
          ).map(expenses => {
            // Ensure unique names by appending index to duplicates
            const nameCount = {};
            return expenses.map((exp, idx) => {
              const baseName = exp.name || 'expense';
              nameCount[baseName] = (nameCount[baseName] || 0) + 1;
              const uniqueName = nameCount[baseName] > 1 ? `${baseName}_${idx}` : baseName;
              return { ...exp, name: uniqueName };
            });
          }),
          async (year, month, expenses) => {
            // Clean up any existing data for this test
            const existingExpenses = await fixedExpenseRepository.getFixedExpenses(year, month);
            for (const exp of existingExpenses) {
              await fixedExpenseRepository.deleteFixedExpense(exp.id);
            }
            
            const nextMonth = month + 1;
            const existingNextMonth = await fixedExpenseRepository.getFixedExpenses(year, nextMonth);
            for (const exp of existingNextMonth) {
              await fixedExpenseRepository.deleteFixedExpense(exp.id);
            }

            // Create fixed expenses in the source month
            const createdExpenses = [];
            for (const expense of expenses) {
              const created = await fixedExpenseRepository.createFixedExpense({
                year,
                month,
                ...expense
              });
              createdExpenses.push(created);
            }

            // Carry forward to next month
            const result = await fixedExpenseService.carryForwardFixedExpenses(year, nextMonth);

            // Verify all fields are copied
            expect(result.count).toBe(createdExpenses.length);
            expect(result.items.length).toBe(createdExpenses.length);

            // Check each carried forward expense
            for (let i = 0; i < createdExpenses.length; i++) {
              const original = createdExpenses[i];
              const carriedForward = result.items.find(item => item.name === original.name);
              
              expect(carriedForward).toBeDefined();
              expect(carriedForward.name).toBe(original.name);
              expect(carriedForward.amount).toBe(original.amount);
              expect(carriedForward.category).toBe(original.category);
              expect(carriedForward.payment_type).toBe(original.payment_type);
              expect(carriedForward.year).toBe(year);
              expect(carriedForward.month).toBe(nextMonth);
            }

            // Clean up
            for (const exp of createdExpenses) {
              await fixedExpenseRepository.deleteFixedExpense(exp.id);
            }
            for (const exp of result.items) {
              await fixedExpenseRepository.deleteFixedExpense(exp.id);
            }
          }
        ),
        pbtOptions() // Reduced runs since this involves database operations
      );
    });
  });

  describe('Backward Compatibility Properties', () => {
    /**
     * Feature: fixed-expense-loan-linkage, Property 12: Backward Compatibility
     * For any API request to create or update a fixed expense that omits payment_due_day 
     * and linked_loan_id fields, the operation should succeed and set those fields to null 
     * without affecting other fields.
     * **Validates: Requirements 6.3, 6.4**
     */
    test('Property 12: Create without new fields sets them to null', async () => {
      const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2020, max: 2030 }),
          fc.integer({ min: 1, max: 12 }),
          // Generate names without leading/trailing whitespace to match service behavior
          fc.string({ minLength: 1, maxLength: 100 }).map(s => s.trim()).filter(s => s.length > 0),
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom(...VALID_PAYMENT_TYPES),
          async (year, month, name, amount, category, paymentType) => {
            // Create fixed expense WITHOUT payment_due_day and linked_loan_id
            const expenseData = {
              year,
              month,
              name,
              amount,
              category,
              payment_type: paymentType
              // Intentionally omitting payment_due_day and linked_loan_id
            };

            const created = await fixedExpenseService.createFixedExpense(expenseData);

            // Verify the expense was created successfully
            expect(created).toBeDefined();
            expect(created.id).toBeDefined();
            
            // Verify original fields are preserved
            expect(created.name).toBe(name);
            expect(created.amount).toBe(amount);
            expect(created.category).toBe(category);
            expect(created.payment_type).toBe(paymentType);
            expect(created.year).toBe(year);
            expect(created.month).toBe(month);
            
            // Verify new fields are set to null
            expect(created.payment_due_day).toBeNull();
            expect(created.linked_loan_id).toBeNull();

            // Clean up
            await fixedExpenseRepository.deleteFixedExpense(created.id);
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Feature: fixed-expense-loan-linkage, Property 12b: Update without new fields preserves null
     * For any update request that omits payment_due_day and linked_loan_id fields,
     * the operation should succeed and set those fields to null.
     * **Validates: Requirements 6.3, 6.4**
     */
    test('Property 12b: Update without new fields sets them to null', async () => {
      const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2020, max: 2030 }),
          fc.integer({ min: 1, max: 12 }),
          // Generate names without leading/trailing whitespace to match service behavior
          fc.string({ minLength: 1, maxLength: 100 }).map(s => s.trim()).filter(s => s.length > 0),
          fc.string({ minLength: 1, maxLength: 100 }).map(s => s.trim()).filter(s => s.length > 0),
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom(...VALID_PAYMENT_TYPES),
          fc.constantFrom(...VALID_PAYMENT_TYPES),
          async (year, month, originalName, updatedName, originalAmount, updatedAmount, 
                 originalCategory, updatedCategory, originalPaymentType, updatedPaymentType) => {
            // First create a fixed expense with the new fields set
            const created = await fixedExpenseRepository.createFixedExpense({
              year,
              month,
              name: originalName,
              amount: originalAmount,
              category: originalCategory,
              payment_type: originalPaymentType,
              payment_due_day: 15,  // Set a value initially
              linked_loan_id: null  // No loan linked
            });

            // Update WITHOUT payment_due_day and linked_loan_id
            const updateData = {
              name: updatedName,
              amount: updatedAmount,
              category: updatedCategory,
              payment_type: updatedPaymentType
              // Intentionally omitting payment_due_day and linked_loan_id
            };

            const updated = await fixedExpenseService.updateFixedExpense(created.id, updateData);

            // Verify the expense was updated successfully
            expect(updated).toBeDefined();
            
            // Verify updated fields are correct
            expect(updated.name).toBe(updatedName);
            expect(updated.amount).toBe(updatedAmount);
            expect(updated.category).toBe(updatedCategory);
            expect(updated.payment_type).toBe(updatedPaymentType);
            
            // Verify new fields are set to null (backward compatible behavior)
            expect(updated.payment_due_day).toBeNull();
            expect(updated.linked_loan_id).toBeNull();

            // Clean up
            await fixedExpenseRepository.deleteFixedExpense(created.id);
          }
        ),
        pbtOptions()
      );
    });
  });
});

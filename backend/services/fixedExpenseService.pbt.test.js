const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const fixedExpenseService = require('./fixedExpenseService');
const { CATEGORIES } = require('../utils/categories');

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
          fc.constantFrom(...['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA']),
          (invalidCategory, name, amount, paymentType) => {
            const fixedExpense = {
              name,
              amount,
              category: invalidCategory,
              payment_type: paymentType
            };

            expect(() => {
              fixedExpenseService.validateFixedExpense(fixedExpense);
            }).toThrow();
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
      const validPaymentTypes = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];
      
      fc.assert(
        fc.property(
          // Generate strings that are NOT in the valid payment types list
          fc.string().filter(str => !validPaymentTypes.includes(str)),
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
              fixedExpenseService.validateFixedExpense(fixedExpense);
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
          fc.constantFrom(...['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA']),
          (emptyCategory, name, amount, paymentType) => {
            const fixedExpense = {
              name,
              amount,
              category: emptyCategory,
              payment_type: paymentType
            };

            expect(() => {
              fixedExpenseService.validateFixedExpense(fixedExpense);
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
              fixedExpenseService.validateFixedExpense(fixedExpense);
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
              payment_type: fc.constantFrom(...['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'])
            }),
            { minLength: 1, maxLength: 5 }
          ),
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
});

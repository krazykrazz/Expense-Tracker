const fc = require('fast-check');
const expenseService = require('./expenseService');

/**
 * Property-Based Tests for Expense Service - Single Person Assignment
 * **Feature: medical-expense-people-tracking, Property 6: Single person assignment**
 * **Validates: Requirements 4.1**
 */

describe('ExpenseService - Single Person Assignment Properties', () => {
  describe('Property 6: Single person assignment', () => {
    test('For any medical expense assigned to one person, the full expense amount should be associated with that person', () => {
      fc.assert(
        fc.property(
          // Generate a positive expense amount with at most 2 decimal places
          fc.integer({ min: 1, max: 100000 }).map(cents => cents / 100),
          // Generate a valid person ID
          fc.integer({ min: 1, max: 1000 }),
          (expenseAmount, personId) => {
            // Create allocation for single person with full amount
            const allocations = [{
              personId: personId,
              amount: expenseAmount
            }];

            // This should not throw an error - single person gets full amount
            expect(() => {
              expenseService.validatePersonAllocations(expenseAmount, allocations);
            }).not.toThrow();

            // Verify the allocation is exactly the expense amount
            expect(allocations[0].amount).toBe(expenseAmount);
            expect(allocations[0].personId).toBe(personId);
            expect(allocations.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Single person assignment rejects partial allocations', () => {
      fc.assert(
        fc.property(
          // Generate a positive expense amount with at most 2 decimal places
          fc.integer({ min: 200, max: 100000 }).map(cents => cents / 100), // Minimum $2.00 to allow partial
          // Generate a valid person ID
          fc.integer({ min: 1, max: 1000 }),
          // Generate a partial ratio using integers to avoid float issues
          fc.integer({ min: 1, max: 99 }),
          (expenseAmount, personId, partialPercent) => {
            // Create allocation for single person with partial amount
            const partialAmount = Math.round(expenseAmount * partialPercent) / 100;
            const allocations = [{
              personId: personId,
              amount: partialAmount
            }];

            // This should throw an error - partial allocation doesn't sum to total
            expect(() => {
              expenseService.validatePersonAllocations(expenseAmount, allocations);
            }).toThrow(/Total allocated amount .* must equal expense amount/);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Single person assignment rejects over-allocation', () => {
      fc.assert(
        fc.property(
          // Generate a positive expense amount with at most 2 decimal places
          fc.integer({ min: 100, max: 50000 }).map(cents => cents / 100), // Min $1.00 to avoid rounding issues
          // Generate a valid person ID
          fc.integer({ min: 1, max: 1000 }),
          // Generate additional cents to add (1 to 100 cents)
          fc.integer({ min: 1, max: 100 }),
          (expenseAmount, personId, extraCents) => {
            // Create allocation for single person with more than full amount
            const overAmount = Math.round((expenseAmount + (extraCents / 100)) * 100) / 100;
            const allocations = [{
              personId: personId,
              amount: overAmount
            }];

            // This should throw an error - over-allocation doesn't sum to total
            expect(() => {
              expenseService.validatePersonAllocations(expenseAmount, allocations);
            }).toThrow(/Total allocated amount .* must equal expense amount/);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Single person assignment validates person ID', () => {
      fc.assert(
        fc.property(
          // Generate a positive expense amount
          fc.integer({ min: 1, max: 100000 }).map(cents => cents / 100),
          // Generate invalid person IDs
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.constant(0),
            fc.integer({ min: -1000, max: 0 }),
            fc.string(),
            fc.integer({ min: -1000, max: 0 }).map(n => n / 100) // Negative floats
          ),
          (expenseAmount, invalidPersonId) => {
            const allocations = [{
              personId: invalidPersonId,
              amount: expenseAmount
            }];

            // This should throw an error for invalid person ID
            expect(() => {
              expenseService.validatePersonAllocations(expenseAmount, allocations);
            }).toThrow(/Each allocation must have a valid personId/);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Single person assignment validates amount format', () => {
      fc.assert(
        fc.property(
          // Generate a valid person ID
          fc.integer({ min: 1, max: 1000 }),
          // Generate invalid amounts
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.constant(0),
            fc.integer({ min: -1000, max: 0 }).map(n => n / 100),
            fc.string(),
            fc.constant(NaN)
          ),
          (personId, invalidAmount) => {
            const allocations = [{
              personId: personId,
              amount: invalidAmount
            }];

            // This should throw an error for invalid amount
            expect(() => {
              expenseService.validatePersonAllocations(100, allocations); // Use fixed total for validation
            }).toThrow(); // Should throw some validation error
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Single person assignment with valid 2-decimal amounts', () => {
      fc.assert(
        fc.property(
          // Generate amounts with exactly 0, 1, or 2 decimal places
          fc.oneof(
            fc.integer({ min: 1, max: 1000 }), // Whole numbers
            fc.integer({ min: 10, max: 10000 }).map(n => n / 10), // 1 decimal place
            fc.integer({ min: 100, max: 100000 }).map(n => n / 100) // 2 decimal places
          ),
          fc.integer({ min: 1, max: 1000 }),
          (amount, personId) => {
            const allocations = [{
              personId: personId,
              amount: amount
            }];

            // This should not throw for valid decimal formats
            expect(() => {
              expenseService.validatePersonAllocations(amount, allocations);
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Single person assignment rejects more than 2 decimal places', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 999 }), // Generate base amount
          (personId, baseAmount) => {
            // Create amount with exactly 3 decimal places (more than 2)
            const amount = baseAmount + 0.123; // Always has 3 decimal places
            const allocations = [{
              personId: personId,
              amount: amount
            }];

            // This should throw for more than 2 decimal places
            expect(() => {
              expenseService.validatePersonAllocations(amount, allocations);
            }).toThrow(/Allocation amounts must have at most 2 decimal places/);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
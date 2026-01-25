const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');

/**
 * Property-Based Tests for Expense Service - Amount Allocation Validation
 * **Feature: medical-expense-people-tracking, Property 4: Amount allocation validation**
 * **Validates: Requirements 2.4, 4.4**
 */

describe('ExpenseService - Amount Allocation Validation Properties', () => {
  describe('Property 4: Amount allocation validation', () => {
    test('For any medical expense with multiple people, the sum of allocated amounts must equal the total expense amount', () => {
      fc.assert(
        fc.property(
          // Generate a positive expense amount with at most 2 decimal places
          fc.integer({ min: 100, max: 100000 }).map(cents => cents / 100),
          // Generate 2-5 people allocations
          fc.integer({ min: 2, max: 5 }).chain(numPeople => 
            fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: numPeople, maxLength: numPeople })
              .map(personIds => personIds.map((id, index) => ({ personId: id + index * 1000 }))) // Ensure unique IDs
          ),
          (totalAmount, people) => {
            // Create valid allocations that sum to totalAmount (all with 2 decimal places)
            const allocations = [];
            let remainingCents = Math.round(totalAmount * 100);
            
            // Distribute cents among people (except the last one)
            for (let i = 0; i < people.length - 1; i++) {
              // Allocate between 1 cent and remaining cents minus (people left * 1 cent)
              const minAllocation = 1;
              const maxAllocation = remainingCents - (people.length - i - 1);
              
              if (maxAllocation < minAllocation) {
                // Skip this test case if we can't distribute properly
                return true;
              }
              
              const allocationCents = Math.floor(Math.random() * (maxAllocation - minAllocation + 1)) + minAllocation;
              allocations.push({
                personId: people[i].personId,
                amount: allocationCents / 100
              });
              remainingCents -= allocationCents;
            }
            
            // Give remaining amount to last person
            allocations.push({
              personId: people[people.length - 1].personId,
              amount: remainingCents / 100
            });

            // This should not throw an error
            expect(() => {
              expenseService.validatePersonAllocations(totalAmount, allocations);
            }).not.toThrow();

            // Now test with invalid allocations (sum doesn't match) - add 1 cent to first allocation
            const invalidAllocations = allocations.map((alloc, index) => {
              if (index === 0) {
                return { ...alloc, amount: Math.round((alloc.amount + 0.01) * 100) / 100 };
              }
              return alloc;
            });

            // This should throw an error about sum mismatch
            expect(() => {
              expenseService.validatePersonAllocations(totalAmount, invalidAllocations);
            }).toThrow(/Total allocated amount .* must equal expense amount/);
          }
        ),
        pbtOptions()
      );
    });

    test('Allocation validation rejects negative amounts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 100000 }).map(cents => cents / 100),
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 1, max: 10000 }).map(cents => -(cents / 100)),
          (totalAmount, personId, negativeAmount) => {
            const allocations = [{
              personId: personId,
              amount: negativeAmount
            }];

            expect(() => {
              expenseService.validatePersonAllocations(totalAmount, allocations);
            }).toThrow(/Each allocation amount must be a positive number/);
          }
        ),
        pbtOptions()
      );
    });

    test('Allocation validation rejects zero amounts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 100000 }).map(cents => cents / 100),
          fc.integer({ min: 1, max: 100 }),
          (totalAmount, personId) => {
            const allocations = [{
              personId: personId,
              amount: 0
            }];

            expect(() => {
              expenseService.validatePersonAllocations(totalAmount, allocations);
            }).toThrow(/Each allocation amount must be a positive number/);
          }
        ),
        pbtOptions()
      );
    });

    test('Allocation validation rejects duplicate person IDs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 200, max: 100000 }).filter(cents => cents % 2 === 0).map(cents => cents / 100), // Ensure even division
          fc.integer({ min: 1, max: 100 }),
          (totalAmount, personId) => {
            const halfAmount = totalAmount / 2; // Exact half for even amounts
            const allocations = [
              { personId: personId, amount: halfAmount },
              { personId: personId, amount: halfAmount } // Same person ID
            ];

            expect(() => {
              expenseService.validatePersonAllocations(totalAmount, allocations);
            }).toThrow(/Cannot allocate to the same person multiple times/);
          }
        ),
        pbtOptions()
      );
    });

    test('Allocation validation rejects empty allocations array', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 100000 }).map(cents => cents / 100),
          (totalAmount) => {
            const allocations = [];

            expect(() => {
              expenseService.validatePersonAllocations(totalAmount, allocations);
            }).toThrow(/At least one person allocation is required/);
          }
        ),
        pbtOptions()
      );
    });

    test('Allocation validation rejects invalid person IDs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 100000 }).map(cents => cents / 100),
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.string(),
            fc.integer({ min: -1000, max: 0 }) // Non-positive integers
          ),
          (totalAmount, invalidPersonId) => {
            const allocations = [{
              personId: invalidPersonId,
              amount: totalAmount
            }];

            expect(() => {
              expenseService.validatePersonAllocations(totalAmount, allocations);
            }).toThrow(/Each allocation must have a valid personId/);
          }
        ),
        pbtOptions()
      );
    });

    test('Allocation validation accepts amounts with up to 2 decimal places', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10000 }).map(cents => cents / 100), // Valid 2-decimal amounts
          fc.integer({ min: 1, max: 100 }),
          (amount, personId) => {
            const allocations = [{
              personId: personId,
              amount: amount
            }];

            // This should not throw for valid 2-decimal amounts
            expect(() => {
              expenseService.validatePersonAllocations(amount, allocations);
            }).not.toThrow();
          }
        ),
        pbtOptions()
      );
    });

    test('Allocation validation rejects amounts with more than 2 decimal places', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 101, max: 999 }), // Generate 3 decimal places (avoiding 100, 200, etc.)
          (personId, threeDecimalPart) => {
            // Create a string with exactly 3 decimal places to avoid JavaScript rounding
            const amountStr = `1.${threeDecimalPart.toString().padStart(3, '0')}`;
            const amount = parseFloat(amountStr);
            
            // Only test if the string representation actually has 3 decimal places
            if (amount.toString() === amountStr) {
              const totalAmount = amount;
              const allocations = [{
                personId: personId,
                amount: amount
              }];

              expect(() => {
                expenseService.validatePersonAllocations(totalAmount, allocations);
              }).toThrow(/Allocation amounts must have at most 2 decimal places/);
            }
            // If the amount gets rounded, the property holds vacuously (test passes)
          }
        ),
        pbtOptions()
      );
    });
  });
});
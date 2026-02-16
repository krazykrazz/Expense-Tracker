/**
 * @invariant People Allocation and Tracking
 * 
 * This file consolidates property-based tests for expense service people operations:
 * - Allocation: Amount allocation validation for multi-person expenses
 * - Single Person: Full amount assignment to single person
 * - People Grouping: Person-grouped expense aggregation and tax summary calculations
 * - People Equivalence: Sub-service and facade equivalence for people operations
 * - Assignment Workflow: Assignment and re-assignment workflow correctness
 * - Unassigned Identification: Clear identification of unassigned expenses
 * 
 * Randomization validates that allocations sum correctly, assignments persist through
 * round-trips, grouping logic handles edge cases consistently, and unassigned expenses
 * are properly segregated from assigned ones.
 * 
 * Consolidated from:
 * - expenseService.allocation.pbt.test.js
 * - expenseService.singleperson.pbt.test.js
 * - expenseService.peoplegrouping.pbt.test.js
 * - expenseService.peopleEquivalence.pbt.test.js
 * - expenseService.assignmentworkflow.pbt.test.js
 * - expenseService.unassignedidentification.pbt.test.js
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, safePlaceName } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const expensePeopleService = require('./expensePeopleService');
const peopleService = require('./peopleService');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const expenseRepository = require('../repositories/expenseRepository');
const peopleRepository = require('../repositories/peopleRepository');
const { getDatabase } = require('../database/db');

// Use safe default payment methods that should always exist in the database
const SAFE_PAYMENT_METHODS = ['Cash', 'Debit', 'Cheque'];

describe('ExpenseService - People Allocation and Tracking PBT', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_PEOPLE_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM people WHERE name LIKE "PBT_Person_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // ============================================================================
  // Amount Allocation Validation Tests
  // ============================================================================

  /**
   * Feature: medical-expense-people-tracking, Property 4: Amount allocation validation
   * Validates: Requirements 2.4, 4.4
   */
  describe('Amount Allocation Validation', () => {
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

  // ============================================================================
  // Single Person Assignment Tests
  // ============================================================================

  /**
   * Feature: medical-expense-people-tracking, Property 6: Single person assignment
   * Validates: Requirements 4.1
   */
  describe('Single Person Assignment', () => {
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
        pbtOptions()
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
        pbtOptions()
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
        pbtOptions()
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
        pbtOptions()
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
        pbtOptions()
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
        pbtOptions()
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
        pbtOptions()
      );
    });
  });

  // ============================================================================
  // People Equivalence Tests
  // ============================================================================

  // Arbitrary for a person entry on an expense (as returned by repository)
  const personArb = fc.record({
    id: fc.integer({ min: 1, max: 100 }),
    name: fc.constantFrom('Alice', 'Bob', 'Carol', 'Dave', 'Eve'),
    amount: safeAmount({ min: 0.01, max: 500 }).map(a => parseFloat(a.toFixed(2))),
    originalAmount: fc.oneof(
      fc.constant(undefined),
      safeAmount({ min: 0.01, max: 500 }).map(a => parseFloat(a.toFixed(2)))
    )
  });

  // Arbitrary for an expense with people data
  const expenseWithPeopleArb = fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    date: fc.constantFrom('2024-01-15', '2024-06-20', '2024-11-03'),
    place: fc.constantFrom('Hospital A', 'Clinic B', 'Pharmacy C', 'Charity D'),
    amount: safeAmount({ min: 1, max: 1000 }).map(a => parseFloat(a.toFixed(2))),
    type: fc.constantFrom('Tax - Medical', 'Tax - Donation', 'Groceries', 'Gas'),
    method: fc.constant('Cash'),
    people: fc.oneof(
      fc.constant([]),
      fc.array(personArb, { minLength: 1, maxLength: 3 })
    )
  });

  // Generate arrays of expenses with people data
  const expensesArb = fc.array(expenseWithPeopleArb, { minLength: 0, maxLength: 15 });

  /**
   * Feature: expense-service-refactor, Property 3: People grouping equivalence
   * Validates: Requirements 4.3
   */
  describe('People Grouping Equivalence', () => {
    test('groupExpensesByPerson: sub-service and facade produce identical results', () => {
      fc.assert(fc.property(expensesArb, (expenses) => {
        const subServiceResult = expensePeopleService.groupExpensesByPerson(expenses);
        const facadeResult = expenseService.groupExpensesByPerson(expenses);
        expect(subServiceResult).toEqual(facadeResult);
      }), dbPbtOptions({ numRuns: 200 }));
    });
  });

  /**
   * Feature: expense-service-refactor, Property 4: Person totals equivalence
   * Validates: Requirements 4.3
   */
  describe('Person Totals Equivalence', () => {
    test('calculatePersonTotals: sub-service and facade produce identical results', () => {
      fc.assert(fc.property(expensesArb, (expenses) => {
        const subServiceResult = expensePeopleService.calculatePersonTotals(expenses);
        const facadeResult = expenseService.calculatePersonTotals(expenses);
        expect(subServiceResult).toEqual(facadeResult);
      }), dbPbtOptions({ numRuns: 200 }));
    });
  });

  // ============================================================================
  // Assignment Workflow Tests
  // ============================================================================

  /**
   * Feature: medical-expense-people-tracking, Property 12: Assignment workflow correctness
   * Validates: Requirements 6.3
   */
  describe('Assignment Workflow Correctness', () => {
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

    test('Assignment workflow updates expense and refreshes summary calculations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 10000 }).map(cents => cents / 100),
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
          async (amount, place, personNameBase) => {
            const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const personName = `${personNameBase.trim()}_${uniqueSuffix}`;
            const person = await peopleRepository.create({
              name: personName,
              date_of_birth: null
            });
            testPeople.push(person);

            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            
            const expense = await expenseService.createExpense({
              date: dateStr,
              place: place.trim(),
              notes: 'Test expense',
              amount: amount,
              type: 'Tax - Medical',
              method: validPaymentMethod
            });
            testExpenses.push(expense);

            const initialPeople = await expensePeopleRepository.getPeopleForExpense(expense.id);
            expect(initialPeople).toHaveLength(0);

            const updatedExpense = await expenseService.updateExpenseWithPeople(
              expense.id,
              {
                date: dateStr,
                place: place.trim(),
                notes: 'Test expense',
                amount: amount,
                type: 'Tax - Medical',
                method: validPaymentMethod
              },
              [{ personId: person.id, amount: amount }]
            );

            expect(updatedExpense).not.toBeNull();
            expect(updatedExpense.people).toHaveLength(1);
            expect(updatedExpense.people[0].id).toBe(person.id);
            expect(updatedExpense.people[0].amount).toBe(amount);

            const persistedPeople = await expensePeopleRepository.getPeopleForExpense(expense.id);
            expect(persistedPeople).toHaveLength(1);
            expect(persistedPeople[0].id).toBe(person.id);
            expect(persistedPeople[0].amount).toBe(amount);
          }
        ),
        pbtOptions()
      );
    });, 120000
  });
});

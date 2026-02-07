/**
 * Property-Based Tests for People Service Equivalence
 * Feature: expense-service-refactor
 * Property 3: People grouping equivalence
 * Property 4: Person totals equivalence
 * Validates: Requirements 4.3
 *
 * For any array of expense objects with people allocation data,
 * calling the sub-service directly should return a result deeply equal
 * to calling through the facade.
 */
const fc = require('fast-check');
const { pbtOptions, safeAmount, safePlaceName } = require('../test/pbtArbitraries');
const expensePeopleService = require('./expensePeopleService');
const expenseService = require('./expenseService');

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

describe('ExpenseService - Property 3: People grouping equivalence', () => {
  /**
   * **Validates: Requirements 4.3**
   */
  test('groupExpensesByPerson: sub-service and facade produce identical results', () => {
    fc.assert(fc.property(expensesArb, (expenses) => {
      const subServiceResult = expensePeopleService.groupExpensesByPerson(expenses);
      const facadeResult = expenseService.groupExpensesByPerson(expenses);
      expect(subServiceResult).toEqual(facadeResult);
    }), pbtOptions({ numRuns: 200 }));
  });
});

describe('ExpenseService - Property 4: Person totals equivalence', () => {
  /**
   * **Validates: Requirements 4.3**
   */
  test('calculatePersonTotals: sub-service and facade produce identical results', () => {
    fc.assert(fc.property(expensesArb, (expenses) => {
      const subServiceResult = expensePeopleService.calculatePersonTotals(expenses);
      const facadeResult = expenseService.calculatePersonTotals(expenses);
      expect(subServiceResult).toEqual(facadeResult);
    }), pbtOptions({ numRuns: 200 }));
  });
});

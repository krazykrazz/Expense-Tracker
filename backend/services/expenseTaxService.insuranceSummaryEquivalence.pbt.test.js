/**
 * Property-Based Tests for Insurance Summary Equivalence
 * Feature: expense-service-refactor
 * Property 5: Insurance summary equivalence
 * Validates: Requirements 5.2
 *
 * For any array of medical expense objects, calling
 * expenseTaxService.calculateInsuranceSummary(expenses) should return a result
 * deeply equal to the original ExpenseService._calculateInsuranceSummary(expenses).
 */
const fc = require('fast-check');
const { pbtOptions, safeAmount } = require('../test/pbtArbitraries');
const expenseTaxService = require('./expenseTaxService');
const expenseService = require('./expenseService');

const CLAIM_STATUSES = ['not_claimed', 'in_progress', 'paid', 'denied'];

// Arbitrary for a single medical expense object with insurance-related fields
const medicalExpenseArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  date: fc.constantFrom('2024-01-15', '2024-06-20', '2024-11-03'),
  place: fc.constantFrom('Hospital A', 'Clinic B', 'Pharmacy C', 'Dr. Smith'),
  amount: safeAmount({ min: 0.01, max: 5000 }).map(a => parseFloat(a.toFixed(2))),
  type: fc.constant('Tax - Medical'),
  method: fc.constant('Cash'),
  insuranceEligible: fc.oneof(
    fc.constant(true),
    fc.constant(false),
    fc.constant(undefined),
    fc.constant(null),
    fc.constant(0),
    fc.constant(1)
  ),
  originalCost: fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    safeAmount({ min: 0.01, max: 5000 }).map(a => parseFloat(a.toFixed(2)))
  ),
  reimbursement: fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.constant(0),
    safeAmount({ min: 0.01, max: 2000 }).map(a => parseFloat(a.toFixed(2)))
  ),
  claimStatus: fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.constantFrom(...CLAIM_STATUSES)
  )
});

// Generate arrays of medical expenses
const medicalExpensesArb = fc.array(medicalExpenseArb, { minLength: 0, maxLength: 20 });

describe('ExpenseService - Property 5: Insurance summary equivalence', () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * For any array of medical expense objects, the sub-service
   * calculateInsuranceSummary and the facade _calculateInsuranceSummary
   * must produce deeply equal results.
   */
  test('calculateInsuranceSummary: sub-service and facade produce identical results', () => {
    fc.assert(fc.property(medicalExpensesArb, (expenses) => {
      const subServiceResult = expenseTaxService.calculateInsuranceSummary(expenses);
      const facadeResult = expenseService._calculateInsuranceSummary(expenses);
      expect(subServiceResult).toEqual(facadeResult);
    }), pbtOptions({ numRuns: 200 }));
  });
});

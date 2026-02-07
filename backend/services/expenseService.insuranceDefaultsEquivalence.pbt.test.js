/**
 * Property-Based Tests for Insurance Defaults Equivalence
 * Feature: expense-service-refactor
 * Property 2: Insurance defaults equivalence
 * Validates: Requirements 3.3
 *
 * For any expense data object, calling expenseInsuranceService.applyInsuranceDefaults(data)
 * should return a result deeply equal to the original ExpenseService._applyInsuranceDefaults(data).
 */
const fc = require('fast-check');
const { pbtOptions, safeAmount } = require('../test/pbtArbitraries');
const { CATEGORIES } = require('../utils/categories');
const expenseInsuranceService = require('./expenseInsuranceService');
const expenseService = require('./expenseService');

const CLAIM_STATUSES = ['not_claimed', 'in_progress', 'paid', 'denied'];

const expenseDataArb = fc.record({
  type: fc.oneof(fc.constantFrom(...CATEGORIES)),
  insurance_eligible: fc.oneof(fc.constant(true), fc.constant(false), fc.constant(0), fc.constant(1), fc.constant(undefined), fc.constant(null)),
  claim_status: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constantFrom(...CLAIM_STATUSES)),
  original_cost: fc.oneof(fc.constant(undefined), fc.constant(null), safeAmount({ min: 0.01, max: 5000 }).map(a => parseFloat(a.toFixed(2)))),
  amount: safeAmount({ min: 0.01, max: 5000 }).map(a => parseFloat(a.toFixed(2))),
  date: fc.constant('2024-06-15'),
  place: fc.constant('Test Place')
});

describe('ExpenseService - Property 2: Insurance defaults equivalence', () => {
  test('applyInsuranceDefaults: sub-service and facade produce identical results', () => {
    fc.assert(fc.property(expenseDataArb, (data) => {
      const subServiceResult = expenseInsuranceService.applyInsuranceDefaults(data);
      const facadeResult = expenseService._applyInsuranceDefaults(data);
      expect(subServiceResult).toEqual(facadeResult);
    }), pbtOptions({ numRuns: 200 }));
  });
});

/**
 * Property-Based Tests for Validation Equivalence
 * Feature: expense-service-refactor
 * Property 1: Validation equivalence
 * Validates: Requirements 2.3, 2.4
 */
const fc = require('fast-check');
const { pbtOptions, safePlaceName, safeAmount } = require('../test/pbtArbitraries');
const { CATEGORIES } = require('../utils/categories');
const expenseValidationService = require('./expenseValidationService');
const expenseService = require('./expenseService');

function capture(fn) {
  try { fn(); return { ok: true, error: null }; }
  catch (e) { return { ok: false, error: e.message }; }
}

const safeDateStr = fc.date({ min: new Date('2020-01-01T00:00:00.000Z'), max: new Date('2025-12-31T00:00:00.000Z') })
  .filter(d => !isNaN(d.getTime()))
  .map(d => d.toISOString().split('T')[0]);

const expenseArb = fc.record({
  date: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(''), fc.constant('not-a-date'),
    safeDateStr),
  amount: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(-5), fc.constant(0), fc.constant(10.123),
    safeAmount({ min: 0.01, max: 9999 }).map(a => parseFloat(a.toFixed(2)))),
  type: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(''), fc.constant('InvalidCat'), fc.constantFrom(...CATEGORIES)),
  method: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant('Cash'), fc.constant('Debit')),
  payment_method_id: fc.oneof(fc.constant(undefined), fc.constant(null), fc.integer({ min: 1, max: 10 })),
  place: fc.oneof(fc.constant(undefined), safePlaceName({ maxLength: 50 }), fc.string({ minLength: 201, maxLength: 210 })),
  notes: fc.oneof(fc.constant(undefined), fc.constant(''), fc.string({ minLength: 201, maxLength: 210 }))
});

describe('ExpenseService - Property 1: Validation equivalence', () => {
  test('validateExpense: facade and sub-service produce identical results', () => {
    fc.assert(fc.property(expenseArb, (expense) => {
      expect(capture(() => expenseValidationService.validateExpense(expense)))
        .toEqual(capture(() => expenseService.validateExpense(expense)));
    }), pbtOptions({ numRuns: 200 }));
  });

  test('isValidDate: facade and sub-service produce identical results', () => {
    const dateArb = fc.oneof(fc.constant('2024-01-15'), fc.constant('not-a-date'), fc.constant(''),
      safeDateStr,
      fc.string({ minLength: 0, maxLength: 20 }));
    fc.assert(fc.property(dateArb, (ds) => {
      expect(expenseValidationService.isValidDate(ds)).toEqual(expenseService.isValidDate(ds));
    }), pbtOptions({ numRuns: 200 }));
  });

  test('validatePostedDate: facade and sub-service produce identical results', () => {
    const pdArb = fc.record({
      date: fc.oneof(fc.constant('2024-06-15'),
        safeDateStr),
      posted_date: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(''), fc.constant('bad-date'),
        fc.constant('2024-01-01'), fc.constant('2024-12-31'),
        safeDateStr)
    });
    fc.assert(fc.property(pdArb, (exp) => {
      expect(capture(() => expenseValidationService.validatePostedDate(exp)))
        .toEqual(capture(() => expenseService.validatePostedDate(exp)));
    }), pbtOptions({ numRuns: 200 }));
  });

  test('validateInsuranceData: facade and sub-service produce identical results', () => {
    const insArb = fc.oneof(fc.constant(null), fc.constant(undefined), fc.record({
      claim_status: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant('invalid'),
        fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied')),
      original_cost: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(-10),
        safeAmount({ min: 0, max: 500 }).map(a => parseFloat(a.toFixed(2))))
    }));
    const amtArb = fc.oneof(fc.constant(0), safeAmount({ min: 0.01, max: 1000 }).map(a => parseFloat(a.toFixed(2))));
    fc.assert(fc.property(insArb, amtArb, (data, amt) => {
      expect(capture(() => expenseValidationService.validateInsuranceData(data, amt)))
        .toEqual(capture(() => expenseService.validateInsuranceData(data, amt)));
    }), pbtOptions({ numRuns: 200 }));
  });

  test('validateReimbursement: facade and sub-service produce identical results', () => {
    const rArb = fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(''), fc.constant(0), fc.constant(-5),
      safeAmount({ min: 0.01, max: 500 }).map(a => parseFloat(a.toFixed(2))));
    const oArb = safeAmount({ min: 0.01, max: 1000 }).map(a => parseFloat(a.toFixed(2)));
    fc.assert(fc.property(rArb, oArb, (r, o) => {
      expect(capture(() => expenseValidationService.validateReimbursement(r, o)))
        .toEqual(capture(() => expenseService.validateReimbursement(r, o)));
    }), pbtOptions({ numRuns: 200 }));
  });
});

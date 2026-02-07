/**
 * Property-Based Tests for Facade API Surface Completeness
 * Feature: expense-service-refactor
 * Property 6: Facade API surface completeness
 * Validates: Requirements 1.1, 1.3
 *
 * For all public method names on the original ExpenseService instance
 * (captured before refactoring), the refactored facade instance should
 * have a method with the same name and the same arity.
 */
const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');

/**
 * Complete expected API surface of the ExpenseService facade.
 * Each entry is [methodName, arity] where arity is the number of
 * declared parameters (Function.length) on the original monolithic service.
 *
 * This list was captured from the original ExpenseService before refactoring
 * and covers all public, delegated, and private-but-exposed methods.
 */
const EXPECTED_API_SURFACE = [
  // ─── Validation methods (delegated to expenseValidationService) ───
  ['validateExpense', 1],
  ['isValidDate', 1],
  ['validatePostedDate', 1],
  ['validateInsuranceData', 2],
  ['validateReimbursement', 2],
  ['validateInsurancePersonAllocations', 1],
  ['validatePersonAllocations', 2],

  // ─── Insurance methods (delegated to expenseInsuranceService) ───
  ['updateInsuranceStatus', 2],
  ['updateInsuranceEligibility', 2],  // 3rd param has default
  ['_applyInsuranceDefaults', 1],

  // ─── Core CRUD methods ───
  ['createExpense', 1],   // 2nd param has default
  ['getExpenses', 0],     // 1st param has default
  ['getExpenseById', 1],
  ['updateExpense', 2],   // 3rd param has default
  ['deleteExpense', 1],

  // ─── Core CRUD private helpers ───
  ['_createSingleExpense', 1],
  ['_resolvePaymentMethod', 1],
  ['_processReimbursement', 1],
  ['_updateCreditCardBalanceOnCreate', 3],
  ['_updateCreditCardBalanceOnDelete', 3],
  ['_calculateFutureDate', 2],
  ['_validateFutureMonths', 1],
  ['_isFutureDate', 1],
  ['_getEffectivePostingDate', 1],
  ['_triggerBudgetRecalculation', 2],
  ['_validatePeopleExist', 1],

  // ─── Aggregation methods (delegated to expenseAggregationService) ───
  ['getSummary', 2],          // 3rd param has default
  ['_getMonthSummary', 2],
  ['_calculatePreviousMonth', 2],
  ['getMonthlyGross', 2],
  ['setMonthlyGross', 3],
  ['getAnnualSummary', 1],
  ['_getYearEndInvestmentValues', 1],
  ['_getYearEndLoanBalances', 1],
  ['_getMonthlyVariableExpenses', 1],
  ['_getMonthlyFixedExpenses', 1],
  ['_getMonthlyIncome', 1],
  ['_getTransactionCount', 1],
  ['getExpensesByCategory', 3],
  ['_getCategoryTotals', 1],
  ['getExpensesByPaymentMethod', 3],
  ['_getMethodTotals', 1],
  ['_buildAnnualSummary', 6],
  ['_createMonthMap', 1],
  ['_buildMonthlyTotals', 3],
  ['_arrayToObject', 2],

  // ─── Tax methods (delegated to expenseTaxService) ───
  ['getTaxDeductibleSummary', 1],
  ['getTaxDeductibleYoYSummary', 1],
  ['_calculateInsuranceSummary', 1],
  ['getTaxDeductibleWithPeople', 1],

  // ─── People methods (delegated to expensePeopleService) ───
  ['groupExpensesByPerson', 1],
  ['calculatePersonTotals', 1],
  ['handleUnassignedExpenses', 1],
  ['createExpenseWithPeople', 1],   // 2nd & 3rd params have defaults
  ['updateExpenseWithPeople', 2],   // 3rd & 4th params have defaults
  ['getExpenseWithPeople', 1],

  // ─── Category methods (delegated to expenseCategoryService) ───
  ['getDistinctPlaces', 0],
  ['getSuggestedCategory', 1],
];

// Build a fast-check arbitrary that picks from the expected method list
const methodEntryArb = fc.constantFrom(...EXPECTED_API_SURFACE);

describe('ExpenseService - Property 6: Facade API surface completeness', () => {
  /**
   * **Validates: Requirements 1.1, 1.3**
   *
   * For all public method names on the original ExpenseService instance,
   * the refactored facade instance should have a method with the same
   * name and the same arity (Function.length).
   */
  test('every expected method exists on the facade as a function with correct arity', () => {
    fc.assert(fc.property(methodEntryArb, ([methodName, expectedArity]) => {
      // Method must exist on the facade
      expect(typeof expenseService[methodName]).toBe('function');
      // Method must have the same arity (number of non-default parameters)
      expect(expenseService[methodName].length).toBe(expectedArity);
    }), pbtOptions({ numRuns: 200 }));
  });

  /**
   * Exhaustive check: verify every single expected method is present.
   * This complements the property test by ensuring no method is missed
   * due to random sampling.
   */
  test('facade exposes all expected methods (exhaustive)', () => {
    const missing = [];
    const wrongArity = [];

    for (const [methodName, expectedArity] of EXPECTED_API_SURFACE) {
      if (typeof expenseService[methodName] !== 'function') {
        missing.push(methodName);
      } else if (expenseService[methodName].length !== expectedArity) {
        wrongArity.push(
          `${methodName}: expected arity ${expectedArity}, got ${expenseService[methodName].length}`
        );
      }
    }

    expect(missing).toEqual([]);
    expect(wrongArity).toEqual([]);
  });

  /**
   * Verify the facade has no fewer methods than expected.
   * The total count of expected methods should all be present.
   */
  test('facade has at least as many methods as the expected API surface', () => {
    const facadeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(expenseService))
      .filter(name => name !== 'constructor' && typeof expenseService[name] === 'function');

    // Every expected method must be in the facade
    for (const [methodName] of EXPECTED_API_SURFACE) {
      expect(facadeMethods).toContain(methodName);
    }
  });
});

/**
 * @invariant Validation Logic
 * 
 * This file consolidates property-based tests for expense service validation operations:
 * - Facade API Surface: All expected methods exist with correct arity
 * - Posted Date Validation: Posted date ordering rules (posted_date >= transaction date)
 * - Validation Equivalence: Sub-service and facade produce identical validation results
 * 
 * Randomization validates that API surface contracts hold, posted date validation works across
 * date ranges, and validation logic is consistent between facade and sub-services.
 * 
 * Consolidated from:
 * - expenseService.facadeApiSurface.pbt.test.js
 * - expenseService.postedDateValidation.pbt.test.js
 * - expenseService.validationEquivalence.pbt.test.js
 */

const fc = require('fast-check');
const { dbPbtOptions, safePlaceName, safeAmount } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const expenseValidationService = require('./expenseValidationService');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

describe('ExpenseService - Validation Logic PBT', () => {
  // ============================================================================
  // Facade API Surface Tests
  // ============================================================================

  /**
   * Complete expected API surface of the ExpenseService facade.
   * Feature: expense-service-refactor, Property 6: Facade API surface completeness
   * Validates: Requirements 1.1, 1.3
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
    ['updateInsuranceEligibility', 2],
    ['_applyInsuranceDefaults', 1],

    // ─── Core CRUD methods ───
    ['createExpense', 1],
    ['getExpenses', 0],
    ['getExpenseById', 1],
    ['updateExpense', 2],
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
    ['getSummary', 2],
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
    ['createExpenseWithPeople', 1],
    ['updateExpenseWithPeople', 2],
    ['getExpenseWithPeople', 1],

    // ─── Category methods (delegated to expenseCategoryService) ───
    ['getDistinctPlaces', 0],
    ['getSuggestedCategory', 1],
  ];

  const methodEntryArb = fc.constantFrom(...EXPECTED_API_SURFACE);

  describe('Facade API Surface Completeness', () => {
    test('Property 6: every expected method exists on the facade as a function with correct arity', () => {
      fc.assert(fc.property(methodEntryArb, ([methodName, expectedArity]) => {
        // Method must exist on the facade
        expect(typeof expenseService[methodName]).toBe('function');
        // Method must have the same arity (number of non-default parameters)
        expect(expenseService[methodName].length).toBe(expectedArity);
      }), dbPbtOptions({ numRuns: 200 }));
    });

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

    test('facade has at least as many methods as the expected API surface', () => {
      const facadeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(expenseService))
        .filter(name => name !== 'constructor' && typeof expenseService[name] === 'function');

      // Every expected method must be in the facade
      for (const [methodName] of EXPECTED_API_SURFACE) {
        expect(facadeMethods).toContain(methodName);
      }
    });
  });

  // ============================================================================
  // Posted Date Validation Tests
  // ============================================================================

  /**
   * Feature: credit-card-posted-date, Property 9: Posted Date Ordering Validation
   * Validates: Requirements 4.5, 4.6
   */
  describe('Posted Date Ordering Validation', () => {
    let db;
    const createdIds = [];

    beforeAll(async () => {
      db = await getDatabase();
    });

    afterAll(async () => {
      // Clean up any expenses that were created
      for (const id of createdIds) {
        try {
          await expenseService.deleteExpense(id);
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    });

    const validDateArb = fc.integer({ min: 2020, max: 2025 }).chain(year =>
      fc.integer({ min: 1, max: 12 }).chain(month =>
        fc.integer({ min: 1, max: 28 }).map(day =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        )
      )
    );

    const invalidDatePairArb = validDateArb.chain(transactionDate => {
      const [year, month, day] = transactionDate.split('-').map(Number);
      
      return fc.integer({ min: 1, max: 365 }).map(daysBefore => {
        const txDate = new Date(year, month - 1, day);
        txDate.setDate(txDate.getDate() - daysBefore);
        const postedDate = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
        return { date: transactionDate, posted_date: postedDate };
      });
    });

    const validDatePairArb = validDateArb.chain(transactionDate => {
      const [year, month, day] = transactionDate.split('-').map(Number);
      
      return fc.oneof(
        fc.constant({ date: transactionDate, posted_date: transactionDate }),
        fc.integer({ min: 1, max: 30 }).map(daysAfter => {
          const txDate = new Date(year, month - 1, day);
          txDate.setDate(txDate.getDate() + daysAfter);
          const postedDate = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
          return { date: transactionDate, posted_date: postedDate };
        })
      );
    });

    test('Property 9: API rejects posted_date before transaction date on create', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidDatePairArb,
          safePlaceName().map(s => `PBT_Invalid_${s.substring(0, 20)}`),
          safeAmount({ min: 0.01, max: 1000 }),
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom('Cash', 'Debit', 'Cheque'),
          async (datePair, place, amount, type, method) => {
            const expenseData = {
              date: datePair.date,
              posted_date: datePair.posted_date,
              place,
              amount: parseFloat(amount.toFixed(2)),
              type,
              method
            };

            expect(datePair.posted_date < datePair.date).toBe(true);

            await expect(expenseService.createExpense(expenseData))
              .rejects
              .toThrow('Posted date cannot be before transaction date');
          }
        ),
        dbPbtOptions({ numRuns: 50 })
      );
    }, 60000);

    test('Property 9: API rejects posted_date before transaction date on update', async () => {
      await fc.assert(
        fc.asyncProperty(
          validDatePairArb,
          invalidDatePairArb,
          safePlaceName().map(s => `PBT_UpdateInvalid_${s.substring(0, 15)}`),
          safeAmount({ min: 0.01, max: 1000 }),
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom('Cash', 'Debit', 'Cheque'),
          async (validDatePair, invalidDatePair, place, amount, type, method) => {
            const validExpenseData = {
              date: validDatePair.date,
              posted_date: validDatePair.posted_date,
              place,
              amount: parseFloat(amount.toFixed(2)),
              type,
              method
            };

            const created = await expenseService.createExpense(validExpenseData);
            createdIds.push(created.id);

            const invalidUpdateData = {
              date: invalidDatePair.date,
              posted_date: invalidDatePair.posted_date,
              place,
              amount: parseFloat(amount.toFixed(2)),
              type,
              method
            };

            expect(invalidDatePair.posted_date < invalidDatePair.date).toBe(true);

            await expect(expenseService.updateExpense(created.id, invalidUpdateData))
              .rejects
              .toThrow('Posted date cannot be before transaction date');

            const retrieved = await expenseService.getExpenseById(created.id);
            if (validDatePair.posted_date === null) {
              expect(retrieved.posted_date).toBeNull();
            } else {
              expect(retrieved.posted_date).toBe(validDatePair.posted_date);
            }
          }
        ),
        dbPbtOptions({ numRuns: 30 })
      );
    }, 90000);

    test('Property 9 Complement: API accepts posted_date >= transaction date', async () => {
      await fc.assert(
        fc.asyncProperty(
          validDatePairArb,
          safePlaceName().map(s => `PBT_Valid_${s.substring(0, 20)}`),
          safeAmount({ min: 0.01, max: 1000 }),
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom('Cash', 'Debit', 'Cheque'),
          async (datePair, place, amount, type, method) => {
            const expenseData = {
              date: datePair.date,
              posted_date: datePair.posted_date,
              place,
              amount: parseFloat(amount.toFixed(2)),
              type,
              method
            };

            expect(datePair.posted_date >= datePair.date).toBe(true);

            const created = await expenseService.createExpense(expenseData);
            createdIds.push(created.id);

            expect(created).toBeDefined();
            expect(created.id).toBeDefined();
            expect(created.posted_date).toBe(datePair.posted_date);
          }
        ),
        dbPbtOptions({ numRuns: 30 })
      );
    }, 60000);
  });

  // ============================================================================
  // Validation Equivalence Tests
  // ============================================================================

  /**
   * Feature: expense-service-refactor, Property 1: Validation equivalence
   * Validates: Requirements 2.3, 2.4
   */
  describe('Validation Equivalence', () => {
    function capture(fn) {
      try { fn(); return { ok: true, error: null }; }
      catch (e) { return { ok: false, error: e.message }; }
    }

    const safeDateStr = fc.date({ min: new Date('2020-01-01T00:00:00.000Z'), max: new Date('2025-12-31T00:00:00.000Z') })
      .filter(d => !isNaN(d.getTime()))
      .map(d => d.toISOString().split('T')[0]);

    const expenseArb = fc.record({
      date: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(''), fc.constant('not-a-date'), safeDateStr),
      amount: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(-5), fc.constant(0), fc.constant(10.123),
        safeAmount({ min: 0.01, max: 9999 }).map(a => parseFloat(a.toFixed(2)))),
      type: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(''), fc.constant('InvalidCat'), fc.constantFrom(...CATEGORIES)),
      method: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant('Cash'), fc.constant('Debit')),
      payment_method_id: fc.oneof(fc.constant(undefined), fc.constant(null), fc.integer({ min: 1, max: 10 })),
      place: fc.oneof(fc.constant(undefined), safePlaceName({ maxLength: 50 }), fc.string({ minLength: 201, maxLength: 210 })),
      notes: fc.oneof(fc.constant(undefined), fc.constant(''), fc.string({ minLength: 201, maxLength: 210 }))
    });

    test('validateExpense: facade and sub-service produce identical results', () => {
      fc.assert(fc.property(expenseArb, (expense) => {
        expect(capture(() => expenseValidationService.validateExpense(expense)))
          .toEqual(capture(() => expenseService.validateExpense(expense)));
      }), dbPbtOptions({ numRuns: 200 }));
    });

    test('isValidDate: facade and sub-service produce identical results', () => {
      const dateArb = fc.oneof(fc.constant('2024-01-15'), fc.constant('not-a-date'), fc.constant(''),
        safeDateStr, fc.string({ minLength: 0, maxLength: 20 }));
      fc.assert(fc.property(dateArb, (ds) => {
        expect(expenseValidationService.isValidDate(ds)).toEqual(expenseService.isValidDate(ds));
      }), dbPbtOptions({ numRuns: 200 }));
    });

    test('validatePostedDate: facade and sub-service produce identical results', () => {
      const pdArb = fc.record({
        date: fc.oneof(fc.constant('2024-06-15'), safeDateStr),
        posted_date: fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(''), fc.constant('bad-date'),
          fc.constant('2024-01-01'), fc.constant('2024-12-31'), safeDateStr)
      });
      fc.assert(fc.property(pdArb, (exp) => {
        expect(capture(() => expenseValidationService.validatePostedDate(exp)))
          .toEqual(capture(() => expenseService.validatePostedDate(exp)));
      }), dbPbtOptions({ numRuns: 200 }));
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
      }), dbPbtOptions({ numRuns: 200 }));
    });

    test('validateReimbursement: facade and sub-service produce identical results', () => {
      const rArb = fc.oneof(fc.constant(undefined), fc.constant(null), fc.constant(''), fc.constant(0), fc.constant(-5),
        safeAmount({ min: 0.01, max: 500 }).map(a => parseFloat(a.toFixed(2))));
      const oArb = safeAmount({ min: 0.01, max: 1000 }).map(a => parseFloat(a.toFixed(2)));
      fc.assert(fc.property(rArb, oArb, (r, o) => {
        expect(capture(() => expenseValidationService.validateReimbursement(r, o)))
          .toEqual(capture(() => expenseService.validateReimbursement(r, o)));
      }), dbPbtOptions({ numRuns: 200 }));
    }, 120000);
  });
});

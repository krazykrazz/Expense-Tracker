/**
 * @invariant Insurance Claims and Reimbursement
 * 
 * This file consolidates property-based tests for expense service insurance operations:
 * - Insurance Validation: Claim status enum validation and amount validation
 * - Insurance Defaults Equivalence: Sub-service and facade produce identical defaults
 * - Reimbursement Validation: Reimbursement cannot exceed expense amount
 * - Posted Date API: Posted date acceptance and response in API operations
 * 
 * Randomization validates that insurance status persists, reimbursement calculations
 * are correct, posted dates interact properly with insurance claims, and API responses
 * include all required fields.
 * 
 * Consolidated from:
 * - expenseService.insurance.pbt.test.js
 * - expenseService.insuranceDefaultsEquivalence.pbt.test.js
 * - expenseService.reimbursement.pbt.test.js
 * - expenseService.postedDate.pbt.test.js
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, safePlaceName } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const expenseInsuranceService = require('./expenseInsuranceService');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

describe('ExpenseService - Insurance Claims and Reimbursement PBT', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  // ============================================================================
  // Insurance Validation Tests
  // ============================================================================

  const validClaimStatusArb = fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied');
  const invalidClaimStatusArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => !['not_claimed', 'in_progress', 'paid', 'denied', null, undefined].includes(s));

  /**
   * Feature: medical-insurance-tracking, Property 4: Claim Status Enum Validation
   * Validates: Requirements 2.2
   */
  describe('Claim Status Enum Validation', () => {
    test('Property 4: should accept all valid claim status values', () => {
      return fc.assert(
        fc.property(
          validClaimStatusArb,
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (claimStatus, amount) => {
            expect(() => {
              expenseService.validateInsuranceData(
                { claim_status: claimStatus, original_cost: amount * 2 },
                amount
              );
            }).not.toThrow();
          }
        ),
        pbtOptions()
      );
    });

    test('should accept null claim status', () => {
      return fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (amount) => {
            expect(() => {
              expenseService.validateInsuranceData(
                { claim_status: null, original_cost: amount * 2 },
                amount
              );
            }).not.toThrow();
          }
        ),
        pbtOptions()
      );
    });

    test('should reject invalid claim status values', () => {
      return fc.assert(
        fc.property(
          invalidClaimStatusArb,
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (invalidStatus, amount) => {
            expect(() => {
              expenseService.validateInsuranceData(
                { claim_status: invalidStatus, original_cost: amount * 2 },
                amount
              );
            }).toThrow(/Claim status must be one of/);
          }
        ),
        pbtOptions()
      );
    });

    test('should handle undefined insurance data gracefully', () => {
      expect(() => {
        expenseService.validateInsuranceData(undefined, 100);
      }).not.toThrow();

      expect(() => {
        expenseService.validateInsuranceData(null, 100);
      }).not.toThrow();
    });
  });

  /**
   * Feature: medical-insurance-tracking, Property 5: Amount Validation Invariant
   * Validates: Requirements 3.5, 4.4
   */
  describe('Amount Validation Invariant', () => {
    test('Property 5: should accept amount <= original_cost', () => {
      return fc.assert(
        fc.property(
          fc.double({ min: 10, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (originalCost) => {
            const amount = Math.round((originalCost * Math.random()) * 100) / 100;
            expect(() => {
              expenseService.validateInsuranceData(
                { original_cost: originalCost },
                amount
              );
            }).not.toThrow();
          }
        ),
        pbtOptions()
      );
    });

    test('should accept amount equal to original_cost', () => {
      return fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (amount) => {
            expect(() => {
              expenseService.validateInsuranceData(
                { original_cost: amount },
                amount
              );
            }).not.toThrow();
          }
        ),
        pbtOptions()
      );
    });

    test('should reject amount > original_cost', () => {
      return fc.assert(
        fc.property(
          fc.double({ min: 10, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (originalCost) => {
            const amount = originalCost + 0.01;
            expect(() => {
              expenseService.validateInsuranceData(
                { original_cost: originalCost },
                amount
              );
            }).toThrow();
          }
        ),
        pbtOptions()
      );
    });
  });

  // ============================================================================
  // Insurance Defaults Equivalence Tests
  // ============================================================================

  /**
   * Feature: expense-service-refactor, Property 2: Insurance defaults equivalence
   * Validates: Requirements 3.3
   */
  describe('Insurance Defaults Equivalence', () => {
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

    test('Property 2: applyInsuranceDefaults - sub-service and facade produce identical results', () => {
      fc.assert(fc.property(expenseDataArb, (data) => {
        const subServiceResult = expenseInsuranceService.applyInsuranceDefaults(data);
        const facadeResult = expenseService._applyInsuranceDefaults(data);
        expect(subServiceResult).toEqual(facadeResult);
      }), pbtOptions({ numRuns: 200 }));
    });
  });

  // ============================================================================
  // Reimbursement Validation Tests
  // ============================================================================

  /**
   * Feature: generic-expense-reimbursement, Property 1: Reimbursement Validation
   * Validates: Requirements 1.3
   */
  describe('Reimbursement Validation', () => {
    test('Property 1: should accept valid reimbursements (reimbursement <= amount)', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 1000000 }),
          fc.integer({ min: 0, max: 100 }),
          (amountCents, reimbursementPercent) => {
            const amount = parseFloat((amountCents / 100).toFixed(2));
            const reimbursement = parseFloat((amount * reimbursementPercent / 100).toFixed(2));
            
            expect(() => {
              expenseService.validateReimbursement(reimbursement, amount);
            }).not.toThrow();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('should reject reimbursements that exceed the expense amount', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 999900 }),
          fc.integer({ min: 1, max: 100000 }),
          (amountCents, excessCents) => {
            const amount = parseFloat((amountCents / 100).toFixed(2));
            const reimbursement = parseFloat(((amountCents + excessCents) / 100).toFixed(2));
            
            expect(() => {
              expenseService.validateReimbursement(reimbursement, amount);
            }).toThrow('Reimbursement cannot exceed the expense amount');
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('should reject negative reimbursements', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 1000000 }),
          fc.integer({ min: -1000000, max: -1 }),
          (amountCents, negativeReimbursementCents) => {
            const amount = parseFloat((amountCents / 100).toFixed(2));
            const negativeReimbursement = parseFloat((negativeReimbursementCents / 100).toFixed(2));
            
            expect(() => {
              expenseService.validateReimbursement(negativeReimbursement, amount);
            }).toThrow('Reimbursement must be a non-negative number');
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });

    test('should accept zero, null, undefined, or empty string reimbursements', () => {
      const amount = 100;
      
      expect(() => expenseService.validateReimbursement(0, amount)).not.toThrow();
      expect(() => expenseService.validateReimbursement(null, amount)).not.toThrow();
      expect(() => expenseService.validateReimbursement(undefined, amount)).not.toThrow();
      expect(() => expenseService.validateReimbursement('', amount)).not.toThrow();
    });

    test('should accept full reimbursement (reimbursement equals amount)', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000000 }),
          (amountCents) => {
            const amount = parseFloat((amountCents / 100).toFixed(2));
            const reimbursement = amount;
            
            expect(() => {
              expenseService.validateReimbursement(reimbursement, amount);
            }).not.toThrow();
          }
        ),
        pbtOptions({ numRuns: 100 })
      );
    });
  });

  // ============================================================================
  // Posted Date API Tests
  // ============================================================================

  /**
   * Feature: credit-card-posted-date, Properties 6 & 7: API Posted Date Acceptance and Response
   * Validates: Requirements 4.1, 4.2, 4.3
   */
  describe('Posted Date API Round-Trip', () => {
    const createdIds = [];

    afterAll(async () => {
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

    const validDatePairArb = validDateArb.chain(transactionDate => {
      const [year, month, day] = transactionDate.split('-').map(Number);
      
      return fc.oneof(
        fc.constant({ date: transactionDate, posted_date: null }),
        fc.constant({ date: transactionDate, posted_date: transactionDate }),
        fc.integer({ min: 1, max: 30 }).map(daysAfter => {
          const txDate = new Date(year, month - 1, day);
          txDate.setDate(txDate.getDate() + daysAfter);
          const postedDate = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
          return { date: transactionDate, posted_date: postedDate };
        })
      );
    });

    test('Property 6: API accepts valid posted_date values on create', async () => {
      await fc.assert(
        fc.asyncProperty(
          validDatePairArb,
          safePlaceName().map(s => `PBT_PostedDate_${s.substring(0, 20)}`),
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

            const created = await expenseService.createExpense(expenseData);
            createdIds.push(created.id);

            expect(created).toBeDefined();
            expect(created.id).toBeDefined();
            
            if (datePair.posted_date === null) {
              expect(created.posted_date).toBeNull();
            } else {
              expect(created.posted_date).toBe(datePair.posted_date);
            }
          }
        ),
        pbtOptions({ numRuns: 50 })
      );
    }, 60000);

    test('Property 7: API response includes posted_date on retrieval', async () => {
      await fc.assert(
        fc.asyncProperty(
          validDatePairArb,
          safePlaceName().map(s => `PBT_Retrieve_${s.substring(0, 20)}`),
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

            const created = await expenseService.createExpense(expenseData);
            createdIds.push(created.id);

            const retrieved = await expenseService.getExpenseById(created.id);

            expect(retrieved).toBeDefined();
            expect(retrieved).toHaveProperty('posted_date');
            
            if (datePair.posted_date === null) {
              expect(retrieved.posted_date).toBeNull();
            } else {
              expect(retrieved.posted_date).toBe(datePair.posted_date);
            }
          }
        ),
        pbtOptions({ numRuns: 50 })
      );
    }, 60000);
  });
});

/**
 * Property-Based Tests for Balance Entry Auto-Population
 *
 * Feature: fixed-interest-rate-loans
 * Tests Property 3: Auto-Population Round Trip
 * Tests Property 4: Variable Rate Requires Explicit Rate
 *
 * Property 3: For any loan with a non-NULL fixed_interest_rate, creating a balance
 * entry without specifying a rate should result in the balance entry having `rate`
 * equal to the loan's `fixed_interest_rate`.
 *
 * Property 4: For any loan with NULL fixed_interest_rate, creating a balance entry
 * without specifying a rate must result in a validation error.
 *
 * **Validates: Requirements 2.2, 2.3, 5.4, 5.5, 6.3**
 */

const fc = require('fast-check');
const { createTestDatabase, resetTestDatabase } = require('../database/db');
const loanService = require('../services/loanService');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const loanBalanceController = require('./loanBalanceController');
const { dbPbtOptions, safeString, safeAmount, safeDate, monthNumber, year } = require('../test/pbtArbitraries');

/**
 * Arbitrary for valid loan data with loan_type='loan'
 */
const validLoanArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 100, max: 1000000 }),
  start_date: safeDate(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constant('loan')
});

/**
 * Arbitrary for valid fixed interest rates (non-negative)
 */
const validFixedRateArb = fc.float({ min: 0, max: 30, noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n >= 0);

/**
 * Arbitrary for valid balance amounts
 */
const validBalanceArb = safeAmount({ min: 0, max: 1000000 });

/**
 * Mock response object for controller testing
 */
function createMockResponse() {
  const res = {
    statusCode: null,
    body: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

/**
 * Mock request object for controller testing
 */
function createMockRequest(body) {
  return { body };
}

describe('LoanBalanceController Auto-Population Property Tests', () => {
  const createdLoanIds = [];

  beforeAll(async () => {
    await createTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterEach(async () => {
    // Clean up created loans
    for (const id of createdLoanIds) {
      try {
        await loanRepository.delete(id);
      } catch (e) {
        // Ignore errors
      }
    }
    createdLoanIds.length = 0;
  });

  /**
   * Property 3: Auto-Population Round Trip
   *
   * For any loan with a non-NULL fixed_interest_rate, creating a balance entry
   * without specifying a rate should result in the balance entry having `rate`
   * equal to the loan's `fixed_interest_rate`.
   *
   * **Validates: Requirements 2.2, 5.4**
   */
  describe('Property 3: Auto-Population Round Trip', () => {
    test('Creating balance entry without rate for fixed-rate loan should auto-populate rate', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validFixedRateArb,
          validBalanceArb,
          year(),
          monthNumber,
          async (loanData, fixedRate, balance, testYear, testMonth) => {
            // Create a loan with fixed_interest_rate
            const loanWithRate = { ...loanData, fixed_interest_rate: fixedRate };
            const createdLoan = await loanService.createLoan(loanWithRate);
            createdLoanIds.push(createdLoan.id);

            // Create balance entry WITHOUT specifying rate
            const req = createMockRequest({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance
              // Note: rate is NOT provided
            });
            const res = createMockResponse();

            await loanBalanceController.createOrUpdateBalance(req, res);

            // Should succeed with status 201
            expect(res.statusCode).toBe(201);
            expect(res.body).not.toBeNull();

            // The rate should be auto-populated from fixed_interest_rate
            expect(res.body.rate).toBeCloseTo(fixedRate, 5);

            // Verify in database
            const balanceEntry = await loanBalanceRepository.findByLoanAndMonth(
              createdLoan.id, testYear, testMonth
            );
            expect(balanceEntry).not.toBeNull();
            expect(balanceEntry.rate).toBeCloseTo(fixedRate, 5);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Creating balance entry with explicit rate for fixed-rate loan should use provided rate', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validFixedRateArb,
          validFixedRateArb,
          validBalanceArb,
          year(),
          monthNumber,
          async (loanData, fixedRate, explicitRate, balance, testYear, testMonth) => {
            // Create a loan with fixed_interest_rate
            const loanWithRate = { ...loanData, fixed_interest_rate: fixedRate };
            const createdLoan = await loanService.createLoan(loanWithRate);
            createdLoanIds.push(createdLoan.id);

            // Create balance entry WITH explicit rate
            const req = createMockRequest({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance,
              rate: explicitRate // Explicit rate provided
            });
            const res = createMockResponse();

            await loanBalanceController.createOrUpdateBalance(req, res);

            // Should succeed with status 201
            expect(res.statusCode).toBe(201);
            expect(res.body).not.toBeNull();

            // The rate should be the explicitly provided rate, not the fixed rate
            expect(res.body.rate).toBeCloseTo(explicitRate, 5);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Auto-populated rate should match fixed_interest_rate exactly', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validFixedRateArb,
          validBalanceArb,
          year(),
          monthNumber,
          async (loanData, fixedRate, balance, testYear, testMonth) => {
            // Create a loan with fixed_interest_rate
            const loanWithRate = { ...loanData, fixed_interest_rate: fixedRate };
            const createdLoan = await loanService.createLoan(loanWithRate);
            createdLoanIds.push(createdLoan.id);

            // Verify the loan has the correct fixed rate
            const loan = await loanRepository.findById(createdLoan.id);
            expect(loan.fixed_interest_rate).toBeCloseTo(fixedRate, 5);

            // Create balance entry without rate
            const req = createMockRequest({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance
            });
            const res = createMockResponse();

            await loanBalanceController.createOrUpdateBalance(req, res);

            // The auto-populated rate should exactly match the loan's fixed_interest_rate
            expect(res.body.rate).toBeCloseTo(loan.fixed_interest_rate, 5);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 4: Variable Rate Requires Explicit Rate
   *
   * For any loan with NULL fixed_interest_rate, creating a balance entry
   * without specifying a rate must result in a validation error.
   *
   * **Validates: Requirements 2.3, 5.5, 6.3**
   */
  describe('Property 4: Variable Rate Requires Explicit Rate', () => {
    test('Creating balance entry without rate for variable-rate loan should fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validBalanceArb,
          year(),
          monthNumber,
          async (loanData, balance, testYear, testMonth) => {
            // Create a loan WITHOUT fixed_interest_rate (variable rate loan)
            const variableLoan = { ...loanData, fixed_interest_rate: null };
            const createdLoan = await loanService.createLoan(variableLoan);
            createdLoanIds.push(createdLoan.id);

            // Verify the loan has null fixed_interest_rate
            const loan = await loanRepository.findById(createdLoan.id);
            expect(loan.fixed_interest_rate).toBeNull();

            // Attempt to create balance entry WITHOUT specifying rate
            const req = createMockRequest({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance
              // Note: rate is NOT provided
            });
            const res = createMockResponse();

            await loanBalanceController.createOrUpdateBalance(req, res);

            // Should fail with status 400
            expect(res.statusCode).toBe(400);
            expect(res.body).not.toBeNull();
            expect(res.body.error).toBe('Interest rate is required for loans without a fixed interest rate');

            // Verify no balance entry was created
            const balanceEntry = await loanBalanceRepository.findByLoanAndMonth(
              createdLoan.id, testYear, testMonth
            );
            expect(balanceEntry).toBeNull();

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Creating balance entry with explicit rate for variable-rate loan should succeed', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validFixedRateArb,
          validBalanceArb,
          year(),
          monthNumber,
          async (loanData, explicitRate, balance, testYear, testMonth) => {
            // Create a loan WITHOUT fixed_interest_rate (variable rate loan)
            const variableLoan = { ...loanData, fixed_interest_rate: null };
            const createdLoan = await loanService.createLoan(variableLoan);
            createdLoanIds.push(createdLoan.id);

            // Create balance entry WITH explicit rate
            const req = createMockRequest({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance,
              rate: explicitRate // Explicit rate provided
            });
            const res = createMockResponse();

            await loanBalanceController.createOrUpdateBalance(req, res);

            // Should succeed with status 201
            expect(res.statusCode).toBe(201);
            expect(res.body).not.toBeNull();
            expect(res.body.rate).toBeCloseTo(explicitRate, 5);

            // Verify in database
            const balanceEntry = await loanBalanceRepository.findByLoanAndMonth(
              createdLoan.id, testYear, testMonth
            );
            expect(balanceEntry).not.toBeNull();
            expect(balanceEntry.rate).toBeCloseTo(explicitRate, 5);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Loan without fixed_interest_rate should behave as variable rate (backward compatibility)', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validBalanceArb,
          year(),
          monthNumber,
          async (loanData, balance, testYear, testMonth) => {
            // Create a loan without specifying fixed_interest_rate at all
            // This simulates existing loans before the feature was added
            const existingLoan = { 
              name: loanData.name,
              initial_balance: loanData.initial_balance,
              start_date: loanData.start_date,
              notes: loanData.notes,
              loan_type: 'loan'
              // fixed_interest_rate not specified - should default to null
            };
            const createdLoan = await loanService.createLoan(existingLoan);
            createdLoanIds.push(createdLoan.id);

            // Verify the loan has null fixed_interest_rate (backward compatible)
            const loan = await loanRepository.findById(createdLoan.id);
            expect(loan.fixed_interest_rate).toBeNull();

            // Attempt to create balance entry WITHOUT rate should fail
            const req = createMockRequest({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance
            });
            const res = createMockResponse();

            await loanBalanceController.createOrUpdateBalance(req, res);

            // Should fail - rate is required for variable rate loans
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toBe('Interest rate is required for loans without a fixed interest rate');

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Creating balance entry for non-existent loan should return 404', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 999999, max: 9999999 }), // Non-existent loan ID
          validBalanceArb,
          year(),
          monthNumber,
          async (nonExistentLoanId, balance, testYear, testMonth) => {
            // Attempt to create balance entry for non-existent loan
            const req = createMockRequest({
              loan_id: nonExistentLoanId,
              year: testYear,
              month: testMonth,
              remaining_balance: balance,
              rate: 5.0
            });
            const res = createMockResponse();

            await loanBalanceController.createOrUpdateBalance(req, res);

            // Should fail with 404
            expect(res.statusCode).toBe(404);
            expect(res.body.error).toBe('Loan not found');

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });
});

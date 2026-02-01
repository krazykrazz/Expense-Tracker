/**
 * Property-Based Tests for Backward Compatibility
 *
 * Feature: fixed-interest-rate-loans
 * Tests Property 7: Backward Compatibility
 *
 * For any loan with NULL fixed_interest_rate, the system must behave identically
 * to the pre-feature behavior: requiring explicit rate input for balance entries
 * and displaying rate change columns in the UI.
 *
 * **Validates: Requirements 6.1, 6.4**
 */

const fc = require('fast-check');
const { createTestDatabase, resetTestDatabase } = require('../database/db');
const loanService = require('./loanService');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const loanBalanceController = require('../controllers/loanBalanceController');
const { dbPbtOptions, safeString, safeAmount, safeDate, monthNumber, year } = require('../test/pbtArbitraries');

/**
 * Arbitrary for valid loan data with loan_type='loan'
 */
const validLoanArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 100, max: 1000000 }),
  start_date: safeDate(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constant('loan'),
  estimated_months_left: fc.option(fc.integer({ min: 1, max: 360 }), { nil: null })
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

describe('LoanService Backward Compatibility Property Tests', () => {
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
   * Property 7: Backward Compatibility
   *
   * For any loan with NULL fixed_interest_rate, the system must behave identically
   * to the pre-feature behavior: requiring explicit rate input for balance entries.
   *
   * **Validates: Requirements 6.1, 6.4**
   */
  describe('Property 7: Backward Compatibility', () => {
    test('Loans without fixed_interest_rate should be treated as variable-rate loans', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          async (loanData) => {
            // Create loan without specifying fixed_interest_rate
            // This simulates existing loans before the feature was added
            const existingLoan = {
              name: loanData.name,
              initial_balance: loanData.initial_balance,
              start_date: loanData.start_date,
              notes: loanData.notes,
              loan_type: 'loan'
              // fixed_interest_rate not specified
            };
            const createdLoan = await loanService.createLoan(existingLoan);
            createdLoanIds.push(createdLoan.id);

            // Verify the loan has null fixed_interest_rate (backward compatible default)
            const loan = await loanRepository.findById(createdLoan.id);
            expect(loan.fixed_interest_rate).toBeNull();

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Variable-rate loans require explicit rate for balance entries (pre-feature behavior)', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validBalanceArb,
          year(),
          monthNumber,
          async (loanData, balance, testYear, testMonth) => {
            // Create a variable-rate loan (null fixed_interest_rate)
            const variableLoan = { ...loanData, fixed_interest_rate: null };
            const createdLoan = await loanService.createLoan(variableLoan);
            createdLoanIds.push(createdLoan.id);

            // Attempt to create balance entry WITHOUT rate
            const req = createMockRequest({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance
              // rate NOT provided
            });
            const res = createMockResponse();

            await loanBalanceController.createOrUpdateBalance(req, res);

            // Should fail - this is the pre-feature behavior
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toBe('Interest rate is required for loans without a fixed interest rate');

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Variable-rate loans accept explicit rate for balance entries (pre-feature behavior)', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validBalanceArb,
          validFixedRateArb,
          year(),
          monthNumber,
          async (loanData, balance, explicitRate, testYear, testMonth) => {
            // Create a variable-rate loan (null fixed_interest_rate)
            const variableLoan = { ...loanData, fixed_interest_rate: null };
            const createdLoan = await loanService.createLoan(variableLoan);
            createdLoanIds.push(createdLoan.id);

            // Create balance entry WITH explicit rate
            const req = createMockRequest({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance,
              rate: explicitRate
            });
            const res = createMockResponse();

            await loanBalanceController.createOrUpdateBalance(req, res);

            // Should succeed - this is the pre-feature behavior
            expect(res.statusCode).toBe(201);
            expect(res.body.rate).toBeCloseTo(explicitRate, 5);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Existing loans (created without fixed_interest_rate field) should work unchanged', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validBalanceArb,
          validFixedRateArb,
          validFixedRateArb,
          year(),
          monthNumber,
          async (loanData, balance, rate1, rate2, testYear, testMonth) => {
            // Create loan without fixed_interest_rate (simulates pre-feature loan)
            const existingLoan = {
              name: loanData.name,
              initial_balance: loanData.initial_balance,
              start_date: loanData.start_date,
              notes: loanData.notes,
              loan_type: 'loan'
            };
            const createdLoan = await loanService.createLoan(existingLoan);
            createdLoanIds.push(createdLoan.id);

            // Create first balance entry with rate1
            const req1 = createMockRequest({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance,
              rate: rate1
            });
            const res1 = createMockResponse();
            await loanBalanceController.createOrUpdateBalance(req1, res1);
            expect(res1.statusCode).toBe(201);

            // Create second balance entry with different rate (rate2)
            // This simulates variable rate behavior where rate can change
            const nextMonth = testMonth === 12 ? 1 : testMonth + 1;
            const nextYear = testMonth === 12 ? testYear + 1 : testYear;
            
            const req2 = createMockRequest({
              loan_id: createdLoan.id,
              year: nextYear,
              month: nextMonth,
              remaining_balance: balance * 0.95, // Slightly reduced balance
              rate: rate2
            });
            const res2 = createMockResponse();
            await loanBalanceController.createOrUpdateBalance(req2, res2);
            expect(res2.statusCode).toBe(201);

            // Verify both balance entries have their respective rates
            const balance1 = await loanBalanceRepository.findByLoanAndMonth(
              createdLoan.id, testYear, testMonth
            );
            const balance2 = await loanBalanceRepository.findByLoanAndMonth(
              createdLoan.id, nextYear, nextMonth
            );

            expect(balance1.rate).toBeCloseTo(rate1, 5);
            expect(balance2.rate).toBeCloseTo(rate2, 5);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('getAllLoans should return null fixed_interest_rate for existing loans', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          async (loanData) => {
            // Create loan without fixed_interest_rate
            const existingLoan = {
              name: loanData.name,
              initial_balance: loanData.initial_balance,
              start_date: loanData.start_date,
              notes: loanData.notes,
              loan_type: 'loan'
            };
            const createdLoan = await loanService.createLoan(existingLoan);
            createdLoanIds.push(createdLoan.id);

            // Get all loans
            const allLoans = await loanService.getAllLoans();
            const retrievedLoan = allLoans.find(l => l.id === createdLoan.id);

            // Verify fixed_interest_rate is null (not undefined)
            expect(retrievedLoan).toBeDefined();
            expect(retrievedLoan.fixed_interest_rate).toBeNull();

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Migration preserves existing loan data without modification', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validBalanceArb,
          validFixedRateArb,
          year(),
          monthNumber,
          async (loanData, balance, rate, testYear, testMonth) => {
            // Create loan (simulates existing loan)
            const existingLoan = {
              name: loanData.name,
              initial_balance: loanData.initial_balance,
              start_date: loanData.start_date,
              notes: loanData.notes,
              loan_type: 'loan'
            };
            const createdLoan = await loanService.createLoan(existingLoan);
            createdLoanIds.push(createdLoan.id);

            // Create balance entry
            await loanBalanceRepository.create({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance,
              rate: rate
            });

            // Retrieve loan and balance
            const loan = await loanRepository.findById(createdLoan.id);
            const balanceEntry = await loanBalanceRepository.findByLoanAndMonth(
              createdLoan.id, testYear, testMonth
            );

            // Verify all original data is preserved
            expect(loan.name).toBe(existingLoan.name.trim());
            expect(loan.initial_balance).toBeCloseTo(existingLoan.initial_balance, 2);
            expect(loan.start_date).toBe(existingLoan.start_date);
            expect(loan.loan_type).toBe('loan');
            expect(loan.fixed_interest_rate).toBeNull(); // New field defaults to null

            expect(balanceEntry.remaining_balance).toBeCloseTo(balance, 2);
            expect(balanceEntry.rate).toBeCloseTo(rate, 5);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });
});

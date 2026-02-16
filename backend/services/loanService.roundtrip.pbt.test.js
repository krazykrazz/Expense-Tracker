/**
 * Property-Based Tests for LoanService - Round-Trip Operations
 * 
 * Consolidates:
 * - loanService.roundtrip.pbt.test.js (Mortgage Round-Trip)
 * - loanService.apiRoundTrip.pbt.test.js (API Round-Trip)
 * - loanService.backwardCompatibility.pbt.test.js (Backward Compatibility)
 * 
 * **Feature: loan-payment-tracking, mortgage-tracking**
 * **Validates: Round-trip persistence and API consistency**
 * 
 * @invariant Round-Trip Persistence: Data written through the service can be read back
 * with identical values, and API operations maintain consistency across create/read/update cycles.
 */

/**
 * Property-Based Tests for Mortgage Data Round-Trip in LoanService
 *
 * Feature: mortgage-tracking
 * Tests Property 2: Mortgage Data Round-Trip
 *
 * For any valid mortgage object with all required and optional fields populated,
 * storing the mortgage and then retrieving it by ID shall return an equivalent
 * mortgage object with all fields preserved.
 *
 * Validates: Requirements 2.1, 2.2, 2.3
 */

const fc = require('fast-check');
const { getDatabase, createTestDatabase, resetTestDatabase } = require('../database/db');
const loanService = require('./loanService');
const loanRepository = require('../repositories/loanRepository');
const { dbPbtOptions, safeString, safeAmount } = require('../test/pbtArbitraries');

/**
 * Safe future date arbitrary for renewal dates
 * Generates dates at least 30 days in the future to avoid edge cases
 * Uses integer-based generation to avoid invalid Date edge cases
 */
const safeFutureDateString = () => {
  // Generate dates 30-3650 days (10 years) in the future
  return fc.integer({ min: 30, max: 3650 }).map(daysInFuture => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysInFuture);
    const year = futureDate.getFullYear();
    const month = (futureDate.getMonth() + 1).toString().padStart(2, '0');
    const day = futureDate.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
};

/**
 * Safe past date arbitrary for start dates
 * Generates dates between 2020 and 2025 as YYYY-MM-DD strings
 */
const safePastDateString = () => {
  return fc.record({
    year: fc.integer({ min: 2020, max: 2025 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  }).map(({ year, month, day }) => {
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  });
};

/**
 * Arbitrary for valid mortgage data with all required fields
 */
const validMortgageArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 10000, max: 10000000 }),
  start_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  amortization_period: fc.integer({ min: 1, max: 40 }),
  term_length: fc.integer({ min: 1, max: 10 }),
  renewal_date: safeFutureDateString(),
  rate_type: fc.constantFrom('fixed', 'variable'),
  payment_frequency: fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly'),
  estimated_property_value: fc.option(safeAmount({ min: 50000, max: 50000000 }), { nil: null }),
  estimated_months_left: fc.option(fc.integer({ min: 1, max: 480 }), { nil: null })
}).filter(m => m.term_length <= m.amortization_period);

/**
 * Arbitrary for valid mortgage data with all fields populated (including optional)
 */
const fullMortgageArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 10000, max: 10000000 }),
  start_date: safePastDateString(),
  notes: safeString({ maxLength: 200 }),
  amortization_period: fc.integer({ min: 1, max: 40 }),
  term_length: fc.integer({ min: 1, max: 10 }),
  renewal_date: safeFutureDateString(),
  rate_type: fc.constantFrom('fixed', 'variable'),
  payment_frequency: fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly'),
  estimated_property_value: safeAmount({ min: 50000, max: 50000000 }),
  estimated_months_left: fc.integer({ min: 1, max: 480 })
}).filter(m => m.term_length <= m.amortization_period);

describe('LoanService - Round-Trip Operations Property Tests', () => {
  // ============================================================================
  // Mortgage Round-Trip Tests
  // ============================================================================

  const createdMortgageIds = [];

  beforeAll(async () => {
    await createTestDatabase();
  
  // ============================================================================
  // API Round-Trip Tests
  // ============================================================================


  const createdLoanIds = [];

  beforeAll(async () => {
    await createTestDatabase();
  
  // ============================================================================
  // Backward Compatibility Tests
  // ============================================================================


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

});
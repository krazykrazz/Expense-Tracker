/**
 * Property-Based Tests for API Round Trip Preservation
 *
 * Feature: fixed-interest-rate-loans
 * Tests Property 5: API Round Trip Preservation
 *
 * For any loan with loan_type='loan', creating or updating the loan with a
 * fixed_interest_rate value, then retrieving the loan, should return the
 * same fixed_interest_rate value.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */

const fc = require('fast-check');
const { createTestDatabase, resetTestDatabase } = require('../database/db');
const loanService = require('./loanService');
const loanRepository = require('../repositories/loanRepository');
const { dbPbtOptions, safeString, safeAmount, safeDate } = require('../test/pbtArbitraries');

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
 * Arbitrary for optional fixed interest rate (null or valid rate)
 */
const optionalFixedRateArb = fc.oneof(
  fc.constant(null),
  validFixedRateArb
);

describe('LoanService API Round Trip Property Tests', () => {
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
   * Property 5: API Round Trip Preservation
   *
   * For any loan with loan_type='loan', creating or updating the loan with a
   * fixed_interest_rate value, then retrieving the loan, should return the
   * same fixed_interest_rate value.
   *
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  describe('Property 5: API Round Trip Preservation', () => {
    test('Creating a loan with fixed_interest_rate and retrieving it should preserve the rate', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          optionalFixedRateArb,
          async (loanData, fixedRate) => {
            // Create loan with fixed_interest_rate
            const dataWithRate = { ...loanData, fixed_interest_rate: fixedRate };
            const created = await loanService.createLoan(dataWithRate);
            createdLoanIds.push(created.id);

            // Retrieve the loan via repository (simulates API GET)
            const retrieved = await loanRepository.findById(created.id);

            // Verify the fixed_interest_rate is preserved
            if (fixedRate === null) {
              expect(retrieved.fixed_interest_rate).toBeNull();
            } else {
              expect(retrieved.fixed_interest_rate).toBeCloseTo(fixedRate, 5);
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Updating a loan with fixed_interest_rate and retrieving it should preserve the rate', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          optionalFixedRateArb,
          optionalFixedRateArb,
          async (loanData, initialRate, newRate) => {
            // Create loan with initial rate
            const dataWithInitialRate = { ...loanData, fixed_interest_rate: initialRate };
            const created = await loanService.createLoan(dataWithInitialRate);
            createdLoanIds.push(created.id);

            // Update loan with new rate
            const updateData = { ...loanData, fixed_interest_rate: newRate };
            await loanService.updateLoan(created.id, updateData);

            // Retrieve the loan via repository (simulates API GET)
            const retrieved = await loanRepository.findById(created.id);

            // Verify the new fixed_interest_rate is preserved
            if (newRate === null) {
              expect(retrieved.fixed_interest_rate).toBeNull();
            } else {
              expect(retrieved.fixed_interest_rate).toBeCloseTo(newRate, 5);
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('getAllLoans should include fixed_interest_rate in response', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          optionalFixedRateArb,
          async (loanData, fixedRate) => {
            // Create loan with fixed_interest_rate
            const dataWithRate = { ...loanData, fixed_interest_rate: fixedRate };
            const created = await loanService.createLoan(dataWithRate);
            createdLoanIds.push(created.id);

            // Retrieve all loans via service (simulates API GET /api/loans)
            const allLoans = await loanService.getAllLoans();

            // Find our created loan
            const retrievedLoan = allLoans.find(l => l.id === created.id);
            expect(retrievedLoan).toBeDefined();

            // Verify the fixed_interest_rate is included and preserved
            if (fixedRate === null) {
              expect(retrievedLoan.fixed_interest_rate).toBeNull();
            } else {
              expect(retrievedLoan.fixed_interest_rate).toBeCloseTo(fixedRate, 5);
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('getLoansForMonth should include fixed_interest_rate in response', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          optionalFixedRateArb,
          async (loanData, fixedRate) => {
            // Use a fixed date that we know will be in the query range
            const testLoanData = {
              ...loanData,
              start_date: '2024-01-15',
              fixed_interest_rate: fixedRate
            };
            const created = await loanService.createLoan(testLoanData);
            createdLoanIds.push(created.id);

            // Retrieve loans for the month (simulates API GET with year/month params)
            const loansForMonth = await loanService.getLoansForMonth(2024, 6);

            // Find our created loan
            const retrievedLoan = loansForMonth.find(l => l.id === created.id);
            expect(retrievedLoan).toBeDefined();

            // Verify the fixed_interest_rate is included and preserved
            if (fixedRate === null) {
              expect(retrievedLoan.fixed_interest_rate).toBeNull();
            } else {
              expect(retrievedLoan.fixed_interest_rate).toBeCloseTo(fixedRate, 5);
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Round trip: create -> retrieve -> update -> retrieve should preserve rate at each step', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validFixedRateArb,
          validFixedRateArb,
          async (loanData, rate1, rate2) => {
            // Step 1: Create with rate1
            const createData = { ...loanData, fixed_interest_rate: rate1 };
            const created = await loanService.createLoan(createData);
            createdLoanIds.push(created.id);

            // Step 2: Retrieve and verify rate1
            const afterCreate = await loanRepository.findById(created.id);
            expect(afterCreate.fixed_interest_rate).toBeCloseTo(rate1, 5);

            // Step 3: Update with rate2
            const updateData = { ...loanData, fixed_interest_rate: rate2 };
            await loanService.updateLoan(created.id, updateData);

            // Step 4: Retrieve and verify rate2
            const afterUpdate = await loanRepository.findById(created.id);
            expect(afterUpdate.fixed_interest_rate).toBeCloseTo(rate2, 5);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Clearing fixed_interest_rate (setting to null) should be preserved', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validFixedRateArb,
          async (loanData, initialRate) => {
            // Create loan with a fixed rate
            const createData = { ...loanData, fixed_interest_rate: initialRate };
            const created = await loanService.createLoan(createData);
            createdLoanIds.push(created.id);

            // Verify initial rate is set
            const afterCreate = await loanRepository.findById(created.id);
            expect(afterCreate.fixed_interest_rate).toBeCloseTo(initialRate, 5);

            // Update to clear the fixed rate (set to null)
            const updateData = { ...loanData, fixed_interest_rate: null };
            await loanService.updateLoan(created.id, updateData);

            // Verify rate is now null
            const afterUpdate = await loanRepository.findById(created.id);
            expect(afterUpdate.fixed_interest_rate).toBeNull();

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });
});

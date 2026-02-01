/**
 * Property-Based Tests for Fixed Interest Rate Validation in LoanService
 *
 * Feature: fixed-interest-rate-loans
 * Tests Property 2: Non-Negative Rate Validation
 *
 * For any loan with a non-NULL fixed_interest_rate, the value must be greater
 * than or equal to zero. Negative values must be rejected with a validation error.
 *
 * **Validates: Requirements 1.4, 4.3**
 */

const fc = require('fast-check');
const { getDatabase, createTestDatabase, resetTestDatabase } = require('../database/db');
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
 * Arbitrary for non-negative fixed interest rates (valid rates)
 */
const validFixedRateArb = fc.float({ min: 0, max: 30, noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n >= 0);

/**
 * Arbitrary for negative fixed interest rates (invalid rates)
 */
const negativeRateArb = fc.float({ min: -100, max: Math.fround(-0.001), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n < 0);

/**
 * Arbitrary for non-loan types (line_of_credit, mortgage)
 */
const nonLoanTypeArb = fc.constantFrom('line_of_credit', 'mortgage');

describe('LoanService Fixed Interest Rate Property Tests', () => {
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
   * Property 2: Non-Negative Rate Validation
   *
   * For any loan with a non-NULL fixed_interest_rate, the value must be greater
   * than or equal to zero. Negative values must be rejected with a validation error.
   *
   * **Validates: Requirements 1.4, 4.3**
   */
  describe('Property 2: Non-Negative Rate Validation', () => {
    test('Creating a loan with a non-negative fixed_interest_rate should succeed', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validFixedRateArb,
          async (loanData, fixedRate) => {
            const dataWithRate = { ...loanData, fixed_interest_rate: fixedRate };
            
            // Should not throw
            const created = await loanService.createLoan(dataWithRate);
            createdLoanIds.push(created.id);

            // Verify the loan was created with the correct fixed rate
            const retrieved = await loanRepository.findById(created.id);
            expect(retrieved).not.toBeNull();
            expect(retrieved.fixed_interest_rate).toBeCloseTo(fixedRate, 5);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Creating a loan with a negative fixed_interest_rate should fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          negativeRateArb,
          async (loanData, negativeRate) => {
            const dataWithRate = { ...loanData, fixed_interest_rate: negativeRate };
            
            // Should throw validation error
            await expect(loanService.createLoan(dataWithRate))
              .rejects.toThrow('Fixed interest rate must be greater than or equal to zero');

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Updating a loan with a non-negative fixed_interest_rate should succeed', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validFixedRateArb,
          validFixedRateArb,
          async (loanData, initialRate, newRate) => {
            // Create loan with initial rate
            const dataWithRate = { ...loanData, fixed_interest_rate: initialRate };
            const created = await loanService.createLoan(dataWithRate);
            createdLoanIds.push(created.id);

            // Update with new rate
            const updateData = { ...loanData, fixed_interest_rate: newRate };
            const updated = await loanService.updateLoan(created.id, updateData);

            // Verify the update succeeded
            expect(updated).not.toBeNull();
            const retrieved = await loanRepository.findById(created.id);
            expect(retrieved.fixed_interest_rate).toBeCloseTo(newRate, 5);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Updating a loan with a negative fixed_interest_rate should fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          validFixedRateArb,
          negativeRateArb,
          async (loanData, initialRate, negativeRate) => {
            // Create loan with valid rate
            const dataWithRate = { ...loanData, fixed_interest_rate: initialRate };
            const created = await loanService.createLoan(dataWithRate);
            createdLoanIds.push(created.id);

            // Attempt to update with negative rate
            const updateData = { ...loanData, fixed_interest_rate: negativeRate };
            await expect(loanService.updateLoan(created.id, updateData))
              .rejects.toThrow('Fixed interest rate must be greater than or equal to zero');

            // Verify original rate is preserved
            const retrieved = await loanRepository.findById(created.id);
            expect(retrieved.fixed_interest_rate).toBeCloseTo(initialRate, 5);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Creating a loan with fixed_interest_rate=0 should succeed (zero is valid)', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          async (loanData) => {
            const dataWithZeroRate = { ...loanData, fixed_interest_rate: 0 };
            
            // Should not throw - zero is a valid rate
            const created = await loanService.createLoan(dataWithZeroRate);
            createdLoanIds.push(created.id);

            // Verify the loan was created with zero rate
            const retrieved = await loanRepository.findById(created.id);
            expect(retrieved).not.toBeNull();
            expect(retrieved.fixed_interest_rate).toBe(0);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Creating a loan with null fixed_interest_rate should succeed (variable rate loan)', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          async (loanData) => {
            const dataWithNullRate = { ...loanData, fixed_interest_rate: null };
            
            // Should not throw - null means variable rate
            const created = await loanService.createLoan(dataWithNullRate);
            createdLoanIds.push(created.id);

            // Verify the loan was created with null rate
            const retrieved = await loanRepository.findById(created.id);
            expect(retrieved).not.toBeNull();
            expect(retrieved.fixed_interest_rate).toBeNull();

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Setting fixed_interest_rate on non-loan types should fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          nonLoanTypeArb,
          validFixedRateArb,
          async (loanData, loanType, fixedRate) => {
            // Skip mortgage type as it requires additional fields
            if (loanType === 'mortgage') {
              return true;
            }
            
            const dataWithRate = { 
              ...loanData, 
              loan_type: loanType,
              fixed_interest_rate: fixedRate 
            };
            
            // Should throw validation error
            await expect(loanService.createLoan(dataWithRate))
              .rejects.toThrow('Fixed interest rate can only be set for loans, not for lines of credit or mortgages');

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });
});

/**
 * Property-Based Tests for LoanService - Data Management
 * 
 * Consolidates:
 * - loanService.existingBalances.pbt.test.js (Existing Balance Entries)
 * - loanService.fixedRate.pbt.test.js (Fixed Interest Rate)
 * 
 * **Feature: loan-payment-tracking**
 * **Validates: Balance history preservation and interest rate management**
 * 
 * @invariant Data Integrity: Existing balance entries are preserved during loan updates,
 * and fixed interest rate changes maintain data consistency.
 */

const fc = require('fast-check');
const { createTestDatabase, resetTestDatabase } = require('../database/db');
const loanService = require('./loanService');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
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
 * Arbitrary for negative fixed interest rates (invalid rates)
 */
const negativeRateArb = fc.float({ min: -100, max: Math.fround(-0.001), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n < 0);

/**
 * Arbitrary for non-loan types (line_of_credit, mortgage)
 */
const nonLoanTypeArb = fc.constantFrom('line_of_credit', 'mortgage');

/**
 * Arbitrary for valid balance amounts
 */
const validBalanceArb = safeAmount({ min: 0, max: 1000000 });

/**
 * Arbitrary for balance entry data
 */
const balanceEntryArb = fc.record({
  year: year(),
  month: monthNumber,
  remaining_balance: validBalanceArb,
  rate: validFixedRateArb
});

/**
 * Arbitrary for multiple balance entries with unique year/month combinations
 */
const multipleBalanceEntriesArb = fc.array(balanceEntryArb, { minLength: 1, maxLength: 5 })
  .map(entries => {
    const seen = new Set();
    return entries.filter(entry => {
      const key = `${entry.year}-${entry.month}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .filter(entries => entries.length > 0);


describe('LoanService - Data Management Property Tests', () => {
  const createdLoanIds = [];

  beforeAll(async () => {
    await createTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterEach(async () => {
    for (const id of createdLoanIds) {
      try {
        await loanRepository.delete(id);
      } catch (e) {
        // Ignore errors
      }
    }
    createdLoanIds.length = 0;
  });

  // ============================================================================
  // Existing Balance Entries Tests (from loanService.existingBalances.pbt.test.js)
  // ============================================================================

  /**
   * Property 6: Existing Balance Entries Unchanged
   *
   * For any loan that is converted from variable-rate (NULL fixed_interest_rate)
   * to fixed-rate (non-NULL fixed_interest_rate), all existing balance entries
   * must retain their original rate values unchanged.
   *
   * **Validates: Requirements 4.6, 6.2**
   */
  describe('Property 6: Existing Balance Entries Unchanged', () => {
    test('Converting variable-rate loan to fixed-rate should not modify existing balance entries', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          multipleBalanceEntriesArb,
          validFixedRateArb,
          async (loanData, balanceEntries, newFixedRate) => {
            const variableLoan = { ...loanData, fixed_interest_rate: null };
            const createdLoan = await loanService.createLoan(variableLoan);
            createdLoanIds.push(createdLoan.id);

            const loanBefore = await loanRepository.findById(createdLoan.id);
            expect(loanBefore.fixed_interest_rate).toBeNull();

            const createdBalances = [];
            for (const entry of balanceEntries) {
              const created = await loanBalanceRepository.create({
                loan_id: createdLoan.id,
                year: entry.year,
                month: entry.month,
                remaining_balance: entry.remaining_balance,
                rate: entry.rate
              });
              createdBalances.push({ ...created, originalRate: entry.rate });
            }

            const updateData = { ...loanData, fixed_interest_rate: newFixedRate };
            await loanService.updateLoan(createdLoan.id, updateData);

            const loanAfter = await loanRepository.findById(createdLoan.id);
            expect(loanAfter.fixed_interest_rate).toBeCloseTo(newFixedRate, 5);

            for (const originalBalance of createdBalances) {
              const currentBalance = await loanBalanceRepository.findByLoanAndMonth(
                createdLoan.id, originalBalance.year, originalBalance.month
              );
              expect(currentBalance).not.toBeNull();
              expect(currentBalance.rate).toBeCloseTo(originalBalance.originalRate, 5);
              expect(currentBalance.remaining_balance).toBeCloseTo(originalBalance.remaining_balance, 2);
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Converting fixed-rate loan to variable-rate should not modify existing balance entries', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          multipleBalanceEntriesArb,
          validFixedRateArb,
          async (loanData, balanceEntries, initialFixedRate) => {
            const fixedLoan = { ...loanData, fixed_interest_rate: initialFixedRate };
            const createdLoan = await loanService.createLoan(fixedLoan);
            createdLoanIds.push(createdLoan.id);

            const createdBalances = [];
            for (const entry of balanceEntries) {
              const created = await loanBalanceRepository.create({
                loan_id: createdLoan.id,
                year: entry.year,
                month: entry.month,
                remaining_balance: entry.remaining_balance,
                rate: entry.rate
              });
              createdBalances.push({ ...created, originalRate: entry.rate });
            }

            const updateData = { ...loanData, fixed_interest_rate: null };
            await loanService.updateLoan(createdLoan.id, updateData);

            const loanAfter = await loanRepository.findById(createdLoan.id);
            expect(loanAfter.fixed_interest_rate).toBeNull();

            for (const originalBalance of createdBalances) {
              const currentBalance = await loanBalanceRepository.findByLoanAndMonth(
                createdLoan.id, originalBalance.year, originalBalance.month
              );
              expect(currentBalance).not.toBeNull();
              expect(currentBalance.rate).toBeCloseTo(originalBalance.originalRate, 5);
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Changing fixed_interest_rate value should not modify existing balance entries', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          multipleBalanceEntriesArb,
          validFixedRateArb,
          validFixedRateArb,
          async (loanData, balanceEntries, rate1, rate2) => {
            const fixedLoan = { ...loanData, fixed_interest_rate: rate1 };
            const createdLoan = await loanService.createLoan(fixedLoan);
            createdLoanIds.push(createdLoan.id);

            const createdBalances = [];
            for (const entry of balanceEntries) {
              const created = await loanBalanceRepository.create({
                loan_id: createdLoan.id,
                year: entry.year,
                month: entry.month,
                remaining_balance: entry.remaining_balance,
                rate: entry.rate
              });
              createdBalances.push({ ...created, originalRate: entry.rate });
            }

            const updateData = { ...loanData, fixed_interest_rate: rate2 };
            await loanService.updateLoan(createdLoan.id, updateData);

            const loanAfter = await loanRepository.findById(createdLoan.id);
            expect(loanAfter.fixed_interest_rate).toBeCloseTo(rate2, 5);

            for (const originalBalance of createdBalances) {
              const currentBalance = await loanBalanceRepository.findByLoanAndMonth(
                createdLoan.id, originalBalance.year, originalBalance.month
              );
              expect(currentBalance).not.toBeNull();
              expect(currentBalance.rate).toBeCloseTo(originalBalance.originalRate, 5);
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Balance entry count should remain unchanged after loan rate conversion', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLoanArb,
          multipleBalanceEntriesArb,
          validFixedRateArb,
          async (loanData, balanceEntries, newFixedRate) => {
            const variableLoan = { ...loanData, fixed_interest_rate: null };
            const createdLoan = await loanService.createLoan(variableLoan);
            createdLoanIds.push(createdLoan.id);

            for (const entry of balanceEntries) {
              await loanBalanceRepository.create({
                loan_id: createdLoan.id,
                year: entry.year,
                month: entry.month,
                remaining_balance: entry.remaining_balance,
                rate: entry.rate
              });
            }

            const balancesBefore = await loanBalanceRepository.findByLoan(createdLoan.id);
            const countBefore = balancesBefore.length;

            const updateData = { ...loanData, fixed_interest_rate: newFixedRate };
            await loanService.updateLoan(createdLoan.id, updateData);

            const balancesAfter = await loanBalanceRepository.findByLoan(createdLoan.id);
            expect(balancesAfter.length).toBe(countBefore);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });


  // ============================================================================
  // Fixed Interest Rate Tests (from loanService.fixedRate.pbt.test.js)
  // ============================================================================

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
            
            const created = await loanService.createLoan(dataWithRate);
            createdLoanIds.push(created.id);

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
            const dataWithRate = { ...loanData, fixed_interest_rate: initialRate };
            const created = await loanService.createLoan(dataWithRate);
            createdLoanIds.push(created.id);

            const updateData = { ...loanData, fixed_interest_rate: newRate };
            const updated = await loanService.updateLoan(created.id, updateData);

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
            const dataWithRate = { ...loanData, fixed_interest_rate: initialRate };
            const created = await loanService.createLoan(dataWithRate);
            createdLoanIds.push(created.id);

            const updateData = { ...loanData, fixed_interest_rate: negativeRate };
            await expect(loanService.updateLoan(created.id, updateData))
              .rejects.toThrow('Fixed interest rate must be greater than or equal to zero');

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
            
            const created = await loanService.createLoan(dataWithZeroRate);
            createdLoanIds.push(created.id);

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
            
            const created = await loanService.createLoan(dataWithNullRate);
            createdLoanIds.push(created.id);

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
            if (loanType === 'mortgage') {
              return true;
            }
            
            const dataWithRate = { 
              ...loanData, 
              loan_type: loanType,
              fixed_interest_rate: fixedRate 
            };
            
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
/**
 * Property-Based Tests for Existing Balance Entries Unchanged
 *
 * Feature: fixed-interest-rate-loans
 * Tests Property 6: Existing Balance Entries Unchanged
 *
 * For any loan that is converted from variable-rate (NULL fixed_interest_rate)
 * to fixed-rate (non-NULL fixed_interest_rate), all existing balance entries
 * must retain their original rate values unchanged.
 *
 * **Validates: Requirements 4.6, 6.2**
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
    // Ensure unique year/month combinations
    const seen = new Set();
    return entries.filter(entry => {
      const key = `${entry.year}-${entry.month}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .filter(entries => entries.length > 0);

describe('LoanService Existing Balance Entries Property Tests', () => {
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
            // Create a variable-rate loan (no fixed_interest_rate)
            const variableLoan = { ...loanData, fixed_interest_rate: null };
            const createdLoan = await loanService.createLoan(variableLoan);
            createdLoanIds.push(createdLoan.id);

            // Verify loan is variable-rate
            const loanBefore = await loanRepository.findById(createdLoan.id);
            expect(loanBefore.fixed_interest_rate).toBeNull();

            // Create balance entries with various rates
            const createdBalances = [];
            for (const entry of balanceEntries) {
              const balanceEntry = {
                loan_id: createdLoan.id,
                year: entry.year,
                month: entry.month,
                remaining_balance: entry.remaining_balance,
                rate: entry.rate
              };
              const created = await loanBalanceRepository.create(balanceEntry);
              createdBalances.push({
                ...created,
                originalRate: entry.rate
              });
            }

            // Convert to fixed-rate loan
            const updateData = { ...loanData, fixed_interest_rate: newFixedRate };
            await loanService.updateLoan(createdLoan.id, updateData);

            // Verify loan is now fixed-rate
            const loanAfter = await loanRepository.findById(createdLoan.id);
            expect(loanAfter.fixed_interest_rate).toBeCloseTo(newFixedRate, 5);

            // Verify all existing balance entries retain their original rates
            for (const originalBalance of createdBalances) {
              const currentBalance = await loanBalanceRepository.findByLoanAndMonth(
                createdLoan.id,
                originalBalance.year,
                originalBalance.month
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
            // Create a fixed-rate loan
            const fixedLoan = { ...loanData, fixed_interest_rate: initialFixedRate };
            const createdLoan = await loanService.createLoan(fixedLoan);
            createdLoanIds.push(createdLoan.id);

            // Create balance entries
            const createdBalances = [];
            for (const entry of balanceEntries) {
              const balanceEntry = {
                loan_id: createdLoan.id,
                year: entry.year,
                month: entry.month,
                remaining_balance: entry.remaining_balance,
                rate: entry.rate
              };
              const created = await loanBalanceRepository.create(balanceEntry);
              createdBalances.push({
                ...created,
                originalRate: entry.rate
              });
            }

            // Convert to variable-rate loan (clear fixed_interest_rate)
            const updateData = { ...loanData, fixed_interest_rate: null };
            await loanService.updateLoan(createdLoan.id, updateData);

            // Verify loan is now variable-rate
            const loanAfter = await loanRepository.findById(createdLoan.id);
            expect(loanAfter.fixed_interest_rate).toBeNull();

            // Verify all existing balance entries retain their original rates
            for (const originalBalance of createdBalances) {
              const currentBalance = await loanBalanceRepository.findByLoanAndMonth(
                createdLoan.id,
                originalBalance.year,
                originalBalance.month
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
            // Create a fixed-rate loan with rate1
            const fixedLoan = { ...loanData, fixed_interest_rate: rate1 };
            const createdLoan = await loanService.createLoan(fixedLoan);
            createdLoanIds.push(createdLoan.id);

            // Create balance entries with various rates
            const createdBalances = [];
            for (const entry of balanceEntries) {
              const balanceEntry = {
                loan_id: createdLoan.id,
                year: entry.year,
                month: entry.month,
                remaining_balance: entry.remaining_balance,
                rate: entry.rate
              };
              const created = await loanBalanceRepository.create(balanceEntry);
              createdBalances.push({
                ...created,
                originalRate: entry.rate
              });
            }

            // Change fixed_interest_rate to rate2
            const updateData = { ...loanData, fixed_interest_rate: rate2 };
            await loanService.updateLoan(createdLoan.id, updateData);

            // Verify loan has new fixed rate
            const loanAfter = await loanRepository.findById(createdLoan.id);
            expect(loanAfter.fixed_interest_rate).toBeCloseTo(rate2, 5);

            // Verify all existing balance entries retain their original rates
            for (const originalBalance of createdBalances) {
              const currentBalance = await loanBalanceRepository.findByLoanAndMonth(
                createdLoan.id,
                originalBalance.year,
                originalBalance.month
              );

              expect(currentBalance).not.toBeNull();
              // The balance entry rate should NOT change to the new fixed rate
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
            // Create a variable-rate loan
            const variableLoan = { ...loanData, fixed_interest_rate: null };
            const createdLoan = await loanService.createLoan(variableLoan);
            createdLoanIds.push(createdLoan.id);

            // Create balance entries
            for (const entry of balanceEntries) {
              await loanBalanceRepository.create({
                loan_id: createdLoan.id,
                year: entry.year,
                month: entry.month,
                remaining_balance: entry.remaining_balance,
                rate: entry.rate
              });
            }

            // Get count before conversion
            const balancesBefore = await loanBalanceRepository.findByLoan(createdLoan.id);
            const countBefore = balancesBefore.length;

            // Convert to fixed-rate loan
            const updateData = { ...loanData, fixed_interest_rate: newFixedRate };
            await loanService.updateLoan(createdLoan.id, updateData);

            // Get count after conversion
            const balancesAfter = await loanBalanceRepository.findByLoan(createdLoan.id);
            const countAfter = balancesAfter.length;

            // Count should be unchanged
            expect(countAfter).toBe(countBefore);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });
});

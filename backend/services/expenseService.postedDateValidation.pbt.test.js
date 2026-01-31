/**
 * Property-Based Tests for Posted Date Ordering Validation
 * 
 * Feature: credit-card-posted-date
 * Property 9: Posted Date Ordering Validation
 * Validates: Requirements 4.5, 4.6
 * 
 * For any expense where posted_date is provided and posted_date < date (transaction date),
 * the API SHALL reject the request with the error "Posted date cannot be before transaction date".
 */

const fc = require('fast-check');
const { pbtOptions, safePlaceName, safeAmount } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

describe('ExpenseService - Property 9: Posted Date Ordering Validation', () => {
  let db;
  const createdIds = [];

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterAll(async () => {
    // Clean up any expenses that were created (shouldn't be any for rejection tests)
    for (const id of createdIds) {
      try {
        await expenseService.deleteExpense(id);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  /**
   * Generate a valid date string in YYYY-MM-DD format
   */
  const validDateArb = fc.integer({ min: 2020, max: 2025 }).chain(year =>
    fc.integer({ min: 1, max: 12 }).chain(month =>
      fc.integer({ min: 1, max: 28 }).map(day =>
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      )
    )
  );

  /**
   * Generate a date pair where posted_date is BEFORE transaction date (invalid)
   * This is the key arbitrary for testing Property 9
   */
  const invalidDatePairArb = validDateArb.chain(transactionDate => {
    const [year, month, day] = transactionDate.split('-').map(Number);
    
    // Generate posted_date that is 1-365 days BEFORE transaction date
    return fc.integer({ min: 1, max: 365 }).map(daysBefore => {
      const txDate = new Date(year, month - 1, day);
      txDate.setDate(txDate.getDate() - daysBefore);
      const postedDate = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
      return { date: transactionDate, posted_date: postedDate };
    });
  });

  /**
   * Generate a valid date pair where posted_date >= transaction date
   */
  const validDatePairArb = validDateArb.chain(transactionDate => {
    const [year, month, day] = transactionDate.split('-').map(Number);
    
    return fc.oneof(
      // Option 1: posted_date equals transaction date
      fc.constant({ date: transactionDate, posted_date: transactionDate }),
      // Option 2: posted_date is 1-30 days after transaction date
      fc.integer({ min: 1, max: 30 }).map(daysAfter => {
        const txDate = new Date(year, month - 1, day);
        txDate.setDate(txDate.getDate() + daysAfter);
        const postedDate = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
        return { date: transactionDate, posted_date: postedDate };
      })
    );
  });

  /**
   * Feature: credit-card-posted-date
   * Property 9: Posted Date Ordering Validation
   * 
   * For any expense where posted_date is provided and posted_date < date (transaction date),
   * the API SHALL reject the request with the error "Posted date cannot be before transaction date".
   * 
   * **Validates: Requirements 4.5, 4.6**
   */
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

          // Verify that posted_date is actually before date (sanity check)
          expect(datePair.posted_date < datePair.date).toBe(true);

          // The create should throw an error
          await expect(expenseService.createExpense(expenseData))
            .rejects
            .toThrow('Posted date cannot be before transaction date');
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  }, 60000);

  /**
   * Feature: credit-card-posted-date
   * Property 9: Posted Date Ordering Validation (Update)
   * 
   * For any expense update where posted_date is provided and posted_date < date,
   * the API SHALL reject the request with the error "Posted date cannot be before transaction date".
   * 
   * **Validates: Requirements 4.5, 4.6**
   */
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
          // First create a valid expense
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

          // Now try to update with invalid posted_date
          const invalidUpdateData = {
            date: invalidDatePair.date,
            posted_date: invalidDatePair.posted_date,
            place,
            amount: parseFloat(amount.toFixed(2)),
            type,
            method
          };

          // Verify that posted_date is actually before date (sanity check)
          expect(invalidDatePair.posted_date < invalidDatePair.date).toBe(true);

          // The update should throw an error
          await expect(expenseService.updateExpense(created.id, invalidUpdateData))
            .rejects
            .toThrow('Posted date cannot be before transaction date');

          // Verify the original expense was not modified
          const retrieved = await expenseService.getExpenseById(created.id);
          if (validDatePair.posted_date === null) {
            expect(retrieved.posted_date).toBeNull();
          } else {
            expect(retrieved.posted_date).toBe(validDatePair.posted_date);
          }
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  }, 90000);

  /**
   * Feature: credit-card-posted-date
   * Property 9 Complement: Valid posted_date >= date is accepted
   * 
   * This is the complement test - verifying that valid date pairs ARE accepted.
   * For any expense where posted_date >= date, the API SHALL accept the request.
   * 
   * **Validates: Requirements 4.5 (inverse)**
   */
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

          // Verify that posted_date is >= date (sanity check)
          expect(datePair.posted_date >= datePair.date).toBe(true);

          // The create should succeed
          const created = await expenseService.createExpense(expenseData);
          createdIds.push(created.id);

          expect(created).toBeDefined();
          expect(created.id).toBeDefined();
          expect(created.posted_date).toBe(datePair.posted_date);
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  }, 60000);

  /**
   * Feature: credit-card-posted-date
   * Property 9 Edge Case: posted_date exactly one day before transaction date
   * 
   * Tests the boundary condition where posted_date is exactly one day before date.
   * 
   * **Validates: Requirements 4.5, 4.6**
   */
  test('Property 9 Edge Case: posted_date one day before transaction date is rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDateArb,
        safePlaceName().map(s => `PBT_OneDayBefore_${s.substring(0, 15)}`),
        safeAmount({ min: 0.01, max: 1000 }),
        fc.constantFrom(...CATEGORIES),
        fc.constantFrom('Cash', 'Debit', 'Cheque'),
        async (transactionDate, place, amount, type, method) => {
          const [year, month, day] = transactionDate.split('-').map(Number);
          
          // Calculate exactly one day before
          const txDate = new Date(year, month - 1, day);
          txDate.setDate(txDate.getDate() - 1);
          const postedDate = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;

          const expenseData = {
            date: transactionDate,
            posted_date: postedDate,
            place,
            amount: parseFloat(amount.toFixed(2)),
            type,
            method
          };

          // The create should throw an error
          await expect(expenseService.createExpense(expenseData))
            .rejects
            .toThrow('Posted date cannot be before transaction date');
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  }, 60000);

  /**
   * Feature: credit-card-posted-date
   * Property 9 Edge Case: posted_date equals transaction date is accepted
   * 
   * Tests the boundary condition where posted_date equals date (should be valid).
   * 
   * **Validates: Requirements 4.5**
   */
  test('Property 9 Edge Case: posted_date equals transaction date is accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDateArb,
        safePlaceName().map(s => `PBT_SameDay_${s.substring(0, 20)}`),
        safeAmount({ min: 0.01, max: 1000 }),
        fc.constantFrom(...CATEGORIES),
        fc.constantFrom('Cash', 'Debit', 'Cheque'),
        async (transactionDate, place, amount, type, method) => {
          const expenseData = {
            date: transactionDate,
            posted_date: transactionDate, // Same as transaction date
            place,
            amount: parseFloat(amount.toFixed(2)),
            type,
            method
          };

          // The create should succeed
          const created = await expenseService.createExpense(expenseData);
          createdIds.push(created.id);

          expect(created).toBeDefined();
          expect(created.id).toBeDefined();
          expect(created.posted_date).toBe(transactionDate);
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  }, 60000);
});

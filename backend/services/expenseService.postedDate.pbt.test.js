/**
 * Property-Based Tests for Credit Card Posted Date API Round-Trip
 * 
 * Feature: credit-card-posted-date
 * Properties 6 & 7: API Posted Date Acceptance and Response
 * Validates: Requirements 4.1, 4.2, 4.3
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, safePlaceName } = require('../test/pbtArbitraries');
const expenseService = require('./expenseService');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

describe('ExpenseService - Property-Based Tests for Posted Date API Round-Trip', () => {
  let db;
  const createdIds = [];

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterAll(async () => {
    // Clean up all created expenses
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
   * Generate a posted_date that is >= transaction date
   * Returns { date, posted_date } where posted_date is either null or >= date
   */
  const validDatePairArb = validDateArb.chain(transactionDate => {
    // Parse the transaction date
    const [year, month, day] = transactionDate.split('-').map(Number);
    
    return fc.oneof(
      // Option 1: NULL posted_date (most common case)
      fc.constant({ date: transactionDate, posted_date: null }),
      // Option 2: posted_date equals transaction date
      fc.constant({ date: transactionDate, posted_date: transactionDate }),
      // Option 3: posted_date is 1-30 days after transaction date
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
   * Property 6: API Posted Date Acceptance
   * 
   * For any valid expense data with an optional posted_date field (NULL, omitted, or valid date),
   * the create API endpoint SHALL accept the request and persist the posted_date value correctly.
   * 
   * **Validates: Requirements 4.1, 4.2**
   */
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

          // Create the expense - should not throw
          const created = await expenseService.createExpense(expenseData);
          createdIds.push(created.id);

          // Verify the expense was created with correct posted_date
          expect(created).toBeDefined();
          expect(created.id).toBeDefined();
          
          // posted_date should match what was provided (null or valid date)
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

  /**
   * Feature: credit-card-posted-date
   * Property 7: API Response Includes Posted Date
   * 
   * For any expense returned by the API (create, update, get, list), the response
   * SHALL include the posted_date field with its current value (including NULL).
   * 
   * **Validates: Requirements 4.3**
   */
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

          // Create the expense
          const created = await expenseService.createExpense(expenseData);
          createdIds.push(created.id);

          // Retrieve the expense by ID
          const retrieved = await expenseService.getExpenseById(created.id);

          // Property: Retrieved expense MUST include posted_date field
          expect(retrieved).toBeDefined();
          expect(retrieved).toHaveProperty('posted_date');
          
          // The posted_date value should match what was stored
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

  /**
   * Feature: credit-card-posted-date
   * Property 6 (Update): API accepts valid posted_date values on update
   * 
   * For any valid expense update with an optional posted_date field,
   * the update API endpoint SHALL accept the request and persist the posted_date value correctly.
   * 
   * **Validates: Requirements 4.2**
   */
  test('Property 6: API accepts valid posted_date values on update', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDatePairArb,
        validDatePairArb,
        safePlaceName().map(s => `PBT_Update_${s.substring(0, 20)}`),
        safeAmount({ min: 0.01, max: 1000 }),
        fc.constantFrom(...CATEGORIES),
        fc.constantFrom('Cash', 'Debit', 'Cheque'),
        async (initialDatePair, updatedDatePair, place, amount, type, method) => {
          // Create initial expense
          const initialData = {
            date: initialDatePair.date,
            posted_date: initialDatePair.posted_date,
            place,
            amount: parseFloat(amount.toFixed(2)),
            type,
            method
          };

          const created = await expenseService.createExpense(initialData);
          createdIds.push(created.id);

          // Update with new posted_date
          const updateData = {
            date: updatedDatePair.date,
            posted_date: updatedDatePair.posted_date,
            place,
            amount: parseFloat(amount.toFixed(2)),
            type,
            method
          };

          const updated = await expenseService.updateExpense(created.id, updateData);

          // Verify the update was successful
          expect(updated).toBeDefined();
          
          // posted_date should match the updated value
          if (updatedDatePair.posted_date === null) {
            expect(updated.posted_date).toBeNull();
          } else {
            expect(updated.posted_date).toBe(updatedDatePair.posted_date);
          }

          // Verify by retrieving again
          const retrieved = await expenseService.getExpenseById(created.id);
          if (updatedDatePair.posted_date === null) {
            expect(retrieved.posted_date).toBeNull();
          } else {
            expect(retrieved.posted_date).toBe(updatedDatePair.posted_date);
          }
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  }, 90000);

  /**
   * Feature: credit-card-posted-date
   * Property 6 & 7 Combined: Full round-trip test
   * 
   * Create -> Retrieve -> Update -> Retrieve cycle should preserve posted_date correctly.
   * 
   * **Validates: Requirements 4.1, 4.2, 4.3**
   */
  test('Properties 6 & 7: Full API round-trip preserves posted_date', async () => {
    await fc.assert(
      fc.asyncProperty(
        validDatePairArb,
        safePlaceName().map(s => `PBT_RoundTrip_${s.substring(0, 15)}`),
        safeAmount({ min: 0.01, max: 500 }),
        fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Other'),
        fc.constantFrom('Cash', 'Debit'),
        async (datePair, place, amount, type, method) => {
          // Step 1: Create expense with posted_date
          const createData = {
            date: datePair.date,
            posted_date: datePair.posted_date,
            place,
            amount: parseFloat(amount.toFixed(2)),
            type,
            method
          };

          const created = await expenseService.createExpense(createData);
          createdIds.push(created.id);

          // Step 2: Retrieve and verify posted_date is included
          const retrieved1 = await expenseService.getExpenseById(created.id);
          expect(retrieved1).toHaveProperty('posted_date');
          
          const expectedPostedDate = datePair.posted_date;
          if (expectedPostedDate === null) {
            expect(retrieved1.posted_date).toBeNull();
          } else {
            expect(retrieved1.posted_date).toBe(expectedPostedDate);
          }

          // Step 3: Update with same data (should preserve posted_date)
          const updated = await expenseService.updateExpense(created.id, createData);
          expect(updated).toBeDefined();

          // Step 4: Retrieve again and verify posted_date is still correct
          const retrieved2 = await expenseService.getExpenseById(created.id);
          expect(retrieved2).toHaveProperty('posted_date');
          
          if (expectedPostedDate === null) {
            expect(retrieved2.posted_date).toBeNull();
          } else {
            expect(retrieved2.posted_date).toBe(expectedPostedDate);
          }
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  }, 60000);
});

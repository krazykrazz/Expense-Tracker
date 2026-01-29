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

describe('LoanService Mortgage Round-Trip Property Tests', () => {
  const createdMortgageIds = [];

  beforeAll(async () => {
    await createTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterEach(async () => {
    // Clean up created mortgages
    for (const id of createdMortgageIds) {
      try {
        await loanRepository.delete(id);
      } catch (e) {
        // Ignore errors
      }
    }
    createdMortgageIds.length = 0;
  });

  /**
   * Property 2: Mortgage Data Round-Trip
   *
   * For any valid mortgage object with all required and optional fields populated,
   * storing the mortgage and then retrieving it by ID shall return an equivalent
   * mortgage object with all fields preserved.
   *
   * **Validates: Requirements 2.1, 2.2, 2.3**
   */
  describe('Property 2: Mortgage Data Round-Trip', () => {
    test('Creating and retrieving a mortgage should preserve all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          validMortgageArb,
          async (mortgageData) => {
            // Create the mortgage using the service
            const created = await loanService.createMortgage(mortgageData);
            createdMortgageIds.push(created.id);

            // Retrieve the mortgage by ID
            const retrieved = await loanRepository.findById(created.id);

            // Verify all required fields are preserved
            expect(retrieved).not.toBeNull();
            expect(retrieved.name).toBe(mortgageData.name.trim());
            expect(retrieved.initial_balance).toBeCloseTo(mortgageData.initial_balance, 2);
            expect(retrieved.start_date).toBe(mortgageData.start_date);
            expect(retrieved.loan_type).toBe('mortgage');
            expect(retrieved.amortization_period).toBe(mortgageData.amortization_period);
            expect(retrieved.term_length).toBe(mortgageData.term_length);
            expect(retrieved.renewal_date).toBe(mortgageData.renewal_date);
            expect(retrieved.rate_type).toBe(mortgageData.rate_type);
            expect(retrieved.payment_frequency).toBe(mortgageData.payment_frequency);

            // Verify optional fields
            if (mortgageData.notes !== null) {
              expect(retrieved.notes).toBe(mortgageData.notes.trim());
            } else {
              expect(retrieved.notes).toBeNull();
            }

            if (mortgageData.estimated_property_value !== null) {
              expect(retrieved.estimated_property_value).toBeCloseTo(mortgageData.estimated_property_value, 2);
            } else {
              expect(retrieved.estimated_property_value).toBeNull();
            }

            if (mortgageData.estimated_months_left !== null) {
              expect(retrieved.estimated_months_left).toBe(mortgageData.estimated_months_left);
            } else {
              expect(retrieved.estimated_months_left).toBeNull();
            }

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Creating and retrieving a mortgage with all fields populated should preserve all data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fullMortgageArb,
          async (mortgageData) => {
            // Create the mortgage using the service
            const created = await loanService.createMortgage(mortgageData);
            createdMortgageIds.push(created.id);

            // Retrieve the mortgage by ID
            const retrieved = await loanRepository.findById(created.id);

            // Verify all fields are preserved
            expect(retrieved).not.toBeNull();
            expect(retrieved.name).toBe(mortgageData.name.trim());
            expect(retrieved.initial_balance).toBeCloseTo(mortgageData.initial_balance, 2);
            expect(retrieved.start_date).toBe(mortgageData.start_date);
            expect(retrieved.loan_type).toBe('mortgage');
            expect(retrieved.notes).toBe(mortgageData.notes.trim());
            expect(retrieved.amortization_period).toBe(mortgageData.amortization_period);
            expect(retrieved.term_length).toBe(mortgageData.term_length);
            expect(retrieved.renewal_date).toBe(mortgageData.renewal_date);
            expect(retrieved.rate_type).toBe(mortgageData.rate_type);
            expect(retrieved.payment_frequency).toBe(mortgageData.payment_frequency);
            expect(retrieved.estimated_property_value).toBeCloseTo(mortgageData.estimated_property_value, 2);
            expect(retrieved.estimated_months_left).toBe(mortgageData.estimated_months_left);
            expect(retrieved.is_paid_off).toBe(0);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Updating a mortgage should preserve changes to allowed fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          validMortgageArb,
          fc.record({
            name: fc.option(safeString({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            notes: fc.option(safeString({ maxLength: 200 }), { nil: undefined }),
            estimated_property_value: fc.option(safeAmount({ min: 50000, max: 50000000 }), { nil: undefined }),
            renewal_date: fc.option(safeFutureDateString(), { nil: undefined })
          }).filter(u =>
            u.name !== undefined ||
            u.notes !== undefined ||
            u.estimated_property_value !== undefined ||
            u.renewal_date !== undefined
          ),
          async (mortgageData, updates) => {
            // Create the mortgage using the service
            const created = await loanService.createMortgage(mortgageData);
            createdMortgageIds.push(created.id);

            // Store original immutable values
            const originalInitialBalance = mortgageData.initial_balance;
            const originalStartDate = mortgageData.start_date;
            const originalAmortizationPeriod = mortgageData.amortization_period;
            const originalTermLength = mortgageData.term_length;

            // Update the mortgage using the service
            const updated = await loanService.updateMortgage(created.id, updates);

            // Verify the update was successful
            expect(updated).not.toBeNull();

            // Retrieve the mortgage to verify persistence
            const retrieved = await loanRepository.findById(created.id);

            // Verify allowed fields are updated
            if (updates.name !== undefined) {
              expect(retrieved.name).toBe(updates.name.trim());
            }
            if (updates.notes !== undefined) {
              expect(retrieved.notes).toBe(updates.notes.trim());
            }
            if (updates.estimated_property_value !== undefined) {
              expect(retrieved.estimated_property_value).toBeCloseTo(updates.estimated_property_value, 2);
            }
            if (updates.renewal_date !== undefined) {
              expect(retrieved.renewal_date).toBe(updates.renewal_date);
            }

            // Verify immutable fields are preserved
            expect(retrieved.initial_balance).toBeCloseTo(originalInitialBalance, 2);
            expect(retrieved.start_date).toBe(originalStartDate);
            expect(retrieved.amortization_period).toBe(originalAmortizationPeriod);
            expect(retrieved.term_length).toBe(originalTermLength);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Mortgage should be retrievable via getAllLoans with correct fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          validMortgageArb,
          async (mortgageData) => {
            // Create the mortgage using the service
            const created = await loanService.createMortgage(mortgageData);
            createdMortgageIds.push(created.id);

            // Retrieve all loans
            const allLoans = await loanService.getAllLoans();

            // Find our mortgage in the list
            const foundMortgage = allLoans.find(l => l.id === created.id);

            // Verify the mortgage is in the list with correct fields
            expect(foundMortgage).toBeDefined();
            expect(foundMortgage.loan_type).toBe('mortgage');
            expect(foundMortgage.amortization_period).toBe(mortgageData.amortization_period);
            expect(foundMortgage.term_length).toBe(mortgageData.term_length);
            expect(foundMortgage.renewal_date).toBe(mortgageData.renewal_date);
            expect(foundMortgage.rate_type).toBe(mortgageData.rate_type);
            expect(foundMortgage.payment_frequency).toBe(mortgageData.payment_frequency);
            expect(foundMortgage.isPaidOff).toBe(false);

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });
});

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

const fc = require('fast-check');
const { createTestDatabase, resetTestDatabase } = require('../database/db');
const loanService = require('./loanService');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const loanBalanceController = require('../controllers/loanBalanceController');
const { dbPbtOptions, safeString, safeAmount, safeDate, monthNumber, year } = require('../test/pbtArbitraries');

/**
 * Safe future date arbitrary for renewal dates
 */
const safeFutureDateString = () => {
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


describe('LoanService - Round-Trip Operations Property Tests', () => {
  const createdIds = [];

  beforeAll(async () => {
    await createTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterEach(async () => {
    for (const id of createdIds) {
      try {
        await loanRepository.delete(id);
      } catch (e) {
        // Ignore errors
      }
    }
    createdIds.length = 0;
  });

  // ============================================================================
  // Mortgage Round-Trip Tests (from loanService.roundtrip.pbt.test.js)
  // ============================================================================

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
            const created = await loanService.createMortgage(mortgageData);
            createdIds.push(created.id);

            const retrieved = await loanRepository.findById(created.id);

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
            const created = await loanService.createMortgage(mortgageData);
            createdIds.push(created.id);

            const retrieved = await loanRepository.findById(created.id);

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
            const created = await loanService.createMortgage(mortgageData);
            createdIds.push(created.id);

            const originalInitialBalance = mortgageData.initial_balance;
            const originalStartDate = mortgageData.start_date;
            const originalAmortizationPeriod = mortgageData.amortization_period;
            const originalTermLength = mortgageData.term_length;

            const updated = await loanService.updateMortgage(created.id, updates);
            expect(updated).not.toBeNull();

            const retrieved = await loanRepository.findById(created.id);

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
            const created = await loanService.createMortgage(mortgageData);
            createdIds.push(created.id);

            const allLoans = await loanService.getAllLoans();
            const foundMortgage = allLoans.find(l => l.id === created.id);

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


  // ============================================================================
  // API Round-Trip Tests (from loanService.apiRoundTrip.pbt.test.js)
  // ============================================================================

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
            const dataWithRate = { ...loanData, fixed_interest_rate: fixedRate };
            const created = await loanService.createLoan(dataWithRate);
            createdIds.push(created.id);

            const retrieved = await loanRepository.findById(created.id);

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
            const dataWithInitialRate = { ...loanData, fixed_interest_rate: initialRate };
            const created = await loanService.createLoan(dataWithInitialRate);
            createdIds.push(created.id);

            const updateData = { ...loanData, fixed_interest_rate: newRate };
            await loanService.updateLoan(created.id, updateData);

            const retrieved = await loanRepository.findById(created.id);

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
            const dataWithRate = { ...loanData, fixed_interest_rate: fixedRate };
            const created = await loanService.createLoan(dataWithRate);
            createdIds.push(created.id);

            const allLoans = await loanService.getAllLoans();
            const retrievedLoan = allLoans.find(l => l.id === created.id);
            expect(retrievedLoan).toBeDefined();

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
            const testLoanData = {
              ...loanData,
              start_date: '2024-01-15',
              fixed_interest_rate: fixedRate
            };
            const created = await loanService.createLoan(testLoanData);
            createdIds.push(created.id);

            const loansForMonth = await loanService.getLoansForMonth(2024, 6);
            const retrievedLoan = loansForMonth.find(l => l.id === created.id);
            expect(retrievedLoan).toBeDefined();

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
            const createData = { ...loanData, fixed_interest_rate: rate1 };
            const created = await loanService.createLoan(createData);
            createdIds.push(created.id);

            const afterCreate = await loanRepository.findById(created.id);
            expect(afterCreate.fixed_interest_rate).toBeCloseTo(rate1, 5);

            const updateData = { ...loanData, fixed_interest_rate: rate2 };
            await loanService.updateLoan(created.id, updateData);

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
            const createData = { ...loanData, fixed_interest_rate: initialRate };
            const created = await loanService.createLoan(createData);
            createdIds.push(created.id);

            const afterCreate = await loanRepository.findById(created.id);
            expect(afterCreate.fixed_interest_rate).toBeCloseTo(initialRate, 5);

            const updateData = { ...loanData, fixed_interest_rate: null };
            await loanService.updateLoan(created.id, updateData);

            const afterUpdate = await loanRepository.findById(created.id);
            expect(afterUpdate.fixed_interest_rate).toBeNull();

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });


  // ============================================================================
  // Backward Compatibility Tests (from loanService.backwardCompatibility.pbt.test.js)
  // ============================================================================

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
            const existingLoan = {
              name: loanData.name,
              initial_balance: loanData.initial_balance,
              start_date: loanData.start_date,
              notes: loanData.notes,
              loan_type: 'loan'
            };
            const createdLoan = await loanService.createLoan(existingLoan);
            createdIds.push(createdLoan.id);

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
            const variableLoan = { ...loanData, fixed_interest_rate: null };
            const createdLoan = await loanService.createLoan(variableLoan);
            createdIds.push(createdLoan.id);

            const req = createMockRequest({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance
            });
            const res = createMockResponse();

            await loanBalanceController.createOrUpdateBalance(req, res);

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
            const variableLoan = { ...loanData, fixed_interest_rate: null };
            const createdLoan = await loanService.createLoan(variableLoan);
            createdIds.push(createdLoan.id);

            const req = createMockRequest({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance,
              rate: explicitRate
            });
            const res = createMockResponse();

            await loanBalanceController.createOrUpdateBalance(req, res);

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
            const existingLoan = {
              name: loanData.name,
              initial_balance: loanData.initial_balance,
              start_date: loanData.start_date,
              notes: loanData.notes,
              loan_type: 'loan'
            };
            const createdLoan = await loanService.createLoan(existingLoan);
            createdIds.push(createdLoan.id);

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

            const nextMonth = testMonth === 12 ? 1 : testMonth + 1;
            const nextYear = testMonth === 12 ? testYear + 1 : testYear;
            
            const req2 = createMockRequest({
              loan_id: createdLoan.id,
              year: nextYear,
              month: nextMonth,
              remaining_balance: balance * 0.95,
              rate: rate2
            });
            const res2 = createMockResponse();
            await loanBalanceController.createOrUpdateBalance(req2, res2);
            expect(res2.statusCode).toBe(201);

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
            const existingLoan = {
              name: loanData.name,
              initial_balance: loanData.initial_balance,
              start_date: loanData.start_date,
              notes: loanData.notes,
              loan_type: 'loan'
            };
            const createdLoan = await loanService.createLoan(existingLoan);
            createdIds.push(createdLoan.id);

            const allLoans = await loanService.getAllLoans();
            const retrievedLoan = allLoans.find(l => l.id === createdLoan.id);

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
            const existingLoan = {
              name: loanData.name,
              initial_balance: loanData.initial_balance,
              start_date: loanData.start_date,
              notes: loanData.notes,
              loan_type: 'loan'
            };
            const createdLoan = await loanService.createLoan(existingLoan);
            createdIds.push(createdLoan.id);

            await loanBalanceRepository.create({
              loan_id: createdLoan.id,
              year: testYear,
              month: testMonth,
              remaining_balance: balance,
              rate: rate
            });

            const loan = await loanRepository.findById(createdLoan.id);
            const balanceEntry = await loanBalanceRepository.findByLoanAndMonth(
              createdLoan.id, testYear, testMonth
            );

            expect(loan.name).toBe(existingLoan.name.trim());
            expect(loan.initial_balance).toBeCloseTo(existingLoan.initial_balance, 2);
            expect(loan.start_date).toBe(existingLoan.start_date);
            expect(loan.loan_type).toBe('loan');
            expect(loan.fixed_interest_rate).toBeNull();

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
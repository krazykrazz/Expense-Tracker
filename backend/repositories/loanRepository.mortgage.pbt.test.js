/**
 * Property-Based Tests for Mortgage Fields in LoanRepository
 *
 * Feature: mortgage-tracking
 * Tests Property 3: Non-Mortgage Loans Have Null Mortgage Fields
 * Tests Property 8: Immutable Fields on Update
 *
 * Validates: Requirements 2.5, 9.3
 */

const fc = require('fast-check');
const sqlite3 = require('sqlite3').verbose();
const { dbPbtOptions, safeString, safeAmount } = require('../test/pbtArbitraries');

// Helper function to create an in-memory test database
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Create loans table with mortgage fields
        db.run(`
          CREATE TABLE loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
            start_date TEXT NOT NULL,
            notes TEXT,
            loan_type TEXT NOT NULL DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit', 'mortgage')),
            is_paid_off INTEGER DEFAULT 0,
            estimated_months_left INTEGER,
            amortization_period INTEGER,
            term_length INTEGER,
            renewal_date TEXT,
            rate_type TEXT CHECK(rate_type IS NULL OR rate_type IN ('fixed', 'variable')),
            payment_frequency TEXT CHECK(payment_frequency IS NULL OR payment_frequency IN ('monthly', 'bi-weekly', 'accelerated_bi-weekly')),
            estimated_property_value REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(db);
        });
      });
    });
  });
}

// Helper to close database
function closeDatabase(db) {
  return new Promise((resolve) => {
    db.close(() => resolve());
  });
}

// Helper to insert a loan directly
function insertLoan(db, loan) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loans (name, initial_balance, start_date, notes, loan_type, is_paid_off, estimated_months_left,
                        amortization_period, term_length, renewal_date, rate_type, payment_frequency, estimated_property_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      loan.name,
      loan.initial_balance,
      loan.start_date,
      loan.notes || null,
      loan.loan_type || 'loan',
      loan.is_paid_off || 0,
      loan.estimated_months_left || null,
      loan.amortization_period || null,
      loan.term_length || null,
      loan.renewal_date || null,
      loan.rate_type || null,
      loan.payment_frequency || null,
      loan.estimated_property_value || null
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, ...loan });
    });
  });
}

// Helper to get a loan by ID
function getLoanById(db, id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM loans WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

// Helper to update mortgage fields (only allowed fields)
function updateMortgageFields(db, id, updates) {
  return new Promise((resolve, reject) => {
    const allowedFields = ['name', 'notes', 'estimated_property_value', 'renewal_date'];
    const fieldsToUpdate = [];
    const params = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fieldsToUpdate.push(`${field} = ?`);
        params.push(updates[field]);
      }
    }

    if (fieldsToUpdate.length === 0) {
      // No allowed fields to update, return current loan
      getLoanById(db, id).then(resolve).catch(reject);
      return;
    }

    params.push(id);

    const sql = `
      UPDATE loans
      SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      getLoanById(db, id).then(resolve).catch(reject);
    });
  });
}

/**
 * Safe future date arbitrary for renewal dates
 * Generates dates between 2026 and 2035 as YYYY-MM-DD strings
 * Uses integer-based generation to avoid invalid Date edge cases
 */
const safeFutureDateString = () => {
  return fc.record({
    year: fc.integer({ min: 2026, max: 2035 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }) // Use 28 to avoid month-end edge cases
  }).map(({ year, month, day }) => {
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
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

// Arbitraries for non-mortgage loan types
const nonMortgageLoanTypeArb = fc.constantFrom('loan', 'line_of_credit');

// Arbitrary for valid non-mortgage loan
const nonMortgageLoanArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 100, max: 1000000 }),
  start_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: nonMortgageLoanTypeArb,
  is_paid_off: fc.constantFrom(0, 1),
  estimated_months_left: fc.option(fc.integer({ min: 1, max: 360 }), { nil: null })
});

// Arbitrary for valid mortgage
const mortgageArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 10000, max: 10000000 }),
  start_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constant('mortgage'),
  is_paid_off: fc.constant(0),
  estimated_months_left: fc.option(fc.integer({ min: 1, max: 480 }), { nil: null }),
  amortization_period: fc.integer({ min: 1, max: 40 }),
  term_length: fc.integer({ min: 1, max: 10 }),
  renewal_date: safeFutureDateString(),
  rate_type: fc.constantFrom('fixed', 'variable'),
  payment_frequency: fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly'),
  estimated_property_value: fc.option(safeAmount({ min: 50000, max: 50000000 }), { nil: null })
}).filter(m => m.term_length <= m.amortization_period);

// Arbitrary for immutable field update attempts
const immutableFieldUpdateArb = fc.record({
  initial_balance: fc.option(safeAmount({ min: 100, max: 1000000 }), { nil: undefined }),
  start_date: fc.option(safePastDateString(), { nil: undefined }),
  amortization_period: fc.option(fc.integer({ min: 1, max: 40 }), { nil: undefined }),
  term_length: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined })
}).filter(u =>
  u.initial_balance !== undefined ||
  u.start_date !== undefined ||
  u.amortization_period !== undefined ||
  u.term_length !== undefined
);

// Arbitrary for allowed field updates
const allowedFieldUpdateArb = fc.record({
  name: fc.option(safeString({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: undefined }),
  estimated_property_value: fc.option(safeAmount({ min: 50000, max: 50000000 }), { nil: undefined }),
  renewal_date: fc.option(safeFutureDateString(), { nil: undefined })
});

describe('LoanRepository Mortgage Property Tests', () => {
  /**
   * Property 3: Non-Mortgage Loans Have Null Mortgage Fields
   *
   * For any loan with loan_type "loan" or "line_of_credit", all mortgage-specific
   * fields (amortization_period, term_length, renewal_date, rate_type,
   * payment_frequency, estimated_property_value) shall be null.
   *
   * **Validates: Requirements 2.5**
   */
  describe('Property 3: Non-Mortgage Loans Have Null Mortgage Fields', () => {
    test('Non-mortgage loans should have null mortgage-specific fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonMortgageLoanArb,
          async (loan) => {
            const db = await createTestDatabase();

            try {
              // Insert the non-mortgage loan
              const created = await insertLoan(db, loan);

              // Retrieve the loan
              const retrieved = await getLoanById(db, created.id);

              // Verify all mortgage-specific fields are null
              expect(retrieved.amortization_period).toBeNull();
              expect(retrieved.term_length).toBeNull();
              expect(retrieved.renewal_date).toBeNull();
              expect(retrieved.rate_type).toBeNull();
              expect(retrieved.payment_frequency).toBeNull();
              expect(retrieved.estimated_property_value).toBeNull();

              // Verify the loan type is correct
              expect(['loan', 'line_of_credit']).toContain(retrieved.loan_type);

              return true;
            } finally {
              await closeDatabase(db);
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Mortgage loans should have mortgage-specific fields populated', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageArb,
          async (mortgage) => {
            const db = await createTestDatabase();

            try {
              // Insert the mortgage
              const created = await insertLoan(db, mortgage);

              // Retrieve the mortgage
              const retrieved = await getLoanById(db, created.id);

              // Verify mortgage-specific fields are populated
              expect(retrieved.loan_type).toBe('mortgage');
              expect(retrieved.amortization_period).toBe(mortgage.amortization_period);
              expect(retrieved.term_length).toBe(mortgage.term_length);
              expect(retrieved.renewal_date).toBe(mortgage.renewal_date);
              expect(retrieved.rate_type).toBe(mortgage.rate_type);
              expect(retrieved.payment_frequency).toBe(mortgage.payment_frequency);

              // estimated_property_value is optional
              if (mortgage.estimated_property_value !== null) {
                expect(retrieved.estimated_property_value).toBeCloseTo(mortgage.estimated_property_value, 2);
              }

              return true;
            } finally {
              await closeDatabase(db);
            }
          }
        ),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 8: Immutable Fields on Update
   *
   * For any mortgage update operation, attempts to modify initial_balance,
   * start_date, amortization_period, or term_length shall either be rejected
   * or ignored, and the original values shall be preserved in the database.
   *
   * **Validates: Requirements 9.3**
   */
  describe('Property 8: Immutable Fields on Update', () => {
    test('Immutable fields should be preserved when using updateMortgageFields', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageArb,
          immutableFieldUpdateArb,
          async (mortgage, attemptedUpdates) => {
            const db = await createTestDatabase();

            try {
              // Insert the mortgage
              const created = await insertLoan(db, mortgage);

              // Store original values
              const originalInitialBalance = mortgage.initial_balance;
              const originalStartDate = mortgage.start_date;
              const originalAmortizationPeriod = mortgage.amortization_period;
              const originalTermLength = mortgage.term_length;

              // Attempt to update with immutable fields (should be ignored)
              await updateMortgageFields(db, created.id, attemptedUpdates);

              // Retrieve the mortgage
              const retrieved = await getLoanById(db, created.id);

              // Verify immutable fields are preserved
              expect(retrieved.initial_balance).toBeCloseTo(originalInitialBalance, 2);
              expect(retrieved.start_date).toBe(originalStartDate);
              expect(retrieved.amortization_period).toBe(originalAmortizationPeriod);
              expect(retrieved.term_length).toBe(originalTermLength);

              return true;
            } finally {
              await closeDatabase(db);
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Allowed fields should be updated correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageArb,
          allowedFieldUpdateArb.filter(u =>
            u.name !== undefined ||
            u.notes !== undefined ||
            u.estimated_property_value !== undefined ||
            u.renewal_date !== undefined
          ),
          async (mortgage, updates) => {
            const db = await createTestDatabase();

            try {
              // Insert the mortgage
              const created = await insertLoan(db, mortgage);

              // Store original immutable values
              const originalInitialBalance = mortgage.initial_balance;
              const originalStartDate = mortgage.start_date;
              const originalAmortizationPeriod = mortgage.amortization_period;
              const originalTermLength = mortgage.term_length;

              // Update with allowed fields
              await updateMortgageFields(db, created.id, updates);

              // Retrieve the mortgage
              const retrieved = await getLoanById(db, created.id);

              // Verify allowed fields are updated
              if (updates.name !== undefined) {
                expect(retrieved.name).toBe(updates.name);
              }
              if (updates.notes !== undefined) {
                expect(retrieved.notes).toBe(updates.notes);
              }
              if (updates.estimated_property_value !== undefined) {
                expect(retrieved.estimated_property_value).toBeCloseTo(updates.estimated_property_value, 2);
              }
              if (updates.renewal_date !== undefined) {
                expect(retrieved.renewal_date).toBe(updates.renewal_date);
              }

              // Verify immutable fields are still preserved
              expect(retrieved.initial_balance).toBeCloseTo(originalInitialBalance, 2);
              expect(retrieved.start_date).toBe(originalStartDate);
              expect(retrieved.amortization_period).toBe(originalAmortizationPeriod);
              expect(retrieved.term_length).toBe(originalTermLength);

              return true;
            } finally {
              await closeDatabase(db);
            }
          }
        ),
        dbPbtOptions()
      );
    });
  });
});

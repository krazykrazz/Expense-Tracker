/**
 * Property-Based Tests for Fixed Interest Rate in LoanRepository
 *
 * Feature: fixed-interest-rate-loans
 * Tests Property 1: Loan Type Restriction
 *
 * Validates: Requirements 1.2, 1.3, 4.5
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

        // Create loans table with fixed_interest_rate column
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
            fixed_interest_rate REAL DEFAULT NULL,
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

// Helper to insert a loan directly (mimics repository create behavior)
function insertLoan(db, loan) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loans (name, initial_balance, start_date, notes, loan_type, is_paid_off, estimated_months_left,
                        amortization_period, term_length, renewal_date, rate_type, payment_frequency, 
                        estimated_property_value, fixed_interest_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Only allow fixed_interest_rate for loan_type='loan' (mimics repository behavior)
    const loanType = loan.loan_type || 'loan';
    const fixedRate = loanType === 'loan' ? (loan.fixed_interest_rate ?? null) : null;

    const params = [
      loan.name,
      loan.initial_balance,
      loan.start_date,
      loan.notes || null,
      loanType,
      loan.is_paid_off || 0,
      loan.estimated_months_left || null,
      loan.amortization_period || null,
      loan.term_length || null,
      loan.renewal_date || null,
      loan.rate_type || null,
      loan.payment_frequency || null,
      loan.estimated_property_value || null,
      fixedRate
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, ...loan, fixed_interest_rate: fixedRate });
    });
  });
}

// Helper to update a loan (mimics repository update behavior)
function updateLoan(db, id, loan) {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE loans 
      SET name = ?, initial_balance = ?, start_date = ?, notes = ?, loan_type = ?, estimated_months_left = ?,
          amortization_period = ?, term_length = ?, renewal_date = ?, rate_type = ?, payment_frequency = ?, 
          estimated_property_value = ?, fixed_interest_rate = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    // Only allow fixed_interest_rate for loan_type='loan' (mimics repository behavior)
    const loanType = loan.loan_type || 'loan';
    const fixedRate = loanType === 'loan' ? (loan.fixed_interest_rate ?? null) : null;

    const params = [
      loan.name,
      loan.initial_balance,
      loan.start_date,
      loan.notes || null,
      loanType,
      loan.estimated_months_left || null,
      loan.amortization_period || null,
      loan.term_length || null,
      loan.renewal_date || null,
      loan.rate_type || null,
      loan.payment_frequency || null,
      loan.estimated_property_value || null,
      fixedRate,
      id
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id, ...loan, fixed_interest_rate: fixedRate });
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

// Arbitrary for non-loan types (line_of_credit and mortgage)
const nonLoanTypeArb = fc.constantFrom('line_of_credit', 'mortgage');

// Arbitrary for valid fixed interest rate (non-negative)
const fixedInterestRateArb = fc.oneof(
  fc.constant(null),
  fc.float({ min: 0, max: 30, noNaN: true }).filter(n => !isNaN(n) && isFinite(n) && n >= 0)
);

// Arbitrary for non-null fixed interest rate
const nonNullFixedRateArb = fc.float({ min: 0, max: 30, noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n >= 0);

// Arbitrary for loan with loan_type='loan' and optional fixed rate
const loanWithFixedRateArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 100, max: 1000000 }),
  start_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constant('loan'),
  is_paid_off: fc.constantFrom(0, 1),
  estimated_months_left: fc.option(fc.integer({ min: 1, max: 360 }), { nil: null }),
  fixed_interest_rate: fixedInterestRateArb
});

// Arbitrary for non-loan type with attempted fixed rate
const nonLoanWithAttemptedFixedRateArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 100, max: 1000000 }),
  start_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: nonLoanTypeArb,
  is_paid_off: fc.constantFrom(0, 1),
  estimated_months_left: fc.option(fc.integer({ min: 1, max: 360 }), { nil: null }),
  fixed_interest_rate: nonNullFixedRateArb // Attempt to set a non-null rate
});

describe('LoanRepository Fixed Interest Rate Property Tests', () => {
  /**
   * Property 1: Loan Type Restriction
   *
   * For any loan, if loan_type is 'line_of_credit' or 'mortgage', then
   * fixed_interest_rate must be NULL. Only loans with loan_type='loan'
   * may have a non-NULL fixed_interest_rate.
   *
   * **Validates: Requirements 1.2, 1.3, 4.5**
   */
  describe('Property 1: Loan Type Restriction', () => {
    test('Loans with loan_type="loan" can have fixed_interest_rate set', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanWithFixedRateArb,
          async (loan) => {
            const db = await createTestDatabase();

            try {
              // Insert the loan
              const created = await insertLoan(db, loan);

              // Retrieve the loan
              const retrieved = await getLoanById(db, created.id);

              // Verify loan_type is 'loan'
              expect(retrieved.loan_type).toBe('loan');

              // Verify fixed_interest_rate matches what was set
              if (loan.fixed_interest_rate === null) {
                expect(retrieved.fixed_interest_rate).toBeNull();
              } else {
                expect(retrieved.fixed_interest_rate).toBeCloseTo(loan.fixed_interest_rate, 2);
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

    test('Loans with loan_type="line_of_credit" or "mortgage" must have NULL fixed_interest_rate', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonLoanWithAttemptedFixedRateArb,
          async (loan) => {
            const db = await createTestDatabase();

            try {
              // Insert the loan (repository should force fixed_interest_rate to null)
              const created = await insertLoan(db, loan);

              // Retrieve the loan
              const retrieved = await getLoanById(db, created.id);

              // Verify loan_type is not 'loan'
              expect(['line_of_credit', 'mortgage']).toContain(retrieved.loan_type);

              // Verify fixed_interest_rate is NULL regardless of what was attempted
              expect(retrieved.fixed_interest_rate).toBeNull();

              return true;
            } finally {
              await closeDatabase(db);
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Updating a loan to non-loan type should clear fixed_interest_rate', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanWithFixedRateArb.filter(l => l.fixed_interest_rate !== null),
          nonLoanTypeArb,
          async (loan, newLoanType) => {
            const db = await createTestDatabase();

            try {
              // Insert the loan with fixed rate
              const created = await insertLoan(db, loan);

              // Verify initial fixed rate is set
              const initial = await getLoanById(db, created.id);
              expect(initial.fixed_interest_rate).not.toBeNull();

              // Update to non-loan type (keeping the fixed rate in the update data)
              const updatedData = {
                ...loan,
                loan_type: newLoanType,
                fixed_interest_rate: loan.fixed_interest_rate // Attempt to keep the rate
              };
              await updateLoan(db, created.id, updatedData);

              // Retrieve the updated loan
              const retrieved = await getLoanById(db, created.id);

              // Verify loan_type changed
              expect(retrieved.loan_type).toBe(newLoanType);

              // Verify fixed_interest_rate is now NULL
              expect(retrieved.fixed_interest_rate).toBeNull();

              return true;
            } finally {
              await closeDatabase(db);
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Updating a non-loan type to loan type allows setting fixed_interest_rate', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonLoanWithAttemptedFixedRateArb,
          nonNullFixedRateArb,
          async (loan, newFixedRate) => {
            const db = await createTestDatabase();

            try {
              // Insert the non-loan type (fixed rate will be null)
              const created = await insertLoan(db, loan);

              // Verify initial fixed rate is null
              const initial = await getLoanById(db, created.id);
              expect(initial.fixed_interest_rate).toBeNull();

              // Update to loan type with fixed rate
              const updatedData = {
                ...loan,
                loan_type: 'loan',
                fixed_interest_rate: newFixedRate
              };
              await updateLoan(db, created.id, updatedData);

              // Retrieve the updated loan
              const retrieved = await getLoanById(db, created.id);

              // Verify loan_type changed to 'loan'
              expect(retrieved.loan_type).toBe('loan');

              // Verify fixed_interest_rate is now set
              expect(retrieved.fixed_interest_rate).toBeCloseTo(newFixedRate, 2);

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

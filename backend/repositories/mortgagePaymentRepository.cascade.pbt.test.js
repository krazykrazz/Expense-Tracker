/**
 * Property-Based Tests for MortgagePaymentRepository Cascade Delete
 *
 * Feature: mortgage-insights
 * Tests Property 10: Cascade Delete Integrity
 *
 * Validates: Requirements 8.5
  *
 * @invariant Cascade Delete Integrity: For any mortgage with associated payments, deleting the parent loan cascades to remove all its payment records; no orphaned payments remain. Randomization covers diverse payment counts and loan configurations.
 */

const fc = require('fast-check');
const sqlite3 = require('sqlite3').verbose();
const { dbPbtOptions, safeString, safeAmount } = require('../test/pbtArbitraries');

// Helper function to create an in-memory test database with required tables
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

        // Create loans table
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

          // Create mortgage_payments table with CASCADE DELETE
          db.run(`
            CREATE TABLE mortgage_payments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              loan_id INTEGER NOT NULL,
              payment_amount REAL NOT NULL,
              effective_date TEXT NOT NULL,
              notes TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
            )
          `, (err) => {
            if (err) {
              reject(err);
              return;
            }

            // Create indexes
            db.run(`CREATE INDEX idx_mortgage_payments_loan_id ON mortgage_payments(loan_id)`, (err) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(db);
            });
          });
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

// Helper to insert a mortgage
function insertMortgage(db, mortgage) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loans (name, initial_balance, start_date, notes, loan_type, amortization_period, term_length, renewal_date, rate_type, payment_frequency)
      VALUES (?, ?, ?, ?, 'mortgage', ?, ?, ?, ?, ?)
    `;

    const params = [
      mortgage.name,
      mortgage.initial_balance,
      mortgage.start_date,
      mortgage.notes || null,
      mortgage.amortization_period,
      mortgage.term_length,
      mortgage.renewal_date,
      mortgage.rate_type,
      mortgage.payment_frequency
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, ...mortgage, loan_type: 'mortgage' });
    });
  });
}

// Helper to insert a payment entry
function insertPayment(db, payment) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO mortgage_payments (loan_id, payment_amount, effective_date, notes)
      VALUES (?, ?, ?, ?)
    `;

    const params = [
      payment.loan_id,
      payment.payment_amount,
      payment.effective_date,
      payment.notes || null
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, ...payment });
    });
  });
}

// Helper to delete a mortgage
function deleteMortgage(db, id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM loans WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}

// Helper to count payments for a mortgage
function countPaymentsForMortgage(db, mortgageId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM mortgage_payments WHERE loan_id = ?', [mortgageId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row ? row.count : 0);
    });
  });
}

// Helper to count all payments
function countAllPayments(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM mortgage_payments', (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row ? row.count : 0);
    });
  });
}

// Helper to get all payments
function getAllPayments(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM mortgage_payments', (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

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
 * Safe future date arbitrary for renewal dates
 */
const safeFutureDateString = () => {
  return fc.record({
    year: fc.integer({ min: 2026, max: 2035 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  }).map(({ year, month, day }) => {
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  });
};

// Arbitrary for valid mortgage
const mortgageArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 10000, max: 10000000 }),
  start_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  amortization_period: fc.integer({ min: 1, max: 40 }),
  term_length: fc.integer({ min: 1, max: 10 }),
  renewal_date: safeFutureDateString(),
  rate_type: fc.constantFrom('fixed', 'variable'),
  payment_frequency: fc.constantFrom('monthly', 'bi-weekly', 'accelerated_bi-weekly')
}).filter(m => m.term_length <= m.amortization_period);

// Arbitrary for valid payment entry
const paymentEntryArb = fc.record({
  payment_amount: safeAmount({ min: 100, max: 50000 }),
  effective_date: safePastDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null })
});

// Arbitrary for array of payment entries (1-10 entries)
const paymentEntriesArb = fc.array(paymentEntryArb, { minLength: 1, maxLength: 10 });

describe('MortgagePaymentRepository Cascade Delete Property Tests', () => {
  /**
   * Property 10: Cascade Delete Integrity
   *
   * For any mortgage with associated payment entries, deleting the mortgage
   * shall result in all associated payment entries being deleted (no orphaned records).
   *
   * **Validates: Requirements 8.5**
   */
  describe('Property 10: Cascade Delete Integrity', () => {
    test('Deleting a mortgage should cascade delete all associated payment entries', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageArb,
          paymentEntriesArb,
          async (mortgage, payments) => {
            const db = await createTestDatabase();

            try {
              // Insert the mortgage
              const createdMortgage = await insertMortgage(db, mortgage);

              // Insert all payment entries for this mortgage
              for (const payment of payments) {
                await insertPayment(db, {
                  ...payment,
                  loan_id: createdMortgage.id
                });
              }

              // Verify payments were created
              const paymentCountBefore = await countPaymentsForMortgage(db, createdMortgage.id);
              expect(paymentCountBefore).toBe(payments.length);

              // Delete the mortgage
              const deleted = await deleteMortgage(db, createdMortgage.id);
              expect(deleted).toBe(true);

              // Verify all associated payments were cascade deleted
              const paymentCountAfter = await countPaymentsForMortgage(db, createdMortgage.id);
              expect(paymentCountAfter).toBe(0);

              // Verify no orphaned records exist
              const allPayments = await getAllPayments(db);
              const orphanedPayments = allPayments.filter(p => p.loan_id === createdMortgage.id);
              expect(orphanedPayments.length).toBe(0);

              return true;
            } finally {
              await closeDatabase(db);
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Deleting one mortgage should not affect payments of other mortgages', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageArb,
          mortgageArb,
          paymentEntriesArb,
          paymentEntriesArb,
          async (mortgage1, mortgage2, payments1, payments2) => {
            const db = await createTestDatabase();

            try {
              // Insert two mortgages
              const createdMortgage1 = await insertMortgage(db, mortgage1);
              const createdMortgage2 = await insertMortgage(db, mortgage2);

              // Insert payments for mortgage 1
              for (const payment of payments1) {
                await insertPayment(db, {
                  ...payment,
                  loan_id: createdMortgage1.id
                });
              }

              // Insert payments for mortgage 2
              for (const payment of payments2) {
                await insertPayment(db, {
                  ...payment,
                  loan_id: createdMortgage2.id
                });
              }

              // Verify initial state
              const totalPaymentsBefore = await countAllPayments(db);
              expect(totalPaymentsBefore).toBe(payments1.length + payments2.length);

              // Delete mortgage 1
              await deleteMortgage(db, createdMortgage1.id);

              // Verify mortgage 1's payments are deleted
              const mortgage1PaymentsAfter = await countPaymentsForMortgage(db, createdMortgage1.id);
              expect(mortgage1PaymentsAfter).toBe(0);

              // Verify mortgage 2's payments are preserved
              const mortgage2PaymentsAfter = await countPaymentsForMortgage(db, createdMortgage2.id);
              expect(mortgage2PaymentsAfter).toBe(payments2.length);

              // Verify total count is correct
              const totalPaymentsAfter = await countAllPayments(db);
              expect(totalPaymentsAfter).toBe(payments2.length);

              return true;
            } finally {
              await closeDatabase(db);
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Mortgage with no payments can be deleted without errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageArb,
          async (mortgage) => {
            const db = await createTestDatabase();

            try {
              // Insert the mortgage without any payments
              const createdMortgage = await insertMortgage(db, mortgage);

              // Verify no payments exist
              const paymentCountBefore = await countPaymentsForMortgage(db, createdMortgage.id);
              expect(paymentCountBefore).toBe(0);

              // Delete the mortgage (should succeed without errors)
              const deleted = await deleteMortgage(db, createdMortgage.id);
              expect(deleted).toBe(true);

              // Verify mortgage is deleted
              const paymentCountAfter = await countPaymentsForMortgage(db, createdMortgage.id);
              expect(paymentCountAfter).toBe(0);

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

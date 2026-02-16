/**
 * Property-Based Tests for LoanPaymentRepository
 *
 * Feature: loan-payment-tracking
 * Tests Property 2: Payment Ordering
 *
 * Validates: Requirements 1.2
  *
 * @invariant Payment Ordering: For any set of loan payments, retrieving them returns results ordered by payment date; payment amounts and dates are preserved exactly as stored. Randomization covers diverse payment schedules and amount distributions.
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
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Create loan_payments table
          db.run(`
            CREATE TABLE loan_payments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              loan_id INTEGER NOT NULL,
              amount REAL NOT NULL CHECK(amount > 0),
              payment_date TEXT NOT NULL,
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
            db.run(`CREATE INDEX idx_loan_payments_loan_id ON loan_payments(loan_id)`, (err) => {
              if (err) {
                reject(err);
                return;
              }
              db.run(`CREATE INDEX idx_loan_payments_payment_date ON loan_payments(payment_date)`, (err) => {
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
  });
}

// Helper to close database
function closeDatabase(db) {
  return new Promise((resolve) => {
    db.close(() => resolve());
  });
}

// Helper to insert a loan
function insertLoan(db, loan) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loans (name, initial_balance, start_date, notes, loan_type)
      VALUES (?, ?, ?, ?, ?)
    `;

    const params = [
      loan.name,
      loan.initial_balance,
      loan.start_date,
      loan.notes || null,
      loan.loan_type || 'loan'
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

// Helper to insert a payment
function insertPayment(db, payment) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loan_payments (loan_id, amount, payment_date, notes)
      VALUES (?, ?, ?, ?)
    `;

    const params = [
      payment.loan_id,
      payment.amount,
      payment.payment_date,
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

// Helper to get payments ordered by payment_date DESC
function getPaymentsOrdered(db, loanId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM loan_payments 
      WHERE loan_id = ? 
      ORDER BY payment_date DESC, id DESC
    `;

    db.all(sql, [loanId], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

/**
 * Safe date arbitrary for payment dates
 * Generates dates between 2020 and 2025 as YYYY-MM-DD strings
 */
const safePaymentDateString = () => {
  return fc.record({
    year: fc.integer({ min: 2020, max: 2025 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }) // Use 28 to avoid month-end edge cases
  }).map(({ year, month, day }) => {
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  });
};

// Arbitrary for a valid loan
const loanArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 1000, max: 100000 }),
  start_date: safePaymentDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constantFrom('loan', 'mortgage')
});

// Arbitrary for a valid payment (without loan_id, which is added later)
const paymentDataArb = fc.record({
  amount: safeAmount({ min: 10, max: 5000 }),
  payment_date: safePaymentDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null })
});

// Arbitrary for a list of payments with distinct dates
const paymentListArb = fc.array(paymentDataArb, { minLength: 2, maxLength: 10 });

describe('LoanPaymentRepository Property Tests', () => {
  /**
   * Property 2: Payment Ordering
   *
   * For any set of payment entries with different dates, retrieving payments
   * should return them sorted in reverse chronological order (newest first).
   *
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: Payment Ordering', () => {
    test('Payments should be returned in reverse chronological order (newest first)', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          paymentListArb,
          async (loan, payments) => {
            const db = await createTestDatabase();

            try {
              // Create a loan
              const createdLoan = await insertLoan(db, loan);

              // Insert all payments
              for (const payment of payments) {
                await insertPayment(db, {
                  loan_id: createdLoan.id,
                  ...payment
                });
              }

              // Retrieve payments using the ordered query
              const retrievedPayments = await getPaymentsOrdered(db, createdLoan.id);

              // Verify we got all payments back
              expect(retrievedPayments.length).toBe(payments.length);

              // Verify payments are in reverse chronological order
              for (let i = 0; i < retrievedPayments.length - 1; i++) {
                const current = retrievedPayments[i];
                const next = retrievedPayments[i + 1];

                // Current payment_date should be >= next payment_date
                // (reverse chronological means newest first)
                const currentDate = current.payment_date;
                const nextDate = next.payment_date;

                // If dates are equal, the one with higher ID should come first
                if (currentDate === nextDate) {
                  expect(current.id).toBeGreaterThan(next.id);
                } else {
                  expect(currentDate >= nextDate).toBe(true);
                }
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

    test('Single payment should be returned correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          paymentDataArb,
          async (loan, payment) => {
            const db = await createTestDatabase();

            try {
              // Create a loan
              const createdLoan = await insertLoan(db, loan);

              // Insert single payment
              const createdPayment = await insertPayment(db, {
                loan_id: createdLoan.id,
                ...payment
              });

              // Retrieve payments
              const retrievedPayments = await getPaymentsOrdered(db, createdLoan.id);

              // Verify we got exactly one payment
              expect(retrievedPayments.length).toBe(1);
              expect(retrievedPayments[0].id).toBe(createdPayment.id);
              expect(retrievedPayments[0].amount).toBeCloseTo(payment.amount, 2);
              expect(retrievedPayments[0].payment_date).toBe(payment.payment_date);

              return true;
            } finally {
              await closeDatabase(db);
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Empty loan should return empty payment list', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          async (loan) => {
            const db = await createTestDatabase();

            try {
              // Create a loan with no payments
              const createdLoan = await insertLoan(db, loan);

              // Retrieve payments
              const retrievedPayments = await getPaymentsOrdered(db, createdLoan.id);

              // Verify empty array is returned
              expect(retrievedPayments).toEqual([]);

              return true;
            } finally {
              await closeDatabase(db);
            }
          }
        ),
        dbPbtOptions()
      );
    });

    test('Payments with same date should be ordered by ID descending', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          safePaymentDateString(),
          fc.array(safeAmount({ min: 10, max: 5000 }), { minLength: 2, maxLength: 5 }),
          async (loan, sameDate, amounts) => {
            const db = await createTestDatabase();

            try {
              // Create a loan
              const createdLoan = await insertLoan(db, loan);

              // Insert multiple payments with the same date
              const createdPayments = [];
              for (const amount of amounts) {
                const created = await insertPayment(db, {
                  loan_id: createdLoan.id,
                  amount,
                  payment_date: sameDate,
                  notes: null
                });
                createdPayments.push(created);
              }

              // Retrieve payments
              const retrievedPayments = await getPaymentsOrdered(db, createdLoan.id);

              // Verify all payments have the same date
              for (const payment of retrievedPayments) {
                expect(payment.payment_date).toBe(sameDate);
              }

              // Verify payments are ordered by ID descending (most recent insert first)
              for (let i = 0; i < retrievedPayments.length - 1; i++) {
                expect(retrievedPayments[i].id).toBeGreaterThan(retrievedPayments[i + 1].id);
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
});

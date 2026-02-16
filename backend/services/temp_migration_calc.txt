/**
 * Property-Based Tests for MigrationService - Payment Calculation
 *
 * Feature: loan-payment-tracking
 * Tests Property 10: Migration Payment Calculation
 *
 * For any sequence of balance entries [B1, B2, B3, ...] in chronological order,
 * the migration should create payments with amounts equal to the positive differences
 * (B1-B2, B2-B3, ...) where the balance decreased.
 *
 * **Validates: Requirements 4.1, 4.2**
 */

const fc = require('fast-check');
const sqlite3 = require('sqlite3').verbose();
const { dbPbtOptions, safeString, safeAmount } = require('../test/pbtArbitraries');

// Mock the database module
let mockDb = null;

jest.mock('../database/db', () => ({
  getDatabase: jest.fn(() => Promise.resolve(mockDb))
}));

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

          // Create loan_balances table
          db.run(`
            CREATE TABLE loan_balances (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              loan_id INTEGER NOT NULL,
              year INTEGER NOT NULL,
              month INTEGER NOT NULL,
              remaining_balance REAL NOT NULL,
              rate REAL,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
              UNIQUE(loan_id, year, month)
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

// Helper to insert a loan directly
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

// Helper to insert a balance entry directly
function insertBalanceEntry(db, entry) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate)
      VALUES (?, ?, ?, ?, ?)
    `;

    const params = [
      entry.loan_id,
      entry.year,
      entry.month,
      entry.remaining_balance,
      entry.rate || 5.0
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, ...entry });
    });
  });
}

// Arbitrary for a valid loan
const loanArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 10000, max: 100000 }),
  start_date: fc.constant('2020-01-01'),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constantFrom('loan', 'mortgage')
});

/**
 * Generate a sequence of balance entries with decreasing balances
 * This simulates a loan being paid down over time
 */
const decreasingBalanceSequenceArb = (initialBalance) => {
  return fc.integer({ min: 2, max: 6 }).chain(numEntries => {
    // Generate payment amounts that sum to less than initial balance
    return fc.array(
      safeAmount({ min: 100, max: initialBalance / numEntries }),
      { minLength: numEntries - 1, maxLength: numEntries - 1 }
    ).map(payments => {
      const entries = [];
      let currentBalance = initialBalance;
      let year = 2020;
      let month = 1;
      
      // First entry is the initial balance
      entries.push({
        year,
        month,
        remaining_balance: currentBalance
      });
      
      // Subsequent entries decrease by payment amounts
      for (const payment of payments) {
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
        currentBalance = Math.max(0, currentBalance - payment);
        entries.push({
          year,
          month,
          remaining_balance: currentBalance
        });
      }
      
      return { entries, expectedPayments: payments };
    });
  });
};

describe('MigrationService Property Tests - Payment Calculation', () => {
  // Clear module cache before each test to get fresh service instances
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(async () => {
    if (mockDb) {
      await closeDatabase(mockDb);
      mockDb = null;
    }
  });

  /**
   * Property 10: Migration Payment Calculation
   *
   * For any sequence of balance entries [B1, B2, B3, ...] in chronological order,
   * the migration should create payments with amounts equal to the positive differences
   * (B1-B2, B2-B3, ...) where the balance decreased.
   *
   * **Validates: Requirements 4.1, 4.2**
   */
  describe('Property 10: Migration Payment Calculation', () => {
    test('Migration calculates payment amounts from consecutive balance differences', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.integer({ min: 10000, max: 50000 }).chain(initialBalance => 
            decreasingBalanceSequenceArb(initialBalance).map(seq => ({
              initialBalance,
              ...seq
            }))
          ),
          async (loan, { initialBalance, entries, expectedPayments }) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const migrationService = require('./migrationService');

            // Create a loan with the specified initial balance
            const createdLoan = await insertLoan(mockDb, {
              ...loan,
              initial_balance: initialBalance
            });

            // Insert balance entries
            for (const entry of entries) {
              await insertBalanceEntry(mockDb, {
                loan_id: createdLoan.id,
                ...entry
              });
            }

            // Run migration
            const result = await migrationService.migrateBalanceEntries(createdLoan.id);

            // Verify the number of payments created matches expected
            expect(result.converted.length).toBe(expectedPayments.length);

            // Verify each payment amount matches the expected balance difference
            for (let i = 0; i < expectedPayments.length; i++) {
              const expectedAmount = expectedPayments[i];
              const actualPayment = result.converted[i];
              
              // Payment amounts should match the balance differences
              expect(actualPayment.paymentAmount).toBeCloseTo(expectedAmount, 2);
            }

            // Verify total payment amount
            const totalExpected = expectedPayments.reduce((sum, p) => sum + p, 0);
            expect(result.summary.totalPaymentAmount).toBeCloseTo(totalExpected, 2);

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Migration creates payment dates corresponding to balance entry months', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.integer({ min: 10000, max: 50000 }).chain(initialBalance => 
            decreasingBalanceSequenceArb(initialBalance).map(seq => ({
              initialBalance,
              ...seq
            }))
          ),
          async (loan, { initialBalance, entries, expectedPayments }) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const migrationService = require('./migrationService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, {
              ...loan,
              initial_balance: initialBalance
            });

            // Insert balance entries
            for (const entry of entries) {
              await insertBalanceEntry(mockDb, {
                loan_id: createdLoan.id,
                ...entry
              });
            }

            // Run migration
            const result = await migrationService.migrateBalanceEntries(createdLoan.id);

            // Verify payment dates correspond to balance entry months
            // Payments are created for entries[1], entries[2], etc. (not the first entry)
            for (let i = 0; i < result.converted.length; i++) {
              const balanceEntry = entries[i + 1]; // +1 because first entry has no payment
              const payment = result.converted[i];
              
              const expectedDate = `${balanceEntry.year}-${String(balanceEntry.month).padStart(2, '0')}-01`;
              expect(payment.paymentDate).toBe(expectedDate);
            }

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Preview migration shows same calculations as actual migration', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.integer({ min: 10000, max: 50000 }).chain(initialBalance => 
            decreasingBalanceSequenceArb(initialBalance).map(seq => ({
              initialBalance,
              ...seq
            }))
          ),
          async (loan, { initialBalance, entries, expectedPayments }) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const migrationService = require('./migrationService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, {
              ...loan,
              initial_balance: initialBalance
            });

            // Insert balance entries
            for (const entry of entries) {
              await insertBalanceEntry(mockDb, {
                loan_id: createdLoan.id,
                ...entry
              });
            }

            // Get preview
            const preview = await migrationService.previewMigration(createdLoan.id);

            // Verify preview shows correct number of payments
            expect(preview.converted.length).toBe(expectedPayments.length);
            expect(preview.summary.totalConverted).toBe(expectedPayments.length);

            // Verify preview amounts match expected
            for (let i = 0; i < expectedPayments.length; i++) {
              expect(preview.converted[i].paymentAmount).toBeCloseTo(expectedPayments[i], 2);
            }

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });
});

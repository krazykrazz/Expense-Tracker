/**
 * Property-Based Tests for MigrationService - Balance Entry Migration
 * 
 * Consolidates:
 * - migrationService.paymentCalc.pbt.test.js (Payment Calculation)
 * - migrationService.preserveBalances.pbt.test.js (Preserve Balance Entries)
 * - migrationService.skipIncreases.pbt.test.js (Skip Balance Increases)
 * 
 * **Feature: loan-payment-tracking**
 * **Validates: Balance entry migration logic and payment calculation**
 * 
 * @invariant Migration Integrity: Balance entry migration preserves existing balance
 * history, correctly calculates payments from balance decreases, and skips balance
 * increases to avoid creating invalid payment records.
 */

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

describe('MigrationService - Balance Entry Migration Property Tests', () => {
  // ============================================================================
  // Payment Calculation Tests
  // ============================================================================

  // Clear module cache before each test to get fresh service instances
  beforeEach(() => {
    jest.resetModules();
  
  // ============================================================================
  // Preserve Balance Entries Tests
  // ============================================================================


  // Clear module cache before each test to get fresh service instances
  beforeEach(() => {
    jest.resetModules();
  
  // ============================================================================
  // Skip Balance Increases Tests
  // ============================================================================


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
   * Property 12: Migration Skips Balance Increases
   *
   * For any pair of consecutive balance entries where the later balance is higher
   * than the earlier balance, the migration should skip that entry and include it
   * in the skipped list.
   *
   * **Validates: Requirements 4.4**
   */
  describe('Property 12: Migration Skips Balance Increases', () => {
    test('Migration skips entries where balance increased', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.integer({ min: 10000, max: 50000 }).chain(initialBalance => 
            balanceSequenceWithIncreasesArb(initialBalance).map(seq => ({
              initialBalance,
              ...seq
            }))
          ),
          async (loan, { initialBalance, entries, expectedSkippedIndices }) => {
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

            // Insert balance entries and track their IDs
            const insertedEntries = [];
            for (const entry of entries) {
              const inserted = await insertBalanceEntry(mockDb, {
                loan_id: createdLoan.id,
                ...entry
              });
              insertedEntries.push(inserted);
            }

            // Run migration
            const result = await migrationService.migrateBalanceEntries(createdLoan.id);

            // Verify the number of skipped entries matches expected
            expect(result.skipped.length).toBe(expectedSkippedIndices.length);

            // Verify each skipped entry has the correct balance entry ID
            for (let i = 0; i < expectedSkippedIndices.length; i++) {
              const expectedIndex = expectedSkippedIndices[i];
              const expectedEntryId = insertedEntries[expectedIndex].id;
              
              // Find this entry in the skipped list
              const skippedEntry = result.skipped.find(s => s.balanceEntryId === expectedEntryId);
              expect(skippedEntry).toBeDefined();
              expect(skippedEntry.reason).toContain('Balance increased');
            }

            // Verify summary counts
            expect(result.summary.totalSkipped).toBe(expectedSkippedIndices.length);

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Migration creates no payments when all entries show balance increases', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.integer({ min: 10000, max: 50000 }).chain(initialBalance => 
            onlyIncreasesSequenceArb(initialBalance).map(entries => ({
              initialBalance,
              entries
            }))
          ),
          async (loan, { initialBalance, entries }) => {
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

            // Verify no payments were created
            expect(result.converted.length).toBe(0);
            expect(result.summary.totalConverted).toBe(0);
            expect(result.summary.totalPaymentAmount).toBe(0);

            // Verify all entries (except first) were skipped
            expect(result.skipped.length).toBe(entries.length - 1);
            expect(result.summary.totalSkipped).toBe(entries.length - 1);

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Preview migration correctly identifies entries to skip', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.integer({ min: 10000, max: 50000 }).chain(initialBalance => 
            balanceSequenceWithIncreasesArb(initialBalance).map(seq => ({
              initialBalance,
              ...seq
            }))
          ),
          async (loan, { initialBalance, entries, expectedSkippedIndices }) => {
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
            const insertedEntries = [];
            for (const entry of entries) {
              const inserted = await insertBalanceEntry(mockDb, {
                loan_id: createdLoan.id,
                ...entry
              });
              insertedEntries.push(inserted);
            }

            // Get preview
            const preview = await migrationService.previewMigration(createdLoan.id);

            // Verify preview shows correct number of skipped entries
            expect(preview.skipped.length).toBe(expectedSkippedIndices.length);
            expect(preview.summary.totalSkipped).toBe(expectedSkippedIndices.length);

            // Verify each skipped entry shows the increase amount
            for (const skipped of preview.skipped) {
              expect(skipped.increase).toBeGreaterThan(0);
              expect(skipped.currentBalance).toBeGreaterThan(skipped.previousBalance);
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

    test('Skipped entries include reason explaining the skip', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.integer({ min: 10000, max: 50000 }).chain(initialBalance => 
            balanceSequenceWithIncreasesArb(initialBalance).map(seq => ({
              initialBalance,
              ...seq
            }))
          ),
          async (loan, { initialBalance, entries, expectedSkippedIndices }) => {
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

            // Verify each skipped entry has a reason
            for (const skipped of result.skipped) {
              expect(skipped.reason).toBeDefined();
              expect(typeof skipped.reason).toBe('string');
              expect(skipped.reason.length).toBeGreaterThan(0);
              // Reason should mention balance increase or additional borrowing
              expect(
                skipped.reason.toLowerCase().includes('increase') ||
                skipped.reason.toLowerCase().includes('borrowing')
              ).toBe(true);
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

});
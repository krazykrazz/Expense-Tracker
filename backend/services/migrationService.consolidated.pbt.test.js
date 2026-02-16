/**
 * Property-Based Tests for MigrationService - Balance Entry Migration
 * 
 * Consolidates:
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
 * Property-Based Tests for MigrationService - Skip Balance Increases
 *
 * Feature: loan-payment-tracking
 * Tests Property 12: Migration Skips Balance Increases
 *
 * For any pair of consecutive balance entries where the later balance is higher
 * than the earlier balance, the migration should skip that entry and include it
 * in the skipped list.
 *
 * **Validates: Requirements 4.4**
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

// Helper to get all balance entries for a loan
function getBalanceEntries(db, loanId) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM loan_balances 
      WHERE loan_id = ? 
      ORDER BY year ASC, month ASC
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

// Arbitrary for a valid loan
const loanArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 10000, max: 100000 }),
  start_date: fc.constant('2020-01-01'),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constantFrom('loan', 'mortgage')
});

/**
 * Generate a sequence of balance entries with at least one increase
 * This simulates additional borrowing on a loan
 */
const balanceSequenceWithIncreasesArb = (initialBalance) => {
  return fc.integer({ min: 3, max: 6 }).chain(numEntries => {
    // Generate balance changes where at least one is negative (increase)
    return fc.array(
      fc.integer({ min: -2000, max: 2000 }),
      { minLength: numEntries - 1, maxLength: numEntries - 1 }
    ).filter(changes => {
      // Ensure at least one change is negative (balance increase)
      return changes.some(c => c < 0);
    }).map(changes => {
      const entries = [];
      let currentBalance = initialBalance;
      let year = 2020;
      let month = 1;
      
      // Track which entries should be skipped (where balance increased)
      const expectedSkippedIndices = [];
      
      // First entry is the initial balance
      entries.push({
        year,
        month,
        remaining_balance: currentBalance,
        rate: 5.0
      });
      
      // Subsequent entries change by the specified amounts
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
        
        const previousBalance = currentBalance;
        currentBalance = Math.max(0, currentBalance - change);
        
        entries.push({
          year,
          month,
          remaining_balance: currentBalance,
          rate: 5.0
        });
        
        // If balance increased (change was negative), this entry should be skipped
        if (change < 0) {
          expectedSkippedIndices.push(i + 1); // +1 because first entry is index 0
        }
      }
      
      return { entries, expectedSkippedIndices };
    });
  });
};

/**
 * Generate a sequence with only balance increases (no payments)
 */
const onlyIncreasesSequenceArb = (initialBalance) => {
  return fc.integer({ min: 2, max: 5 }).chain(numEntries => {
    return fc.array(
      fc.integer({ min: 100, max: 2000 }), // All positive = balance increases
      { minLength: numEntries - 1, maxLength: numEntries - 1 }
    ).map(increases => {
      const entries = [];
      let currentBalance = initialBalance;
      let year = 2020;
      let month = 1;
      
      // First entry is the initial balance
      entries.push({
        year,
        month,
        remaining_balance: currentBalance,
        rate: 5.0
      });
      
      // All subsequent entries increase the balance
      for (const increase of increases) {
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
        currentBalance = currentBalance + increase;
        entries.push({
          year,
          month,
          remaining_balance: currentBalance,
          rate: 5.0
        });
      }
      
      return entries;
    });
  });
};

/**
 * Generate a sequence of balance entries (can be increasing or decreasing)
 */
const balanceSequenceArb = (initialBalance) => {
  return fc.integer({ min: 2, max: 6 }).chain(numEntries => {
    // Generate balance changes (positive = decrease, negative = increase)
    return fc.array(
      fc.integer({ min: -1000, max: 2000 }),
      { minLength: numEntries - 1, maxLength: numEntries - 1 }
    ).map(changes => {
      const entries = [];
      let currentBalance = initialBalance;
      let year = 2020;
      let month = 1;
      
      // First entry is the initial balance
      entries.push({
        year,
        month,
        remaining_balance: currentBalance,
        rate: 5.0
      });
      
      // Subsequent entries change by the specified amounts
      for (const change of changes) {
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
        currentBalance = Math.max(0, currentBalance - change);
        entries.push({
          year,
          month,
          remaining_balance: currentBalance,
          rate: 5.0
        });
      }
      
      return entries;
    });
  });
};



describe('MigrationService - Balance Entry Migration Property Tests', () => {
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

  // ============================================================================
  // Skip Balance Increases Tests (from migrationService.skipIncreases.pbt.test.js)
  // ============================================================================
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

  // ============================================================================
  // Preserve Balance Entries Tests (from migrationService.preserveBalances.pbt.test.js)
  // ============================================================================
test('Migration does not delete or modify original balance entries', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.integer({ min: 10000, max: 50000 }).chain(initialBalance => 
            balanceSequenceArb(initialBalance).map(entries => ({
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

            // Insert balance entries and store their IDs
            const insertedEntries = [];
            for (const entry of entries) {
              const inserted = await insertBalanceEntry(mockDb, {
                loan_id: createdLoan.id,
                ...entry
              });
              insertedEntries.push(inserted);
            }

            // Get balance entries before migration
            const entriesBefore = await getBalanceEntries(mockDb, createdLoan.id);
            expect(entriesBefore.length).toBe(entries.length);

            // Run migration
            await migrationService.migrateBalanceEntries(createdLoan.id);

            // Get balance entries after migration
            const entriesAfter = await getBalanceEntries(mockDb, createdLoan.id);

            // Verify all original balance entries still exist
            expect(entriesAfter.length).toBe(entriesBefore.length);

            // Verify each entry is unchanged
            for (let i = 0; i < entriesBefore.length; i++) {
              const before = entriesBefore[i];
              const after = entriesAfter[i];
              
              expect(after.id).toBe(before.id);
              expect(after.loan_id).toBe(before.loan_id);
              expect(after.year).toBe(before.year);
              expect(after.month).toBe(before.month);
              expect(after.remaining_balance).toBeCloseTo(before.remaining_balance, 2);
              expect(after.rate).toBeCloseTo(before.rate, 2);
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

    test('Balance entries remain accessible for historical reference after migration', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.integer({ min: 10000, max: 50000 }).chain(initialBalance => 
            balanceSequenceArb(initialBalance).map(entries => ({
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
            const loanBalanceRepository = require('../repositories/loanBalanceRepository');

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
            await migrationService.migrateBalanceEntries(createdLoan.id);

            // Verify balance history is still accessible via repository
            const balanceHistory = await loanBalanceRepository.getBalanceHistory(createdLoan.id);
            
            expect(balanceHistory.length).toBe(entries.length);
            
            // Verify each entry matches the original
            for (let i = 0; i < entries.length; i++) {
              expect(balanceHistory[i].year).toBe(entries[i].year);
              expect(balanceHistory[i].month).toBe(entries[i].month);
              expect(balanceHistory[i].remaining_balance).toBeCloseTo(entries[i].remaining_balance, 2);
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

    test('Multiple migrations do not affect balance entries', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.integer({ min: 10000, max: 50000 }).chain(initialBalance => 
            balanceSequenceArb(initialBalance).map(entries => ({
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

            // Get balance entries before any migration
            const entriesBefore = await getBalanceEntries(mockDb, createdLoan.id);

            // Run migration multiple times
            await migrationService.migrateBalanceEntries(createdLoan.id);
            await migrationService.migrateBalanceEntries(createdLoan.id);
            await migrationService.migrateBalanceEntries(createdLoan.id);

            // Get balance entries after multiple migrations
            const entriesAfter = await getBalanceEntries(mockDb, createdLoan.id);

            // Verify balance entries are unchanged
            expect(entriesAfter.length).toBe(entriesBefore.length);

            for (let i = 0; i < entriesBefore.length; i++) {
              expect(entriesAfter[i].id).toBe(entriesBefore[i].id);
              expect(entriesAfter[i].remaining_balance).toBeCloseTo(entriesBefore[i].remaining_balance, 2);
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

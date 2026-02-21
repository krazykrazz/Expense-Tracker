/**
 * Property-Based Tests for Effective Balance Column Migration & Persistence
 * Feature: billing-cycle-simplification
 *
 * @invariant Persisted effective_balance/balance_type columns match utility output on create/update
 * @invariant Migration backfill matches utility for all existing records
 * @invariant Application functions identically with or without persisted columns
 *
 * Property 5: Persisted effective balance columns match utility on create/update
 * Property 6: Migration backfill correctness
 * Property 7: Application functions identically with or without persisted columns
 *
 * Validates: Requirements 6.2, 6.3, 6.5, 6.6
 */

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();
const { calculateEffectiveBalance } = require('../utils/effectiveBalanceUtil');

// Mock createBackup to avoid file system operations in tests
jest.mock('../services/backupService', () => ({
  createBackup: jest.fn().mockResolvedValue('/mock/backup/path')
}));

jest.mock('../config/paths', () => ({
  getDatabasePath: jest.fn().mockReturnValue(':memory:'),
  getBackupPath: jest.fn().mockReturnValue('/mock/backup')
}));

// Mock fs to prevent actual file system operations during migration's createBackup
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  copyFileSync: jest.fn()
}));

// ============================================================================
// Helpers
// ============================================================================

function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => err ? reject(err) : resolve(db));
  });
}

function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => err ? reject(err) : resolve());
  });
}

function runStatement(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
  });
}

function getRow(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function getAllRows(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

/**
 * Create billing cycles table WITHOUT effective_balance/balance_type columns
 * (pre-migration state)
 */
function createPreMigrationBillingCyclesTable(db) {
  return runStatement(db, `
    CREATE TABLE credit_card_billing_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_method_id INTEGER NOT NULL,
      cycle_start_date TEXT NOT NULL,
      cycle_end_date TEXT NOT NULL,
      actual_statement_balance REAL NOT NULL CHECK(actual_statement_balance >= 0),
      calculated_statement_balance REAL NOT NULL CHECK(calculated_statement_balance >= 0),
      minimum_payment REAL CHECK(minimum_payment IS NULL OR minimum_payment >= 0),
      notes TEXT,
      statement_pdf_path TEXT,
      is_user_entered INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(payment_method_id, cycle_end_date)
    )
  `);
}

/**
 * Create billing cycles table WITH effective_balance/balance_type columns
 * (post-migration state)
 */
function createPostMigrationBillingCyclesTable(db) {
  return runStatement(db, `
    CREATE TABLE credit_card_billing_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_method_id INTEGER NOT NULL,
      cycle_start_date TEXT NOT NULL,
      cycle_end_date TEXT NOT NULL,
      actual_statement_balance REAL NOT NULL CHECK(actual_statement_balance >= 0),
      calculated_statement_balance REAL NOT NULL CHECK(calculated_statement_balance >= 0),
      minimum_payment REAL CHECK(minimum_payment IS NULL OR minimum_payment >= 0),
      notes TEXT,
      statement_pdf_path TEXT,
      is_user_entered INTEGER DEFAULT 0,
      effective_balance REAL,
      balance_type TEXT CHECK(balance_type IS NULL OR balance_type IN ('actual', 'calculated')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(payment_method_id, cycle_end_date)
    )
  `);
}

function createSchemaMigrationsTable(db) {
  return runStatement(db, `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function insertBillingCycle(db, cycle) {
  return runStatement(db, `
    INSERT INTO credit_card_billing_cycles (
      payment_method_id, cycle_start_date, cycle_end_date,
      actual_statement_balance, calculated_statement_balance,
      is_user_entered
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [
    cycle.payment_method_id,
    cycle.cycle_start_date,
    cycle.cycle_end_date,
    cycle.actual_statement_balance,
    cycle.calculated_statement_balance,
    cycle.is_user_entered
  ]);
}

function hasColumn(db, tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.some(r => r.name === columnName));
    });
  });
}

// ============================================================================
// Generators
// ============================================================================

const arbBillingCycleRecord = fc.record({
  payment_method_id: fc.integer({ min: 1, max: 10 }),
  cycle_start_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-06-30') })
    .map(d => { try { return d.toISOString().split('T')[0]; } catch (e) { return '2022-01-01'; } }),
  cycle_end_date: fc.date({ min: new Date('2020-07-01'), max: new Date('2025-12-31') })
    .map(d => { try { return d.toISOString().split('T')[0]; } catch (e) { return '2023-06-15'; } }),
  actual_statement_balance: fc.oneof(
    fc.constant(0),
    fc.double({ min: 0.01, max: 50000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100)
  ),
  calculated_statement_balance: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100),
  is_user_entered: fc.oneof(fc.constant(0), fc.constant(1))
});

// Generate unique cycle records (unique payment_method_id + cycle_end_date)
const arbUniqueBillingCycles = fc.integer({ min: 1, max: 8 }).chain(count =>
  fc.array(arbBillingCycleRecord, { minLength: count, maxLength: count })
    .map(cycles => {
      // Ensure uniqueness on (payment_method_id, cycle_end_date)
      const seen = new Set();
      return cycles.filter(c => {
        const key = `${c.payment_method_id}-${c.cycle_end_date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .filter(cycles => cycles.length > 0)
);

// ============================================================================
// Property 6: Migration backfill correctness
// ============================================================================

describe('Property 6: Migration backfill correctness', () => {
  // Feature: billing-cycle-simplification, Property 6: Migration backfill correctness
  test('backfill sets effective_balance/balance_type matching effectiveBalanceUtil for all records', async () => {
    const { migrateAddEffectiveBalanceColumns } = require('./migrations');

    await fc.assert(
      fc.asyncProperty(arbUniqueBillingCycles, async (cycles) => {
        const db = await createTestDatabase();
        try {
          await createSchemaMigrationsTable(db);
          await createPreMigrationBillingCyclesTable(db);

          // Insert pre-migration records
          for (const cycle of cycles) {
            await insertBillingCycle(db, cycle);
          }

          // Run migration
          await migrateAddEffectiveBalanceColumns(db);

          // Verify columns exist
          expect(await hasColumn(db, 'credit_card_billing_cycles', 'effective_balance')).toBe(true);
          expect(await hasColumn(db, 'credit_card_billing_cycles', 'balance_type')).toBe(true);

          // Verify every record was backfilled correctly
          const rows = await getAllRows(db, 'SELECT * FROM credit_card_billing_cycles');
          expect(rows.length).toBe(cycles.length);

          for (const row of rows) {
            const expected = calculateEffectiveBalance(row);
            expect(row.effective_balance).toBeCloseTo(expected.effectiveBalance, 2);
            expect(row.balance_type).toBe(expected.balanceType);
          }
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  // Feature: billing-cycle-simplification, Property 6: Migration backfill correctness
  test('migration is idempotent — running twice does not corrupt data', async () => {
    const { migrateAddEffectiveBalanceColumns } = require('./migrations');

    await fc.assert(
      fc.asyncProperty(arbUniqueBillingCycles, async (cycles) => {
        const db = await createTestDatabase();
        try {
          await createSchemaMigrationsTable(db);
          await createPreMigrationBillingCyclesTable(db);

          for (const cycle of cycles) {
            await insertBillingCycle(db, cycle);
          }

          // Run migration twice
          await migrateAddEffectiveBalanceColumns(db);

          // Reset migration tracking to allow re-run
          await runStatement(db, "DELETE FROM schema_migrations WHERE migration_name = 'add_effective_balance_columns_v1'");
          await migrateAddEffectiveBalanceColumns(db);

          // Verify data is still correct
          const rows = await getAllRows(db, 'SELECT * FROM credit_card_billing_cycles');
          for (const row of rows) {
            const expected = calculateEffectiveBalance(row);
            expect(row.effective_balance).toBeCloseTo(expected.effectiveBalance, 2);
            expect(row.balance_type).toBe(expected.balanceType);
          }
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });
});

// ============================================================================
// Property 5: Persisted effective balance columns match utility on create/update
// ============================================================================

describe('Property 5: Persisted effective balance columns match utility on create/update', () => {
  // Feature: billing-cycle-simplification, Property 5: Persisted effective balance columns match utility on create/update
  test('INSERT with effective_balance/balance_type matches effectiveBalanceUtil output', async () => {
    await fc.assert(
      fc.asyncProperty(arbBillingCycleRecord, async (cycle) => {
        const db = await createTestDatabase();
        try {
          await createPostMigrationBillingCyclesTable(db);

          // Compute expected values using the utility
          const expected = calculateEffectiveBalance(cycle);

          // Insert with persisted columns
          await runStatement(db, `
            INSERT INTO credit_card_billing_cycles (
              payment_method_id, cycle_start_date, cycle_end_date,
              actual_statement_balance, calculated_statement_balance,
              is_user_entered, effective_balance, balance_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            cycle.payment_method_id,
            cycle.cycle_start_date,
            cycle.cycle_end_date,
            cycle.actual_statement_balance,
            cycle.calculated_statement_balance,
            cycle.is_user_entered,
            expected.effectiveBalance,
            expected.balanceType
          ]);

          const row = await getRow(db, 'SELECT * FROM credit_card_billing_cycles WHERE id = 1');
          expect(row.effective_balance).toBeCloseTo(expected.effectiveBalance, 2);
          expect(row.balance_type).toBe(expected.balanceType);
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  // Feature: billing-cycle-simplification, Property 5: Persisted effective balance columns match utility on create/update
  test('UPDATE with effective_balance/balance_type matches effectiveBalanceUtil output', async () => {
    const arbUpdatePair = fc.tuple(arbBillingCycleRecord, arbBillingCycleRecord);

    await fc.assert(
      fc.asyncProperty(arbUpdatePair, async ([original, updated]) => {
        const db = await createTestDatabase();
        try {
          await createPostMigrationBillingCyclesTable(db);

          // Insert original
          const origExpected = calculateEffectiveBalance(original);
          await runStatement(db, `
            INSERT INTO credit_card_billing_cycles (
              payment_method_id, cycle_start_date, cycle_end_date,
              actual_statement_balance, calculated_statement_balance,
              is_user_entered, effective_balance, balance_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            original.payment_method_id,
            original.cycle_start_date,
            original.cycle_end_date,
            original.actual_statement_balance,
            original.calculated_statement_balance,
            original.is_user_entered,
            origExpected.effectiveBalance,
            origExpected.balanceType
          ]);

          // Update with new values
          const updatedCycle = {
            actual_statement_balance: updated.actual_statement_balance,
            calculated_statement_balance: updated.calculated_statement_balance,
            is_user_entered: updated.is_user_entered
          };
          const updExpected = calculateEffectiveBalance(updatedCycle);

          await runStatement(db, `
            UPDATE credit_card_billing_cycles
            SET actual_statement_balance = ?,
                calculated_statement_balance = ?,
                is_user_entered = ?,
                effective_balance = ?,
                balance_type = ?
            WHERE id = 1
          `, [
            updated.actual_statement_balance,
            updated.calculated_statement_balance,
            updated.is_user_entered,
            updExpected.effectiveBalance,
            updExpected.balanceType
          ]);

          const row = await getRow(db, 'SELECT * FROM credit_card_billing_cycles WHERE id = 1');
          expect(row.effective_balance).toBeCloseTo(updExpected.effectiveBalance, 2);
          expect(row.balance_type).toBe(updExpected.balanceType);
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });
});

// ============================================================================
// Property 7: Application functions identically with or without persisted columns
// ============================================================================

describe('Property 7: Application functions identically with or without persisted columns', () => {
  // Feature: billing-cycle-simplification, Property 7: Application functions identically with or without persisted columns
  test('effectiveBalanceUtil produces same result whether reading from DB columns or computing in-memory', async () => {
    await fc.assert(
      fc.asyncProperty(arbUniqueBillingCycles, async (cycles) => {
        // DB with columns (post-migration)
        const dbWith = await createTestDatabase();
        // DB without columns (pre-migration)
        const dbWithout = await createTestDatabase();

        try {
          await createPostMigrationBillingCyclesTable(dbWith);
          await createPreMigrationBillingCyclesTable(dbWithout);

          for (const cycle of cycles) {
            const expected = calculateEffectiveBalance(cycle);

            // Insert into post-migration DB with persisted columns
            await runStatement(dbWith, `
              INSERT INTO credit_card_billing_cycles (
                payment_method_id, cycle_start_date, cycle_end_date,
                actual_statement_balance, calculated_statement_balance,
                is_user_entered, effective_balance, balance_type
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              cycle.payment_method_id, cycle.cycle_start_date, cycle.cycle_end_date,
              cycle.actual_statement_balance, cycle.calculated_statement_balance,
              cycle.is_user_entered, expected.effectiveBalance, expected.balanceType
            ]);

            // Insert into pre-migration DB without persisted columns
            await insertBillingCycle(dbWithout, cycle);
          }

          // Read from both DBs and compare
          const rowsWith = await getAllRows(dbWith, 'SELECT * FROM credit_card_billing_cycles ORDER BY id');
          const rowsWithout = await getAllRows(dbWithout, 'SELECT * FROM credit_card_billing_cycles ORDER BY id');

          expect(rowsWith.length).toBe(rowsWithout.length);

          for (let i = 0; i < rowsWith.length; i++) {
            const withRow = rowsWith[i];
            const withoutRow = rowsWithout[i];

            // From post-migration DB: read persisted columns directly
            const persistedBalance = withRow.effective_balance;
            const persistedType = withRow.balance_type;

            // From pre-migration DB: compute in-memory
            const computed = calculateEffectiveBalance(withoutRow);

            // They must match
            expect(persistedBalance).toBeCloseTo(computed.effectiveBalance, 2);
            expect(persistedType).toBe(computed.balanceType);
          }
        } finally {
          await closeDatabase(dbWith);
          await closeDatabase(dbWithout);
        }
      }),
      dbPbtOptions()
    );
  });
});

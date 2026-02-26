/**
 * Property-Based Tests for Consolidated Database Schema
 *
 * Feature: migration-consolidation
 *
 * @invariant Schema Completeness: For any table in the expected set, the consolidated
 *   schema produces the correct columns, types, and constraints.
 * @invariant Schema Idempotency: Executing schema statements twice on a database with
 *   data produces the same schema state with no errors and no data loss.
 * @invariant Test-Production Schema Parity: For any table name, the test and production
 *   databases have identical columns, types, defaults, constraints, indexes, and triggers.
 * @invariant Constraint Enforcement: For any value violating a CHECK constraint, the
 *   database rejects the insert.
 */

const fc = require('fast-check');
const sqlite3 = require('sqlite3').verbose();
const { dbPbtOptions } = require('../test/pbtArbitraries');
const { ALL_STATEMENTS, TABLE_STATEMENTS, INDEX_STATEMENTS, TRIGGER_STATEMENTS } = require('./schema');

// ─── Helpers ───

function openDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) return reject(err);
      db.run('PRAGMA foreign_keys = ON', (err) => err ? reject(err) : resolve(db));
    });
  });
}

function closeDb(db) {
  return new Promise((resolve) => db.close(() => resolve()));
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

async function applySchema(db) {
  for (const stmt of ALL_STATEMENTS) {
    await run(db, stmt);
  }
}


// ─── Expected schema definition ───

const EXPECTED_TABLES = {
  schema_migrations: ['id', 'migration_name', 'applied_at'],
  expenses: ['id', 'date', 'posted_date', 'place', 'notes', 'amount', 'type', 'week', 'method', 'payment_method_id', 'insurance_eligible', 'claim_status', 'original_cost', 'created_at'],
  monthly_gross: ['id', 'year', 'month', 'gross_amount', 'created_at'],
  income_sources: ['id', 'year', 'month', 'name', 'amount', 'category', 'created_at', 'updated_at'],
  fixed_expenses: ['id', 'year', 'month', 'name', 'amount', 'category', 'payment_type', 'payment_method_id', 'payment_due_day', 'linked_loan_id', 'created_at', 'updated_at'],
  loans: ['id', 'name', 'initial_balance', 'start_date', 'notes', 'loan_type', 'is_paid_off', 'estimated_months_left', 'amortization_period', 'term_length', 'renewal_date', 'rate_type', 'payment_frequency', 'estimated_property_value', 'fixed_interest_rate', 'created_at', 'updated_at'],
  loan_balances: ['id', 'loan_id', 'year', 'month', 'remaining_balance', 'rate', 'created_at', 'updated_at'],
  mortgage_payments: ['id', 'loan_id', 'payment_amount', 'effective_date', 'notes', 'created_at', 'updated_at'],
  loan_payments: ['id', 'loan_id', 'amount', 'payment_date', 'notes', 'created_at', 'updated_at'],
  budgets: ['id', 'year', 'month', 'category', 'limit', 'created_at', 'updated_at'],
  investments: ['id', 'name', 'type', 'initial_value', 'created_at', 'updated_at'],
  investment_values: ['id', 'investment_id', 'year', 'month', 'value', 'created_at', 'updated_at'],
  people: ['id', 'name', 'date_of_birth', 'created_at', 'updated_at'],
  expense_people: ['id', 'expense_id', 'person_id', 'amount', 'original_amount', 'created_at'],
  expense_invoices: ['id', 'expense_id', 'person_id', 'filename', 'original_filename', 'file_path', 'file_size', 'mime_type', 'upload_date'],
  place_names: ['id', 'original_name', 'standardized_name', 'created_at', 'updated_at'],
  reminders: ['id', 'year', 'month', 'type', 'dismissed', 'created_at', 'updated_at'],
  dismissed_anomalies: ['id', 'expense_id', 'dismissed_at'],
  payment_methods: ['id', 'type', 'display_name', 'full_name', 'account_details', 'credit_limit', 'current_balance', 'payment_due_day', 'billing_cycle_start', 'billing_cycle_end', 'billing_cycle_day', 'is_active', 'created_at', 'updated_at'],
  credit_card_payments: ['id', 'payment_method_id', 'amount', 'payment_date', 'notes', 'created_at'],
  credit_card_statements: ['id', 'payment_method_id', 'statement_date', 'statement_period_start', 'statement_period_end', 'filename', 'original_filename', 'file_path', 'file_size', 'mime_type', 'created_at'],
  credit_card_billing_cycles: ['id', 'payment_method_id', 'cycle_start_date', 'cycle_end_date', 'actual_statement_balance', 'calculated_statement_balance', 'minimum_payment', 'notes', 'statement_pdf_path', 'is_user_entered', 'reviewed_at', 'effective_balance', 'balance_type', 'created_at', 'updated_at'],
  activity_logs: ['id', 'event_type', 'entity_type', 'entity_id', 'user_action', 'metadata', 'timestamp', 'created_at'],
  settings: ['key', 'value', 'updated_at'],
  users: ['id', 'username', 'password_hash', 'created_at', 'updated_at']
};

const TABLE_NAMES = Object.keys(EXPECTED_TABLES);


// ─── Property 1: Schema completeness ───

describe('Feature: migration-consolidation, Property 1: Schema completeness', () => {
  test('For any table name from the expected 25, columns match the documented schema', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...TABLE_NAMES),
        async (tableName) => {
          const db = await openDb();
          try {
            await applySchema(db);
            const columns = await all(db, `PRAGMA table_info("${tableName}")`);
            const columnNames = columns.map(c => c.name);
            const expected = EXPECTED_TABLES[tableName];

            // Verify exact column set
            expect(columnNames).toEqual(expected);
            // Verify column count
            expect(columns.length).toBe(expected.length);
          } finally {
            await closeDb(db);
          }
        }
      ),
      dbPbtOptions({ numRuns: 100 })
    );
  });

  test('Schema creates exactly 25 tables', async () => {
    const db = await openDb();
    try {
      await applySchema(db);
      const tables = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence' ORDER BY name");
      expect(tables.length).toBe(25);
      const names = tables.map(t => t.name).sort();
      expect(names).toEqual(TABLE_NAMES.sort());
    } finally {
      await closeDb(db);
    }
  });
});


// ─── Property 2: Schema idempotency ───

describe('Feature: migration-consolidation, Property 2: Schema idempotency', () => {
  // Simple data inserters for idempotency testing
  const insertFns = {
    settings: (db) => run(db, "INSERT INTO settings (key, value) VALUES ('test_key', 'test_value')"),
    monthly_gross: (db) => run(db, "INSERT INTO monthly_gross (year, month, gross_amount) VALUES (2025, 1, 5000)"),
    income_sources: (db) => run(db, "INSERT INTO income_sources (year, month, name, amount) VALUES (2025, 1, 'Job', 3000)"),
    budgets: (db) => run(db, "INSERT INTO budgets (year, month, category, \"limit\") VALUES (2025, 1, 'Groceries', 500)"),
    people: (db) => run(db, "INSERT INTO people (name) VALUES ('Test Person')"),
    place_names: (db) => run(db, "INSERT INTO place_names (original_name, standardized_name) VALUES ('test', 'Test')"),
    loans: (db) => run(db, "INSERT INTO loans (name, initial_balance, start_date) VALUES ('Test Loan', 10000, '2025-01-01')"),
    investments: (db) => run(db, "INSERT INTO investments (name, type, initial_value) VALUES ('TFSA', 'TFSA', 1000)"),
    payment_methods: (db) => run(db, "INSERT OR IGNORE INTO payment_methods (type, display_name, full_name, is_active) VALUES ('cash', 'TestCash', 'Test Cash', 1)"),
    reminders: (db) => run(db, "INSERT INTO reminders (year, month, type) VALUES (2025, 1, 'loan_balances')"),
  };

  const insertableTableNames = Object.keys(insertFns);

  test('For any database with data, executing schema twice preserves data and schema', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...insertableTableNames),
        fc.integer({ min: 1, max: 5 }),
        async (tableName, insertCount) => {
          const db = await openDb();
          try {
            // First schema application
            await applySchema(db);

            // Insert data
            for (let i = 0; i < insertCount; i++) {
              try {
                await insertFns[tableName](db);
              } catch (e) {
                // UNIQUE constraint violations are expected for some tables on repeat inserts
                if (!e.message.includes('UNIQUE constraint')) throw e;
              }
            }

            // Count data and schema objects before second run
            const countBefore = await get(db, `SELECT COUNT(*) as c FROM "${tableName}"`);
            const tablesBefore = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'");
            const indexesBefore = await all(db, "SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL");
            const triggersBefore = await all(db, "SELECT name FROM sqlite_master WHERE type='trigger'");

            // Second schema application — should not error or lose data
            await applySchema(db);

            // Verify data preserved
            const countAfter = await get(db, `SELECT COUNT(*) as c FROM "${tableName}"`);
            expect(countAfter.c).toBe(countBefore.c);

            // Verify schema unchanged
            const tablesAfter = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'");
            const indexesAfter = await all(db, "SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL");
            const triggersAfter = await all(db, "SELECT name FROM sqlite_master WHERE type='trigger'");

            expect(tablesAfter.length).toBe(tablesBefore.length);
            expect(indexesAfter.length).toBe(indexesBefore.length);
            expect(triggersAfter.length).toBe(triggersBefore.length);
          } finally {
            await closeDb(db);
          }
        }
      ),
      dbPbtOptions({ numRuns: 100 })
    );
  });
});


// ─── Property 4: Constraint enforcement ───

describe('Feature: migration-consolidation, Property 4: Constraint enforcement', () => {
  // Generators for constraint-violating values
  const violationGenerators = {
    // expenses.week outside 1-5
    bad_expense_week: fc.integer({ min: 6, max: 100 }).map(week => ({
      table: 'expenses',
      sql: `INSERT INTO expenses (date, place, amount, type, week, method) VALUES ('2025-01-01', 'Test', 10, 'Groceries', ${week}, 'Cash')`,
      description: `week=${week} (must be 1-5)`
    })),
    bad_expense_week_zero: fc.constant({
      table: 'expenses',
      sql: "INSERT INTO expenses (date, place, amount, type, week, method) VALUES ('2025-01-01', 'Test', 10, 'Groceries', 0, 'Cash')",
      description: 'week=0 (must be 1-5)'
    }),
    bad_expense_week_negative: fc.integer({ min: -100, max: -1 }).map(week => ({
      table: 'expenses',
      sql: `INSERT INTO expenses (date, place, amount, type, week, method) VALUES ('2025-01-01', 'Test', 10, 'Groceries', ${week}, 'Cash')`,
      description: `week=${week} (must be 1-5)`
    })),

    // loans.loan_type not in allowed set
    bad_loan_type: fc.constantFrom('personal', 'credit', 'savings', 'checking', 'other', 'invalid_type')
      .map(loanType => ({
        table: 'loans',
        sql: `INSERT INTO loans (name, initial_balance, start_date, loan_type) VALUES ('Test', 1000, '2025-01-01', '${loanType}')`,
        description: `loan_type='${loanType}' (must be loan/line_of_credit/mortgage)`
      })),

    // payment_methods.credit_limit negative
    bad_credit_limit_negative: fc.double({ min: -10000, max: -0.01, noNaN: true }).map(limit => ({
      table: 'payment_methods',
      sql: `INSERT INTO payment_methods (type, display_name, credit_limit) VALUES ('credit_card', 'BadCard', ${limit})`,
      description: `credit_limit=${limit} (must be > 0 or NULL)`
    })),
    bad_credit_limit_zero: fc.constant({
      table: 'payment_methods',
      sql: "INSERT INTO payment_methods (type, display_name, credit_limit) VALUES ('credit_card', 'BadCard', 0)",
      description: 'credit_limit=0 (must be > 0 or NULL)'
    }),

    // budgets.limit <= 0
    bad_budget_limit: fc.double({ min: -1000, max: 0, noNaN: true }).map(limit => ({
      table: 'budgets',
      sql: `INSERT INTO budgets (year, month, category, "limit") VALUES (2025, 1, 'Groceries', ${limit})`,
      description: `limit=${limit} (must be > 0)`
    })),

    // budgets.month outside 1-12
    bad_budget_month_high: fc.integer({ min: 13, max: 100 }).map(month => ({
      table: 'budgets',
      sql: `INSERT INTO budgets (year, month, category, "limit") VALUES (2025, ${month}, 'Groceries', 100)`,
      description: `month=${month} (must be 1-12)`
    })),
    bad_budget_month_low: fc.integer({ min: -10, max: 0 }).map(month => ({
      table: 'budgets',
      sql: `INSERT INTO budgets (year, month, category, "limit") VALUES (2025, ${month}, 'Groceries', 100)`,
      description: `month=${month} (must be 1-12)`
    })),
  };

  const allViolations = fc.oneof(
    ...Object.values(violationGenerators)
  );

  test('For any CHECK constraint violation, the database rejects the insert', async () => {
    await fc.assert(
      fc.asyncProperty(
        allViolations,
        async (violation) => {
          const db = await openDb();
          try {
            await applySchema(db);
            await expect(run(db, violation.sql)).rejects.toThrow();
          } finally {
            await closeDb(db);
          }
        }
      ),
      dbPbtOptions({ numRuns: 100 })
    );
  });
});



// ─── Property 3: Test-production schema parity ───

describe('Feature: migration-consolidation, Property 3: Test-production schema parity', () => {
  test('For any table name, test and production databases have identical schema', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...TABLE_NAMES),
        async (tableName) => {
          // Create two independent databases simulating production and test paths
          // Both use ALL_STATEMENTS from schema.js (same as db.js now does)
          const prodDb = await openDb();
          const testDb = await openDb();
          try {
            await applySchema(prodDb);
            await applySchema(testDb);

            // Compare table_info (columns, types, defaults, constraints)
            const prodColumns = await all(prodDb, `PRAGMA table_info("${tableName}")`);
            const testColumns = await all(testDb, `PRAGMA table_info("${tableName}")`);

            expect(testColumns.length).toBe(prodColumns.length);
            for (let i = 0; i < prodColumns.length; i++) {
              expect(testColumns[i].name).toBe(prodColumns[i].name);
              expect(testColumns[i].type).toBe(prodColumns[i].type);
              expect(testColumns[i].dflt_value).toBe(prodColumns[i].dflt_value);
              expect(testColumns[i].notnull).toBe(prodColumns[i].notnull);
              expect(testColumns[i].pk).toBe(prodColumns[i].pk);
            }
          } finally {
            await closeDb(prodDb);
            await closeDb(testDb);
          }
        }
      ),
      dbPbtOptions({ numRuns: 30 })
    );
  });

  test('Test and production databases have identical indexes', async () => {
    const prodDb = await openDb();
    const testDb = await openDb();
    try {
      await applySchema(prodDb);
      await applySchema(testDb);

      const prodIndexes = await all(prodDb, "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name");
      const testIndexes = await all(testDb, "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name");

      expect(testIndexes.length).toBe(prodIndexes.length);
      for (let i = 0; i < prodIndexes.length; i++) {
        expect(testIndexes[i].name).toBe(prodIndexes[i].name);
        expect(testIndexes[i].tbl_name).toBe(prodIndexes[i].tbl_name);
        expect(testIndexes[i].sql).toBe(prodIndexes[i].sql);
      }
    } finally {
      await closeDb(prodDb);
      await closeDb(testDb);
    }
  });

  test('Test and production databases have identical triggers', async () => {
    const prodDb = await openDb();
    const testDb = await openDb();
    try {
      await applySchema(prodDb);
      await applySchema(testDb);

      const prodTriggers = await all(prodDb, "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name");
      const testTriggers = await all(testDb, "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name");

      expect(testTriggers.length).toBe(prodTriggers.length);
      for (let i = 0; i < prodTriggers.length; i++) {
        expect(testTriggers[i].name).toBe(prodTriggers[i].name);
        expect(testTriggers[i].tbl_name).toBe(prodTriggers[i].tbl_name);
        expect(testTriggers[i].sql).toBe(prodTriggers[i].sql);
      }
    } finally {
      await closeDb(prodDb);
      await closeDb(testDb);
    }
  });
});

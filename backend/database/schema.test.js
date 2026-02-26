/**
 * Unit tests for the consolidated database schema.
 *
 * Verifies table creation, seed data, migration tracking,
 * PRAGMA settings, column defaults, idempotency, and triggers.
 *
 * Requirements: 1.1, 1.4, 2.1, 2.4, 2.5, 3.2, 3.3, 7.2, 7.3, 8.2, 8.3
 */
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { ALL_STATEMENTS } = require('./schema');
const { runMigrations, checkMigrationApplied } = require('./migrations');

// Helper: promisify db.all
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// Helper: promisify db.get
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

// Helper: promisify db.run
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

describe('Consolidated Schema – Unit Tests', () => {
  let db;

  beforeAll(async () => {
    db = await createIsolatedTestDb();
  });

  afterAll(() => {
    cleanupIsolatedTestDb(db);
  });

  // ── Requirement 1.1, 2.1, 7.2: All 25 tables created ──

  const EXPECTED_TABLES = [
    'schema_migrations', 'expenses', 'monthly_gross', 'income_sources',
    'fixed_expenses', 'loans', 'loan_balances', 'mortgage_payments',
    'loan_payments', 'budgets', 'investments', 'investment_values',
    'people', 'expense_people', 'expense_invoices', 'place_names',
    'reminders', 'dismissed_anomalies', 'payment_methods',
    'credit_card_payments', 'credit_card_statements',
    'credit_card_billing_cycles', 'activity_logs', 'settings', 'users'
  ];

  test('creates exactly 25 tables', async () => {
    const rows = await dbAll(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tableNames = rows.map(r => r.name).sort();
    expect(tableNames).toEqual([...EXPECTED_TABLES].sort());
    expect(tableNames).toHaveLength(25);
  });

  // ── Requirement 1.4: Default payment methods seeded ──

  test('seeds 4 default payment methods (Cash, Debit, Cheque, Credit Card)', async () => {
    const rows = await dbAll(db, 'SELECT display_name FROM payment_methods ORDER BY id');
    const names = rows.map(r => r.display_name);
    expect(names).toEqual(['Cash', 'Debit', 'Cheque', 'Credit Card']);
  });

  // ── Requirement 2.4, 3.2, 3.3: consolidated_schema_v1 migration recorded ──

  test('records consolidated_schema_v1 migration entry after runMigrations', async () => {
    await runMigrations(db);
    const applied = await checkMigrationApplied(db, 'consolidated_schema_v1');
    expect(applied).toBe(true);
  });

  // ── Requirement 2.1: PRAGMA foreign_keys ON ──

  test('has PRAGMA foreign_keys enabled', async () => {
    const row = await dbGet(db, 'PRAGMA foreign_keys');
    expect(row.foreign_keys).toBe(1);
  });

  // ── Requirement 8.2: effective_balance defaults to NULL ──

  test('effective_balance defaults to NULL on credit_card_billing_cycles', async () => {
    // Insert a minimal billing cycle row
    await dbRun(db, `
      INSERT INTO payment_methods (type, display_name, full_name, is_active)
      VALUES ('credit_card', 'Test CC', 'Test Credit Card', 1)
    `);
    const pm = await dbGet(db, "SELECT id FROM payment_methods WHERE display_name = 'Test CC'");

    await dbRun(db, `
      INSERT INTO credit_card_billing_cycles
        (payment_method_id, cycle_start_date, cycle_end_date,
         actual_statement_balance, calculated_statement_balance)
      VALUES (?, '2024-01-01', '2024-01-31', 100.0, 95.0)
    `, [pm.id]);

    const row = await dbGet(db, `
      SELECT effective_balance FROM credit_card_billing_cycles
      WHERE payment_method_id = ?
    `, [pm.id]);

    expect(row.effective_balance).toBeNull();
  });

  // ── Requirement 8.3: balance_type defaults to 'calculated' ──

  test("balance_type defaults to 'calculated' on credit_card_billing_cycles", async () => {
    const row = await dbGet(db, `
      SELECT balance_type FROM credit_card_billing_cycles LIMIT 1
    `);
    expect(row.balance_type).toBe('calculated');
  });

  // ── Requirement 2.5, 3.2: runMigrations no-ops when already applied ──

  test('runMigrations is a no-op when consolidated_schema_v1 already exists', async () => {
    // Ensure it's applied
    await runMigrations(db);

    // Count entries before
    const before = await dbGet(
      db,
      "SELECT COUNT(*) as cnt FROM schema_migrations WHERE migration_name = 'consolidated_schema_v1'"
    );

    // Run again
    await runMigrations(db);

    // Count entries after — should be the same (INSERT OR IGNORE)
    const after = await dbGet(
      db,
      "SELECT COUNT(*) as cnt FROM schema_migrations WHERE migration_name = 'consolidated_schema_v1'"
    );

    expect(after.cnt).toBe(before.cnt);
    expect(after.cnt).toBe(1);
  });

  // ── Requirement 7.3: update_budgets_timestamp trigger exists and fires ──

  test('update_budgets_timestamp trigger exists', async () => {
    const row = await dbGet(
      db,
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='update_budgets_timestamp'"
    );
    expect(row).toBeTruthy();
    expect(row.name).toBe('update_budgets_timestamp');
  });

  test('update_budgets_timestamp trigger fires on budget update', async () => {
    // Insert a budget row with a known updated_at
    await dbRun(db, `
      INSERT INTO budgets (year, month, category, "limit", created_at, updated_at)
      VALUES (2024, 1, 'TestTrigger', 500.0, '2020-01-01 00:00:00', '2020-01-01 00:00:00')
    `);

    const before = await dbGet(
      db,
      "SELECT updated_at FROM budgets WHERE category = 'TestTrigger'"
    );
    expect(before.updated_at).toBe('2020-01-01 00:00:00');

    // Update the row — trigger should change updated_at
    await dbRun(db, `
      UPDATE budgets SET "limit" = 600.0 WHERE category = 'TestTrigger'
    `);

    const after = await dbGet(
      db,
      "SELECT updated_at FROM budgets WHERE category = 'TestTrigger'"
    );

    // updated_at should have changed from the old value
    expect(after.updated_at).not.toBe('2020-01-01 00:00:00');
  });
});

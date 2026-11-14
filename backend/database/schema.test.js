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
    'fixed_expenses', 'loans', 'loan_balances',
    'loan_payments', 'budgets', 'budget_allocations', 'investments', 'investment_values',
    'people', 'expense_people', 'expense_invoices', 'place_names',
    'reminders', 'dismissed_anomalies', 'anomaly_suppression_rules',
    'payment_methods', 'credit_card_payments', 'credit_card_statements',
    'credit_card_billing_cycles', 'activity_logs', 'settings', 'users',
    'plaid_items', 'plaid_accounts', 'plaid_transactions', 'plaid_fixed_expense_links', 'plaid_income_links',
    'plaid_card_payment_links', 'plaid_insurance_links'
  ];

  test('creates exactly 33 tables', async () => {
    const rows = await dbAll(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tableNames = rows.map(r => r.name).sort();
    expect(tableNames).toEqual([...EXPECTED_TABLES].sort());
    expect(tableNames).toHaveLength(33);
  });

  test('plaid_transactions allows one bank transaction per expense', async () => {
    await dbRun(db, "INSERT INTO expenses (date, amount, type, week, method) VALUES ('2026-01-05', 10, 'Other', 1, 'Cash')");
    const expense = await dbGet(db, 'SELECT id FROM expenses ORDER BY id DESC LIMIT 1');
    await dbRun(db, "INSERT INTO plaid_transactions (transaction_id, amount, date, status, expense_id) VALUES ('t1', 10, '2026-01-05', 'matched', ?)", [expense.id]);
    // Unlinked rows (NULL expense_id) are not constrained
    await dbRun(db, "INSERT INTO plaid_transactions (transaction_id, amount, date) VALUES ('t2', 10, '2026-01-05')");
    await dbRun(db, "INSERT INTO plaid_transactions (transaction_id, amount, date) VALUES ('t3', 10, '2026-01-05')");
    await expect(
      dbRun(db, "INSERT INTO plaid_transactions (transaction_id, amount, date, status, expense_id) VALUES ('t4', 10, '2026-01-05', 'added', ?)", [expense.id])
    ).rejects.toThrow(/UNIQUE constraint failed/);
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

  test('plaid_transactions_pfc_v1 adds the category columns to a database created before them', async () => {
    await runMigrations(db);
    const pfcColumns = async () => (await dbAll(db, 'PRAGMA table_info(plaid_transactions)'))
      .map(c => c.name).filter(name => name.startsWith('pfc_'));
    for (const column of await pfcColumns()) {
      await dbRun(db, `ALTER TABLE plaid_transactions DROP COLUMN ${column}`);
    }
    await dbRun(db, "DELETE FROM schema_migrations WHERE migration_name = 'plaid_transactions_pfc_v1'");
    expect(await pfcColumns()).toEqual([]);

    await runMigrations(db);

    expect(await pfcColumns()).toEqual(['pfc_primary', 'pfc_detailed', 'pfc_confidence']);
    expect(await checkMigrationApplied(db, 'plaid_transactions_pfc_v1')).toBe(true);
  });

  test('plaid_capture_v1 adds the capture and bucket columns and sorts categorised rows into Not expenses', async () => {
    const ADDED = ['merchant_entity_id', 'logo_url', 'website', 'original_description', 'payment_channel', 'review_bucket', 'bucket_overridden'];
    const columns = async () => (await dbAll(db, 'PRAGMA table_info(plaid_transactions)')).map(c => c.name).filter(name => ADDED.includes(name));
    await runMigrations(db);
    await dbRun(db, 'DROP INDEX IF EXISTS idx_plaid_transactions_merchant_entity');
    for (const column of await columns()) {
      await dbRun(db, `ALTER TABLE plaid_transactions DROP COLUMN ${column}`);
    }
    await dbRun(db, "DELETE FROM schema_migrations WHERE migration_name = 'plaid_capture_v1'");
    expect(await columns()).toEqual([]);

    await dbRun(db, "INSERT INTO plaid_items (item_id, institution_name, access_token_enc, environment) VALUES ('mig-item', 'Bank', 'v1:x:y:z', 'sandbox')");
    const item = await dbGet(db, "SELECT id FROM plaid_items WHERE item_id = 'mig-item'");
    await dbRun(db, "INSERT INTO plaid_accounts (plaid_item_id, account_id, name, payment_method_id) VALUES (?, 'mig-chq', 'Chequing', 2)", [item.id]);
    await dbRun(db, "INSERT INTO plaid_accounts (plaid_item_id, account_id, name, payment_method_id) VALUES (?, 'mig-card', 'Visa', 4)", [item.id]);
    const chq = (await dbGet(db, "SELECT id FROM plaid_accounts WHERE account_id = 'mig-chq'")).id;
    const card = (await dbGet(db, "SELECT id FROM plaid_accounts WHERE account_id = 'mig-card'")).id;
    const stage = (tid, account, amount, status, primary, detailed = null, name = 'X') => dbRun(db,
      'INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, date, name, status, pfc_primary, pfc_detailed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tid, account, amount, '2026-10-01', name, status, primary, detailed]);
    await stage('mig-xfer', chq, 300, 'new', 'TRANSFER_OUT');
    await stage('mig-etransfer', chq, 12, 'new', 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'Joliet Cutler - INTERAC e-Transfer®');
    await stage('mig-xfer-ignored', chq, 75, 'ignored', 'TRANSFER_OUT', null, 'Transfer out');
    await stage('mig-loan', chq, 900, 'new', 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CAR_PAYMENT');
    await stage('mig-card-pay', card, -500, 'new', 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT');
    await stage('mig-insurer', chq, -105.3, 'new', 'TRANSFER_IN');
    await stage('mig-refund', card, -20, 'new', 'GENERAL_MERCHANDISE', null, 'AMAZON REFUND');
    await stage('mig-no-pfc', chq, 300, 'new', null);
    await stage('mig-added', chq, 300, 'added', 'TRANSFER_OUT');

    await runMigrations(db);

    expect(await columns()).toEqual(ADDED);
    expect(await checkMigrationApplied(db, 'plaid_capture_v1')).toBe(true);
    expect(await dbGet(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_plaid_transactions_merchant_entity'")).toBeDefined();
    const rows = await dbAll(db, "SELECT transaction_id, review_bucket FROM plaid_transactions WHERE transaction_id LIKE 'mig-%' ORDER BY transaction_id");
    expect(Object.fromEntries(rows.map(r => [r.transaction_id, r.review_bucket]))).toEqual({
      'mig-added': 'spending', 'mig-card-pay': 'not_expense', 'mig-etransfer': 'spending', 'mig-insurer': 'spending',
      'mig-loan': 'spending', 'mig-no-pfc': 'spending', 'mig-refund': 'spending', 'mig-xfer': 'not_expense',
      'mig-xfer-ignored': 'not_expense'
    });
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

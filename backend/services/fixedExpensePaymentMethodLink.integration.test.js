/**
 * Integration tests: fixed expenses are linked to their payment method by id (not only by display name),
 * so renaming a payment method keeps them linked and their stored names current.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const fixedExpenseService = require('./fixedExpenseService');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const paymentMethodService = require('./paymentMethodService');
const { runMigrations } = require('../database/migrations');

let db;
let wsDebitId;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { return err ? reject(err) : resolve(this.lastID); });
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});

const fixedInput = (overrides = {}) => ({
  year: 2026, month: 10, name: 'Mortgage', amount: 1500, category: 'Housing', payment_type: 'Debit - WS', payment_due_day: 1, ...overrides
});

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM fixed_expenses');
  await run('DELETE FROM expenses');
  await run("DELETE FROM payment_methods WHERE display_name NOT IN ('Cash', 'Debit', 'Cheque', 'Credit Card')");
  wsDebitId = await run("INSERT INTO payment_methods (type, display_name, full_name, is_active) VALUES ('debit', 'Debit - WS', 'Wealthsimple', 1)");
});

describe('fixed expense payment method link', () => {
  test('create, update and copy-forward store payment_method_id resolved from the chosen name', async () => {
    const created = await fixedExpenseService.createFixedExpense(fixedInput());
    expect(created.payment_method_id).toBe(wsDebitId);

    const debit = await get("SELECT id FROM payment_methods WHERE display_name = 'Debit'");
    const updated = await fixedExpenseService.updateFixedExpense(created.id, fixedInput({ payment_type: 'Debit' }));
    expect(updated.payment_method_id).toBe(debit.id);

    await fixedExpenseRepository.copyFixedExpenses(2026, 10, 2026, 11);
    expect(await get('SELECT payment_type, payment_method_id FROM fixed_expenses WHERE month = 11')).toEqual({ payment_type: 'Debit', payment_method_id: debit.id });

    const { items } = await fixedExpenseService.getMonthlyFixedExpensesWithLoans(2026, 10);
    expect(items[0]).toMatchObject({ payment_type: 'Debit', payment_method_id: debit.id });
  });

  test('legacy names that match no payment method stay unlinked', async () => {
    await run("INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (2023, 1, 'Old', 10, 'Other', 'Fixed')");
    await fixedExpenseRepository.copyFixedExpenses(2023, 1, 2023, 2);
    expect(await all('SELECT payment_method_id FROM fixed_expenses ORDER BY month')).toEqual([{ payment_method_id: null }, { payment_method_id: null }]);
  });

  test('the backfill migration links existing rows by name, fixes stale ids, and leaves legacy rows alone', async () => {
    const byName = await run("INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (2026, 9, 'Mortgage', 1500, 'Housing', 'Debit - WS')");
    const legacy = await run("INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (2024, 1, 'Old', 10, 'Other', 'Fixed')");
    // Switched from 'Debit' to 'Debit - WS' before updates wrote the id: the id still points at 'Debit'
    const debit = await get("SELECT id FROM payment_methods WHERE display_name = 'Debit'");
    const stale = await run("INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type, payment_method_id) VALUES (2026, 1, 'Loan', 135.29, 'Other', 'Debit - WS', ?)", [debit.id]);
    await run("DELETE FROM schema_migrations WHERE migration_name = 'fixed_expenses_payment_method_id_backfill_v1'");

    await runMigrations(db);

    expect(await get('SELECT payment_method_id FROM fixed_expenses WHERE id = ?', [byName])).toEqual({ payment_method_id: wsDebitId });
    expect(await get('SELECT payment_method_id FROM fixed_expenses WHERE id = ?', [stale])).toEqual({ payment_method_id: wsDebitId });
    expect(await get('SELECT payment_method_id FROM fixed_expenses WHERE id = ?', [legacy])).toEqual({ payment_method_id: null });
  });

  test('renaming a payment method keeps fixed expenses linked and updates stored names', async () => {
    const linked = (await fixedExpenseService.createFixedExpense(fixedInput())).id;
    const nameOnly = await run("INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (2026, 8, 'Internet', 80, 'Utilities', 'Debit - WS')");
    const expenseId = await run("INSERT INTO expenses (date, place, amount, type, week, method, payment_method_id) VALUES ('2026-10-05', 'Store', 10, 'Other', 1, 'Debit - WS', ?)", [wsDebitId]);
    const pm = await paymentMethodService.getPaymentMethodById(wsDebitId);

    await paymentMethodService.updatePaymentMethod(wsDebitId, { ...pm, display_name: 'WS Chequing' });

    expect(await all('SELECT id, payment_type, payment_method_id FROM fixed_expenses ORDER BY id')).toEqual([
      { id: linked, payment_type: 'WS Chequing', payment_method_id: wsDebitId },
      { id: nameOnly, payment_type: 'WS Chequing', payment_method_id: wsDebitId }
    ]);
    expect(await get('SELECT method FROM expenses WHERE id = ?', [expenseId])).toEqual({ method: 'WS Chequing' });
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'payment_method_updated', 'payment_method', wsDebitId,
      expect.stringContaining('renamed on 2 fixed expense(s) and 1 expense(s)'), expect.any(Object)
    );

    // Still valid for editing under the new name
    await expect(fixedExpenseService.updateFixedExpense(linked, fixedInput({ payment_type: 'WS Chequing', amount: 1600 }))).resolves.toMatchObject({ amount: 1600 });
  });
});

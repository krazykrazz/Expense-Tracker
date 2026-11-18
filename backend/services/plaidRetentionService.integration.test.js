/**
 * Integration tests: plaidRetentionService -> plaidRepository / settingsRepository -> real SQLite (spec 2.5.1).
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { sqlHelpers, insertItem } = require('../test/plaidFixtures');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));
jest.mock('./activityLogService');
jest.mock('../config/plaid', () => ({ isEnabled: jest.fn() }));

const { getDatabase } = require('../database/db');
const plaidConfig = require('../config/plaid');
const activityLogService = require('./activityLogService');
const plaidRetentionService = require('./plaidRetentionService');

const TODAY = '2026-11-17';
let db;
let accountId;

const { run, get } = sqlHelpers(() => db);

const stage = (transactionId, { status = 'new', date = '2026-01-10', authorizedDate = null, expenseId = null } = {}) =>
  run(
    `INSERT INTO plaid_transactions (transaction_id, plaid_account_id, amount, date, authorized_date, name, status, expense_id)
     VALUES (?, ?, 10, ?, ?, 'ROW', ?, ?)`,
    [transactionId, accountId, date, authorizedDate, status, expenseId]
  );

const remaining = async () => (await sqlHelpers(() => db).all('SELECT transaction_id FROM plaid_transactions ORDER BY transaction_id')).map(r => r.transaction_id);

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  plaidConfig.isEnabled.mockReturnValue(true);
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run('DELETE FROM settings WHERE key = ?', [plaidRetentionService.RETENTION_KEY]);
  const itemId = await insertItem(run);
  accountId = await run("INSERT INTO plaid_accounts (plaid_item_id, account_id, name) VALUES (?, 'acc', 'Chequing')", [itemId]);
});

describe('plaidRetentionService', () => {
  test('deletes only ignored rows older than two months and keeps everything else', async () => {
    await stage('ignored-old', { status: 'ignored', date: '2026-08-01' });
    await stage('ignored-recent', { status: 'ignored', date: '2026-10-01' });
    await stage('ignored-boundary', { status: 'ignored', date: '2026-09-17' });
    await stage('new-old', { status: 'new', date: '2026-01-01' });
    await stage('matched-old', { status: 'matched', date: '2026-01-01' });
    await stage('added-old', { status: 'added', date: '2026-01-01' });

    const result = await plaidRetentionService.run(TODAY);

    expect(result).toEqual({ deleted: 1 });
    expect(await remaining()).toEqual(['added-old', 'ignored-boundary', 'ignored-recent', 'matched-old', 'new-old']);
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'plaid_transactions_cleaned', 'plaid_transaction', null, expect.stringContaining('Removed 1 ignored'), expect.objectContaining({ deleted: 1, cutoff: '2026-09-17' })
    );
  });

  test('ages a row by its purchase date when it has one, not the posting date', async () => {
    await stage('posted-late', { status: 'ignored', authorizedDate: '2026-07-30', date: '2026-10-05' });

    expect(await plaidRetentionService.run(TODAY)).toEqual({ deleted: 1 });
  });

  test('uses the saved retention months, and falls back to two when the value is not usable', async () => {
    await stage('ignored-old', { status: 'ignored', date: '2026-08-01' });
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '6')", [plaidRetentionService.RETENTION_KEY]);
    expect(await plaidRetentionService.run(TODAY)).toEqual({ deleted: 0 });
    expect(activityLogService.logEvent).not.toHaveBeenCalled();

    await run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, 'soon')", [plaidRetentionService.RETENTION_KEY]);
    expect(await plaidRetentionService.getRetentionMonths()).toBe(2);
    expect(await plaidRetentionService.run(TODAY)).toEqual({ deleted: 1 });
    expect(await get('SELECT COUNT(*) AS n FROM plaid_transactions')).toEqual({ n: 0 });
  });

  test('does nothing while Plaid is not configured', async () => {
    plaidConfig.isEnabled.mockReturnValue(false);
    await stage('ignored-old', { status: 'ignored', date: '2026-08-01' });

    expect(await plaidRetentionService.run(TODAY)).toEqual({ skipped: 'plaid_disabled' });
    expect(await remaining()).toEqual(['ignored-old']);
  });

  test.each([
    ['2026-03-31', 1, '2026-02-28'],
    ['2026-01-15', 2, '2025-11-15'],
    ['2024-03-31', 1, '2024-02-29']
  ])('monthsBefore(%s, %i) clamps to the month length: %s', (date, months, expected) => {
    expect(plaidRetentionService._monthsBefore(date, months)).toBe(expected);
  });
});

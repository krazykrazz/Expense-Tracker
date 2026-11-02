/**
 * Integration tests: plaidService -> plaidRepository -> real SQLite, with the Plaid API client mocked.
 */

const crypto = require('crypto');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db');
jest.mock('./activityLogService');
jest.mock('../config/plaid', () => ({
  ...jest.requireActual('../config/plaid'),
  getPlaidClient: jest.fn()
}));

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const plaidConfig = require('../config/plaid');
const plaidService = require('./plaidService');

const ENV_KEYS = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV', 'PLAID_TOKEN_KEY'];
const savedEnv = {};

let db;
let client;

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { return err ? reject(err) : resolve(this.lastID); });
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});

const account = (id, extra = {}) => ({ account_id: id, name: `Account ${id}`, mask: '1234', type: 'depository', subtype: 'checking', ...extra });
const txn = (id, extra = {}) => ({
  transaction_id: id, account_id: 'acc-1', amount: 12.34, iso_currency_code: 'CAD',
  date: '2026-10-10', authorized_date: '2026-10-09', name: `RAW ${id}`, merchant_name: `Merchant ${id}`, pending: false, ...extra
});
const page = ({ added = [], modified = [], removed = [], next_cursor = 'c1', has_more = false, accounts = [account('acc-1')] } = {}) => ({
  data: { added, modified, removed, next_cursor, has_more, accounts, transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE' }
});
const plaidError = (code) => Object.assign(new Error('Request failed'), { response: { data: { error_code: code, error_message: code } } });

async function connect(name = 'Test Bank') {
  client.itemPublicTokenExchange.mockResolvedValueOnce({ data: { access_token: `access-${name}`, item_id: `item-${name}` } });
  client.accountsGet.mockResolvedValueOnce({ data: { accounts: [account('acc-1')] } });
  return plaidService.connectItem({ publicToken: 'public-token', institutionName: name });
}

beforeAll(async () => {
  for (const name of ENV_KEYS) savedEnv[name] = process.env[name];
  Object.assign(process.env, {
    PLAID_CLIENT_ID: 'client', PLAID_SECRET: 'secret', PLAID_ENV: 'sandbox',
    PLAID_TOKEN_KEY: crypto.randomBytes(32).toString('base64')
  });
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => {
  for (const name of ENV_KEYS) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
  cleanupIsolatedTestDb(db);
});

beforeEach(async () => {
  process.env.PLAID_ENV = 'sandbox';
  client = {
    linkTokenCreate: jest.fn(),
    itemPublicTokenExchange: jest.fn(),
    accountsGet: jest.fn(),
    transactionsSync: jest.fn(),
    itemRemove: jest.fn().mockResolvedValue({ data: {} })
  };
  plaidConfig.getPlaidClient.mockReturnValue(client);
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
  await run('DELETE FROM expenses');
  await run("DELETE FROM settings WHERE key = 'plaid_production_items_created'");
});

describe('plaidService', () => {
  describe('status', () => {
    test('reports disabled when configuration is incomplete', async () => {
      const previous = process.env.PLAID_SECRET;
      delete process.env.PLAID_SECRET;
      try {
        expect(await plaidService.getStatus()).toEqual({ enabled: false, source: 'env' });
      } finally {
        process.env.PLAID_SECRET = previous;
      }
    });

    test('sandbox has no Trial counter', async () => {
      expect(await plaidService.getStatus()).toEqual({ enabled: true, source: 'env', environment: 'sandbox', trial: null });
    });
  });

  describe('connectItem', () => {
    test('stores the item with an encrypted token, its accounts, and logs the connection', async () => {
      const item = await connect();

      expect(item).toMatchObject({ institutionName: 'Test Bank', environment: 'sandbox', accounts: [expect.objectContaining({ accountId: 'acc-1', paymentMethodId: null })] });
      expect(item).not.toHaveProperty('accessTokenEnc');
      const stored = await get('SELECT access_token_enc FROM plaid_items WHERE id = ?', [item.id]);
      expect(stored.access_token_enc).toMatch(/^v1:/);
      expect(stored.access_token_enc).not.toContain('access-Test Bank');
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_item_added', 'plaid_item', item.id, 'Connected bank: Test Bank', expect.not.objectContaining({ accessToken: expect.anything() })
      );
    });

    test('counts Production connections against the Trial limit, even after disconnecting', async () => {
      process.env.PLAID_ENV = 'production';
      const item = await connect('Real Bank');
      expect((await plaidService.getStatus()).trial).toEqual({ limit: 10, used: 1 });

      await plaidService.disconnectItem(item.id);
      expect((await plaidService.getStatus()).trial).toEqual({ limit: 10, used: 1 });
    });

    test('requires a public token', async () => {
      await expect(plaidService.connectItem({})).rejects.toMatchObject({ statusCode: 400 });
    });

    test('maps Plaid API errors to 502 without leaking the raw error', async () => {
      client.itemPublicTokenExchange.mockRejectedValueOnce(plaidError('INVALID_PUBLIC_TOKEN'));
      await expect(plaidService.connectItem({ publicToken: 'bad' })).rejects.toMatchObject({ statusCode: 502, plaidErrorCode: 'INVALID_PUBLIC_TOKEN' });
    });

    test('refuses before creating anything at Plaid when the encryption key is unusable', async () => {
      const previous = process.env.PLAID_TOKEN_KEY;
      process.env.PLAID_TOKEN_KEY = 'not-a-valid-key';
      try {
        await expect(plaidService.connectItem({ publicToken: 'public-token' })).rejects.toMatchObject({ statusCode: 500 });
      } finally {
        process.env.PLAID_TOKEN_KEY = previous;
      }
      expect(client.itemPublicTokenExchange).not.toHaveBeenCalled();
    });

    test('removes the new Item at Plaid if storing it fails', async () => {
      await connect('Dup Bank');
      // Same item_id again: the UNIQUE constraint makes the insert fail after the exchange
      client.itemPublicTokenExchange.mockResolvedValueOnce({ data: { access_token: 'access-second', item_id: 'item-Dup Bank' } });

      await expect(plaidService.connectItem({ publicToken: 'public-token', institutionName: 'Dup Bank' })).rejects.toThrow(/UNIQUE/);

      expect(client.itemRemove).toHaveBeenCalledWith({ access_token: 'access-second' });
      expect((await get('SELECT COUNT(*) AS n FROM plaid_items')).n).toBe(1);
    });
  });

  describe('syncItem', () => {
    test('pages through has_more, skips pending, and saves the final cursor', async () => {
      const item = await connect();
      client.transactionsSync
        .mockResolvedValueOnce(page({ added: [txn('t1'), txn('p1', { pending: true })], next_cursor: 'c1', has_more: true }))
        .mockResolvedValueOnce(page({ added: [txn('t2')], next_cursor: 'c2', has_more: false }));

      const result = await plaidService.syncItem(item.id);

      expect(result).toMatchObject({ added: 2, updated: 0, removed: 0 });
      expect(client.transactionsSync.mock.calls.map(([req]) => req.cursor)).toEqual([undefined, 'c1']);
      expect((await all('SELECT transaction_id FROM plaid_transactions ORDER BY transaction_id')).map(r => r.transaction_id)).toEqual(['t1', 't2']);
      expect(await get('SELECT sync_cursor, last_synced_at FROM plaid_items WHERE id = ?', [item.id]))
        .toMatchObject({ sync_cursor: 'c2', last_synced_at: expect.any(String) });
    });

    test('is idempotent when the same transactions arrive again', async () => {
      const item = await connect();
      client.transactionsSync.mockResolvedValue(page({ added: [txn('t1'), txn('t2')] }));

      await plaidService.syncItem(item.id);
      const second = await plaidService.syncItem(item.id);

      expect(second).toMatchObject({ added: 0 });
      expect((await get('SELECT COUNT(*) AS n FROM plaid_transactions')).n).toBe(2);
    });

    test('modified and removed only touch rows still waiting for review', async () => {
      const item = await connect();
      client.transactionsSync.mockResolvedValueOnce(page({ added: [txn('new1'), txn('new2'), txn('done1'), txn('done2')] }));
      await plaidService.syncItem(item.id);
      await run("UPDATE plaid_transactions SET status = 'ignored' WHERE transaction_id IN ('done1', 'done2')");

      client.transactionsSync.mockResolvedValueOnce(page({
        modified: [txn('new1', { amount: 99 }), txn('done1', { amount: 99 })],
        removed: [{ transaction_id: 'new2' }, { transaction_id: 'done2' }],
        next_cursor: 'c2'
      }));
      const result = await plaidService.syncItem(item.id);

      expect(result).toMatchObject({ added: 0, updated: 1, removed: 1 });
      const rows = await all('SELECT transaction_id, amount, status FROM plaid_transactions ORDER BY transaction_id');
      expect(rows).toEqual([
        { transaction_id: 'done1', amount: 12.34, status: 'ignored' },
        { transaction_id: 'done2', amount: 12.34, status: 'ignored' },
        { transaction_id: 'new1', amount: 99, status: 'new' }
      ]);
    });

    test('restarts from the saved cursor when data changes during pagination', async () => {
      const item = await connect();
      client.transactionsSync
        .mockResolvedValueOnce(page({ added: [txn('t1')], next_cursor: 'c1', has_more: true }))
        .mockRejectedValueOnce(plaidError('TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'))
        .mockResolvedValueOnce(page({ added: [txn('t1')], next_cursor: 'c1', has_more: true }))
        .mockResolvedValueOnce(page({ added: [txn('t2')], next_cursor: 'c2' }));

      const result = await plaidService.syncItem(item.id);

      expect(client.transactionsSync.mock.calls.map(([req]) => req.cursor)).toEqual([undefined, 'c1', undefined, 'c1']);
      expect(result).toMatchObject({ added: 2 });
    });

    test('refuses to sync a bank connected in a different environment', async () => {
      const item = await connect();
      process.env.PLAID_ENV = 'production';

      await expect(plaidService.syncItem(item.id)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('connected in sandbox') });
      expect(client.transactionsSync).not.toHaveBeenCalled();
    });

    test('a failed page stages nothing, keeps the cursor, and records the error', async () => {
      const item = await connect();
      client.transactionsSync
        .mockResolvedValueOnce(page({ added: [txn('t1')], next_cursor: 'c1', has_more: true }))
        .mockRejectedValueOnce(plaidError('ITEM_LOGIN_REQUIRED'));

      await expect(plaidService.syncItem(item.id)).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('reconnect') });

      expect((await get('SELECT COUNT(*) AS n FROM plaid_transactions')).n).toBe(0);
      expect(await get('SELECT sync_cursor, last_error FROM plaid_items WHERE id = ?', [item.id]))
        .toEqual({ sync_cursor: null, last_error: 'ITEM_LOGIN_REQUIRED' });
    });

    test('syncAll reports per-bank failures without stopping other banks', async () => {
      await connect('Bank A');
      await connect('Bank B');
      client.transactionsSync
        .mockRejectedValueOnce(plaidError('INSTITUTION_DOWN'))
        .mockResolvedValueOnce(page({ added: [txn('t1')] }));

      const { results, totals } = await plaidService.syncAll();

      expect(results).toEqual([
        expect.objectContaining({ institutionName: 'Bank A', error: expect.stringContaining('INSTITUTION_DOWN') }),
        expect.objectContaining({ institutionName: 'Bank B', added: 1 })
      ]);
      expect(totals).toEqual({ added: 1, updated: 0, removed: 0 });
    });
  });

  describe('updateAccountMapping', () => {
    test('maps to an active payment method and back to none', async () => {
      const item = await connect();
      const accountId = item.accounts[0].id;

      expect(await plaidService.updateAccountMapping(accountId, 2)).toMatchObject({ paymentMethodId: 2 });
      expect(await plaidService.updateAccountMapping(accountId, null)).toMatchObject({ paymentMethodId: null });
    });

    test('rejects unknown accounts and payment methods', async () => {
      const item = await connect();
      await expect(plaidService.updateAccountMapping(99999, 2)).rejects.toMatchObject({ statusCode: 404 });
      await expect(plaidService.updateAccountMapping(item.accounts[0].id, 99999)).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('disconnectItem', () => {
    test('removes the item at Plaid, deletes unreviewed rows, and keeps reviewed links and expenses', async () => {
      const item = await connect();
      client.transactionsSync.mockResolvedValueOnce(page({ added: [txn('new1'), txn('ign1'), txn('add1')] }));
      await plaidService.syncItem(item.id);
      const expenseId = await run("INSERT INTO expenses (date, amount, type, week, method, payment_method_id) VALUES ('2026-10-09', 12.34, 'Other', 2, 'Debit', 2)");
      await run("UPDATE plaid_transactions SET status = 'ignored' WHERE transaction_id = 'ign1'");
      await run("UPDATE plaid_transactions SET status = 'added', expense_id = ? WHERE transaction_id = 'add1'", [expenseId]);

      await plaidService.disconnectItem(item.id);

      expect(client.itemRemove).toHaveBeenCalledWith({ access_token: 'access-Test Bank' });
      expect(await all('SELECT transaction_id, plaid_account_id, expense_id FROM plaid_transactions'))
        .toEqual([{ transaction_id: 'add1', plaid_account_id: null, expense_id: expenseId }]);
      expect((await get('SELECT COUNT(*) AS n FROM expenses')).n).toBe(1);
      expect((await get('SELECT COUNT(*) AS n FROM plaid_items')).n).toBe(0);
      expect(activityLogService.logEvent).toHaveBeenCalledWith('plaid_item_deleted', 'plaid_item', item.id, 'Disconnected bank: Test Bank', expect.any(Object));
    });

    test('still removes locally when Plaid no longer knows the item', async () => {
      const item = await connect();
      client.itemRemove.mockRejectedValueOnce(plaidError('ITEM_NOT_FOUND'));

      await plaidService.disconnectItem(item.id);

      expect((await get('SELECT COUNT(*) AS n FROM plaid_items')).n).toBe(0);
    });

    test('removes a bank from another environment locally without calling Plaid', async () => {
      const item = await connect();
      process.env.PLAID_ENV = 'production';

      await plaidService.disconnectItem(item.id);

      expect(client.itemRemove).not.toHaveBeenCalled();
      expect((await get('SELECT COUNT(*) AS n FROM plaid_items')).n).toBe(0);
    });
  });
});

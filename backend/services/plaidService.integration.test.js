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
    transactionsRefresh: jest.fn(),
    transactionsSync: jest.fn(),
    itemRemove: jest.fn().mockResolvedValue({ data: {} }),
    itemGet: jest.fn().mockResolvedValue({
      data: { item: { institution_id: 'ins_test' }, status: { transactions: { last_successful_update: new Date().toISOString(), last_failed_update: null } } }
    }),
    institutionsGetById: jest.fn().mockResolvedValue({
      data: { institution: { status: { transactions_updates: { status: 'HEALTHY', last_status_change: '2026-11-01T00:00:00Z' } } } }
    })
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
      expect(await plaidService.getStatus()).toEqual({ enabled: true, source: 'env', environment: 'sandbox', trial: null, needsAttention: [], staleData: [] });
    });

    test('a bank Plaid has had no new data from for over 12 hours is stale; a login problem takes precedence', async () => {
      const quiet = await connect('Quiet Bank');
      const fresh = await connect('Fresh Bank');
      const expired = await connect('Expired Bank');
      const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
      const quietUpdated = hoursAgo(13);
      await run("UPDATE plaid_items SET bank_updated_at = ?, institution_status = 'DOWN' WHERE id = ?", [quietUpdated, quiet.id]);
      await run('UPDATE plaid_items SET bank_updated_at = ? WHERE id = ?', [hoursAgo(11), fresh.id]);
      await run("UPDATE plaid_items SET bank_updated_at = ?, last_error = 'ITEM_LOGIN_REQUIRED' WHERE id = ?", [hoursAgo(30), expired.id]);

      const status = await plaidService.getStatus();

      expect(status.staleData).toEqual([
        { id: quiet.id, institutionName: 'Quiet Bank', bankUpdatedAt: quietUpdated, institutionStatus: 'DOWN' }
      ]);
      expect(status.needsAttention.map(item => item.id)).toEqual([expired.id]);
      const statuses = Object.fromEntries((await plaidService.listItems()).map(item => [item.institutionName, item.status]));
      expect(statuses).toEqual({ 'Quiet Bank': 'stale', 'Fresh Bank': 'ok', 'Expired Bank': 'needs_login' });
    });

    test('a stale bank is still synced automatically (it is not waiting for the user)', async () => {
      const quiet = await connect('Quiet Bank');
      await run("UPDATE plaid_items SET bank_updated_at = '2026-01-01T00:00:00Z' WHERE id = ?", [quiet.id]);

      expect((await plaidService.findStaleItems(30)).map(item => item.id)).toEqual([quiet.id]);
    });

    test('lists banks that need the user: login expired, or removed at the bank; not temporary errors', async () => {
      const login = await connect('Login Bank');
      const gone = await connect('Gone Bank');
      const down = await connect('Down Bank');
      await run("UPDATE plaid_items SET last_error = 'ITEM_LOGIN_REQUIRED' WHERE id = ?", [login.id]);
      await run("UPDATE plaid_items SET last_error = 'ITEM_NOT_FOUND' WHERE id = ?", [gone.id]);
      await run("UPDATE plaid_items SET last_error = 'INSTITUTION_DOWN' WHERE id = ?", [down.id]);

      expect((await plaidService.getStatus()).needsAttention).toEqual([
        { id: gone.id, institutionName: 'Gone Bank', status: 'gone' },
        { id: login.id, institutionName: 'Login Bank', status: 'needs_login' }
      ]);
      expect((await plaidService.listItems()).map(item => item.status).sort()).toEqual(['error', 'gone', 'needs_login']);
    });
  });

  describe('reconnect (update mode)', () => {
    test('a link token for an existing bank carries its access token and no products', async () => {
      const item = await connect();
      client.linkTokenCreate.mockResolvedValue({ data: { link_token: 'link-update', expiration: 'x' } });

      expect(await plaidService.createLinkToken({ itemId: item.id })).toEqual({ linkToken: 'link-update', expiration: 'x' });
      const [request] = client.linkTokenCreate.mock.calls[0];
      expect(request.access_token).toBe('access-Test Bank');
      expect(request).not.toHaveProperty('products');

      await plaidService.createLinkToken();
      expect(client.linkTokenCreate.mock.calls[1][0]).toMatchObject({ products: ['transactions'] });
      expect(client.linkTokenCreate.mock.calls[1][0]).not.toHaveProperty('access_token');
      await expect(plaidService.createLinkToken({ itemId: 99999 })).rejects.toMatchObject({ statusCode: 404 });
    });

    test('reconnected clears the error, logs it, syncs at once, and uses no Trial slot', async () => {
      process.env.PLAID_ENV = 'production';
      const item = await connect();
      const usedBefore = (await plaidService.getStatus()).trial.used;
      await run("UPDATE plaid_items SET last_error = 'ITEM_LOGIN_REQUIRED' WHERE id = ?", [item.id]);
      client.transactionsSync.mockResolvedValueOnce(page({ added: [txn('t1')] }));

      const result = await plaidService.markReconnected(item.id);

      expect(result.item).toMatchObject({ id: item.id, status: 'ok', lastError: null });
      expect(result.sync).toMatchObject({ added: 1 });
      expect((await plaidService.getStatus()).trial.used).toBe(usedBefore);
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_item_updated', 'plaid_item', item.id, 'Reconnected bank: Test Bank',
        { institutionName: 'Test Bank', previousError: 'ITEM_LOGIN_REQUIRED' }
      );
    });

    test('logging in again to a working bank (stale data) syncs and is logged as a login, not a reconnect', async () => {
      const item = await connect();
      client.transactionsSync.mockResolvedValueOnce(page({ added: [txn('t-new')] }));

      const result = await plaidService.markReconnected(item.id);

      expect(result.sync).toMatchObject({ added: 1 });
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_item_updated', 'plaid_item', item.id, 'Logged in to bank again: Test Bank',
        { institutionName: 'Test Bank', previousError: null }
      );
    });

    test('reconnected refuses an unknown bank or one from the other environment', async () => {
      const item = await connect();
      await run("UPDATE plaid_items SET environment = 'production', last_error = 'ITEM_LOGIN_REQUIRED' WHERE id = ?", [item.id]);

      await expect(plaidService.markReconnected(99999)).rejects.toMatchObject({ statusCode: 404 });
      await expect(plaidService.markReconnected(item.id)).rejects.toMatchObject({ statusCode: 409 });
      expect((await plaidService.getItem(item.id)).lastError).toBe('ITEM_LOGIN_REQUIRED');
      expect(activityLogService.logEvent).not.toHaveBeenCalledWith('plaid_item_updated', expect.anything(), expect.anything(), expect.anything(), expect.anything());
    });

    test('requestRefresh asks Plaid to fetch from the bank now', async () => {
      const item = await connect();
      client.transactionsRefresh.mockResolvedValueOnce({ data: { request_id: 'r1' } });

      const result = await plaidService.requestRefresh(item.id);

      expect(client.transactionsRefresh).toHaveBeenCalledWith({ access_token: 'access-Test Bank' });
      expect(result).toMatchObject({ status: 'refreshing', item: { id: item.id, status: 'ok' } });
    });

    test('requestRefresh on a bank that only fetches during a login marks it as needing one (no log entry)', async () => {
      const item = await connect();
      client.transactionsRefresh.mockRejectedValueOnce(plaidError('ITEM_LOGIN_REQUIRED'));

      const result = await plaidService.requestRefresh(item.id);

      expect(result).toMatchObject({ status: 'needs_login', item: { id: item.id, status: 'needs_login' } });
      expect(activityLogService.logEvent).not.toHaveBeenCalledWith('plaid_sync_failed', expect.anything(), expect.anything(), expect.anything(), expect.anything());
    });

    test('requestRefresh reports other Plaid errors and leaves the bank as it was', async () => {
      const item = await connect();
      client.transactionsRefresh.mockRejectedValueOnce(plaidError('INSTITUTION_DOWN'));

      await expect(plaidService.requestRefresh(item.id)).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('refresh failed') });
      expect((await plaidService.getItem(item.id)).lastError).toBeNull();
      await expect(plaidService.requestRefresh(99999)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('bank files and Plaid together (either order)', () => {
    const CREDIT_CARD = 4;
    const plaidInboxService = require('./plaidInboxService');
    const plaidFileImportService = require('./plaidFileImportService');
    const WS_HEADER = 'transaction_date,transaction_type,status,merchant,amount,currency,notes,category';
    const wsFile = (...lines) => [WS_HEADER, ...lines].join('\n');
    const cardPage = (options) => page({ accounts: [account('acc-1', { type: 'credit' })], ...options });
    const rows = () => all(`SELECT transaction_id AS tid, status, pending, amount, date, authorized_date AS auth, name,
      merchant_name AS merchant, expense_id AS expenseId FROM plaid_transactions ORDER BY date, id`);

    async function cardBank(name) {
      const item = await connect(name);
      await run("UPDATE plaid_accounts SET type = 'credit' WHERE plaid_item_id = ?", [item.id]);
      await plaidService.updateAccountMapping(item.accounts[0].id, CREDIT_CARD);
      return { item, accountId: item.accounts[0].id };
    }

    test('file first: Plaid takes the rows over, keeping their review, expense link, purchase date and merchant', async () => {
      const { item, accountId } = await cardBank('Card Bank');
      await plaidFileImportService.importFile(accountId, {
        csv: wsFile('2026-11-03,Purchase,Completed,Corner Cafe,-10.40,CAD,,', '2026-11-03,Purchase,Completed,Grocer,-44.57,CAD,,'),
        fromDate: '2026-11-01'
      });
      const cafe = (await rows()).find(r => r.name === 'Corner Cafe');
      await plaidInboxService.addAsExpense((await get('SELECT id FROM plaid_transactions WHERE name = ?', ['Corner Cafe'])).id, { type: 'Dining Out' });

      // Plaid (Wealthsimple style) sends them a day later, posted date only, its own names
      client.transactionsSync.mockResolvedValueOnce(cardPage({ added: [
        txn('ws-cafe', { amount: 10.4, date: '2026-11-04', authorized_date: null, name: 'Corner Cafe - Purchase', merchant_name: null,
          personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE', confidence_level: 'HIGH' } }),
        txn('ws-grocer', { amount: 44.57, date: '2026-11-04', authorized_date: null, name: 'Grocer - Purchase', merchant_name: null }),
        txn('ws-new', { amount: 7, date: '2026-11-05', authorized_date: null, name: 'Something new', merchant_name: null })
      ] }));

      const result = await plaidService.syncItem(item.id);

      expect(result).toMatchObject({ added: 1, fromFile: 2 });
      expect(await rows()).toEqual([
        { tid: 'ws-cafe', status: 'added', pending: 0, amount: 10.4, date: '2026-11-04', auth: '2026-11-03', name: 'Corner Cafe - Purchase', merchant: 'Corner Cafe', expenseId: expect.any(Number) },
        { tid: 'ws-grocer', status: 'new', pending: 0, amount: 44.57, date: '2026-11-04', auth: '2026-11-03', name: 'Grocer - Purchase', merchant: 'Grocer', expenseId: null },
        { tid: 'ws-new', status: 'new', pending: 0, amount: 7, date: '2026-11-05', auth: null, name: 'Something new', merchant: null, expenseId: null }
      ]);
      expect(cafe).toBeDefined();
      // A file row is dated the day of purchase; Plaid's later date is the posting date, so it reaches the expense
      expect(await get("SELECT e.date, e.posted_date FROM expenses e JOIN plaid_transactions pt ON pt.expense_id = e.id WHERE pt.transaction_id = 'ws-cafe'"))
        .toEqual({ date: '2026-11-03', posted_date: '2026-11-04' });
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_transaction_updated', 'plaid_transaction', expect.any(Number),
        expect.stringMatching(/from a bank file, posting date from the bank: posted date 2026-11-04$/),
        expect.objectContaining({ action: 'posted_date', postedDateUpdated: true })
      );
      // The file had no category; Plaid's version brings it
      expect(await get("SELECT pfc_detailed FROM plaid_transactions WHERE transaction_id = 'ws-cafe'"))
        .toEqual({ pfc_detailed: 'FOOD_AND_DRINK_COFFEE' });
    });

    test('file first, pending at a bank that never sends pending through Plaid: stays pending until it settles', async () => {
      const { item, accountId } = await cardBank('No Pending Bank');
      await plaidFileImportService.importFile(accountId, { csv: wsFile('2026-11-04,Purchase,Pending,Ridge Rock Brewing,-40.00,CAD,,'), fromDate: '2026-11-01' });
      const rowId = (await get("SELECT id FROM plaid_transactions WHERE name = 'Ridge Rock Brewing'")).id;
      const { expense } = await plaidInboxService.addAsExpense(rowId, { type: 'Dining Out' });

      // Plaid says "settled" right away (as Wealthsimple does): not evidence, the file said pending
      client.transactionsSync.mockResolvedValueOnce(cardPage({ added: [txn('ws-rr', { amount: 40, date: '2026-11-04', authorized_date: null, name: 'Ridge Rock Brewing - Purchase' })] }));
      await plaidService.syncItem(item.id);
      expect(await get('SELECT transaction_id AS tid, pending FROM plaid_transactions WHERE id = ?', [rowId])).toEqual({ tid: 'ws-rr', pending: 1 });

      // It completes with the tip: Plaid sends the change
      client.transactionsSync.mockResolvedValueOnce(cardPage({ modified: [txn('ws-rr', { amount: 46, date: '2026-11-05', authorized_date: null, name: 'Ridge Rock Brewing - Purchase' })] }));
      await plaidService.syncItem(item.id);

      expect(await get('SELECT pending, amount FROM plaid_transactions WHERE id = ?', [rowId])).toEqual({ pending: 0, amount: 46 });
      expect((await get('SELECT amount FROM expenses WHERE id = ?', [expense.id])).amount).toBe(46);
    });

    test('file first, pending at a bank that never sends pending: settles once the bank balance includes it', async () => {
      const { item, accountId } = await cardBank('No Pending Bank');
      await plaidFileImportService.importFile(accountId, {
        csv: wsFile('2026-11-04,Purchase,Pending,First Choice Haircutters,-45.41,CAD,,', '2026-11-04,Purchase,Pending,Sobeys,-12.41,CAD,,'),
        fromDate: '2026-11-01'
      });
      for (const name of ['First Choice Haircutters', 'Sobeys']) {
        await plaidInboxService.addAsExpense((await get('SELECT id FROM plaid_transactions WHERE name = ?', [name])).id, { type: 'Other' });
      }
      const ws = (id, amount, name) => txn(id, { amount, date: '2026-11-04', authorized_date: null, name: `${name} - Purchase`, merchant_name: null });
      const balance = (current) => client.accountsGet.mockResolvedValueOnce({ data: { accounts: [account('acc-1', {
        type: 'credit', balances: { current, available: null, limit: null, iso_currency_code: 'CAD' }
      })] } });

      // Plaid sends both; Wealthsimple's balance (pending left out) doesn't include either yet
      client.transactionsSync.mockResolvedValueOnce(cardPage({ added: [ws('ws-hair', 45.41, 'First Choice Haircutters'), ws('ws-sob', 12.41, 'Sobeys')] }));
      balance(0);
      await plaidService.syncItem(item.id);
      expect((await rows()).map(r => [r.tid, r.pending])).toEqual([['ws-hair', 1], ['ws-sob', 1]]);

      // Nothing new from Plaid, but the balance now includes the haircut: it posted
      client.transactionsSync.mockResolvedValueOnce(cardPage());
      balance(45.41);
      await plaidService.syncItem(item.id);

      expect((await rows()).map(r => [r.tid, r.pending])).toEqual([['ws-hair', 0], ['ws-sob', 1]]);
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_transaction_updated', 'plaid_transaction', expect.any(Number), expect.stringContaining('First Choice Haircutters'),
        expect.objectContaining({ action: 'settled' })
      );
    });

    test('never settles from a balance that could not be refreshed in this sync', async () => {
      const { item, accountId } = await cardBank('No Pending Bank');
      await plaidFileImportService.importFile(accountId, {
        csv: wsFile('2026-11-04,Purchase,Pending,Haircut,-45.41,CAD,,', '2026-11-04,Purchase,Pending,Grocer,-12.41,CAD,,'),
        fromDate: '2026-11-01'
      });
      for (const name of ['Haircut', 'Grocer']) {
        await plaidInboxService.addAsExpense((await get('SELECT id FROM plaid_transactions WHERE name = ?', [name])).id, { type: 'Other' });
      }
      // Plaid takes both over; the bank balance doesn't include them yet
      const ws = (id, amount, name) => txn(id, { amount, date: '2026-11-04', authorized_date: null, name: `${name} - Purchase`, merchant_name: null });
      client.transactionsSync.mockResolvedValueOnce(cardPage({ added: [ws('ws-hair', 45.41, 'Haircut'), ws('ws-groc', 12.41, 'Grocer')] }));
      client.accountsGet.mockResolvedValueOnce({ data: { accounts: [account('acc-1', {
        type: 'credit', balances: { current: 0, available: null, limit: null, iso_currency_code: 'CAD' }
      })] } });
      await plaidService.syncItem(item.id);
      // A stored balance that would read as "the haircut posted" (with a fresh one, the haircut would settle)
      await run('UPDATE plaid_accounts SET current_balance = 45.41 WHERE id = ?', [accountId]);

      client.transactionsSync.mockResolvedValueOnce(cardPage());
      client.accountsGet.mockRejectedValueOnce(plaidError('INTERNAL_SERVER_ERROR'));
      await plaidService.syncItem(item.id);

      expect(await all('SELECT name, pending FROM plaid_transactions ORDER BY name')).toEqual([
        { name: 'Grocer - Purchase', pending: 1 }, { name: 'Haircut - Purchase', pending: 1 }
      ]);
    });

    test('Plaid first: a file shows a pending charge settled; Plaid\'s posted version later replaces it without a duplicate', async () => {
      const { item, accountId } = await cardBank('Pending Bank');
      client.transactionsSync.mockResolvedValueOnce(cardPage({ added: [
        txn('cibc-p', { amount: 28.24, date: '2026-11-03', authorized_date: '2026-11-03', name: 'SHOPPERS DRUG MART #13 STITTSVILLE, ON', merchant_name: 'Shoppers Drug Mart', pending: true })
      ] }));
      await plaidService.syncItem(item.id);
      const rowId = (await get("SELECT id FROM plaid_transactions WHERE transaction_id = 'cibc-p'")).id;
      const { expense } = await plaidInboxService.addAsExpense(rowId, { type: 'Groceries' });

      const imported = await plaidFileImportService.importFile(accountId, {
        csv: '2026-11-04,"SHOPPERS DRUG MART #13 STITTSVILLE, ON",28.24,,5223********1234', fromDate: '2026-11-01'
      });

      expect(imported).toMatchObject({ format: 'cibc_credit_card', added: 0, updated: 1, settled: 1 });
      expect(await get('SELECT transaction_id AS tid, pending, date, authorized_date AS auth FROM plaid_transactions WHERE id = ?', [rowId]))
        .toEqual({ tid: 'cibc-p', pending: 0, date: '2026-11-04', auth: '2026-11-03' });
      expect((await get('SELECT posted_date AS posted FROM expenses WHERE id = ?', [expense.id])).posted).toBe('2026-11-04');

      // Plaid catches up: posted version naming the pending one, and the pending id removed
      activityLogService.logEvent.mockClear();
      client.transactionsSync.mockResolvedValueOnce(cardPage({
        added: [txn('cibc-posted', { amount: 28.24, date: '2026-11-04', authorized_date: '2026-11-03', name: 'SHOPPERS DRUG MART #13 STITTSVILLE, ON', merchant_name: 'Shoppers Drug Mart', pending_transaction_id: 'cibc-p' })],
        removed: [{ transaction_id: 'cibc-p' }]
      }));
      await plaidService.syncItem(item.id);

      expect(await rows()).toEqual([expect.objectContaining({ tid: 'cibc-posted', status: 'added', pending: 0, expenseId: expense.id })]);
      // Already settled by the file: not settled a second time
      expect(activityLogService.logEvent).not.toHaveBeenCalledWith('plaid_transaction_updated', expect.anything(), expect.anything(), expect.anything(), expect.objectContaining({ action: 'settled' }));
    });

    test('Plaid first: a file never turns a settled charge back to pending, and a stale pending update from Plaid is ignored', async () => {
      const { item, accountId } = await cardBank('Pending Bank');
      client.transactionsSync.mockResolvedValueOnce(cardPage({ added: [txn('p1', { amount: 12, date: '2026-11-03', name: 'CAFE', pending: true })] }));
      await plaidService.syncItem(item.id);
      await plaidFileImportService.importFile(accountId, { csv: '2026-11-04,CAFE,12.00,,5223********1234', fromDate: '2026-11-01' });

      client.transactionsSync.mockResolvedValueOnce(cardPage({ modified: [txn('p1', { amount: 12, date: '2026-11-03', name: 'CAFE', pending: true })] }));
      await plaidService.syncItem(item.id);

      expect(await rows()).toEqual([expect.objectContaining({ tid: 'p1', pending: 0, date: '2026-11-04' })]);
    });

    test('ignore works whichever source a transaction came from, and holds when the other source sends it', async () => {
      const { item, accountId } = await cardBank('Card Bank');
      // Ignored as a file row, then Plaid sends it
      await plaidFileImportService.importFile(accountId, { csv: wsFile('2026-11-02,Refund,Completed,Book Store,15.50,CAD,,'), fromDate: '2026-11-01' });
      const fromFile = await get("SELECT id FROM plaid_transactions WHERE name = 'Book Store'");
      await plaidInboxService.ignore(fromFile.id);
      // Ignored as a Plaid row, then a file brings it
      client.transactionsSync.mockResolvedValueOnce(cardPage({ added: [
        txn('plaid-refund', { amount: -15.5, date: '2026-11-02', authorized_date: null, name: 'Book Store - Refund' }),
        txn('plaid-fee', { amount: 3.5, date: '2026-11-03', authorized_date: null, name: 'Annual fee' })
      ] }));
      await plaidService.syncItem(item.id);
      const fee = await get("SELECT id FROM plaid_transactions WHERE transaction_id = 'plaid-fee'");
      await plaidInboxService.ignore(fee.id);

      const imported = await plaidFileImportService.importFile(accountId, {
        csv: wsFile('2026-11-03,Fee,Completed,Annual fee,-3.50,CAD,,', '2026-11-02,Refund,Completed,Book Store,15.50,CAD,,'), fromDate: '2026-11-01'
      });

      expect(imported).toMatchObject({ added: 0 });
      expect((await rows()).map(r => [r.tid, r.status])).toEqual([['plaid-refund', 'ignored'], ['plaid-fee', 'ignored']]);
      expect((await plaidInboxService.listInbox('new')).transactions).toEqual([]);
      expect((await plaidInboxService.listInbox('ignored')).transactions.map(t => t.source)).toEqual(['plaid', 'plaid']);
      // Undo ignore still works on a row that came from a file
      await plaidInboxService.unignore(fromFile.id);
      expect((await plaidInboxService.listInbox('new')).transactions.map(t => t.transactionId)).toEqual(['plaid-refund']);
    });
  });
  describe('connecting a bank again after disconnecting', () => {
    const CREDIT_CARD = 4;
    const plaidInboxService = require('./plaidInboxService');

    test('re-sent history re-attaches to the kept rows instead of coming back as duplicates', async () => {
      const first = await connect('Card Bank');
      await plaidService.updateAccountMapping(first.accounts[0].id, CREDIT_CARD);
      client.transactionsSync.mockResolvedValueOnce(page({
        added: [
          txn('old-coffee', { amount: 5, date: '2026-10-10', name: 'COFFEE #1' }),
          txn('old-pending', { amount: 40, date: '2026-10-12', authorized_date: '2026-10-12', name: 'RESTAURANT', merchant_name: 'Restaurant', pending: true }),
          txn('old-unreviewed', { amount: 9, date: '2026-10-11', name: 'SHOP' })
        ]
      }));
      await plaidService.syncItem(first.id);
      const coffee = await get("SELECT id FROM plaid_transactions WHERE transaction_id = 'old-coffee'");
      const pendingRow = await get("SELECT id FROM plaid_transactions WHERE transaction_id = 'old-pending'");
      const { expense: coffeeExpense } = await plaidInboxService.addAsExpense(coffee.id, { type: 'Dining Out' });
      const { expense: dinner } = await plaidInboxService.addAsExpense(pendingRow.id, { type: 'Dining Out' });
      await plaidService.disconnectItem(first.id);

      // Kept while disconnected; the pending one says so in the expense list
      const links = await require('./expenseService').getExpenses({ year: 2026, month: 10 });
      expect(links.find(e => e.id === dinner.id).bankLink).toMatchObject({ pending: true, disconnected: true });

      const second = await connect('Card Bank');
      client.transactionsSync.mockResolvedValueOnce(page({
        added: [
          txn('new-coffee', { amount: 5, date: '2026-10-10', name: 'COFFEE #1' }),
          // The pending charge settled (with a tip) while the bank was disconnected: new id, no pending link
          txn('new-dinner', { amount: 46, date: '2026-10-14', authorized_date: '2026-10-12', name: 'RESTAURANT #9', merchant_name: 'Restaurant' }),
          txn('new-unreviewed', { amount: 9, date: '2026-10-11', name: 'SHOP' })
        ]
      }));
      const result = await plaidService.syncItem(second.id);

      expect(result).toMatchObject({ added: 1, reattached: 2 });
      expect(await all('SELECT id, transaction_id, status, expense_id, pending FROM plaid_transactions ORDER BY id')).toEqual([
        { id: coffee.id, transaction_id: 'new-coffee', status: 'added', expense_id: coffeeExpense.id, pending: 0 },
        { id: pendingRow.id, transaction_id: 'new-dinner', status: 'added', expense_id: dinner.id, pending: 0 },
        expect.objectContaining({ transaction_id: 'new-unreviewed', status: 'new' })
      ]);
      expect(await get('SELECT amount, posted_date FROM expenses WHERE id = ?', [dinner.id])).toEqual({ amount: 46, posted_date: '2026-10-14' });
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
    test('stores every account balance after a sync, even one with no transactions', async () => {
      const item = await connect();
      client.transactionsSync.mockResolvedValueOnce(page({ accounts: [] }));
      client.accountsGet.mockResolvedValueOnce({ data: { accounts: [account('acc-1', {
        type: 'credit', balances: { current: 1554.4, available: 9839.6, limit: 12000, iso_currency_code: 'CAD' }
      })] } });

      await plaidService.syncItem(item.id);

      expect(client.accountsGet).toHaveBeenLastCalledWith({ access_token: 'access-Test Bank' });
      expect(await get("SELECT current_balance, available_balance, credit_limit, balance_currency FROM plaid_accounts WHERE account_id = 'acc-1'"))
        .toEqual({ current_balance: 1554.4, available_balance: 9839.6, credit_limit: 12000, balance_currency: 'CAD' });
    });

    test('a failed balance refresh keeps the previous balances and does not fail the sync', async () => {
      const item = await connect();
      await run("UPDATE plaid_accounts SET current_balance = 10 WHERE account_id = 'acc-1'");
      client.transactionsSync.mockResolvedValueOnce(page({ added: [txn('t1')] }));
      client.accountsGet.mockRejectedValueOnce(plaidError('INTERNAL_SERVER_ERROR'));

      expect(await plaidService.syncItem(item.id)).toMatchObject({ added: 1 });
      expect((await get("SELECT current_balance FROM plaid_accounts WHERE account_id = 'acc-1'")).current_balance).toBe(10);
    });

    test('records when Plaid last fetched from the bank and its status for the institution', async () => {
      const item = await connect();
      client.transactionsSync.mockResolvedValueOnce(page());
      client.itemGet.mockResolvedValueOnce({ data: {
        item: { institution_id: 'ins_118273' },
        status: { transactions: { last_successful_update: '2026-11-03T21:11:14.558Z', last_failed_update: '2026-11-04T09:21:24.494Z' } }
      } });
      client.institutionsGetById.mockResolvedValueOnce({ data: { institution: { status: {
        transactions_updates: { status: 'DOWN', last_status_change: '2026-11-04T03:05:18Z' }
      } } } });

      await plaidService.syncItem(item.id);

      expect(client.institutionsGetById).toHaveBeenLastCalledWith({ institution_id: 'ins_118273', country_codes: ['CA'], options: { include_status: true } });
      expect(await plaidService.getItem(item.id)).toMatchObject({
        status: 'stale',
        bankUpdatedAt: '2026-11-03T21:11:14.558Z',
        bankUpdateFailedAt: '2026-11-04T09:21:24.494Z',
        institutionStatus: 'DOWN',
        institutionStatusSince: '2026-11-04T03:05:18Z'
      });
    });

    test('a failed status check keeps what was recorded and does not fail the sync', async () => {
      const item = await connect();
      await run("UPDATE plaid_items SET bank_updated_at = '2026-11-03T21:11:14Z', institution_status = 'DOWN' WHERE id = ?", [item.id]);
      client.transactionsSync.mockResolvedValueOnce(page({ added: [txn('t1')] }));
      client.itemGet.mockRejectedValueOnce(plaidError('INTERNAL_SERVER_ERROR'));

      expect(await plaidService.syncItem(item.id)).toMatchObject({ added: 1 });
      expect(await plaidService.getItem(item.id)).toMatchObject({ bankUpdatedAt: '2026-11-03T21:11:14Z', institutionStatus: 'DOWN' });
    });

    test('pages through has_more, stages pending transactions flagged, and saves the final cursor', async () => {
      const item = await connect();
      client.transactionsSync
        .mockResolvedValueOnce(page({ added: [txn('t1'), txn('p1', { pending: true })], next_cursor: 'c1', has_more: true }))
        .mockResolvedValueOnce(page({ added: [txn('t2')], next_cursor: 'c2', has_more: false }));

      const result = await plaidService.syncItem(item.id);

      expect(result).toMatchObject({ added: 3, updated: 0, removed: 0 });
      expect(client.transactionsSync.mock.calls.map(([req]) => req.cursor)).toEqual([undefined, 'c1']);
      expect(await all('SELECT transaction_id, pending FROM plaid_transactions ORDER BY transaction_id'))
        .toEqual([{ transaction_id: 'p1', pending: 1 }, { transaction_id: 't1', pending: 0 }, { transaction_id: 't2', pending: 0 }]);
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

    test("stores Plaid's category; a later sync without it keeps it; reviewed rows aren't touched", async () => {
      const item = await connect();
      const pfc = (primary, detailed, confidence = 'VERY_HIGH') => ({
        personal_finance_category: { primary, detailed, confidence_level: confidence }
      });
      const categories = () => all(`SELECT transaction_id AS tid, pfc_primary AS primary_, pfc_detailed AS detailed,
        pfc_confidence AS confidence FROM plaid_transactions ORDER BY transaction_id`);
      client.transactionsSync.mockResolvedValueOnce(page({ added: [
        txn('pay', pfc('LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')),
        txn('none'),
        txn('done', pfc('FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE', 'HIGH'))
      ] }));
      await plaidService.syncItem(item.id);

      expect(await categories()).toEqual([
        { tid: 'done', primary_: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE', confidence: 'HIGH' },
        { tid: 'none', primary_: null, detailed: null, confidence: null },
        { tid: 'pay', primary_: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', confidence: 'VERY_HIGH' }
      ]);

      await run("UPDATE plaid_transactions SET status = 'ignored' WHERE transaction_id = 'done'");
      client.transactionsSync.mockResolvedValueOnce(page({
        modified: [
          txn('pay', { amount: 20 }),
          txn('none', pfc('TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'LOW')),
          txn('done', pfc('GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_OTHER'))
        ],
        next_cursor: 'c2'
      }));
      await plaidService.syncItem(item.id);

      expect(await categories()).toEqual([
        { tid: 'done', primary_: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE', confidence: 'HIGH' },
        { tid: 'none', primary_: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER', confidence: 'LOW' },
        { tid: 'pay', primary_: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', confidence: 'VERY_HIGH' }
      ]);
    });

    test("a pending row settling in place takes the posted transaction's category", async () => {
      const item = await connect();
      client.transactionsSync.mockResolvedValueOnce(page({ added: [txn('p1', { pending: true })] }));
      await plaidService.syncItem(item.id);
      client.transactionsSync.mockResolvedValueOnce(page({
        added: [txn('s1', {
          pending_transaction_id: 'p1',
          personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', confidence_level: 'HIGH' }
        })],
        removed: [{ transaction_id: 'p1' }],
        next_cursor: 'c2'
      }));
      await plaidService.syncItem(item.id);

      expect(await all('SELECT transaction_id, pending, pfc_detailed FROM plaid_transactions'))
        .toEqual([{ transaction_id: 's1', pending: 0, pfc_detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' }]);
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

      await expect(plaidService.syncItem(item.id)).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('log in again') });

      expect((await get('SELECT COUNT(*) AS n FROM plaid_transactions')).n).toBe(0);
      expect(await get('SELECT sync_cursor, last_error FROM plaid_items WHERE id = ?', [item.id]))
        .toEqual({ sync_cursor: null, last_error: 'ITEM_LOGIN_REQUIRED' });
    });

    test('logs a sync failure when the bank goes into error, not on every retry', async () => {
      const item = await connect();
      activityLogService.logEvent.mockClear();
      client.transactionsSync.mockRejectedValue(plaidError('INSTITUTION_DOWN'));

      await expect(plaidService.syncItem(item.id)).rejects.toMatchObject({ statusCode: 502 });
      await expect(plaidService.syncItem(item.id)).rejects.toMatchObject({ statusCode: 502 });

      const failures = activityLogService.logEvent.mock.calls.filter(([type]) => type === 'plaid_sync_failed');
      expect(failures).toEqual([[
        'plaid_sync_failed', 'plaid_item', item.id, 'Bank sync failed for Test Bank: INSTITUTION_DOWN',
        { institutionName: 'Test Bank', errorCode: 'INSTITUTION_DOWN' }
      ]]);
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
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_sync_completed', 'plaid_transaction', null, 'Bank sync (manual): 1 new, 0 updated, 0 removed',
        { source: 'manual', added: 1, updated: 0, removed: 0 }
      );
    });
  });

  describe('automatic sync', () => {
    beforeEach(() => plaidService._lastAttemptAt.clear());

    const setSynced = (id, minutesAgo) => run(
      "UPDATE plaid_items SET last_synced_at = strftime('%Y-%m-%d %H:%M:%S', 'now', ?) WHERE id = ?",
      [`-${minutesAgo} minutes`, id]
    );

    test('finds banks not synced within the window, skipping those that need the user and other environments', async () => {
      await connect('Never');
      const old = await connect('Old');
      const fresh = await connect('Fresh');
      const expired = await connect('Expired');
      const other = await connect('Other');
      await setSynced(old.id, 45);
      await setSynced(fresh.id, 10);
      await run("UPDATE plaid_items SET last_error = 'ITEM_LOGIN_REQUIRED' WHERE id = ?", [expired.id]);
      await run("UPDATE plaid_items SET environment = 'production' WHERE id = ?", [other.id]);

      const stale = await plaidService.findStaleItems(30);

      expect(stale.map(item => item.institutionName).sort()).toEqual(['Never', 'Old']);
    });

    test('syncs due banks, records attempts so a failing bank is not retried at once, and logs only changes', async () => {
      await connect('Bank A');
      await connect('Bank B');
      client.transactionsSync
        .mockRejectedValueOnce(plaidError('INSTITUTION_DOWN'))
        .mockResolvedValueOnce(page({ added: [txn('t1'), txn('t2')] }));

      const result = await plaidService.syncItems(await plaidService.findStaleItems(30), 'scheduled');

      expect(result).toEqual({ synced: 1, totals: { added: 2, updated: 0, removed: 0 } });
      expect(await plaidService.findStaleItems(30)).toEqual([]);
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_sync_completed', 'plaid_transaction', null, 'Bank sync (scheduled): 2 new, 0 updated, 0 removed', expect.any(Object)
      );

      activityLogService.logEvent.mockClear();
      client.transactionsSync.mockResolvedValue(page());
      await plaidService.syncItems(await plaidService.findStaleItems(30, Date.now() + 31 * 60 * 1000), 'on_open');
      expect(activityLogService.logEvent).not.toHaveBeenCalled();
    });
  });

  describe('pending transactions', () => {
    const plaidInboxService = require('./plaidInboxService');
    const CREDIT_CARD = 4;
    const expenseOf = (id) => get('SELECT amount, date, posted_date FROM expenses WHERE id = ?', [id]);

    async function addPendingAsExpense({ amount = 40, date = '2026-10-10' } = {}) {
      const item = await connect();
      await plaidService.updateAccountMapping(item.accounts[0].id, CREDIT_CARD);
      client.transactionsSync.mockResolvedValueOnce(page({
        added: [txn('p1', { pending: true, amount, date, authorized_date: date })], next_cursor: 'c1'
      }));
      await plaidService.syncItem(item.id);
      const row = await get("SELECT id FROM plaid_transactions WHERE transaction_id = 'p1'");
      const { expense } = await plaidInboxService.addAsExpense(row.id, { type: 'Dining Out' });
      return { item, rowId: row.id, expenseId: expense.id };
    }

    test('a pending charge can be added; when it settles with a tip the expense follows the bank', async () => {
      const { item, rowId, expenseId } = await addPendingAsExpense({ amount: 40 });
      expect(await expenseOf(expenseId)).toEqual({ amount: 40, date: '2026-10-10', posted_date: null });
      expect((await plaidInboxService.listInbox('new')).transactions).toHaveLength(0);

      client.transactionsSync.mockResolvedValueOnce(page({
        added: [txn('s1', { amount: 48, date: '2026-10-12', authorized_date: '2026-10-10', pending_transaction_id: 'p1' })],
        removed: [{ transaction_id: 'p1' }], next_cursor: 'c2'
      }));
      await plaidService.syncItem(item.id);

      expect(await get('SELECT id, transaction_id, pending, status, expense_id, amount FROM plaid_transactions'))
        .toEqual({ id: rowId, transaction_id: 's1', pending: 0, status: 'added', expense_id: expenseId, amount: 48 });
      expect(await expenseOf(expenseId)).toEqual({ amount: 48, date: '2026-10-10', posted_date: '2026-10-12' });
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'plaid_transaction_updated', 'plaid_transaction', rowId,
        expect.stringMatching(/settled: \$40\.00 → \$48\.00, expense updated; posted date 2026-10-12$/),
        expect.objectContaining({ action: 'settled', amountUpdated: true })
      );
    });

    test('an amount edited by hand is kept when the charge settles at a different amount', async () => {
      const { item, expenseId } = await addPendingAsExpense({ amount: 40 });
      await run('UPDATE expenses SET amount = 45 WHERE id = ?', [expenseId]);

      client.transactionsSync.mockResolvedValueOnce(page({
        added: [txn('s1', { amount: 48, date: '2026-10-12', pending_transaction_id: 'p1' })], removed: [{ transaction_id: 'p1' }], next_cursor: 'c2'
      }));
      await plaidService.syncItem(item.id);

      expect((await expenseOf(expenseId)).amount).toBe(45);
    });

    test('a dropped pending charge is flagged for review, and can be linked to the settled transaction', async () => {
      const { item, rowId, expenseId } = await addPendingAsExpense({ amount: 40 });
      client.transactionsSync.mockResolvedValueOnce(page({
        added: [txn('s9', { amount: 46, date: '2026-10-13' })], removed: [{ transaction_id: 'p1' }], next_cursor: 'c2'
      }));
      await plaidService.syncItem(item.id);

      const { cancelled, transactions } = await plaidInboxService.listInbox('new');
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0]).toMatchObject({ id: rowId, expense: { id: expenseId, amount: 40 } });
      expect(cancelled[0].settledCandidates.map(c => c.amount)).toEqual([46]);
      expect((await require('./expenseService').getExpenses({ year: 2026, month: 10 })).find(e => e.id === expenseId).bankLink)
        .toMatchObject({ pending: true, removed: true });

      await plaidInboxService.resolveCancelled(rowId, { action: 'link', postedId: transactions[0].id });

      expect(await all('SELECT transaction_id, status, expense_id FROM plaid_transactions'))
        .toEqual([{ transaction_id: 's9', status: 'added', expense_id: expenseId }]);
      expect((await expenseOf(expenseId)).amount).toBe(46);
      expect((await plaidInboxService.listInbox('new')).cancelled).toEqual([]);
    });

    test('a cancelled hold: delete the expense, or keep it unlinked', async () => {
      const first = await addPendingAsExpense();
      client.transactionsSync.mockResolvedValueOnce(page({ removed: [{ transaction_id: 'p1' }], next_cursor: 'c2' }));
      await plaidService.syncItem(first.item.id);

      await plaidInboxService.resolveCancelled(first.rowId, { action: 'delete_expense' });

      expect(await get('SELECT COUNT(*) AS n FROM expenses WHERE id = ?', [first.expenseId])).toEqual({ n: 0 });
      expect(await get('SELECT COUNT(*) AS n FROM plaid_transactions')).toEqual({ n: 0 });
      await expect(plaidInboxService.resolveCancelled(first.rowId, { action: 'keep' })).rejects.toMatchObject({ statusCode: 404 });
    });

    test('unreviewed pending rows follow the bank: removed when dropped, replaced in place when settled', async () => {
      const item = await connect();
      client.transactionsSync.mockResolvedValueOnce(page({
        added: [txn('p1', { pending: true, amount: 10 }), txn('p2', { pending: true, amount: 20 })], next_cursor: 'c1'
      }));
      await plaidService.syncItem(item.id);
      const p1 = await get("SELECT id FROM plaid_transactions WHERE transaction_id = 'p1'");

      client.transactionsSync.mockResolvedValueOnce(page({
        added: [txn('s1', { amount: 11, pending_transaction_id: 'p1' })],
        removed: [{ transaction_id: 'p1' }, { transaction_id: 'p2' }], next_cursor: 'c2'
      }));
      await plaidService.syncItem(item.id);

      expect(await all('SELECT id, transaction_id, pending, status, amount FROM plaid_transactions'))
        .toEqual([{ id: p1.id, transaction_id: 's1', pending: 0, status: 'new', amount: 11 }]);
    });
  });

  describe('updateAccountMapping', () => {
    test('maps to an active payment method and back to none', async () => {
      const item = await connect();
      const accountId = item.accounts[0].id;

      expect(await plaidService.updateAccountMapping(accountId, 2)).toMatchObject({ paymentMethodId: 2 });
      expect(await plaidService.updateAccountMapping(accountId, null)).toMatchObject({ paymentMethodId: null });
    });

    test('logs mapping changes, and nothing when the mapping is unchanged', async () => {
      const item = await connect();
      const accountId = item.accounts[0].id;
      activityLogService.logEvent.mockClear();

      await plaidService.updateAccountMapping(accountId, 2);
      await plaidService.updateAccountMapping(accountId, 2);
      await plaidService.updateAccountMapping(accountId, null);

      const events = activityLogService.logEvent.mock.calls.filter(([type]) => type === 'plaid_account_updated');
      expect(events.map(([, entity, id, text, metadata]) => [entity, id, text, metadata.paymentMethodId])).toEqual([
        ['plaid_account', accountId, expect.stringMatching(/^Bank account "Account acc-1 ••1234" now imports into /), 2],
        ['plaid_account', accountId, 'Bank account "Account acc-1 ••1234" set to Don\'t import', null]
      ]);
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

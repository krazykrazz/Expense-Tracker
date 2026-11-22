/**
 * Integration tests: what the Plaid sync, refresh and disconnect report to the notification service (real SQLite,
 * mocked Plaid client, mocked notification service). The service's own rules are in notificationService tests.
 */
const crypto = require('crypto');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { sqlHelpers, account, txn, page, plaidError } = require('../test/plaidFixtures');

jest.mock('../database/db');
jest.mock('./activityLogService');
jest.mock('./notificationService', () => ({
  reportBankStatus: jest.fn(),
  reportSyncChanges: jest.fn(),
  forgetBank: jest.fn(),
  resetState: jest.fn()
}));
jest.mock('../config/plaid', () => ({
  ...jest.requireActual('../config/plaid'),
  getPlaidClient: jest.fn()
}));

const { getDatabase } = require('../database/db');
const notificationService = require('./notificationService');
const plaidConfig = require('../config/plaid');
const plaidService = require('./plaidService');

const ENV_KEYS = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV', 'PLAID_TOKEN_KEY'];
const savedEnv = {};
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

let db;
let client;
const { run } = sqlHelpers(() => db);

const itemGetReturning = (lastSuccessfulUpdate) => jest.fn().mockResolvedValue({
  data: { item: { institution_id: 'ins_test' }, status: { transactions: { last_successful_update: lastSuccessfulUpdate, last_failed_update: null } } }
});

async function connect(name = 'CIBC') {
  client.itemPublicTokenExchange.mockResolvedValueOnce({ data: { access_token: `access-${name}`, item_id: `item-${name}` } });
  client.accountsGet.mockResolvedValueOnce({ data: { accounts: [account('acc-1')] } });
  const item = await plaidService.connectItem({ publicToken: 'public-token', institutionName: name });
  jest.clearAllMocks();
  return item;
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
    itemPublicTokenExchange: jest.fn(),
    accountsGet: jest.fn().mockResolvedValue({ data: { accounts: [account('acc-1')] } }),
    transactionsRefresh: jest.fn(),
    transactionsSync: jest.fn(),
    transactionsGet: jest.fn().mockResolvedValue({ data: { transactions: [], total_transactions: 0 } }),
    itemRemove: jest.fn().mockResolvedValue({ data: {} }),
    itemGet: itemGetReturning(new Date().toISOString()),
    institutionsGetById: jest.fn().mockResolvedValue({
      data: { institution: { status: { transactions_updates: { status: 'HEALTHY', last_status_change: '2026-11-01T00:00:00Z' } } } }
    })
  };
  plaidConfig.getPlaidClient.mockReturnValue(client);
  await run('DELETE FROM plaid_transactions');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM plaid_items');
});

describe('bank status reports', () => {
  test('a good sync reports the bank as ok with fresh details', async () => {
    const item = await connect();
    client.transactionsSync.mockResolvedValueOnce(page());

    await plaidService.syncItem(item.id);

    expect(notificationService.reportBankStatus).toHaveBeenCalledTimes(1);
    expect(notificationService.reportBankStatus).toHaveBeenCalledWith(expect.objectContaining({
      id: item.id, institutionName: 'CIBC', status: 'ok', errorCode: null,
      lastSyncedAt: expect.any(String), bankUpdatedAt: expect.any(String), institutionStatus: 'HEALTHY'
    }));
  });

  test.each([
    ['ITEM_LOGIN_REQUIRED', 'needs_login'],
    ['ITEM_NOT_FOUND', 'gone'],
    ['INSTITUTION_DOWN', 'error']
  ])('a sync that fails with %s reports %s and the code', async (code, status) => {
    const item = await connect();
    client.transactionsSync.mockRejectedValueOnce(plaidError(code));

    await expect(plaidService.syncItem(item.id)).rejects.toBeDefined();

    expect(notificationService.reportBankStatus).toHaveBeenCalledWith(expect.objectContaining({
      id: item.id, institutionName: 'CIBC', status, errorCode: code
    }));
  });

  test('a failure that is not a Plaid error (network, our own bug) reports nothing', async () => {
    const item = await connect();
    client.transactionsSync.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(plaidService.syncItem(item.id)).rejects.toThrow('ECONNRESET');

    expect(notificationService.reportBankStatus).not.toHaveBeenCalled();
  });

  test('the next good sync reports ok with the error cleared (the stored row is re-read, not the one loaded before the sync)', async () => {
    const item = await connect();
    client.transactionsSync.mockRejectedValueOnce(plaidError('ITEM_LOGIN_REQUIRED'));
    await expect(plaidService.syncItem(item.id)).rejects.toBeDefined();
    client.transactionsSync.mockResolvedValueOnce(page());

    await plaidService.syncItem(item.id);

    expect(notificationService.reportBankStatus.mock.calls.map(([bank]) => [bank.status, bank.errorCode]))
      .toEqual([['needs_login', 'ITEM_LOGIN_REQUIRED'], ['ok', null]]);
  });

  test('a bank Plaid stopped fetching from is reported as stale with the time of its last fetch', async () => {
    const item = await connect();
    const lastFetch = hoursAgo(30);
    client.itemGet = itemGetReturning(lastFetch);
    client.transactionsSync.mockResolvedValueOnce(page());

    await plaidService.syncItem(item.id);

    expect(notificationService.reportBankStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'stale', bankUpdatedAt: lastFetch }));
  });

  test('"Log in again" that finds the bank needs a login reports it (automatic sync skips such banks)', async () => {
    const item = await connect();
    client.transactionsRefresh.mockRejectedValueOnce(plaidError('ITEM_LOGIN_REQUIRED'));

    const result = await plaidService.requestRefresh(item.id);

    expect(result.status).toBe('needs_login');
    expect(notificationService.reportBankStatus).toHaveBeenCalledWith(expect.objectContaining({
      id: item.id, status: 'needs_login', errorCode: 'ITEM_LOGIN_REQUIRED'
    }));
  });

  test('disconnecting a bank makes the notification service forget it', async () => {
    const item = await connect();

    await plaidService.disconnectItem(item.id);

    expect(notificationService.forgetBank).toHaveBeenCalledWith(item.id);
  });
});

describe('sync change reports', () => {
  test('new transactions are reported with the counts', async () => {
    const item = await connect();
    client.transactionsSync.mockResolvedValueOnce(page({ added: [txn('t1'), txn('t2')] }));

    await plaidService.syncItem(item.id);

    expect(notificationService.reportSyncChanges).toHaveBeenCalledWith(
      { id: item.id, institutionName: 'CIBC' },
      { added: 2, updated: 0, removed: 0, balances: [] }
    );
  });

  test('a sync that brought nothing reports no changes', async () => {
    const item = await connect();
    client.transactionsSync.mockResolvedValueOnce(page());

    await plaidService.syncItem(item.id);

    expect(notificationService.reportSyncChanges).not.toHaveBeenCalled();
  });
});

describe('a notification problem never affects the sync', () => {
  test('rejections and synchronous throws from the notification service are swallowed', async () => {
    const item = await connect();
    notificationService.reportBankStatus.mockRejectedValue(new Error('rejected'));
    notificationService.reportSyncChanges.mockImplementation(() => { throw new Error('thrown'); });
    client.transactionsSync.mockResolvedValueOnce(page({ added: [txn('t1')] }));

    await expect(plaidService.syncItem(item.id)).resolves.toMatchObject({ id: item.id, added: 1 });
  });

  test('a failing bank is still reported to the caller as the same error', async () => {
    const item = await connect();
    notificationService.reportBankStatus.mockImplementation(() => { throw new Error('thrown'); });
    client.transactionsSync.mockRejectedValueOnce(plaidError('ITEM_LOGIN_REQUIRED'));

    await expect(plaidService.syncItem(item.id)).rejects.toMatchObject({ statusCode: 502, plaidErrorCode: 'ITEM_LOGIN_REQUIRED' });
  });
});

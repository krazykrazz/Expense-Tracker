/**
 * Route + controller wiring for the Plaid endpoints, including the disabled (503) gate.
 */

const request = require('supertest');
const express = require('express');

jest.mock('../services/plaidService');
jest.mock('../services/plaidInboxService');
jest.mock('../services/plaidSettingsService');
jest.mock('../services/plaidSyncSchedulerService');
jest.mock('../services/plaidCardBalanceService');
jest.mock('../services/plaidFileImportService');
jest.mock('../config/plaid', () => ({ isEnabled: jest.fn() }));

const plaidService = require('../services/plaidService');
const plaidInboxService = require('../services/plaidInboxService');
const plaidCardBalanceService = require('../services/plaidCardBalanceService');
const plaidFileImportService = require('../services/plaidFileImportService');
const plaidSettingsService = require('../services/plaidSettingsService');
const plaidSyncSchedulerService = require('../services/plaidSyncSchedulerService');
const { isEnabled } = require('../config/plaid');
const plaidRoutes = require('./plaidRoutes');
const { errorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/plaid', plaidRoutes);
app.use(errorHandler);

describe('plaid routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isEnabled.mockReturnValue(true);
  });

  test('GET /status answers even when disabled', async () => {
    isEnabled.mockReturnValue(false);
    plaidService.getStatus.mockResolvedValue({ enabled: false });

    const res = await request(app).get('/api/plaid/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false });
  });

  test.each([
    ['post', '/api/plaid/link-token'],
    ['get', '/api/plaid/items'],
    ['post', '/api/plaid/sync'],
    ['get', '/api/plaid/inbox'],
    ['post', '/api/plaid/inbox/1/ignore'],
  ])('%s %s returns 503 when disabled', async (method, url) => {
    isEnabled.mockReturnValue(false);

    const res = await request(app)[method](url);

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/Settings → Bank Import/);
  });

  describe('settings (available while disabled)', () => {
    beforeEach(() => isEnabled.mockReturnValue(false));

    test('GET /settings', async () => {
      plaidSettingsService.getSettings.mockResolvedValue({ source: 'none', editable: true });

      const res = await request(app).get('/api/plaid/settings');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ source: 'none', editable: true });
    });

    test('PUT /settings passes the body and tab id', async () => {
      plaidSettingsService.saveSettings.mockResolvedValue({ enabled: true });
      const body = { clientId: 'abc', secret: 'def', environment: 'sandbox' };

      const res = await request(app).put('/api/plaid/settings').set('X-Tab-ID', 'tab-1').send(body);

      expect(res.status).toBe(200);
      expect(plaidSettingsService.saveSettings).toHaveBeenCalledWith(body, 'tab-1');
    });

    test('POST /settings/test', async () => {
      plaidSettingsService.testSettings.mockResolvedValue({ ok: false, message: 'Plaid rejected these keys' });

      const res = await request(app).post('/api/plaid/settings/test').send({ environment: 'production' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(plaidSettingsService.testSettings).toHaveBeenCalledWith({ environment: 'production' });
    });

    test('DELETE /settings honours the service statusCode', async () => {
      plaidSettingsService.clearSettings.mockRejectedValue(Object.assign(new Error('Disconnect your banks first'), { statusCode: 409 }));

      const res = await request(app).delete('/api/plaid/settings');

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Disconnect your banks first');
    });
  });

  test('POST /items connects a bank and returns 201', async () => {
    plaidService.connectItem.mockResolvedValue({ id: 1, institutionName: 'Bank', accounts: [] });

    const res = await request(app).post('/api/plaid/items').send({ publicToken: 'public-x', institutionName: 'Bank' });

    expect(res.status).toBe(201);
    expect(plaidService.connectItem).toHaveBeenCalledWith({ publicToken: 'public-x', institutionName: 'Bank' });
  });

  test('PUT /accounts/:id passes the payment method (null clears it)', async () => {
    plaidService.updateAccountMapping.mockResolvedValue({ id: 5, paymentMethodId: null });

    const res = await request(app).put('/api/plaid/accounts/5').send({ paymentMethodId: null });

    expect(res.status).toBe(200);
    expect(plaidService.updateAccountMapping).toHaveBeenCalledWith(5, null);
  });

  test('GET /inbox defaults to new and forwards the status filter', async () => {
    plaidInboxService.listInbox.mockResolvedValue({ transactions: [], hiddenUnmapped: 0 });

    await request(app).get('/api/plaid/inbox');
    await request(app).get('/api/plaid/inbox?status=ignored');

    expect(plaidInboxService.listInbox.mock.calls).toEqual([['new'], ['ignored']]);
  });

  test('POST /inbox/:id/add passes the edits and the tab id', async () => {
    plaidInboxService.addAsExpense.mockResolvedValue({ transaction: {}, expense: { id: 9 } });

    const res = await request(app).post('/api/plaid/inbox/3/add').set('X-Tab-ID', 'tab-7').send({ type: 'Groceries' });

    expect(res.status).toBe(201);
    expect(plaidInboxService.addAsExpense).toHaveBeenCalledWith(3, { type: 'Groceries' }, 'tab-7');
  });

  test('POST /inbox/:id/match honours the service statusCode', async () => {
    plaidInboxService.matchToExpense.mockRejectedValue(Object.assign(new Error('already linked'), { statusCode: 409 }));

    const res = await request(app).post('/api/plaid/inbox/3/match').send({ expenseId: 4 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already linked');
    expect(plaidInboxService.matchToExpense).toHaveBeenCalledWith(3, 4);
  });

  test('POST /inbox/:id/match-fixed passes the fixed expense and tab id', async () => {
    plaidInboxService.matchToFixedExpense.mockResolvedValue({ transaction: {}, fixedExpense: { id: 8 } });

    const res = await request(app).post('/api/plaid/inbox/3/match-fixed').set('X-Tab-ID', 'tab-2').send({ fixedExpenseId: 8 });

    expect(res.status).toBe(200);
    expect(plaidInboxService.matchToFixedExpense).toHaveBeenCalledWith(3, 8, 'tab-2');
  });

  test('POST /inbox/:id/match-income passes the income source, updateAmount and tab id', async () => {
    plaidInboxService.matchToIncome.mockResolvedValue({ transaction: {}, incomeSource: { id: 9 } });

    const kept = await request(app).post('/api/plaid/inbox/3/match-income').set('X-Tab-ID', 'tab-2').send({ incomeSourceId: 9 });
    const declined = await request(app).post('/api/plaid/inbox/3/match-income').send({ incomeSourceId: 9, updateAmount: false });

    expect(kept.status).toBe(200);
    expect(declined.status).toBe(200);
    expect(plaidInboxService.matchToIncome).toHaveBeenNthCalledWith(1, 3, 9, { updateAmount: true }, 'tab-2');
    expect(plaidInboxService.matchToIncome).toHaveBeenNthCalledWith(2, 3, 9, { updateAmount: false }, null);
  });

  test('POST /sync?ifStaleMinutes starts only stale banks in the background and answers at once', async () => {
    plaidService.findStaleItems.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    plaidService.syncItems.mockReturnValue(new Promise(() => {}));

    const res = await request(app).post('/api/plaid/sync?ifStaleMinutes=30');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ started: true, banks: 2 });
    expect(plaidService.findStaleItems).toHaveBeenCalledWith(30);
    expect(plaidService.syncItems).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }], 'on_open');
    expect(plaidService.syncAll).not.toHaveBeenCalled();
  });

  test('POST /sync?ifStaleMinutes does nothing when every bank is fresh, and validates the window', async () => {
    plaidService.findStaleItems.mockResolvedValue([]);

    const fresh = await request(app).post('/api/plaid/sync?ifStaleMinutes=30');
    const invalid = await request(app).post('/api/plaid/sync?ifStaleMinutes=1');

    expect(fresh.body).toEqual({ started: false, banks: 0 });
    expect(plaidService.syncItems).not.toHaveBeenCalled();
    expect(invalid.status).toBe(400);
  });

  test('GET and PUT /sync-settings', async () => {
    plaidSyncSchedulerService.getSettings.mockResolvedValue({ enabled: true, intervalMinutes: 30, startHour: 6, endHour: 23 });
    plaidSyncSchedulerService.saveSettings.mockResolvedValue({ enabled: false, intervalMinutes: 30, startHour: 6, endHour: 23 });

    const got = await request(app).get('/api/plaid/sync-settings');
    const saved = await request(app).put('/api/plaid/sync-settings').set('X-Tab-ID', 'tab-3').send({ enabled: false });

    expect(got.body.intervalMinutes).toBe(30);
    expect(saved.body.enabled).toBe(false);
    expect(plaidSyncSchedulerService.saveSettings).toHaveBeenCalledWith({ enabled: false }, 'tab-3');
  });

  test('POST /link-token passes an itemId for update mode, none for a new bank', async () => {
    plaidService.createLinkToken.mockResolvedValue({ linkToken: 'link-x' });

    await request(app).post('/api/plaid/link-token').send({});
    await request(app).post('/api/plaid/link-token').send({ itemId: 2 });

    expect(plaidService.createLinkToken).toHaveBeenNthCalledWith(1, { itemId: undefined });
    expect(plaidService.createLinkToken).toHaveBeenNthCalledWith(2, { itemId: 2 });
  });

  test('POST /items/:id/reconnected', async () => {
    plaidService.markReconnected.mockResolvedValue({ item: { id: 2, status: 'ok' }, sync: { added: 0 } });

    const res = await request(app).post('/api/plaid/items/2/reconnected');

    expect(res.status).toBe(200);
    expect(plaidService.markReconnected).toHaveBeenCalledWith(2);
  });

  test('POST /items/:id/refresh', async () => {
    plaidService.requestRefresh.mockResolvedValue({ status: 'needs_login', item: { id: 2, status: 'needs_login' } });

    const res = await request(app).post('/api/plaid/items/2/refresh');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('needs_login');
    expect(plaidService.requestRefresh).toHaveBeenCalledWith(2);
  });

  test('GET /card-balances and POST /card-balances/:id/use-bank-limit', async () => {
    plaidCardBalanceService.getCardBalances.mockResolvedValue({ cards: [{ paymentMethodId: 4, status: 'match' }] });
    plaidCardBalanceService.applyBankCreditLimit.mockResolvedValue({ id: 4, credit_limit: 12000 });

    const list = await request(app).get('/api/plaid/card-balances');
    const limit = await request(app).post('/api/plaid/card-balances/4/use-bank-limit');

    expect(list.body).toEqual({ cards: [{ paymentMethodId: 4, status: 'match' }] });
    expect(limit.body).toEqual({ id: 4, credit_limit: 12000 });
    expect(plaidCardBalanceService.applyBankCreditLimit).toHaveBeenCalledWith(4);
  });

  test('POST /accounts/:id/import-file passes the CSV, from date and dry-run flag', async () => {
    plaidFileImportService.importFile.mockResolvedValue({ added: 4, dryRun: true });

    const res = await request(app).post('/api/plaid/accounts/7/import-file').send({ csv: 'a,b', fromDate: '2026-10-03', dryRun: true });

    expect(res.body).toEqual({ added: 4, dryRun: true });
    expect(plaidFileImportService.importFile).toHaveBeenCalledWith(7, { csv: 'a,b', fromDate: '2026-10-03', dryRun: true });
  });

  test('card balances are behind the 503 gate', async () => {
    isEnabled.mockReturnValue(false);
    expect((await request(app).get('/api/plaid/card-balances')).status).toBe(503);
    expect(plaidCardBalanceService.getCardBalances).not.toHaveBeenCalled();
  });

  test('POST /inbox/:id/add-income returns 201', async () => {
    plaidInboxService.addAsIncome.mockResolvedValue({ transaction: {}, incomeSource: { id: 10 } });

    const res = await request(app).post('/api/plaid/inbox/3/add-income').send({ name: 'Gift', category: 'Gifts' });

    expect(res.status).toBe(201);
    expect(plaidInboxService.addAsIncome).toHaveBeenCalledWith(3, { name: 'Gift', category: 'Gifts' }, null);
  });

  test('POST /inbox/:id/cancelled passes the action, settled row and tab id', async () => {
    plaidInboxService.resolveCancelled.mockResolvedValue({ action: 'link' });

    const res = await request(app).post('/api/plaid/inbox/3/cancelled').set('X-Tab-ID', 'tab-4').send({ action: 'link', postedId: 9 });

    expect(res.status).toBe(200);
    expect(plaidInboxService.resolveCancelled).toHaveBeenCalledWith(3, { action: 'link', postedId: 9 }, 'tab-4');
  });

  test('DELETE /items/:id returns 204', async () => {
    plaidService.disconnectItem.mockResolvedValue();

    const res = await request(app).delete('/api/plaid/items/2');

    expect(res.status).toBe(204);
    expect(plaidService.disconnectItem).toHaveBeenCalledWith(2);
  });
});

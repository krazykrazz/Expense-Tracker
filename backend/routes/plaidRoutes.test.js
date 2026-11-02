/**
 * Route + controller wiring for the Plaid endpoints, including the disabled (503) gate.
 */

const request = require('supertest');
const express = require('express');

jest.mock('../services/plaidService');
jest.mock('../services/plaidInboxService');
jest.mock('../services/plaidSettingsService');
jest.mock('../config/plaid', () => ({ isEnabled: jest.fn() }));

const plaidService = require('../services/plaidService');
const plaidInboxService = require('../services/plaidInboxService');
const plaidSettingsService = require('../services/plaidSettingsService');
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

  test('POST /inbox/:id/add-income returns 201', async () => {
    plaidInboxService.addAsIncome.mockResolvedValue({ transaction: {}, incomeSource: { id: 10 } });

    const res = await request(app).post('/api/plaid/inbox/3/add-income').send({ name: 'Gift', category: 'Gifts' });

    expect(res.status).toBe(201);
    expect(plaidInboxService.addAsIncome).toHaveBeenCalledWith(3, { name: 'Gift', category: 'Gifts' }, null);
  });

  test('DELETE /items/:id returns 204', async () => {
    plaidService.disconnectItem.mockResolvedValue();

    const res = await request(app).delete('/api/plaid/items/2');

    expect(res.status).toBe(204);
    expect(plaidService.disconnectItem).toHaveBeenCalledWith(2);
  });
});

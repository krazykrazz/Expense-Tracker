/**
 * Integration tests: activity log events carry the originating tab's X-Tab-ID to the SSE
 * broadcast even when the service never passes tabId in metadata, so the sending tab can
 * ignore its own change. Real SQLite, real Express request, stubbed SSE service.
 */

const express = require('express');
const request = require('supertest');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

jest.mock('../database/db');

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const { requestContextMiddleware, runWithTabId } = require('../utils/requestContext');

let db;
const broadcast = jest.fn().mockResolvedValue(undefined);

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
  activityLogService.setSseService({ broadcast });
});

afterAll(() => {
  activityLogService.setSseService(null);
  cleanupIsolatedTestDb(db);
});

beforeEach(() => broadcast.mockClear());

describe('activityLogService tab id for SSE broadcast', () => {
  test('uses the X-Tab-ID of the HTTP request that triggered the event', async () => {
    const app = express();
    app.use(requestContextMiddleware);
    app.post('/loan-payment', async (req, res) => {
      // Mimics a service that logs without threading tabId through
      await new Promise(resolve => setTimeout(resolve, 5));
      await activityLogService.logEvent('loan_payment_added', 'loan_payment', 1, 'Added payment', { amount: 10 });
      res.sendStatus(204);
    });

    await request(app).post('/loan-payment').set('X-Tab-ID', 'tab-A').expect(204);

    expect(broadcast).toHaveBeenCalledWith('loan_payment', 'tab-A');
  });

  test('an explicit metadata.tabId wins over the request context', async () => {
    await runWithTabId('from-request', () =>
      activityLogService.logEvent('person_added', 'person', 1, 'Added person', { tabId: 'from-metadata' }));

    expect(broadcast).toHaveBeenCalledWith('person', 'from-metadata');
  });

  test('events outside a request (scheduler, startup) broadcast to every tab', async () => {
    await activityLogService.logEvent('billing_cycle_auto_generated', 'billing_cycle', 1, 'Auto-generated cycle', {});

    expect(broadcast).toHaveBeenCalledWith('billing_cycle', null);
  });

  test('the stored metadata is not modified by the fallback', async () => {
    await runWithTabId('tab-B', () =>
      activityLogService.logEvent('income_source_added', 'income_source', 7, 'Added income', { amount: 5 }));

    const row = await new Promise((resolve, reject) => {
      db.get("SELECT metadata FROM activity_logs WHERE event_type = 'income_source_added' ORDER BY id DESC LIMIT 1", (err, r) => (err ? reject(err) : resolve(r)));
    });
    expect(JSON.parse(row.metadata)).toEqual({ amount: 5 });
  });
});

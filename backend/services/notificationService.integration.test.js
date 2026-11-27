/**
 * Integration tests: notificationService state handling -> settings table (real SQLite).
 * The provider (Notifiarr) is mocked; no network.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { sqlHelpers } = require('../test/plaidFixtures');

const mockSecretsDir = { current: null };
jest.mock('../config/paths', () => ({
  ...jest.requireActual('../config/paths'),
  getSecretsPath: () => mockSecretsDir.current
}));
jest.mock('../database/db');
jest.mock('./activityLogService');
jest.mock('./notifiarrProvider', () => ({
  ...jest.requireActual('./notifiarrProvider'),
  send: jest.fn()
}));

const { getDatabase } = require('../database/db');
const notifiarrProvider = require('./notifiarrProvider');
const settingsService = require('./notificationSettingsService');
const { NotificationService } = require('./notificationService');

const API_KEY = '00000000-1111-2222-3333-444444444444';
const CHANNEL = '1234567890123456789';
const cibc = (status, extra = {}) => ({ id: 3, institutionName: 'CIBC', status, ...extra });

let db;
let tmpRoot;
let service;
const { run, get } = sqlHelpers(() => db);
// Each message as "<header> · <subject>" (the subject is the bank, empty for backups)
const sent = () => notifiarrProvider.send.mock.calls.map(([, message]) => (message.title ? `${message.name} · ${message.title}` : message.name));
const LOGIN = 'Expense Tracker: Bank Needs Login · CIBC';
const RECOVERED = 'Expense Tracker: Bank Recovered · CIBC';
const NOT_UPDATING = 'Expense Tracker: Bank Not Updating · CIBC';
const storedState = async () => JSON.parse((await get("SELECT value FROM settings WHERE key = 'notifications_state'"))?.value || '{}');

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});
afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notification-service-'));
  mockSecretsDir.current = path.join(tmpRoot, 'secrets');
  notifiarrProvider.send.mockReset();
  notifiarrProvider.send.mockResolvedValue({ ok: true });
  await run("DELETE FROM settings WHERE key LIKE 'notifications_%'");
  await settingsService.saveSettings({ apiKey: API_KEY, channelId: CHANNEL, enabled: true });
  service = new NotificationService();
});
afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe('bank status changes', () => {
  test('a healthy bank that was never a problem sends nothing', async () => {
    expect(await service.reportBankStatus(cibc('ok'))).toEqual({ sent: false, reason: 'no_problem' });
    expect(notifiarrProvider.send).not.toHaveBeenCalled();
  });

  test('a bank that stays broken is announced once, however often it is synced', async () => {
    expect(await service.reportBankStatus(cibc('needs_login', { errorCode: 'ITEM_LOGIN_REQUIRED' }))).toEqual({ sent: true });
    expect(await service.reportBankStatus(cibc('needs_login'))).toEqual({ sent: false, reason: 'unchanged' });
    await service.reportBankStatus(cibc('needs_login'));

    expect(sent()).toEqual([LOGIN]);
  });

  test('recovery and the next problem are each a new message', async () => {
    await service.reportBankStatus(cibc('needs_login'));
    await service.reportBankStatus(cibc('ok'));
    await service.reportBankStatus(cibc('stale', { bankUpdatedAt: '2026-11-21T11:16:07Z' }), Date.parse('2026-11-22T16:00:00Z'));

    expect(sent()).toEqual([LOGIN, RECOVERED, NOT_UPDATING]);
  });

  test('a bank that moves from one problem to another gets a new message and keeps the original start time', async () => {
    await service.reportBankStatus(cibc('stale'));
    const { since } = (await storedState())['plaid:3'];
    await service.reportBankStatus(cibc('needs_login'));

    expect(sent()[1]).toEqual(LOGIN);
    expect((await storedState())['plaid:3']).toEqual({ state: 'needs_login', since });
  });

  test('state survives a restart: a fresh service does not announce the same broken bank again', async () => {
    await service.reportBankStatus(cibc('needs_login'));

    const restarted = new NotificationService();
    expect(await restarted.reportBankStatus(cibc('needs_login'))).toEqual({ sent: false, reason: 'unchanged' });
    await restarted.reportBankStatus(cibc('ok'));

    expect(sent()).toEqual([LOGIN, RECOVERED]);
  });

  test('banks are tracked separately', async () => {
    await service.reportBankStatus(cibc('needs_login'));
    await service.reportBankStatus({ id: 1, institutionName: 'Wealthsimple (Canada)', status: 'needs_login' });

    expect(sent()).toEqual([LOGIN, 'Expense Tracker: Bank Needs Login · Wealthsimple (Canada)']);
  });

  test('a recovery that could not be delivered is retried on the next report', async () => {
    await service.reportBankStatus(cibc('needs_login'));
    notifiarrProvider.send.mockResolvedValueOnce({ ok: false, reason: 'down' });

    expect(await service.reportBankStatus(cibc('ok'))).toEqual({ sent: false, reason: 'down' });
    expect((await storedState())['plaid:3'].state).toBe('needs_login');

    expect(await service.reportBankStatus(cibc('ok'))).toEqual({ sent: true });
    expect((await storedState())['plaid:3']).toEqual({ state: 'ok' });
  });

  describe('sync errors are held for an hour', () => {
    const T0 = Date.parse('2026-11-22T12:00:00Z');
    const at = (minutes) => T0 + minutes * 60000;
    const error = () => cibc('error', { errorCode: 'INSTITUTION_DOWN' });

    test('an error that clears within the hour sends nothing', async () => {
      expect(await service.reportBankStatus(error(), at(0))).toEqual({ sent: false, reason: 'holding' });
      expect(await service.reportBankStatus(error(), at(30))).toEqual({ sent: false, reason: 'holding' });
      await service.reportBankStatus(cibc('ok'), at(45));
      // A new error starts a new hour
      expect(await service.reportBankStatus(error(), at(70))).toEqual({ sent: false, reason: 'holding' });

      expect(notifiarrProvider.send).not.toHaveBeenCalled();
    });

    test('an error still there after an hour is announced once, counted from when it began', async () => {
      await service.reportBankStatus(error(), at(0));
      expect(await service.reportBankStatus(error(), at(60))).toEqual({ sent: true });
      expect(await service.reportBankStatus(error(), at(90))).toEqual({ sent: false, reason: 'unchanged' });

      expect(sent()).toEqual(['Expense Tracker: Bank Sync Problem · CIBC']);
      expect((await storedState())['plaid:3']).toEqual({ state: 'error', since: new Date(at(0)).toISOString() });
    });

    test('the hold survives a restart', async () => {
      await service.reportBankStatus(error(), at(0));
      expect(await new NotificationService().reportBankStatus(error(), at(61))).toEqual({ sent: true });
    });

    test('login problems are not held', async () => {
      expect(await service.reportBankStatus(cibc('needs_login'), at(0))).toEqual({ sent: true });
    });
  });

  test('"not updating" is only announced once Plaid\'s data is over 24 hours old; newer data counts as recovered', async () => {
    const now = Date.parse('2026-11-22T12:00:00Z');
    const hoursAgo = (h) => new Date(now - h * 3600000).toISOString();

    expect(await service.reportBankStatus(cibc('stale', { bankUpdatedAt: hoursAgo(20) }), now)).toEqual({ sent: false, reason: 'no_problem' });
    expect(await service.reportBankStatus(cibc('stale', { bankUpdatedAt: hoursAgo(25) }), now)).toEqual({ sent: true });
    expect(await service.reportBankStatus(cibc('stale', { bankUpdatedAt: hoursAgo(13) }), now)).toEqual({ sent: true });

    expect(sent()).toEqual([NOT_UPDATING, RECOVERED]);
  });

  test('sync activity is its own kind of message, apart from the bank\'s problem messages', async () => {
    await settingsService.saveSettings({ events: ['plaid_needs_attention', 'plaid_recovered', 'plaid_sync_changes'] });
    await service.reportBankStatus(cibc('needs_login'));
    await service.reportSyncChanges(cibc('ok'), { added: 2, updated: 0, removed: 0 });
    await service.reportBankStatus(cibc('ok'));

    expect(sent()).toEqual([LOGIN, 'Expense Tracker: New Bank Activity · CIBC', RECOVERED]);
  });

  test('forgetBank drops a disconnected bank, so its id starts clean', async () => {
    await service.reportBankStatus(cibc('needs_login'));
    await service.forgetBank(3);

    expect(await storedState()).toEqual({});
    expect(await service.reportBankStatus(cibc('needs_login'))).toEqual({ sent: true });
  });

  test('resetState (after a restore) forgets everything: no recovery for a problem from the backup\'s moment', async () => {
    await service.reportBankStatus(cibc('needs_login'));
    await service.resetState();

    expect(await service.reportBankStatus(cibc('ok'))).toEqual({ sent: false, reason: 'no_problem' });
    expect(sent()).toHaveLength(1);
  });

  test('a problem that could not be delivered is not remembered, so the next sync tries again', async () => {
    notifiarrProvider.send.mockResolvedValueOnce({ ok: false, reason: 'Timed out after 5 s' });

    expect(await service.reportBankStatus(cibc('needs_login'))).toEqual({ sent: false, reason: 'Timed out after 5 s' });
    expect(await storedState()).toEqual({});
    expect(await service.reportBankStatus(cibc('needs_login'))).toEqual({ sent: true });
  });

  test('a switched-off event sends nothing and is not remembered; recovery is still recorded', async () => {
    await settingsService.saveSettings({ events: ['plaid_recovered'] });
    expect(await service.reportBankStatus(cibc('needs_login'))).toEqual({ sent: false, reason: 'event_off' });
    expect(await storedState()).toEqual({});

    await settingsService.saveSettings({ events: ['plaid_needs_attention'] });
    await service.reportBankStatus(cibc('needs_login'));
    expect(await service.reportBankStatus(cibc('ok'))).toEqual({ sent: false, reason: 'event_off' });
    expect((await storedState())['plaid:3']).toEqual({ state: 'ok' });
  });

  test('nothing is sent or remembered while notifications are off', async () => {
    await settingsService.saveSettings({ enabled: false });

    expect(await service.reportBankStatus(cibc('needs_login'))).toEqual({ sent: false, reason: 'off' });
    expect(notifiarrProvider.send).not.toHaveBeenCalled();
    expect(await storedState()).toEqual({});
  });

  test('never throws, even when sending blows up', async () => {
    notifiarrProvider.send.mockRejectedValue(new Error('boom'));
    await expect(service.reportBankStatus(cibc('needs_login'))).resolves.toEqual({ sent: false, reason: 'error' });
  });

  test('overlapping reports of one bank still announce it once', async () => {
    await Promise.all([1, 2, 3].map(() => service.reportBankStatus(cibc('needs_login'))));
    expect(sent()).toHaveLength(1);
  });
});

describe('backup', () => {
  const failure = () => ({ trigger: 'scheduled', error: new Error('disk full') });
  const success = { trigger: 'scheduled', filename: 'b.tar.gz', size: 1024 };

  test('a failure is announced once; the next success announces the recovery', async () => {
    await service.reportBackupFailed(failure());
    await service.reportBackupFailed(failure());
    await service.reportBackupSucceeded(success);

    expect(sent()).toEqual(['Expense Tracker: Backup Failed', 'Expense Tracker: Backup Recovered']);
  });

  test('a completed backup is announced only when that event is switched on', async () => {
    await service.reportBackupSucceeded(success);
    expect(notifiarrProvider.send).not.toHaveBeenCalled();

    await settingsService.saveSettings({ events: ['backup_succeeded'] });
    await service.reportBackupSucceeded(success);
    expect(sent()).toEqual(['Expense Tracker: Backup Created']);
  });

  test('restores are announced every time', async () => {
    await service.reportBackupRestored({ filename: 'b.tar.gz' });
    await service.reportBackupRestored({ filename: 'b.tar.gz' });
    expect(sent()).toHaveLength(2);
  });
});

describe('loan payments the bank has not confirmed', () => {
  const NOT_RECORDED = 'Expense Tracker: Loan Payment Not Recorded · Pine Mortgage';
  const RECORDED = 'Expense Tracker: Loan Payment Recorded · Pine Mortgage';
  const payment = (dueDate, recorded) => ({
    loanId: 32, loanName: 'Pine Mortgage', fixedExpenseName: 'Pine Mortgage', amount: 2800, dueDate, paymentMethodName: 'Debit - WS', recorded
  });

  test('a recorded payment that was never missing sends nothing', async () => {
    await service.reportLoanPayment(payment('2026-12-01', true));
    expect(notifiarrProvider.send).not.toHaveBeenCalled();
  });

  test('a missing payment is announced once, and its recording once', async () => {
    await service.reportLoanPayment(payment('2026-12-01', false));
    await service.reportLoanPayment(payment('2026-12-01', false));
    await service.reportLoanPayment(payment('2026-12-01', true));
    await service.reportLoanPayment(payment('2026-12-01', true));

    expect(sent()).toEqual([NOT_RECORDED, RECORDED]);
    expect(notifiarrProvider.send.mock.calls[0][1].ping).toBe(true);
  });

  test('the next month still missing is announced again; recording a later month names the one still missing', async () => {
    await service.reportLoanPayment(payment('2026-12-01', false));
    await service.reportLoanPayment(payment('2027-01-01', false));
    await service.reportLoanPayment(payment('2027-02-01', true));

    expect(sent()).toEqual([NOT_RECORDED, NOT_RECORDED, RECORDED]);
    const recorded = notifiarrProvider.send.mock.calls[2][1];
    expect(recorded.description).toBe('The February 2027 payment is recorded.');
    expect(recorded.fields).toContainEqual(expect.objectContaining({ title: 'Still not recorded', text: 'January 2027' }));
  });

  test('switched off, neither message is sent', async () => {
    await settingsService.saveSettings({ events: ['plaid_needs_attention'] });
    await service.reportLoanPayment(payment('2026-12-01', false));
    await service.reportLoanPayment(payment('2026-12-01', true));
    expect(notifiarrProvider.send).not.toHaveBeenCalled();
  });
});

describe('occurrences', () => {
  test('sync changes are off by default and sent every time once switched on', async () => {
    const data = { added: 2, updated: 0, removed: 0 };
    expect(await service.reportSyncChanges(cibc('ok'), data)).toEqual({ sent: false, reason: 'event_off' });

    await settingsService.saveSettings({ events: ['plaid_sync_changes'] });
    await service.reportSyncChanges(cibc('ok'), data);
    await service.reportSyncChanges(cibc('ok'), data);

    expect(sent()).toHaveLength(2);
  });
});

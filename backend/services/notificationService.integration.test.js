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
const sent = () => notifiarrProvider.send.mock.calls.map(([, message, options]) => ({ title: message.title, ...options }));
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

    expect(sent()).toEqual([{ title: '🔴 Bank needs login', event: 'CIBC', update: false }]);
  });

  test('recovery edits the problem message in place, then the next problem is a new message', async () => {
    await service.reportBankStatus(cibc('needs_login'));
    await service.reportBankStatus(cibc('ok'));
    await service.reportBankStatus(cibc('stale', { bankUpdatedAt: '2026-11-21T11:16:07Z' }));

    expect(sent()).toEqual([
      { title: '🔴 Bank needs login', event: 'CIBC', update: false },
      { title: '🟢 Bank recovered', event: 'CIBC', update: true },
      { title: '🟡 Bank not updating', event: 'CIBC', update: false }
    ]);
  });

  test('a bank that moves from one problem to another edits its message and keeps the original start time', async () => {
    await service.reportBankStatus(cibc('stale'));
    const { since } = (await storedState())['plaid:3'];
    await service.reportBankStatus(cibc('needs_login'));

    expect(sent()[1]).toEqual({ title: '🔴 Bank needs login', event: 'CIBC', update: true });
    expect((await storedState())['plaid:3']).toEqual({ state: 'needs_login', since });
  });

  test('state survives a restart: a fresh service does not announce the same broken bank again', async () => {
    await service.reportBankStatus(cibc('needs_login'));

    const restarted = new NotificationService();
    expect(await restarted.reportBankStatus(cibc('needs_login'))).toEqual({ sent: false, reason: 'unchanged' });
    await restarted.reportBankStatus(cibc('ok'));

    expect(sent().map(s => s.title)).toEqual(['🔴 Bank needs login', '🟢 Bank recovered']);
  });

  test('banks are tracked separately', async () => {
    await service.reportBankStatus(cibc('needs_login'));
    await service.reportBankStatus({ id: 1, institutionName: 'Wealthsimple (Canada)', status: 'needs_login' });

    expect(sent().map(s => s.event)).toEqual(['CIBC', 'Wealthsimple (Canada)']);
  });

  test('a failed edit is retried as a new message', async () => {
    await service.reportBankStatus(cibc('needs_login'));
    notifiarrProvider.send.mockResolvedValueOnce({ ok: false, reason: 'HTTP 404: message not found' });

    expect(await service.reportBankStatus(cibc('ok'))).toEqual({ sent: true });

    expect(sent().slice(1)).toEqual([
      { title: '🟢 Bank recovered', event: 'CIBC', update: true },
      { title: '🟢 Bank recovered', event: 'CIBC', update: false }
    ]);
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

  test('a failure is announced once; the next success edits it into "recovered"', async () => {
    await service.reportBackupFailed(failure());
    await service.reportBackupFailed(failure());
    await service.reportBackupSucceeded(success);

    expect(sent()).toEqual([
      { title: '🔴 Backup failed', event: 'Backup', update: false },
      { title: '🟢 Backup recovered', event: 'Backup', update: true }
    ]);
  });

  test('a completed backup is announced only when that event is switched on', async () => {
    await service.reportBackupSucceeded(success);
    expect(notifiarrProvider.send).not.toHaveBeenCalled();

    await settingsService.saveSettings({ events: ['backup_succeeded'] });
    await service.reportBackupSucceeded(success);
    expect(sent()).toEqual([{ title: '🔵 Backup completed', event: 'Backup', update: false }]);
  });

  test('restores are announced every time', async () => {
    await service.notifyOccurrence('backup_restored', { filename: 'b.tar.gz' }, 'Backup');
    await service.notifyOccurrence('backup_restored', { filename: 'b.tar.gz' }, 'Backup');
    expect(sent()).toHaveLength(2);
  });
});

describe('occurrences', () => {
  test('sync changes are off by default and sent every time once switched on', async () => {
    const data = { institutionName: 'CIBC', added: 2, updated: 0, removed: 0 };
    expect(await service.notifyOccurrence('plaid_sync_changes', data, 'CIBC')).toEqual({ sent: false, reason: 'event_off' });

    await settingsService.saveSettings({ events: ['plaid_sync_changes'] });
    await service.notifyOccurrence('plaid_sync_changes', data, 'CIBC');
    await service.notifyOccurrence('plaid_sync_changes', data, 'CIBC');

    expect(sent()).toHaveLength(2);
  });
});

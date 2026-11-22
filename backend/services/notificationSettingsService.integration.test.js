/**
 * Integration tests: notificationSettingsService -> settings table (real SQLite) + generated key file.
 * Notifiarr is mocked; no network.
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
const activityLogService = require('./activityLogService');
const notifiarrProvider = require('./notifiarrProvider');
const service = require('./notificationSettingsService');
const { DEFAULT_EVENT_KEYS } = require('./notificationEvents');

const API_KEY = '00000000-1111-2222-3333-444444444444';
const OTHER_KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CHANNEL = '1234567890123456789';
const USER = '543077981707436033';

let db;
let tmpRoot;
const { run, get } = sqlHelpers(() => db);
const save = (input = {}) => service.saveSettings({ apiKey: API_KEY, channelId: CHANNEL, enabled: true, ...input });

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});
afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'notification-settings-'));
  mockSecretsDir.current = path.join(tmpRoot, 'secrets');
  activityLogService.logEvent.mockClear();
  notifiarrProvider.send.mockReset();
  await run("DELETE FROM settings WHERE key LIKE 'notifications_%'");
});
afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe('notificationSettingsService', () => {
  test('starts off with the default events', async () => {
    const settings = await service.getSettings();

    expect(settings).toMatchObject({ enabled: false, configured: false, keyHint: null, channelId: '', pingUserId: '' });
    expect(settings.events.filter(e => e.enabled).map(e => e.key)).toEqual(DEFAULT_EVENT_KEYS);
  });

  test('saving encrypts the API key at rest and only returns a masked hint', async () => {
    const settings = await save({ pingUserId: USER });

    expect(settings).toMatchObject({ enabled: true, configured: true, keyHint: `••••${API_KEY.slice(-4)}`, channelId: CHANNEL, pingUserId: USER });
    expect(JSON.stringify(settings)).not.toContain(API_KEY);
    const stored = await get("SELECT value FROM settings WHERE key = 'notifications_notifiarr_key_enc'");
    expect(stored.value).toMatch(/^v1:/);
    expect(stored.value).not.toContain(API_KEY);
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'settings_updated', 'settings', null,
      'Updated notification settings (turned on, API key changed, channel changed, ping user changed)',
      expect.objectContaining({ section: 'notifications', enabled: true })
    );
    expect(JSON.stringify(activityLogService.logEvent.mock.calls)).not.toContain(API_KEY);
  });

  test('getConfig returns the decrypted key for sending', async () => {
    await save();
    expect(await service.getConfig()).toMatchObject({ enabled: true, configured: true, apiKey: API_KEY, channelId: CHANNEL });
  });

  test('a blank API key keeps the saved one; an empty ping user clears it', async () => {
    await save({ pingUserId: USER });

    await service.saveSettings({ apiKey: '', pingUserId: '' });

    expect(await service.getConfig()).toMatchObject({ apiKey: API_KEY, pingUserId: '', channelId: CHANNEL, enabled: true });
  });

  test('saves the selected events, in a stable order, and rejects unknown ones', async () => {
    await save({ events: ['backup_restored', 'plaid_stale'] });
    expect((await service.getSettings()).events.filter(e => e.enabled).map(e => e.key)).toEqual(['plaid_stale', 'backup_restored']);

    await expect(service.saveSettings({ events: ['plaid_stale', 'bogus'] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.saveSettings({ events: 'plaid_stale' })).rejects.toMatchObject({ statusCode: 400 });
  });

  test.each([
    ['API key with a slash (it goes into a URL path)', { apiKey: '../../etc/passwd-aaaaaaaa' }],
    ['short API key', { apiKey: 'abc' }],
    ['non-numeric channel', { channelId: 'general' }],
    ['channel too short', { channelId: '12345' }],
    ['bad ping user', { pingUserId: '12ab' }],
    // What a client sending the IDs as JSON numbers produces: the last digits are already wrong
    ['channel sent as a JSON number (digits already lost)', { channelId: JSON.parse('1234567890123456789') }],
    ['ping user sent as a number', { pingUserId: JSON.parse('543077981707436033') }],
    ['API key that is not a string', { apiKey: 12345 }],
    ['enabled that is not a boolean', { enabled: 'yes' }]
  ])('rejects %s', async (_name, input) => {
    await expect(save(input)).rejects.toMatchObject({ statusCode: 400 });
    expect(await get("SELECT value FROM settings WHERE key = 'notifications_notifiarr_key_enc'")).toBeUndefined();
  });

  test('cannot be turned on without an API key and channel', async () => {
    await expect(service.saveSettings({ enabled: true })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('before turning notifications on') });
    await expect(service.saveSettings({ enabled: true, apiKey: API_KEY })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('can be turned off again without losing the credentials', async () => {
    await save();
    const settings = await service.saveSettings({ enabled: false });
    expect(settings).toMatchObject({ enabled: false, configured: true });
  });

  test('a key saved under another encryption key asks to be re-entered', async () => {
    const { randomBytes } = require('crypto');
    process.env.PLAID_TOKEN_KEY = randomBytes(32).toString('base64');
    try {
      await save();
      process.env.PLAID_TOKEN_KEY = randomBytes(32).toString('base64');

      const settings = await service.getSettings();

      expect(settings).toMatchObject({ configured: false, keyHint: null, keyError: expect.stringContaining('Re-enter the API key') });
      // Saving anything else while on says why, instead of asking for a key the user already entered
      await expect(service.saveSettings({ events: ['plaid_stale'] })).rejects.toMatchObject({
        statusCode: 400, message: expect.stringContaining('cannot be decrypted')
      });
    } finally {
      delete process.env.PLAID_TOKEN_KEY;
    }
  });

  test('clearSettings removes the credentials and remembered states, turns off, and keeps the events', async () => {
    await save({ pingUserId: USER, events: ['plaid_stale'] });
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('notifications_state', '{\"plaid:3\":{\"state\":\"stale\"}}')");

    const settings = await service.clearSettings();

    expect(settings).toMatchObject({ enabled: false, configured: false, keyHint: null, channelId: '', pingUserId: '' });
    expect(settings.events.filter(e => e.enabled).map(e => e.key)).toEqual(['plaid_stale']);
    expect((await get("SELECT value FROM settings WHERE key = 'notifications_notifiarr_key_enc'")).value).toBe('');
    expect((await get("SELECT value FROM settings WHERE key = 'notifications_state'")).value).toBe('{}');
    expect(activityLogService.logEvent).toHaveBeenLastCalledWith(
      'settings_updated', 'settings', null, 'Removed notification settings', expect.objectContaining({ section: 'notifications' })
    );
  });

  describe('sendTest', () => {
    test('posts with the saved credentials, pinging when a user is set, and reports success', async () => {
      await save({ pingUserId: USER });
      notifiarrProvider.send.mockResolvedValue({ ok: true });

      expect(await service.sendTest()).toEqual({ ok: true, message: expect.stringContaining('Test message sent') });

      const [credentials, message, options] = notifiarrProvider.send.mock.calls[0];
      expect(credentials).toEqual({ apiKey: API_KEY, channelId: CHANNEL, pingUserId: USER });
      expect(message).toMatchObject({ title: '🔵 Test message', ping: true });
      expect(options).toEqual({ event: 'Test', update: false });
    });

    test('tests values that are not saved yet, and saves nothing', async () => {
      notifiarrProvider.send.mockResolvedValue({ ok: true });

      await service.sendTest({ apiKey: OTHER_KEY, channelId: CHANNEL });

      expect(notifiarrProvider.send.mock.calls[0][0]).toMatchObject({ apiKey: OTHER_KEY });
      expect(await get("SELECT value FROM settings WHERE key = 'notifications_notifiarr_key_enc'")).toBeUndefined();
    });

    test('reports why Notifiarr refused, and needs credentials to try', async () => {
      notifiarrProvider.send.mockResolvedValue({ ok: false, reason: 'HTTP 401: invalid api key' });
      expect(await service.sendTest({ apiKey: API_KEY, channelId: CHANNEL })).toEqual({
        ok: false, message: 'Notifiarr did not accept the message: HTTP 401: invalid api key'
      });

      await expect(service.sendTest()).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});

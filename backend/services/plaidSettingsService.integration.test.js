/**
 * Integration tests: plaidSettingsService -> settings table (real SQLite) + generated key file.
 * The Plaid API client is mocked; no network.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { sqlHelpers, insertItem, plaidError } = require('../test/plaidFixtures');

const mockSecretsDir = { current: null };
jest.mock('../config/paths', () => ({
  ...jest.requireActual('../config/paths'),
  getSecretsPath: () => mockSecretsDir.current
}));
jest.mock('../database/db');
jest.mock('./activityLogService');
jest.mock('../config/plaid', () => ({
  ...jest.requireActual('../config/plaid'),
  createPlaidClient: jest.fn()
}));

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const plaidConfig = require('../config/plaid');
const plaidSettingsService = require('./plaidSettingsService');

const ENV_KEYS = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV', 'PLAID_TOKEN_KEY'];
const savedEnv = {};
const CLIENT_ID = '0123456789abcdef01234567';
const SECRET = 'abcdef0123456789abcdef012345';
const OTHER_SECRET = 'ffffffffffffffffffffffff9999';

let db;
let tmpRoot;

const { run, get } = sqlHelpers(() => db);
const addItem = (environment) => insertItem(run, { itemId: `item-${environment}-${Math.random()}`, institutionName: 'Bank', environment });
const save = (input = {}) => plaidSettingsService.saveSettings({ clientId: CLIENT_ID, secret: SECRET, environment: 'sandbox', ...input });

beforeAll(async () => {
  for (const name of ENV_KEYS) savedEnv[name] = process.env[name];
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
  for (const name of ENV_KEYS) delete process.env[name];
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plaid-settings-'));
  mockSecretsDir.current = path.join(tmpRoot, 'secrets');
  plaidConfig.setStoredCredentials({});
  activityLogService.logEvent.mockClear();
  plaidConfig.createPlaidClient.mockReset();
  await run("DELETE FROM settings WHERE key LIKE 'plaid_%'");
  await run('DELETE FROM plaid_items');
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('plaidSettingsService', () => {
  test('starts unconfigured and editable', async () => {
    expect(await plaidSettingsService.getSettings()).toEqual({
      source: 'none', editable: true, enabled: false, environment: null,
      clientIdHint: null, secretHint: null, problems: [], keySource: expect.any(String),
      connectedBanks: { sandbox: 0, production: 0 }
    });
  });

  test('saving enables Plaid, encrypts the secret at rest, and only returns masked hints', async () => {
    const settings = await save();

    expect(settings).toMatchObject({ source: 'settings', enabled: true, environment: 'sandbox', clientIdHint: '••••4567', secretHint: '••••2345', keySource: 'file' });
    expect(JSON.stringify(settings)).not.toContain(SECRET);
    const stored = await get("SELECT value FROM settings WHERE key = 'plaid_secret_enc'");
    expect(stored.value).toMatch(/^v1:/);
    expect(stored.value).not.toContain(SECRET);
    expect(fs.existsSync(path.join(mockSecretsDir.current, 'plaid.key'))).toBe(true);
    expect(plaidConfig.getPlaidConfig()).toMatchObject({ enabled: true, secret: SECRET });
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'settings_updated', 'settings', null, 'Updated Plaid bank import settings (keys added)',
      expect.objectContaining({ section: 'plaid', environment: 'sandbox' })
    );
    expect(JSON.stringify(activityLogService.logEvent.mock.calls)).not.toContain(SECRET);
  });

  test('load() restores saved settings after a restart', async () => {
    await save();
    plaidConfig.setStoredCredentials({});
    expect(plaidConfig.isEnabled()).toBe(false);

    await plaidSettingsService.load();

    expect(plaidConfig.getPlaidConfig()).toMatchObject({ source: 'settings', enabled: true, clientId: CLIENT_ID, secret: SECRET });
  });

  test('a secret saved under another key asks to be re-entered', async () => {
    const { randomBytes } = require('crypto');
    process.env.PLAID_TOKEN_KEY = randomBytes(32).toString('base64');
    await save();
    // Simulates restoring the database where the encryption key is different
    process.env.PLAID_TOKEN_KEY = randomBytes(32).toString('base64');
    await plaidSettingsService.load();

    const settings = await plaidSettingsService.getSettings();
    expect(settings).toMatchObject({ source: 'settings', enabled: false, keySource: 'env' });
    expect(settings.problems.join(' ')).toMatch(/Re-enter the secret/);
  });

  test('blank fields keep the saved values', async () => {
    await save();
    await plaidSettingsService.saveSettings({ clientId: '', secret: '', environment: 'sandbox' });

    expect(plaidConfig.getPlaidConfig()).toMatchObject({ clientId: CLIENT_ID, secret: SECRET });
    expect(activityLogService.logEvent).toHaveBeenLastCalledWith(
      'settings_updated', 'settings', null, 'Updated Plaid bank import settings', expect.any(Object)
    );
  });

  test.each([
    [{ clientId: 'short' }, /Client ID/],
    [{ secret: 'has spaces in it' }, /Secret/],
    [{ environment: 'development' }, /Environment must be one of/],
  ])('rejects invalid input %j', async (input, message) => {
    await expect(save(input)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(message) });
  });

  test('a first save needs every field', async () => {
    await expect(plaidSettingsService.saveSettings({ clientId: CLIENT_ID, environment: 'sandbox' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Secret/) });
  });

  test('switching environment is refused while banks from the other environment are connected', async () => {
    await save();
    await addItem('sandbox');

    await expect(save({ environment: 'production', secret: OTHER_SECRET }))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Disconnect your 1 Sandbox bank/) });
    expect(plaidConfig.getPlaidConfig().environment).toBe('sandbox');

    await run('DELETE FROM plaid_items');
    const settings = await save({ environment: 'production', secret: OTHER_SECRET });
    expect(settings).toMatchObject({ environment: 'production', secretHint: '••••9999' });
    expect(activityLogService.logEvent).toHaveBeenLastCalledWith(
      'settings_updated', 'settings', null,
      'Updated Plaid bank import settings (environment: Sandbox → Production, secret changed)', expect.any(Object)
    );
  });

  test('removing keys is refused while banks are connected, then disables Plaid', async () => {
    await save();
    await addItem('sandbox');
    await expect(plaidSettingsService.clearSettings()).rejects.toMatchObject({ statusCode: 409 });

    await run('DELETE FROM plaid_items');
    const settings = await plaidSettingsService.clearSettings();

    expect(settings).toMatchObject({ source: 'none', enabled: false, clientIdHint: null });
    await plaidSettingsService.load();
    expect(plaidConfig.isEnabled()).toBe(false);
  });

  test('environment variables lock the settings', async () => {
    Object.assign(process.env, { PLAID_CLIENT_ID: CLIENT_ID, PLAID_SECRET: SECRET, PLAID_ENV: 'sandbox' });

    expect(await plaidSettingsService.getSettings()).toMatchObject({ source: 'env', editable: false, enabled: true, secretHint: '••••2345' });
    await expect(save()).rejects.toMatchObject({ statusCode: 409 });
    await expect(plaidSettingsService.testSettings({})).rejects.toMatchObject({ statusCode: 409 });
    await expect(plaidSettingsService.clearSettings()).rejects.toMatchObject({ statusCode: 409 });
  });

  describe('testSettings', () => {
    test('reports success without saving', async () => {
      const linkTokenCreate = jest.fn().mockResolvedValue({ data: { link_token: 'link-sandbox-x' } });
      plaidConfig.createPlaidClient.mockReturnValue({ linkTokenCreate });

      const result = await plaidSettingsService.testSettings({ clientId: CLIENT_ID, secret: SECRET, environment: 'sandbox' });

      expect(result).toEqual({ ok: true, environment: 'sandbox', message: 'Plaid accepted these Sandbox keys.' });
      expect(plaidConfig.createPlaidClient).toHaveBeenCalledWith({ clientId: CLIENT_ID, secret: SECRET, environment: 'sandbox' });
      expect(plaidConfig.isEnabled()).toBe(false);
    });

    test('uses the saved secret when the field is left blank', async () => {
      await save();
      plaidConfig.createPlaidClient.mockReturnValue({ linkTokenCreate: jest.fn().mockResolvedValue({ data: {} }) });

      await plaidSettingsService.testSettings({ environment: 'sandbox' });

      expect(plaidConfig.createPlaidClient).toHaveBeenCalledWith({ clientId: CLIENT_ID, secret: SECRET, environment: 'sandbox' });
    });

    test('returns Plaid\'s rejection as a message, not an error', async () => {
      // The axios error carries the request headers, secret included: the message must not leak them
      const rejection = Object.assign(plaidError('INVALID_API_KEYS', 'invalid client_id or secret provided'), {
        config: { headers: { 'PLAID-SECRET': SECRET } }
      });
      plaidConfig.createPlaidClient.mockReturnValue({ linkTokenCreate: jest.fn().mockRejectedValue(rejection) });

      const result = await plaidSettingsService.testSettings({ clientId: CLIENT_ID, secret: SECRET, environment: 'production' });

      expect(result).toEqual({ ok: false, environment: 'production', message: 'Plaid rejected these keys: invalid client_id or secret provided' });
      expect(JSON.stringify(result)).not.toContain(SECRET);
    });
  });
});

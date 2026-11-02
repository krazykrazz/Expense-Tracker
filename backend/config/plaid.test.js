/**
 * Unit tests for Plaid configuration resolution: environment variables vs in-app settings,
 * and the generated token key file.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const mockSecretsDir = { current: null };
jest.mock('./paths', () => ({ getSecretsPath: () => mockSecretsDir.current }));

const plaidConfig = require('./plaid');

const ENV_KEYS = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV', 'PLAID_TOKEN_KEY'];
const savedEnv = {};
let tmpRoot;

beforeAll(() => {
  for (const name of ENV_KEYS) savedEnv[name] = process.env[name];
});

afterAll(() => {
  for (const name of ENV_KEYS) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

beforeEach(() => {
  for (const name of ENV_KEYS) delete process.env[name];
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plaid-config-'));
  // A fresh, not-yet-created directory per test so the key file cache cannot leak between tests
  mockSecretsDir.current = path.join(tmpRoot, 'secrets');
  plaidConfig.setStoredCredentials({});
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const freshConfig = () => {
  let mod;
  jest.isolateModules(() => { mod = require('./plaid'); });
  return mod;
};

describe('credential source', () => {
  test('nothing configured: disabled with a pointer to Settings', () => {
    const config = plaidConfig.getPlaidConfig();
    expect(config).toMatchObject({ source: 'none', enabled: false });
    expect(config.problems[0]).toMatch(/Settings → Bank Import/);
  });

  test('saved settings enable the integration', () => {
    plaidConfig.setStoredCredentials({ clientId: 'client123456', secret: 'secret123456', environment: 'sandbox' });
    expect(plaidConfig.getPlaidConfig()).toMatchObject({ source: 'settings', enabled: true, environment: 'sandbox', clientId: 'client123456' });
  });

  test('environment variables take precedence over saved settings', () => {
    plaidConfig.setStoredCredentials({ clientId: 'stored', secret: 'stored', environment: 'production' });
    Object.assign(process.env, { PLAID_CLIENT_ID: 'envclient', PLAID_SECRET: 'envsecret', PLAID_ENV: 'Sandbox' });

    expect(plaidConfig.getPlaidConfig()).toMatchObject({ source: 'env', enabled: true, clientId: 'envclient', environment: 'sandbox' });
  });

  test('a partial environment configuration reports what is missing instead of mixing sources', () => {
    plaidConfig.setStoredCredentials({ clientId: 'stored', secret: 'stored', environment: 'sandbox' });
    process.env.PLAID_ENV = 'sandbox';

    const config = plaidConfig.getPlaidConfig();
    expect(config).toMatchObject({ source: 'env', enabled: false });
    expect(config.problems).toEqual(['PLAID_CLIENT_ID is not set', 'PLAID_SECRET is not set']);
  });

  test('an unreadable saved secret disables the integration with its explanation', () => {
    plaidConfig.setStoredCredentials({ clientId: 'client123456', environment: 'sandbox', secretError: 'Re-enter the secret.' });
    expect(plaidConfig.getPlaidConfig()).toMatchObject({ source: 'settings', enabled: false, problems: ['Re-enter the secret.'] });
  });

  test('an invalid PLAID_TOKEN_KEY is reported', () => {
    plaidConfig.setStoredCredentials({ clientId: 'client123456', secret: 'secret123456', environment: 'sandbox' });
    process.env.PLAID_TOKEN_KEY = 'nope';
    expect(plaidConfig.getPlaidConfig().problems).toEqual(['PLAID_TOKEN_KEY must be a 32-byte key encoded as base64 or hex']);
  });
});

describe('token key', () => {
  test('is not created just by looking', () => {
    const config = freshConfig();
    expect(config.getTokenKey()).toBeNull();
    expect(config.getTokenKeySource()).toBe('none');
    expect(fs.existsSync(mockSecretsDir.current)).toBe(false);
  });

  test('is generated once on demand and reused', () => {
    const config = freshConfig();
    const key = config.getTokenKey({ create: true });

    expect(key).toHaveLength(32);
    expect(config.getTokenKeySource()).toBe('file');
    const filePath = config.getKeyFilePath();
    expect(filePath).toBe(path.join(mockSecretsDir.current, 'plaid.key'));
    expect(Buffer.from(fs.readFileSync(filePath, 'utf8').trim(), 'base64').equals(key)).toBe(true);
    if (process.platform !== 'win32') {
      expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
    }

    // A new process (fresh module) reads the same key back
    expect(freshConfig().getTokenKey().equals(key)).toBe(true);
  });

  test('PLAID_TOKEN_KEY overrides the key file', () => {
    const config = freshConfig();
    config.getTokenKey({ create: true });
    const envKey = crypto.randomBytes(32);
    process.env.PLAID_TOKEN_KEY = envKey.toString('hex');

    expect(config.getTokenKey({ create: true }).equals(envKey)).toBe(true);
    expect(config.getTokenKeySource()).toBe('env');
  });
});

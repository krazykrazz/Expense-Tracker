const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const logger = require('./logger');

const VALID_ENVIRONMENTS = ['sandbox', 'production'];
const TRIAL_ITEM_LIMIT = 10;
const DAYS_REQUESTED = 30;
const COUNTRY_CODES = ['CA'];
const ENV_CREDENTIAL_VARS = ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV'];
const KEY_FILE_NAME = 'plaid.key';

/**
 * Credentials saved through Settings → Bank Import. Loaded from the settings table by
 * plaidSettingsService (which owns persistence and decryption); held here so the
 * synchronous config lookups used by routes and services stay cheap.
 */
let storedCredentials = { clientId: '', secret: '', environment: '', secretError: null };
let keyFileCache = { path: null, key: null };

/**
 * Decode a 32-byte AES-256 key encoded as base64 or hex.
 * @returns {Buffer|null} null when missing or not exactly 32 bytes
 */
function decodeTokenKey(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const decoded = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64');
  return decoded.length === 32 ? decoded : null;
}

function getKeyFilePath() {
  // Resolved lazily: some tests replace config/paths with partial mocks
  const { getSecretsPath } = require('./paths');
  return path.join(getSecretsPath(), KEY_FILE_NAME);
}

function readKeyFile() {
  const filePath = getKeyFilePath();
  if (keyFileCache.path === filePath && keyFileCache.key) return keyFileCache.key;
  let key = null;
  try {
    key = decodeTokenKey(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn('Plaid key file could not be read', { error: err.message });
    }
  }
  keyFileCache = { path: filePath, key };
  return key;
}

/**
 * The key that encrypts the stored Plaid secret and bank access tokens.
 * PLAID_TOKEN_KEY wins when set; otherwise <CONFIG_DIR>/secrets/plaid.key, which is
 * generated on first use and is not included in backups.
 * @param {{create?: boolean}} [options] create the key file when it does not exist yet
 * @returns {Buffer|null}
 */
function getTokenKey({ create = false } = {}) {
  if (process.env.PLAID_TOKEN_KEY) {
    return decodeTokenKey(process.env.PLAID_TOKEN_KEY);
  }
  const existing = readKeyFile();
  if (existing || !create) return existing;

  const filePath = getKeyFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(filePath, `${crypto.randomBytes(32).toString('base64')}\n`, { mode: 0o600, flag: 'wx' });
    logger.info('Generated Plaid encryption key', { path: filePath });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  keyFileCache = { path: null, key: null };
  return readKeyFile();
}

/** @returns {'env'|'file'|'none'} where the token key comes from (or 'none' until first generated) */
function getTokenKeySource() {
  if (process.env.PLAID_TOKEN_KEY) return 'env';
  return readKeyFile() ? 'file' : 'none';
}

/**
 * 'env' when any PLAID_CLIENT_ID / PLAID_SECRET / PLAID_ENV is set (settings UI becomes read-only),
 * 'settings' when credentials were saved in the app, otherwise 'none'.
 */
function getCredentialSource() {
  if (ENV_CREDENTIAL_VARS.some(name => process.env[name])) return 'env';
  if (storedCredentials.clientId || storedCredentials.secret || storedCredentials.secretError) return 'settings';
  return 'none';
}

/**
 * Effective Plaid configuration. Secrets are never logged or returned to clients.
 */
function getPlaidConfig() {
  const source = getCredentialSource();
  const fromEnv = source === 'env';
  const clientId = fromEnv ? (process.env.PLAID_CLIENT_ID || '').trim() : storedCredentials.clientId;
  const secret = fromEnv ? (process.env.PLAID_SECRET || '').trim() : storedCredentials.secret;
  const environment = (fromEnv ? (process.env.PLAID_ENV || '') : storedCredentials.environment).trim().toLowerCase();

  const problems = [];
  if (source === 'none') {
    problems.push('Plaid is not configured. Add your keys in Settings → Bank Import.');
  } else {
    if (!clientId) problems.push(fromEnv ? 'PLAID_CLIENT_ID is not set' : 'Client ID is missing');
    if (!fromEnv && storedCredentials.secretError) problems.push(storedCredentials.secretError);
    else if (!secret) problems.push(fromEnv ? 'PLAID_SECRET is not set' : 'Secret is missing');
    if (!VALID_ENVIRONMENTS.includes(environment)) {
      problems.push(fromEnv ? `PLAID_ENV must be one of: ${VALID_ENVIRONMENTS.join(', ')}` : 'Environment is missing');
    }
  }
  if (process.env.PLAID_TOKEN_KEY && !decodeTokenKey(process.env.PLAID_TOKEN_KEY)) {
    problems.push('PLAID_TOKEN_KEY must be a 32-byte key encoded as base64 or hex');
  }

  return { source, clientId, secret, environment, problems, enabled: problems.length === 0 };
}

function isEnabled() {
  return getPlaidConfig().enabled;
}

/** Called by plaidSettingsService after loading or saving stored credentials. */
function setStoredCredentials({ clientId = '', secret = '', environment = '', secretError = null } = {}) {
  storedCredentials = { clientId, secret, environment, secretError };
}

/**
 * @param {{clientId: string, secret: string, environment: string}} credentials
 * @returns {PlaidApi}
 */
function createPlaidClient({ clientId, secret, environment }) {
  return new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[environment],
    baseOptions: { headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret } }
  }));
}

let cachedClient = null;
let cachedClientKey = null;

/**
 * @returns {PlaidApi} a client for the configured environment
 */
function getPlaidClient() {
  const config = getPlaidConfig();
  if (!config.enabled) {
    throw Object.assign(new Error('Plaid integration is not configured'), { statusCode: 503 });
  }
  const key = `${config.environment}:${config.clientId}:${config.secret}`;
  if (!cachedClient || cachedClientKey !== key) {
    cachedClient = createPlaidClient(config);
    cachedClientKey = key;
  }
  return cachedClient;
}

/**
 * Log at startup whether the integration is active (never logs secrets).
 */
function logPlaidStatus() {
  const config = getPlaidConfig();
  if (config.enabled) {
    logger.info(`Plaid integration enabled (${config.environment}, configured via ${config.source === 'env' ? 'environment variables' : 'Settings'})`);
  } else if (config.source !== 'none' || process.env.PLAID_TOKEN_KEY) {
    logger.warn('Plaid integration disabled: incomplete configuration', { problems: config.problems });
  }
}

module.exports = {
  getPlaidConfig,
  getPlaidClient,
  createPlaidClient,
  isEnabled,
  logPlaidStatus,
  setStoredCredentials,
  getTokenKey,
  getTokenKeySource,
  getKeyFilePath,
  decodeTokenKey,
  VALID_ENVIRONMENTS,
  TRIAL_ITEM_LIMIT,
  DAYS_REQUESTED,
  COUNTRY_CODES
};

const plaidConfig = require('../config/plaid');
const plaidRepository = require('../repositories/plaidRepository');
const settingsRepository = require('../repositories/settingsRepository');
const activityLogService = require('./activityLogService');
const { encrypt, decrypt } = require('../utils/tokenCrypto');
const logger = require('../config/logger');

const KEYS = {
  clientId: 'plaid_client_id',
  secret: 'plaid_secret_enc',
  environment: 'plaid_environment'
};
const CREDENTIAL_PATTERN = /^[A-Za-z0-9]{8,64}$/;
const SECRET_UNREADABLE = 'The saved Plaid secret cannot be decrypted because the encryption key changed '
  + '(for example after restoring a backup on another machine). Re-enter the secret.';

const { fail } = require('../utils/httpError');
const hint = (value) => (value ? `••••${value.slice(-4)}` : null);
const label = (environment) => (environment === 'production' ? 'Production' : 'Sandbox');

/** Plaid errors arrive as axios errors whose config carries the secret, so only the error body is used. */
const plaidMessage = (err) => {
  const data = err && err.response && err.response.data;
  return data && data.error_code ? (data.error_message || data.error_code) : null;
};

/**
 * Plaid credentials managed in the app (Settings → Bank Import), for installs that do not set
 * PLAID_* environment variables. The secret is stored encrypted with the same key as bank tokens.
 */
class PlaidSettingsService {
  /**
   * Load saved credentials into the in-memory Plaid config. Call at startup and after a restore.
   */
  async load() {
    const values = await settingsRepository.getMultiple(Object.values(KEYS));
    let secret = '';
    let secretError = null;
    if (values[KEYS.secret]) {
      try {
        secret = decrypt(values[KEYS.secret]);
      } catch (err) {
        secretError = SECRET_UNREADABLE;
        logger.warn('Saved Plaid secret could not be decrypted');
      }
    }
    plaidConfig.setStoredCredentials({
      clientId: values[KEYS.clientId] || '',
      secret,
      environment: values[KEYS.environment] || '',
      secretError
    });
  }

  async _connectedBanks() {
    const [sandbox, production] = await Promise.all([
      plaidRepository.countItemsByEnvironment('sandbox'),
      plaidRepository.countItemsByEnvironment('production')
    ]);
    return { sandbox, production };
  }

  /**
   * Settings as shown in the UI: never includes the secret, only masked hints.
   */
  async getSettings() {
    const config = plaidConfig.getPlaidConfig();
    return {
      source: config.source,
      editable: config.source !== 'env',
      enabled: config.enabled,
      environment: config.environment || null,
      clientIdHint: hint(config.clientId),
      secretHint: hint(config.secret),
      problems: config.source === 'none' ? [] : config.problems,
      keySource: plaidConfig.getTokenKeySource(),
      connectedBanks: await this._connectedBanks()
    };
  }

  _assertEditable() {
    if (plaidConfig.getPlaidConfig().source === 'env') {
      throw fail('Plaid is configured with PLAID_* environment variables. Remove them to manage the keys here.', 409);
    }
  }

  /**
   * Merge user input with the saved values (a blank field keeps the saved value) and validate.
   * @returns {{clientId: string, secret: string, environment: string}}
   */
  _resolveInput({ clientId, secret, environment } = {}) {
    const current = plaidConfig.getPlaidConfig();
    const usable = current.source === 'settings';
    const pick = (value, saved) => (typeof value === 'string' && value.trim() ? value.trim() : (usable ? saved : ''));

    const resolved = {
      clientId: pick(clientId, current.clientId),
      secret: pick(secret, current.secret),
      environment: pick(environment, current.environment).toLowerCase()
    };

    if (!CREDENTIAL_PATTERN.test(resolved.clientId)) {
      throw fail('Client ID must be the letters and digits from Plaid Dashboard → Developers → Keys', 400);
    }
    if (!CREDENTIAL_PATTERN.test(resolved.secret)) {
      throw fail('Secret must be the letters and digits from Plaid Dashboard → Developers → Keys', 400);
    }
    if (!plaidConfig.VALID_ENVIRONMENTS.includes(resolved.environment)) {
      throw fail(`Environment must be one of: ${plaidConfig.VALID_ENVIRONMENTS.join(', ')}`, 400);
    }
    return resolved;
  }

  /**
   * Check credentials against Plaid without saving them (blank fields use the saved values).
   * @returns {Promise<{ok: boolean, environment: string, message: string}>}
   */
  async testSettings(input = {}) {
    this._assertEditable();
    const credentials = this._resolveInput(input);
    try {
      await plaidConfig.createPlaidClient(credentials).linkTokenCreate({
        user: { client_user_id: 'expense-tracker-settings-test' },
        client_name: 'Expense Tracker',
        products: ['transactions'],
        country_codes: plaidConfig.COUNTRY_CODES,
        language: 'en'
      });
      return { ok: true, environment: credentials.environment, message: `Plaid accepted these ${label(credentials.environment)} keys.` };
    } catch (err) {
      const message = plaidMessage(err);
      if (!message) throw err;
      return { ok: false, environment: credentials.environment, message: `Plaid rejected these keys: ${message}` };
    }
  }

  /**
   * Save credentials. Switching environment is refused while banks from the other environment are
   * connected, because their tokens only work against the environment they were created in.
   */
  async saveSettings(input = {}, tabId = null) {
    this._assertEditable();
    const previous = plaidConfig.getPlaidConfig();
    const next = this._resolveInput(input);

    const banks = await this._connectedBanks();
    const stranded = Object.entries(banks).filter(([environment, count]) => environment !== next.environment && count > 0);
    if (stranded.length > 0) {
      const [environment, count] = stranded[0];
      throw fail(
        `Disconnect your ${count} ${label(environment)} bank${count === 1 ? '' : 's'} (Bank Import → Connections) before switching to ${label(next.environment)}.`,
        409
      );
    }

    // Encrypt first so a key failure can't leave the client ID saved without its secret
    const secretEnc = encrypt(next.secret);
    await settingsRepository.setSetting(KEYS.clientId, next.clientId);
    await settingsRepository.setSetting(KEYS.secret, secretEnc);
    await settingsRepository.setSetting(KEYS.environment, next.environment);
    plaidConfig.setStoredCredentials(next);

    const changes = [];
    if (previous.source !== 'settings') changes.push('keys added');
    else {
      if (previous.environment !== next.environment) changes.push(`environment: ${label(previous.environment)} → ${label(next.environment)}`);
      if (previous.clientId !== next.clientId) changes.push('client ID changed');
      if (previous.secret !== next.secret) changes.push('secret changed');
    }
    await activityLogService.logEvent(
      'settings_updated',
      'settings',
      null,
      `Updated Plaid bank import settings${changes.length ? ` (${changes.join(', ')})` : ''}`,
      { section: 'plaid', environment: next.environment, changes, tabId }
    );

    return this.getSettings();
  }

  /**
   * Remove saved credentials. Refused while banks are connected (they could no longer sync or be disconnected).
   */
  async clearSettings(tabId = null) {
    this._assertEditable();
    const banks = await this._connectedBanks();
    const total = banks.sandbox + banks.production;
    if (total > 0) {
      throw fail(`Disconnect your ${total} connected bank${total === 1 ? '' : 's'} (Bank Import → Connections) before removing the Plaid keys.`, 409);
    }

    for (const key of Object.values(KEYS)) {
      await settingsRepository.setSetting(key, '');
    }
    plaidConfig.setStoredCredentials({});

    await activityLogService.logEvent(
      'settings_updated',
      'settings',
      null,
      'Removed Plaid bank import settings',
      { section: 'plaid', changes: ['keys removed'], tabId }
    );
    return this.getSettings();
  }
}

module.exports = new PlaidSettingsService();

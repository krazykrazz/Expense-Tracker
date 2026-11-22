const settingsRepository = require('../repositories/settingsRepository');
const activityLogService = require('./activityLogService');
const notifiarrProvider = require('./notifiarrProvider');
const { buildMessage } = require('./notificationMessages');
const { EVENTS, EVENT_KEYS, DEFAULT_EVENT_KEYS } = require('./notificationEvents');
const timeBoundaryService = require('./timeBoundaryService');
const { encrypt, decrypt } = require('../utils/tokenCrypto');
const { fail } = require('../utils/httpError');
const logger = require('../config/logger');

const KEYS = {
  enabled: 'notifications_enabled',
  apiKey: 'notifications_notifiarr_key_enc',
  channelId: 'notifications_channel_id',
  pingUserId: 'notifications_ping_user_id',
  events: 'notifications_events'
};
const KEY_UNREADABLE = 'The saved Notifiarr API key cannot be decrypted because the encryption key changed '
  + '(for example after restoring a backup on another machine). Re-enter the API key.';

const hint = (value) => (value ? `••••${value.slice(-4)}` : null);
const isBlank = (value) => typeof value !== 'string' || value.trim() === '';

function parseEvents(stored) {
  if (!stored) return DEFAULT_EVENT_KEYS;
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(key => EVENT_KEYS.includes(key)) : DEFAULT_EVENT_KEYS;
  } catch {
    return DEFAULT_EVENT_KEYS;
  }
}

/**
 * Notification settings (Settings → Notifications): the Notifiarr API key (encrypted with the same key as bank
 * tokens), the Discord channel to post to, an optional user to ping on failures, and which events to send.
 */
class NotificationSettingsService {
  /**
   * Full configuration for sending (includes the decrypted API key: never return it to a client).
   * @returns {Promise<{enabled: boolean, configured: boolean, apiKey: string, channelId: string, pingUserId: string, events: Set<string>, keyError: (string|null)}>}
   */
  async getConfig() {
    const values = await settingsRepository.getMultiple(Object.values(KEYS));
    let apiKey = '';
    let keyError = null;
    if (values[KEYS.apiKey]) {
      try {
        apiKey = decrypt(values[KEYS.apiKey]);
      } catch {
        keyError = KEY_UNREADABLE;
        logger.warn('Saved Notifiarr API key could not be decrypted');
      }
    }
    const channelId = values[KEYS.channelId] || '';
    return {
      enabled: values[KEYS.enabled] === '1',
      configured: Boolean(apiKey && channelId),
      apiKey,
      channelId,
      pingUserId: values[KEYS.pingUserId] || '',
      events: new Set(parseEvents(values[KEYS.events])),
      keyError
    };
  }

  /** Settings as shown in the UI: the API key is only ever returned as a masked hint. */
  async getSettings() {
    const config = await this.getConfig();
    return {
      enabled: config.enabled,
      configured: config.configured,
      keyHint: hint(config.apiKey),
      keyError: config.keyError,
      channelId: config.channelId,
      pingUserId: config.pingUserId,
      events: EVENTS.map(({ key, label }) => ({ key, label, enabled: config.events.has(key) }))
    };
  }

  /**
   * Merge input with the saved values (a blank API key keeps the saved key; an omitted channel / ping user is kept,
   * an empty one clears it) and validate.
   */
  _resolve(input, current) {
    const apiKey = isBlank(input.apiKey) ? current.apiKey : input.apiKey.trim();
    const text = (value, saved) => (value === undefined ? saved : String(value ?? '').trim());
    const channelId = text(input.channelId, current.channelId);
    const pingUserId = text(input.pingUserId, current.pingUserId);

    if (apiKey && !notifiarrProvider.API_KEY_PATTERN.test(apiKey)) {
      throw fail('API key must be the letters, digits and dashes of your Notifiarr API key (notifiarr.com → Profile)', 400);
    }
    if (channelId && !notifiarrProvider.SNOWFLAKE_PATTERN.test(channelId)) {
      throw fail('Channel ID must be the 17-20 digit Discord channel ID (Discord → Developer Mode → right-click the channel → Copy Channel ID)', 400);
    }
    if (pingUserId && !notifiarrProvider.SNOWFLAKE_PATTERN.test(pingUserId)) {
      throw fail('User ID must be the 17-20 digit Discord user ID, or left empty', 400);
    }
    return { apiKey, channelId, pingUserId };
  }

  /**
   * Post a test message with the given (or saved) credentials. Nothing is saved.
   * @returns {Promise<{ok: boolean, message: string}>}
   */
  async sendTest(input = {}) {
    const credentials = this._resolve(input, await this.getConfig());
    if (!credentials.apiKey || !credentials.channelId) {
      throw fail('Enter the Notifiarr API key and the Discord channel ID first', 400);
    }
    const timezone = await timeBoundaryService.getBusinessTimezone();
    const message = buildMessage('test', { ping: Boolean(credentials.pingUserId) }, { timezone });
    const result = await notifiarrProvider.send(credentials, message, { event: 'Test', update: false });
    return result.ok
      ? { ok: true, message: 'Test message sent. Check your Discord channel.' }
      : { ok: false, message: `Notifiarr did not accept the message: ${result.reason}` };
  }

  /**
   * @param {{apiKey?: string, channelId?: string, pingUserId?: string, enabled?: boolean, events?: string[]}} input
   */
  async saveSettings(input = {}, tabId = null) {
    const current = await this.getConfig();
    const next = this._resolve(input, current);

    if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
      throw fail('enabled must be true or false', 400);
    }
    const enabled = input.enabled === undefined ? current.enabled : input.enabled;

    let events = [...current.events];
    if (input.events !== undefined) {
      if (!Array.isArray(input.events) || input.events.some(key => !EVENT_KEYS.includes(key))) {
        throw fail(`events must be a list of: ${EVENT_KEYS.join(', ')}`, 400);
      }
      events = EVENT_KEYS.filter(key => input.events.includes(key));
    }
    if (enabled && !(next.apiKey && next.channelId)) {
      throw fail('Enter the Notifiarr API key and the Discord channel ID before turning notifications on', 400);
    }

    // Encrypt first so a key failure can't leave the channel saved without its API key
    if (next.apiKey && next.apiKey !== current.apiKey) {
      await settingsRepository.setSetting(KEYS.apiKey, encrypt(next.apiKey));
    }
    await settingsRepository.setSetting(KEYS.channelId, next.channelId);
    await settingsRepository.setSetting(KEYS.pingUserId, next.pingUserId);
    await settingsRepository.setSetting(KEYS.enabled, enabled ? '1' : '0');
    await settingsRepository.setSetting(KEYS.events, JSON.stringify(events));

    const changes = [];
    if (enabled !== current.enabled) changes.push(enabled ? 'turned on' : 'turned off');
    if (next.apiKey !== current.apiKey) changes.push('API key changed');
    if (next.channelId !== current.channelId) changes.push('channel changed');
    if (next.pingUserId !== current.pingUserId) changes.push('ping user changed');
    if (events.length !== current.events.size || events.some(key => !current.events.has(key))) changes.push('events changed');
    await activityLogService.logEvent(
      'settings_updated',
      'settings',
      null,
      `Updated notification settings${changes.length ? ` (${changes.join(', ')})` : ''}`,
      { section: 'notifications', enabled, changes, tabId }
    );

    return this.getSettings();
  }
}

module.exports = new NotificationSettingsService();

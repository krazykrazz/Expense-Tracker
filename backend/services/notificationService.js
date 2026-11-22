/**
 * Sends the notifications of specs/discord-notifications/spec.md. Failure-type events fire on a state change only:
 * one message when a bank (or the backup) goes bad, edited in place while it stays bad or changes problem, and
 * edited again when it recovers. The last notified state is kept in the settings table, so a restart (every
 * deploy) does not announce the same broken bank again. Nothing here ever throws: a notification must not
 * affect the sync or backup that triggered it.
 */
const settingsRepository = require('../repositories/settingsRepository');
const notificationSettingsService = require('./notificationSettingsService');
const notifiarrProvider = require('./notifiarrProvider');
const timeBoundaryService = require('./timeBoundaryService');
const { buildMessage, safeName } = require('./notificationMessages');
const { toggleFor } = require('./notificationEvents');
const logger = require('../config/logger');

const STATE_KEY = 'notifications_state';

class NotificationService {
  constructor() {
    this._queue = Promise.resolve();
  }

  /** One at a time: state is read, changed and saved as a whole, and syncs of several banks can overlap. */
  _serial(task) {
    const run = this._queue.then(task);
    this._queue = run.catch(() => {});
    return run;
  }

  async _loadStates() {
    try {
      const parsed = JSON.parse(await settingsRepository.getSetting(STATE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  _saveStates(states) {
    return settingsRepository.setSetting(STATE_KEY, JSON.stringify(states));
  }

  _outcome(result, eventKey) {
    if (result.ok) return { sent: true };
    logger.warn('Notification not delivered', { eventKey, reason: result.reason });
    return { sent: false, reason: result.reason };
  }

  /** @returns {Promise<{ok: boolean, reason?: string}>} an edit that fails falls back to a new message */
  async _post(config, eventKey, data, { eventId, update }) {
    const timezone = await timeBoundaryService.getBusinessTimezone();
    const message = buildMessage(eventKey, data, { timezone });
    const credentials = { apiKey: config.apiKey, channelId: config.channelId, pingUserId: config.pingUserId };
    const result = await notifiarrProvider.send(credentials, message, { event: eventId, update });
    if (!result.ok && update) {
      return notifiarrProvider.send(credentials, message, { event: eventId, update: false });
    }
    return result;
  }

  /**
   * A bank or the backup changed state. Sends when the new state is a problem (`problemEvent`), or when it is back
   * to normal after one (`recoveryEvent`); a repeat of the same state sends nothing. The reason of a failed
   * delivery is logged without credentials (the provider strips the API key).
   * @param {object} spec
   * @param {string} spec.stateKey e.g. `plaid:3`, `backup`
   * @param {string} spec.state e.g. 'ok', 'needs_login', 'stale', 'failed'
   * @param {(string|null)} spec.problemEvent event for a problem state; null when `state` is the normal state
   * @param {string} spec.recoveryEvent event sent when going from a problem back to normal
   * @param {string} spec.eventId names the message and keys edits ("CIBC", "Backup")
   * @param {object} spec.data event data (see notificationMessages)
   * @returns {Promise<{sent: boolean, reason?: string}>}
   */
  _transition({ stateKey, state, problemEvent, recoveryEvent, eventId, data }) {
    return this._serial(async () => {
      try {
        const config = await notificationSettingsService.getConfig();
        if (!config.enabled || !config.configured) return { sent: false, reason: 'off' };

        const states = await this._loadStates();
        const previous = states[stateKey];
        if (previous && previous.state === state) return { sent: false, reason: 'unchanged' };
        const previousIsProblem = Boolean(previous) && previous.state !== 'ok';

        if (!problemEvent) {
          states[stateKey] = { state };
          await this._saveStates(states);
          if (!previousIsProblem) return { sent: false, reason: 'no_problem' };
          if (!config.events.has(toggleFor(recoveryEvent))) return { sent: false, reason: 'event_off' };
          const result = await this._post(config, recoveryEvent,
            { ...data, previousState: previous.state, since: previous.since }, { eventId, update: true });
          return this._outcome(result, recoveryEvent);
        }

        if (!config.events.has(toggleFor(problemEvent))) return { sent: false, reason: 'event_off' };
        // A problem that follows another one edits that message; a new problem after a recovery is a new message
        const result = await this._post(config, problemEvent, { ...data, status: state },
          { eventId, update: previousIsProblem });
        if (!result.ok) return this._outcome(result, problemEvent);
        // Only a delivered message is remembered, so a failed one is retried on the next sync
        states[stateKey] = { state, since: previousIsProblem ? previous.since : new Date().toISOString() };
        await this._saveStates(states);
        return { sent: true };
      } catch (err) {
        logger.warn('Notification failed', { stateKey, state, error: err.message });
        return { sent: false, reason: 'error' };
      }
    });
  }

  /**
   * A bank connection's health after a sync.
   * @param {{id: number, institutionName: string, status: ('ok'|'stale'|'needs_login'|'gone'|'error'),
   *   errorCode?: (string|null), lastSyncedAt?: (string|null), bankUpdatedAt?: (string|null), institutionStatus?: (string|null)}} bank
   */
  reportBankStatus(bank) {
    const problemEvent = bank.status === 'ok' ? null : bank.status === 'stale' ? 'plaid_stale' : 'plaid_needs_attention';
    return this._transition({
      stateKey: `plaid:${bank.id}`,
      state: bank.status,
      problemEvent,
      recoveryEvent: 'plaid_recovered',
      eventId: safeName(bank.institutionName),
      data: bank
    });
  }

  /** @param {{trigger: ('manual'|'scheduled'), error: Error, lastBackup?: (string|null)}} data */
  reportBackupFailed(data) {
    return this._transition({
      stateKey: 'backup', state: 'failed', problemEvent: 'backup_failed', recoveryEvent: 'backup_recovered', eventId: 'Backup', data
    });
  }

  /**
   * A backup completed: ends a failure (edits its message), then announces the backup when that is switched on.
   * @param {{trigger: ('manual'|'scheduled'), filename: string, size: number}} data
   */
  async reportBackupSucceeded(data) {
    await this._transition({
      stateKey: 'backup', state: 'ok', problemEvent: null, recoveryEvent: 'backup_recovered', eventId: 'Backup', data
    });
    return this.notifyOccurrence('backup_succeeded', data, 'Backup');
  }

  /**
   * An event that is sent every time it happens (sync changes, a completed or restored backup).
   * @returns {Promise<{sent: boolean, reason?: string}>}
   */
  notifyOccurrence(eventKey, data, eventId) {
    return this._serial(async () => {
      try {
        const config = await notificationSettingsService.getConfig();
        if (!config.enabled || !config.configured) return { sent: false, reason: 'off' };
        if (!config.events.has(toggleFor(eventKey))) return { sent: false, reason: 'event_off' };
        const result = await this._post(config, eventKey, data, { eventId, update: false });
        return this._outcome(result, eventKey);
      } catch (err) {
        logger.warn('Notification failed', { eventKey, error: err.message });
        return { sent: false, reason: 'error' };
      }
    });
  }
}

module.exports = new NotificationService();
module.exports.NotificationService = NotificationService;

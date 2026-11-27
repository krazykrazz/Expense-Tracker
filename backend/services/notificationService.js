/**
 * Sends the notifications of specs/archive/discord-notifications/spec.md. Failure-type events fire on a state change only:
 * one message when a bank (or the backup) goes bad or changes problem, and one when it recovers. Every message is a
 * new one (in-place edits are deferred; traffic is low). The last notified state is kept in the settings table, so
 * a restart (every deploy) does not announce the same broken bank again. Nothing here ever throws: a notification
 * must not affect the sync or backup that triggered it.
 */
const settingsRepository = require('../repositories/settingsRepository');
const notificationSettingsService = require('./notificationSettingsService');
const notifiarrProvider = require('./notifiarrProvider');
const timeBoundaryService = require('./timeBoundaryService');
const { buildMessage } = require('./notificationMessages');
const { toggleFor, STATE_KEY } = require('./notificationEvents');
const logger = require('../config/logger');

/** A sync error is usually temporary at the bank: it is only announced once it has lasted this long. */
const ERROR_HOLD_MS = 60 * 60 * 1000;
/** Plaid can fetch a bank as rarely as once a day: "not updating" is only announced past this age (the UI uses 12 h). */
const NOTIFY_STALE_AFTER_HOURS = 24;

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

  /** @returns {Promise<{ok: boolean, reason?: string}>} */
  async _post(config, eventKey, data) {
    const timezone = await timeBoundaryService.getBusinessTimezone();
    const message = buildMessage(eventKey, data, { timezone });
    const credentials = { apiKey: config.apiKey, channelId: config.channelId, pingUserId: config.pingUserId };
    return notifiarrProvider.send(credentials, message);
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
   * @param {object} spec.data event data (see notificationMessages)
   * @param {number} [spec.holdMs] only announce the problem once it has been reported for this long
   * @param {number} [spec.now]
   * @returns {Promise<{sent: boolean, reason?: string}>}
   */
  _transition({ stateKey, state, problemEvent, recoveryEvent, data, holdMs = 0, now = Date.now() }) {
    return this._serial(async () => {
      try {
        const config = await notificationSettingsService.getConfig();
        if (!config.enabled || !config.configured) return { sent: false, reason: 'off' };

        const states = await this._loadStates();
        const previous = states[stateKey] || {};
        // A problem being held back that has gone away (or changed) is forgotten
        if (previous.pending && previous.pending.state !== state) {
          delete previous.pending;
          states[stateKey] = previous;
          await this._saveStates(states);
        }
        if (previous.state === state) return { sent: false, reason: 'unchanged' };
        const previousIsProblem = Boolean(previous.state) && previous.state !== 'ok';

        if (!problemEvent) {
          if (!previousIsProblem || !config.events.has(toggleFor(recoveryEvent))) {
            states[stateKey] = { state };
            await this._saveStates(states);
            return { sent: false, reason: previousIsProblem ? 'event_off' : 'no_problem' };
          }
          const result = await this._post(config, recoveryEvent,
            { ...data, previousState: previous.state, since: previous.since });
          // Like a problem, a recovery is only remembered once delivered, so the next report retries it
          if (result.ok) {
            states[stateKey] = { state };
            await this._saveStates(states);
          }
          return this._outcome(result, recoveryEvent);
        }

        let startedAt = previousIsProblem ? previous.since : new Date(now).toISOString();
        if (holdMs > 0) {
          if (!previous.pending) {
            states[stateKey] = { ...previous, pending: { state, since: new Date(now).toISOString() } };
            await this._saveStates(states);
            return { sent: false, reason: 'holding' };
          }
          if (now - Date.parse(previous.pending.since) < holdMs) return { sent: false, reason: 'holding' };
          if (!previousIsProblem) startedAt = previous.pending.since;
        }

        if (!config.events.has(toggleFor(problemEvent))) return { sent: false, reason: 'event_off' };
        const result = await this._post(config, problemEvent, { ...data, status: state });
        if (!result.ok) return this._outcome(result, problemEvent);
        // Only a delivered message is remembered, so a failed one is retried on the next sync
        states[stateKey] = { state, since: startedAt };
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
  async reportBankStatus(bank, now = Date.now()) {
    let status = bank.status;
    // Stale for the UI (12 h) but not yet for a notification: no problem to announce, and a stale bank that got new
    // data within the day counts as recovered
    if (status === 'stale') {
      const updated = Date.parse(bank.bankUpdatedAt);
      if (!Number.isNaN(updated) && now - updated <= NOTIFY_STALE_AFTER_HOURS * 3600 * 1000) status = 'ok';
    }
    const problemEvent = status === 'ok' ? null : status === 'stale' ? 'plaid_stale' : 'plaid_needs_attention';
    return this._transition({
      stateKey: `plaid:${bank.id}`,
      state: status,
      problemEvent,
      recoveryEvent: 'plaid_recovered',
      data: bank,
      holdMs: status === 'error' ? ERROR_HOLD_MS : 0,
      now
    });
  }

  /**
   * A sync that brought new, changed or removed transactions or balance changes.
   * @param {{id: number, institutionName: string}} bank
   * @param {{added: number, updated: number, removed: number, balances?: Array<object>}} changes
   */
  reportSyncChanges(bank, changes) {
    return this.notifyOccurrence('plaid_sync_changes', { ...changes, institutionName: bank.institutionName });
  }

  /**
   * Whether the latest due payment of a loan paid from a bank-imported account is recorded, once its 5-day wait for
   * the bank has passed (loanPaymentBankCheckService). Announced once per loan and month when it isn't, and once
   * more when a later check finds it (or a later month's payment) recorded.
   * @param {{loanId: number, loanName: string, fixedExpenseName: string, amount: number, dueDate: string,
   *   paymentMethodName?: (string|null), recorded: boolean}} payment
   */
  reportLoanPayment(payment, now = Date.now()) {
    return this._transition({
      stateKey: `loan:${payment.loanId}`,
      state: payment.recorded ? 'ok' : `unconfirmed:${payment.dueDate.slice(0, 7)}`,
      problemEvent: payment.recorded ? null : 'loan_payment_unconfirmed',
      recoveryEvent: 'loan_payment_recorded',
      data: payment,
      now
    });
  }

  /** A disconnected bank's state is dropped, so a later connection with the same id starts clean. Never throws. */
  forgetBank(id) {
    return this._serial(async () => {
      try {
        const states = await this._loadStates();
        if (!(`plaid:${id}` in states)) return;
        delete states[`plaid:${id}`];
        await this._saveStates(states);
      } catch (err) {
        logger.warn('Clearing notification state failed', { plaidItemId: id, error: err.message });
      }
    });
  }

  /**
   * Forget every remembered state. After a restore the stored states describe the backup's moment, not now: keeping
   * them would announce recoveries that already happened. A bank that is broken now is announced again. Never throws.
   */
  resetState() {
    return this._serial(async () => {
      try {
        await this._saveStates({});
      } catch (err) {
        logger.warn('Resetting notification state failed', { error: err.message });
      }
    });
  }

  /** @param {{trigger: ('manual'|'scheduled'), error: Error, lastBackup?: (string|null)}} data */
  reportBackupFailed(data) {
    return this._transition({
      stateKey: 'backup', state: 'failed', problemEvent: 'backup_failed', recoveryEvent: 'backup_recovered', data
    });
  }

  /**
   * A backup completed: ends a failure ("recovered"), then announces the backup when that is switched on.
   * @param {{trigger: ('manual'|'scheduled'), filename: string, size: number, backupsKept?: (number|null)}} data
   */
  async reportBackupSucceeded(data) {
    await this._transition({
      stateKey: 'backup', state: 'ok', problemEvent: null, recoveryEvent: 'backup_recovered', data
    });
    return this.notifyOccurrence('backup_succeeded', data);
  }

  /** @param {{filename: string}} data */
  reportBackupRestored(data) {
    return this.notifyOccurrence('backup_restored', data);
  }

  /**
   * An event that is sent every time it happens (sync changes, a completed or restored backup).
   * @returns {Promise<{sent: boolean, reason?: string}>}
   */
  notifyOccurrence(eventKey, data) {
    return this._serial(async () => {
      try {
        const config = await notificationSettingsService.getConfig();
        if (!config.enabled || !config.configured) return { sent: false, reason: 'off' };
        if (!config.events.has(toggleFor(eventKey))) return { sent: false, reason: 'event_off' };
        const result = await this._post(config, eventKey, data);
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
module.exports.ERROR_HOLD_MS = ERROR_HOLD_MS;
module.exports.NOTIFY_STALE_AFTER_HOURS = NOTIFY_STALE_AFTER_HOURS;

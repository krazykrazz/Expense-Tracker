const plaidBackfillRepository = require('../repositories/plaidBackfillRepository');
const plaidBalanceCheckRepository = require('../repositories/plaidBalanceCheckRepository');
const settingsRepository = require('../repositories/settingsRepository');
const activityLogService = require('./activityLogService');
const { postedDateChange, estimatedPostedDate } = require('./plaidInboxSupport');
const { plaidClient, plaidErrorOf } = require('./plaidConnectionSupport');
const { shiftDate } = require('../utils/plaidMatching');
const { getTodayString } = require('../utils/dateUtils');
const logger = require('../config/logger');

/** Banks (plaid_items ids, JSON array) whose rows staged before 1.28.0 have been given Plaid's category and details. */
const CAPTURE_DONE_KEY = 'plaid_capture_backfill_done';
/** '1' once linked card expenses without a posted date have been given one. */
const POSTED_DONE_KEY = 'plaid_posted_date_backfill_done';
/** How far back a bank's older rows are looked up; Plaid's own history is the limit beyond that. */
const CAPTURE_MAX_DAYS = 90;
const PAGE_SIZE = 500;

/**
 * One-off backfills of data that earlier versions did not keep, run after a bank sync so nothing happens while
 * Plaid is off. Each is gated by a setting and only fills empty values (principle 3):
 * - spec 2.1: Plaid's category and other fields on rows still to review or ignored (`/transactions/get`, read-only);
 * - spec 2.5.7: the posted date of credit card expenses linked to a settled bank transaction.
 */
class PlaidBackfillService {
  constructor() {
    this._running = false;
    // Banks whose lookup failed in this process: not retried until a restart (no hammering Plaid every sync)
    this._failed = new Set();
    // Same for the posted-date backfill: a failure is retried after a restart, not on every sync
    this._postedDatesFailed = false;
  }

  /**
   * Run whatever is still due. Never throws: a failure only leaves that step for a restart; the other step still runs.
   * @param {{id: number, institutionName: string}} item the bank that was just synced
   * @param {string} accessToken
   */
  async afterSync(item, accessToken) {
    if (this._running) return;
    this._running = true;
    try {
      if (!this._postedDatesFailed) {
        try {
          await this.backfillPostedDates();
        } catch (err) {
          this._postedDatesFailed = true;
          logger.warn('Backfilling posted dates failed; will retry after a restart', { error: err.message });
        }
      }
      try {
        await this.backfillCapture(item, accessToken);
      } catch (err) {
        logger.warn('Backfilling Plaid transaction details failed', { plaidItemId: item.id, error: plaidErrorOf(err)?.error_code ?? err.message });
      }
    } finally {
      this._running = false;
    }
  }

  async _doneItems() {
    try {
      const ids = JSON.parse(await settingsRepository.getSetting(CAPTURE_DONE_KEY) || '[]');
      return new Set(Array.isArray(ids) ? ids : []);
    } catch {
      return new Set();
    }
  }

  /**
   * Fill Plaid's category and the other captured fields of a bank's rows staged before they were kept (spec 2.1),
   * then move rows to the Inbox tab their category gives them. Nothing is asked of Plaid when the bank has no such rows.
   * @returns {Promise<{filled: number, moved: number}|null>} null when nothing was due
   */
  async backfillCapture(item, accessToken, today = getTodayString()) {
    const done = await this._doneItems();
    if (done.has(item.id) || this._failed.has(item.id)) return null;

    let result = { filled: 0, moved: 0 };
    try {
      const rows = await plaidBackfillRepository.findCaptureCandidates(item.id);
      if (rows.length > 0) {
        const oldest = rows.map(row => row.date).sort()[0];
        const startDate = [oldest, shiftDate(today, -CAPTURE_MAX_DAYS)].sort().pop();
        const wanted = new Set(rows.map(row => row.transactionId));
        const found = [];
        for (let offset = 0; ;) {
          const { data } = await plaidClient().transactionsGet({
            access_token: accessToken, start_date: startDate, end_date: today,
            options: { count: PAGE_SIZE, offset, include_original_description: true }
          });
          found.push(...data.transactions.filter(txn => wanted.has(txn.transaction_id)));
          offset += data.transactions.length;
          if (data.transactions.length === 0 || offset >= data.total_transactions) break;
        }
        result = await plaidBackfillRepository.applyCapture(item.id, found);
      }
    } catch (err) {
      this._failed.add(item.id);
      logger.warn('Backfilling Plaid transaction details failed; will retry after a restart', {
        plaidItemId: item.id, errorCode: plaidErrorOf(err)?.error_code ?? err.message
      });
      return null;
    }

    done.add(item.id);
    await settingsRepository.setSetting(CAPTURE_DONE_KEY, JSON.stringify([...done]));
    logger.info('Backfilled Plaid transaction details', { plaidItemId: item.id, ...result });
    if (result.filled > 0) {
      await activityLogService.logEvent(
        'plaid_data_backfilled',
        'plaid_transaction',
        null,
        `Filled in Plaid's category and details for ${result.filled} earlier ${item.institutionName} transaction${result.filled === 1 ? '' : 's'}`
          + (result.moved > 0 ? `; ${result.moved} moved to Not expenses` : ''),
        { institutionName: item.institutionName, ...result }
      );
    }
    return result;
  }

  /**
   * Give credit card expenses linked to a settled bank transaction the posted date they lack (spec 2.5.7), by the
   * rules a settlement uses: the bank's date when the bank reports real posting dates, else the expense form's
   * estimate (next business day, never after today). A posted date already set is never replaced.
   * @returns {Promise<{changed: number}|null>} null when it had already run
   */
  async backfillPostedDates(today = getTodayString()) {
    if (await settingsRepository.getSetting(POSTED_DONE_KEY) === '1') return null;

    const rows = await plaidBackfillRepository.findLinkedCardExpensesWithoutPostedDate();
    const realDates = new Map();
    const changes = [];
    for (const row of rows) {
      if (!row.plaidAccountId) continue;
      if (!realDates.has(row.plaidAccountId)) {
        realDates.set(row.plaidAccountId, await plaidBalanceCheckRepository.bankReportsPostingDates(row.plaidAccountId));
      }
      const expense = { date: row.date, posted_date: null };
      const change = realDates.get(row.plaidAccountId) ? postedDateChange(expense, row.bankDate, true) : estimatedPostedDate(expense, today);
      if (change && change.posted_date) changes.push({ id: row.id, postedDate: change.posted_date });
    }

    const changed = await plaidBackfillRepository.fillPostedDates(changes);
    await settingsRepository.setSetting(POSTED_DONE_KEY, '1');
    logger.info('Backfilled posted dates of linked card expenses', { checked: rows.length, changed });
    if (changed > 0) {
      await activityLogService.logEvent(
        'plaid_posted_dates_backfilled',
        'expense',
        null,
        `Filled in the posted date of ${changed} credit card expense${changed === 1 ? '' : 's'} linked to bank transactions`,
        { changed, expenseIds: changes.map(change => change.id) }
      );
    }
    return { changed };
  }
}

module.exports = new PlaidBackfillService();

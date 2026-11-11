const plaidConfig = require('../config/plaid');
const plaidRepository = require('../repositories/plaidRepository');
const plaidSyncRepository = require('../repositories/plaidSyncRepository');
const activityLogService = require('./activityLogService');
const plaidSettlementService = require('./plaidSettlementService');
const plaidCardBalanceService = require('./plaidCardBalanceService');
const { runWithTabId } = require('../utils/requestContext');
const { decrypt } = require('../utils/tokenCrypto');
const logger = require('../config/logger');
const { fail } = require('../utils/httpError');
const { NEEDS_USER_CODES, plaidErrorOf, toServiceError, plaidClient } = require('./plaidConnectionSupport');

const MAX_SYNC_RESTARTS = 3;
const SYNC_PAGE_SIZE = 500;

/** SQLite CURRENT_TIMESTAMP ('YYYY-MM-DD HH:MM:SS', UTC) → epoch ms; 0 when missing. */
const sqliteUtcMs = (value) => {
  const ms = value ? Date.parse(`${value.replace(' ', 'T')}Z`) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * Transaction sync: pulling each bank's changes from Plaid (manually, on a schedule, or when the app opens),
 * refreshing balances and connection health, and logging what a sync brought.
 */
class PlaidSyncService {
  constructor() {
    this._syncing = new Set();
    // Last sync attempt per bank (success or failure), so automatic sync doesn't retry a failing bank every tick
    this._lastAttemptAt = new Map();
  }

  /** Forget a bank's last attempt (it was reconnected or removed), so automatic sync picks it up again. */
  clearAttempt(id) {
    this._lastAttemptAt.delete(id);
  }

  /**
   * Pull all changes since the stored cursor and apply them atomically.
   * Pending transactions are staged; when they settle, linked expenses are brought in line (applySettlements).
   * A sync that brought anything (transactions, re-attached rows, a changed balance) is logged once, per bank.
   * @param {'manual'|'scheduled'|'on_open'|'login'} [source]
   */
  async syncItem(id, source = 'manual') {
    if (this._syncing.has(id)) {
      throw fail('A sync is already running for this bank', 409);
    }
    this._syncing.add(id);
    try {
      const item = await plaidRepository.findItemWithTokenById(id);
      if (!item) {
        throw fail('Bank connection not found', 404);
      }
      const { environment } = plaidConfig.getPlaidConfig();
      if (item.environment !== environment) {
        throw fail(`${item.institutionName} was connected in ${item.environment}; Plaid is now set to ${environment}. Disconnect it and connect again.`, 409);
      }
      const accessToken = decrypt(item.accessTokenEnc);
      const balancesBefore = await plaidRepository.findMappedAccountBalances(id);

      for (let attempt = 0; ; attempt++) {
        try {
          const batch = await this._fetchAllPages(accessToken, item.syncCursor);
          const { settlements, ...counts } = await plaidSyncRepository.applySyncBatch(id, batch);
          const balancesFresh = await this._refreshBalances(id, accessToken);
          await this._refreshHealth(id, accessToken);
          const balanceChanges = await this._balanceChanges(id, balancesBefore);
          // Automatic sync runs every 30 minutes per bank: only a sync that changed something is worth an info line
          const changed = counts.added + counts.updated + counts.removed + counts.reattached + counts.fromFile
            + settlements.length + balanceChanges.length > 0;
          logger[changed ? 'info' : 'debug']('Plaid sync completed', {
            plaidItemId: id, ...counts, settled: settlements.length, balancesChanged: balanceChanges.length
          });
          await this._logSync(item, source, counts, balanceChanges);
          if (settlements.length > 0) {
            // After the batch is committed: expense updates go through expenseService (validation, card balance, log),
            // outside any request's tab context so every tab (including one that pressed Sync now) refreshes
            await runWithTabId(null, () => plaidSettlementService.applySettlements(settlements));
          }
          // Only against a balance fetched just now: an old one would settle the wrong charges, irreversibly
          if (balancesFresh) await this._settleFromBalance(id);
          return { id, institutionName: item.institutionName, ...counts, updateStatus: batch.updateStatus };
        } catch (err) {
          const code = plaidErrorOf(err)?.error_code;
          if (code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' && attempt < MAX_SYNC_RESTARTS) {
            logger.debug('Plaid data changed during pagination; restarting sync', { plaidItemId: id, attempt });
            continue;
          }
          if (code) {
            await plaidRepository.setItemError(id, code);
            logger.warn('Plaid sync failed', { plaidItemId: id, errorCode: code });
            // Only when the bank goes into error, not on every retry of a bank that is already failing
            if (item.lastError !== code) {
              await activityLogService.logEvent(
                'plaid_sync_failed',
                'plaid_item',
                id,
                `Bank sync failed for ${item.institutionName}: ${code}`,
                { institutionName: item.institutionName, errorCode: code }
              );
            }
          }
          throw toServiceError(err, 'sync');
        }
      }
    } finally {
      this._syncing.delete(id);
    }
  }

  /**
   * Pending charges the fresh card balance shows have posted, on banks that don't flag pending charges
   * through Plaid (see plaidCardBalanceService.settleFromBalance). Never fails the sync.
   */
  async _settleFromBalance(id) {
    try {
      const settlements = await plaidCardBalanceService.settleFromBalance(id);
      if (settlements.length > 0) {
        logger.info('Pending charges settled from the bank balance', { plaidItemId: id, settled: settlements.length });
        await runWithTabId(null, () => plaidSettlementService.applySettlements(settlements));
      }
    } catch (err) {
      logger.warn('Settling pending charges from the bank balance failed', { plaidItemId: id, error: err.message });
    }
  }

  /**
   * Store every account's balances after a sync. /transactions/sync only lists accounts that had transactions
   * in the response, so a quiet sync carries no balances; /accounts/get returns Plaid's cached balances for
   * all of them (free, unlike /accounts/balance/get). A failure only leaves the previous balances in place.
   * @returns {Promise<boolean>} whether the balances were refreshed
   */
  async _refreshBalances(id, accessToken) {
    try {
      const { data } = await plaidClient().accountsGet({ access_token: accessToken });
      for (const account of data.accounts || []) {
        await plaidRepository.upsertAccount(id, account);
      }
      return true;
    } catch (err) {
      logger.warn('Plaid balance refresh failed', { plaidItemId: id, errorCode: plaidErrorOf(err)?.error_code ?? err.message });
      return false;
    }
  }

  /**
   * Balances that changed during a sync, for accounts that import into a payment method: the current balance,
   * or the available credit when only that moved (a CIBC pending charge).
   * @param {Array<object>} before findMappedAccountBalances taken when the sync started
   * @returns {Promise<Array<{name: string, mask: (string|null), field: 'balance'|'available', from: number, to: number}>>}
   */
  async _balanceChanges(id, before) {
    const previous = new Map(before.map(a => [a.accountId, a]));
    const cents = (n) => (n == null ? null : Math.round(n * 100));
    const changes = [];
    for (const after of await plaidRepository.findMappedAccountBalances(id)) {
      const prev = previous.get(after.accountId);
      if (!prev || after.currentBalance == null) continue;
      const base = { name: after.name, mask: after.mask ?? null };
      if (cents(prev.currentBalance) !== cents(after.currentBalance)) {
        changes.push({ ...base, field: 'balance', from: prev.currentBalance, to: after.currentBalance });
      } else if (after.availableBalance != null && cents(prev.availableBalance) !== cents(after.availableBalance)) {
        changes.push({ ...base, field: 'available', from: prev.availableBalance, to: after.availableBalance });
      }
    }
    return changes;
  }

  /**
   * Record when Plaid last fetched from the bank (/item/get) and Plaid's status for the institution
   * (/institutions/get_by_id; both free). A sync only says our side works: when Plaid itself can't get data
   * from the bank, the sync succeeds with nothing new, so this is what reveals a stuck connection.
   * Failures leave the previous values and never fail the sync.
   */
  async _refreshHealth(id, accessToken) {
    let institutionId = null;
    try {
      const { data } = await plaidClient().itemGet({ access_token: accessToken });
      const updates = (data.status && data.status.transactions) || {};
      institutionId = (data.item && data.item.institution_id) || null;
      await plaidRepository.setItemHealth(id, {
        bankUpdatedAt: updates.last_successful_update || null,
        bankUpdateFailedAt: updates.last_failed_update || null
      });
    } catch (err) {
      logger.warn('Plaid item status check failed', { plaidItemId: id, errorCode: plaidErrorOf(err)?.error_code ?? err.message });
      return;
    }
    if (!institutionId) return;
    try {
      const { data } = await plaidClient().institutionsGetById({
        institution_id: institutionId,
        country_codes: plaidConfig.COUNTRY_CODES,
        options: { include_status: true }
      });
      const updates = data.institution && data.institution.status && data.institution.status.transactions_updates;
      await plaidRepository.setItemHealth(id, {
        institutionStatus: (updates && updates.status) || null,
        institutionStatusSince: (updates && updates.last_status_change) || null
      });
    } catch (err) {
      logger.warn('Plaid institution status check failed', { plaidItemId: id, errorCode: plaidErrorOf(err)?.error_code ?? err.message });
    }
  }

  async _fetchAllPages(accessToken, startCursor) {
    const accounts = new Map();
    const upserts = [];
    const removedIds = [];
    let cursor = startCursor || undefined;
    let hasMore = true;
    let updateStatus = null;

    while (hasMore) {
      const { data } = await plaidClient().transactionsSync({ access_token: accessToken, cursor, count: SYNC_PAGE_SIZE });
      for (const account of data.accounts || []) accounts.set(account.account_id, account);
      // Pending transactions are staged too (shown as Pending; they settle in place, see applySyncBatch)
      upserts.push(...data.added, ...data.modified);
      for (const removed of data.removed) removedIds.push(removed.transaction_id);
      cursor = data.next_cursor;
      hasMore = data.has_more;
      updateStatus = data.transactions_update_status || updateStatus;
    }

    return { accounts: [...accounts.values()], upserts, removedIds, cursor, updateStatus };
  }

  /**
   * Sync every connected bank; one failing bank does not stop the others.
   */
  async syncAll() {
    const items = await plaidRepository.findAllItems();
    const results = [];
    for (const item of items) {
      this._lastAttemptAt.set(item.id, Date.now());
      try {
        results.push(await this.syncItem(item.id, 'manual'));
      } catch (err) {
        results.push({ id: item.id, institutionName: item.institutionName, error: err.message });
      }
    }
    const totals = results.reduce(
      (sum, r) => ({ added: sum.added + (r.added || 0), updated: sum.updated + (r.updated || 0), removed: sum.removed + (r.removed || 0) }),
      { added: 0, updated: 0, removed: 0 }
    );
    return { results, totals };
  }

  /**
   * Banks due for an automatic sync: connected in the current environment, not waiting for the user
   * (expired login, removed at the bank), and neither synced nor attempted in the last `maxAgeMinutes`.
   */
  async findStaleItems(maxAgeMinutes, now = Date.now()) {
    const { environment } = plaidConfig.getPlaidConfig();
    const cutoff = now - maxAgeMinutes * 60 * 1000;
    const items = await plaidRepository.findAllItems();
    return items.filter(item => item.environment === environment
      && !NEEDS_USER_CODES.has(item.lastError)
      && Math.max(sqliteUtcMs(item.lastSyncedAt), this._lastAttemptAt.get(item.id) || 0) <= cutoff);
  }

  /**
   * Automatic sync (scheduled, or when the app is opened) of the given banks, one at a time. Never throws:
   * failures are recorded on the bank (`last_error`) by syncItem and shown on the Connections tab.
   * @param {Array<{id: number}>} items
   * @param {'scheduled'|'on_open'} source
   */
  async syncItems(items, source) {
    const totals = { added: 0, updated: 0, removed: 0 };
    let synced = 0;
    for (const item of items) {
      this._lastAttemptAt.set(item.id, Date.now());
      try {
        const result = await this.syncItem(item.id, source);
        totals.added += result.added;
        totals.updated += result.updated;
        totals.removed += result.removed;
        synced++;
      } catch (err) {
        if (err.statusCode !== 409) {
          logger.warn('Automatic Plaid sync failed', { plaidItemId: item.id, source, error: err.message });
        }
      }
    }
    return { synced, totals };
  }

  /**
   * Log a sync that brought anything, so the activity log shows it and other tabs refresh: new, updated,
   * removed and re-attached transactions, and changed balances of accounts that import into a payment method.
   * Syncs that brought nothing are not logged.
   */
  async _logSync(item, source, { added = 0, updated = 0, removed = 0, reattached = 0 }, balanceChanges) {
    if (added + updated + removed + reattached === 0 && balanceChanges.length === 0) return;
    const money = (n) => `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const parts = [];
    const counts = [[added, 'new'], [updated, 'updated'], [removed, 'removed'], [reattached, 're-attached']]
      .filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
    if (counts.length > 0) parts.push(counts.join(', '));
    for (const change of balanceChanges) {
      const account = `${change.name}${change.mask ? ` ••${change.mask}` : ''}`;
      parts.push(`${account} ${change.field === 'available' ? 'available credit' : 'balance'} ${money(change.from)} → ${money(change.to)}`);
    }
    await activityLogService.logEvent(
      'plaid_sync_completed',
      'plaid_transaction',
      null,
      `Bank sync (${source.replace('_', ' ')}) ${item.institutionName}: ${parts.join('; ')}`,
      { source, institutionName: item.institutionName, added, updated, removed, reattached, balances: balanceChanges }
    );
  }
}

module.exports = new PlaidSyncService();

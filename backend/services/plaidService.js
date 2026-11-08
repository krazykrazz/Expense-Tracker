const { Products } = require('plaid');
const plaidConfig = require('../config/plaid');
const plaidRepository = require('../repositories/plaidRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const settingsRepository = require('../repositories/settingsRepository');
const activityLogService = require('./activityLogService');
const plaidInboxService = require('./plaidInboxService');
const plaidCardBalanceService = require('./plaidCardBalanceService');
const { runWithTabId } = require('../utils/requestContext');
const { encrypt, decrypt } = require('../utils/tokenCrypto');
const { isBankDataStale } = require('../utils/plaidFreshness');
const logger = require('../config/logger');

const PRODUCTION_ITEMS_KEY = 'plaid_production_items_created';
const MAX_SYNC_RESTARTS = 3;
const SYNC_PAGE_SIZE = 500;
const GONE_ITEM_CODES = new Set(['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN']);
/** Errors the user fixes by logging in to the bank again (Reconnect, Plaid update mode). */
const LOGIN_CODES = new Set(['ITEM_LOGIN_REQUIRED', 'INVALID_CREDENTIALS', 'INVALID_MFA', 'USER_SETUP_REQUIRED', 'PENDING_DISCONNECT']);
/** Errors only the user can fix (log in again, or the connection is gone): automatic sync skips these banks. */
const NEEDS_USER_CODES = new Set([...LOGIN_CODES, ...GONE_ITEM_CODES]);

/**
 * A bank connection's health, from its last sync error and when Plaid last fetched from the bank:
 * 'ok', 'needs_login' (Reconnect fixes it without a new Trial connection), 'gone' (removed at the bank or
 * token rejected: disconnect), 'error' (anything else; usually temporary, retried automatically), or 'stale'
 * (our syncs work, but Plaid has had no new data from the bank for STALE_AFTER_HOURS; nothing to do but wait).
 * @param {{lastError: (string|null), bankUpdatedAt?: (string|null)}} item
 * @param {number} [now]
 */
function connectionStatus(item, now = Date.now()) {
  if (item.lastError) {
    if (LOGIN_CODES.has(item.lastError)) return 'needs_login';
    if (GONE_ITEM_CODES.has(item.lastError)) return 'gone';
    return 'error';
  }
  return isBankDataStale(item.bankUpdatedAt, now) ? 'stale' : 'ok';
}

/** SQLite CURRENT_TIMESTAMP ('YYYY-MM-DD HH:MM:SS', UTC) → epoch ms; 0 when missing. */
const sqliteUtcMs = (value) => {
  const ms = value ? Date.parse(`${value.replace(' ', 'T')}Z`) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
};

const fail = (message, statusCode, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });

/** Plaid API errors arrive as axios errors; never log the raw error (its config carries the secret). */
function plaidErrorOf(err) {
  const data = err && err.response && err.response.data;
  return data && data.error_code ? data : null;
}

function toServiceError(err, action) {
  const plaidError = plaidErrorOf(err);
  if (!plaidError) return err;
  let message = `Plaid ${action} failed: ${plaidError.error_message || plaidError.error_code}`;
  if (LOGIN_CODES.has(plaidError.error_code)) {
    // Never suggest disconnecting: reconnecting from scratch uses a new Trial connection and duplicates history
    message = 'The bank needs you to log in again. Use Reconnect on the Connections tab (no new Trial connection is used).';
  }
  return fail(message, 502, { plaidErrorCode: plaidError.error_code });
}

/**
 * Plaid connectivity: Link tokens, connecting/disconnecting banks, account mapping and transaction sync.
 */
class PlaidService {
  constructor() {
    this._syncing = new Set();
    // Last sync attempt per bank (success or failure), so automatic sync doesn't retry a failing bank every tick
    this._lastAttemptAt = new Map();
  }

  _client() {
    return plaidConfig.getPlaidClient();
  }

  async _productionItemsCreated() {
    const [stored, current] = await Promise.all([
      settingsRepository.getSetting(PRODUCTION_ITEMS_KEY),
      plaidRepository.countItemsByEnvironment('production')
    ]);
    return Math.max(parseInt(stored, 10) || 0, current);
  }

  /**
   * @returns {Promise<{enabled: boolean, environment?: string, trial?: {limit: number, used: number}|null,
   *   toReview?: number,
   *   needsAttention?: Array<{id: number, institutionName: string, status: string}>,
   *   staleData?: Array<{id: number, institutionName: string, bankUpdatedAt: string, institutionStatus: (string|null)}>}>}
   *   toReview is the number of rows waiting in the Inbox, for the header badge; needsAttention lists the banks
   *   the user has to act on (log in again, or removed at the bank), for the header
   *   dot and main-screen banner; staleData the banks Plaid has had no new data from for hours (amber header dot)
   */
  async getStatus() {
    const config = plaidConfig.getPlaidConfig();
    if (!config.enabled) {
      return { enabled: false, source: config.source };
    }
    const [trial, items, toReview] = await Promise.all([
      config.environment === 'production'
        ? this._productionItemsCreated().then(used => ({ limit: plaidConfig.TRIAL_ITEM_LIMIT, used }))
        : null,
      plaidRepository.findAllItems(),
      plaidRepository.countToReview()
    ]);
    const current = items
      .filter(item => item.environment === config.environment)
      .map(item => ({ item, status: connectionStatus(item) }));
    const needsAttention = current
      .filter(({ status }) => status === 'needs_login' || status === 'gone')
      .map(({ item, status }) => ({ id: item.id, institutionName: item.institutionName, status }));
    const staleData = current
      .filter(({ status }) => status === 'stale')
      .map(({ item }) => ({
        id: item.id, institutionName: item.institutionName, bankUpdatedAt: item.bankUpdatedAt,
        institutionStatus: item.institutionStatus || null
      }));
    return { enabled: true, source: config.source, environment: config.environment, trial, toReview, needsAttention, staleData };
  }

  /**
   * A Link token to connect a new bank, or with `itemId` to repair an existing connection (Plaid update mode:
   * the user logs in again; same connection, no new Trial slot, sync cursor kept).
   */
  async createLinkToken({ itemId } = {}) {
    const request = {
      user: { client_user_id: 'expense-tracker-household' },
      client_name: 'Expense Tracker',
      country_codes: plaidConfig.COUNTRY_CODES,
      language: 'en'
    };
    if (itemId !== undefined && itemId !== null) {
      request.access_token = await this._accessTokenFor(itemId);
    } else {
      request.products = [Products.Transactions];
      request.transactions = { days_requested: plaidConfig.DAYS_REQUESTED };
    }
    try {
      const { data } = await this._client().linkTokenCreate(request);
      return { linkToken: data.link_token, expiration: data.expiration };
    } catch (err) {
      throw toServiceError(err, 'link token creation');
    }
  }

  /** Decrypted access token of a bank connected in the current environment. */
  async _accessTokenFor(id) {
    const item = await plaidRepository.findItemWithTokenById(parseInt(id, 10));
    if (!item) {
      throw fail('Bank connection not found', 404);
    }
    const { environment } = plaidConfig.getPlaidConfig();
    if (item.environment !== environment) {
      throw fail(`${item.institutionName} was connected in ${item.environment}; Plaid is now set to ${environment}.`, 409);
    }
    return decrypt(item.accessTokenEnc);
  }

  /**
   * Ask Plaid to fetch new transactions from the bank now (/transactions/refresh), for a bank whose data is
   * stale. Some banks (CIBC) refuse a fetch without a fresh login, even right after one: Plaid then reports
   * ITEM_LOGIN_REQUIRED, the item is marked as needing a login, and the caller opens Link update mode. A login
   * on an item in that state is what makes Plaid fetch; a login on an item Plaid considers healthy doesn't.
   * @returns {Promise<{status: 'refreshing'|'needs_login', item: object}>} refreshing: new transactions arrive
   *   in a later sync, once Plaid has fetched them
   */
  async requestRefresh(id) {
    const item = await plaidRepository.findItemById(parseInt(id, 10));
    if (!item) {
      throw fail('Bank connection not found', 404);
    }
    const accessToken = await this._accessTokenFor(item.id);
    try {
      await this._client().transactionsRefresh({ access_token: accessToken });
      logger.info('Plaid refresh requested', { plaidItemId: item.id });
      return { status: 'refreshing', item: await this.getItem(item.id) };
    } catch (err) {
      const code = plaidErrorOf(err)?.error_code;
      if (!LOGIN_CODES.has(code)) {
        throw toServiceError(err, 'refresh');
      }
      // Expected for banks that only update during a login: no activity log entry (the login that follows logs)
      await plaidRepository.setItemError(item.id, code);
      return { status: 'needs_login', item: await this.getItem(item.id) };
    }
  }

  /**
   * After the user logged in again through Link update mode. There is no public token to exchange: the
   * connection (and its access token) is unchanged. Clears the error, logs it, and syncs straight away.
   */
  async markReconnected(id) {
    const item = await plaidRepository.findItemById(parseInt(id, 10));
    if (!item) {
      throw fail('Bank connection not found', 404);
    }
    const { environment } = plaidConfig.getPlaidConfig();
    if (item.environment !== environment) {
      throw fail(`${item.institutionName} was connected in ${item.environment}; Plaid is now set to ${environment}.`, 409);
    }
    await plaidRepository.setItemError(item.id, null);
    this._lastAttemptAt.delete(item.id);
    await activityLogService.logEvent(
      'plaid_item_updated',
      'plaid_item',
      item.id,
      item.lastError ? `Reconnected bank: ${item.institutionName}` : `Logged in to bank again: ${item.institutionName}`,
      { institutionName: item.institutionName, previousError: item.lastError }
    );
    let sync = null;
    try {
      sync = await this.syncItem(item.id, 'login');
    } catch (err) {
      sync = { error: err.message };
    }
    return { item: await this.getItem(item.id), sync };
  }

  /**
   * Exchange the public token from Plaid Link, store the item (token encrypted) and its accounts.
   */
  async connectItem({ publicToken, institutionName } = {}) {
    if (typeof publicToken !== 'string' || !publicToken.trim()) {
      throw fail('publicToken is required', 400);
    }
    const { environment } = plaidConfig.getPlaidConfig();
    const client = this._client();

    // Make sure the token can be stored *before* Plaid creates the Item (and, in Production,
    // consumes a Trial slot); otherwise a key-file failure would leave a live, untracked Item
    try {
      if (!plaidConfig.getTokenKey({ create: true })) throw new Error('no key');
    } catch (err) {
      logger.error('Plaid encryption key unavailable; refusing to connect', { error: err.message });
      throw fail('Bank connections cannot be stored: the Plaid encryption key is unavailable (check PLAID_TOKEN_KEY or that /config/secrets is writable).', 500);
    }

    let accessToken;
    let itemId;
    try {
      const { data } = await client.itemPublicTokenExchange({ public_token: publicToken });
      accessToken = data.access_token;
      itemId = data.item_id;
    } catch (err) {
      throw toServiceError(err, 'token exchange');
    }

    // The Trial slot is consumed at this point, so record it before anything else can fail
    if (environment === 'production') {
      const used = await this._productionItemsCreated();
      await settingsRepository.setSetting(PRODUCTION_ITEMS_KEY, String(used + 1));
    }

    const name = (typeof institutionName === 'string' && institutionName.trim()) || 'Unknown institution';
    let item;
    try {
      item = await plaidRepository.createItem({
        itemId,
        institutionName: name.slice(0, 200),
        accessTokenEnc: encrypt(accessToken),
        environment
      });
    } catch (err) {
      // Don't leave a live Item at Plaid that this app has no record of
      logger.error('Storing new Plaid connection failed; removing it at Plaid', { error: err.message });
      await client.itemRemove({ access_token: accessToken }).catch((removeErr) => {
        logger.error('Removing orphaned Plaid connection failed', { errorCode: plaidErrorOf(removeErr)?.error_code });
      });
      throw err;
    }

    try {
      const { data } = await client.accountsGet({ access_token: accessToken });
      for (const account of data.accounts) {
        await plaidRepository.upsertAccount(item.id, account);
      }
    } catch (err) {
      // Accounts are also delivered by the first sync, so a failure here is recoverable
      logger.warn('Plaid accounts fetch failed after connecting', { plaidItemId: item.id, errorCode: plaidErrorOf(err)?.error_code });
    }

    await activityLogService.logEvent(
      'plaid_item_added',
      'plaid_item',
      item.id,
      `Connected bank: ${item.institutionName}`,
      { institutionName: item.institutionName, environment }
    );

    return this.getItem(item.id);
  }

  async getItem(id) {
    const item = await plaidRepository.findItemById(id);
    if (!item) return null;
    const accounts = await plaidRepository.findAccountsByItemIds([id]);
    return { ...item, status: connectionStatus(item), accounts };
  }

  async listItems() {
    const items = await plaidRepository.findAllItems();
    const accounts = await plaidRepository.findAccountsByItemIds(items.map(item => item.id));
    return items.map(item => ({
      ...item,
      status: connectionStatus(item),
      accounts: accounts.filter(account => account.plaidItemId === item.id)
    }));
  }

  /**
   * Map a bank account to a payment method (null = don't import).
   */
  async updateAccountMapping(accountId, paymentMethodId) {
    const account = await plaidRepository.findAccountById(accountId);
    if (!account) {
      throw fail('Bank account not found', 404);
    }

    let mappedId = null;
    let paymentMethod = null;
    if (paymentMethodId !== null && paymentMethodId !== undefined && paymentMethodId !== '') {
      mappedId = parseInt(paymentMethodId, 10);
      paymentMethod = Number.isNaN(mappedId) ? null : await paymentMethodRepository.findById(mappedId);
      if (!paymentMethod || !paymentMethod.is_active) {
        throw fail('Payment method not found or inactive', 400);
      }
    }

    const updated = await plaidRepository.updateAccountPaymentMethod(accountId, mappedId);
    if ((account.paymentMethodId ?? null) !== mappedId) {
      const label = `"${account.name}${account.mask ? ` ••${account.mask}` : ''}"`;
      await activityLogService.logEvent(
        'plaid_account_updated',
        'plaid_account',
        account.id,
        paymentMethod ? `Bank account ${label} now imports into ${paymentMethod.display_name}` : `Bank account ${label} set to Don't import`,
        { accountName: account.name, mask: account.mask, paymentMethodId: mappedId, paymentMethodName: paymentMethod ? paymentMethod.display_name : null }
      );
    }
    return updated;
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
          const { settlements, ...counts } = await plaidRepository.applySyncBatch(id, batch);
          logger.info('Plaid sync completed', { plaidItemId: id, ...counts, settled: settlements.length });
          const balancesFresh = await this._refreshBalances(id, accessToken);
          await this._refreshHealth(id, accessToken);
          await this._logSync(item, source, counts, await this._balanceChanges(id, balancesBefore));
          if (settlements.length > 0) {
            // After the batch is committed: expense updates go through expenseService (validation, card balance, log),
            // outside any request's tab context so every tab (including one that pressed Sync now) refreshes
            await runWithTabId(null, () => plaidInboxService.applySettlements(settlements));
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
        await runWithTabId(null, () => plaidInboxService.applySettlements(settlements));
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
      const { data } = await this._client().accountsGet({ access_token: accessToken });
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
      const { data } = await this._client().itemGet({ access_token: accessToken });
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
      const { data } = await this._client().institutionsGetById({
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
      const { data } = await this._client().transactionsSync({ access_token: accessToken, cursor, count: SYNC_PAGE_SIZE });
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

  /**
   * Remove the item at Plaid and locally. Expenses already created from it are kept.
   */
  async disconnectItem(id) {
    const item = await plaidRepository.findItemWithTokenById(id);
    if (!item) {
      throw fail('Bank connection not found', 404);
    }

    let accessToken = null;
    // A token only works against the environment it was created in
    if (item.environment === plaidConfig.getPlaidConfig().environment) {
      try {
        accessToken = decrypt(item.accessTokenEnc);
      } catch (err) {
        logger.warn('Plaid token unreadable; removing the connection locally only', { plaidItemId: id });
      }
    } else {
      logger.warn('Plaid connection belongs to another environment; removing it locally only', { plaidItemId: id, itemEnvironment: item.environment });
    }

    if (accessToken) {
      try {
        await this._client().itemRemove({ access_token: accessToken });
      } catch (err) {
        const code = plaidErrorOf(err)?.error_code;
        if (!GONE_ITEM_CODES.has(code)) {
          throw toServiceError(err, 'disconnect');
        }
      }
    }

    const removedRows = await plaidRepository.deleteItemWithUnreviewed(id);
    this._lastAttemptAt.delete(id);

    await activityLogService.logEvent(
      'plaid_item_deleted',
      'plaid_item',
      id,
      `Disconnected bank: ${item.institutionName}`,
      { institutionName: item.institutionName, removedUnreviewed: removedRows }
    );
  }
}

module.exports = new PlaidService();

const { Products } = require('plaid');
const plaidConfig = require('../config/plaid');
const plaidRepository = require('../repositories/plaidRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const settingsRepository = require('../repositories/settingsRepository');
const activityLogService = require('./activityLogService');
const { encrypt, decrypt } = require('../utils/tokenCrypto');
const logger = require('../config/logger');

const PRODUCTION_ITEMS_KEY = 'plaid_production_items_created';
const MAX_SYNC_RESTARTS = 3;
const SYNC_PAGE_SIZE = 500;
const GONE_ITEM_CODES = new Set(['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN']);
/** Errors only the user can fix (log in again, reconnect): automatic sync skips these banks. */
const NEEDS_USER_CODES = new Set([
  'ITEM_LOGIN_REQUIRED', 'INVALID_CREDENTIALS', 'INVALID_MFA', 'USER_SETUP_REQUIRED', 'PENDING_DISCONNECT', ...GONE_ITEM_CODES
]);

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
  if (plaidError.error_code === 'ITEM_LOGIN_REQUIRED') {
    message = 'The bank login has expired. Disconnect and reconnect this bank.';
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
   * @returns {Promise<{enabled: boolean, environment?: string, trial?: {limit: number, used: number}|null}>}
   */
  async getStatus() {
    const config = plaidConfig.getPlaidConfig();
    if (!config.enabled) {
      return { enabled: false, source: config.source };
    }
    const trial = config.environment === 'production'
      ? { limit: plaidConfig.TRIAL_ITEM_LIMIT, used: await this._productionItemsCreated() }
      : null;
    return { enabled: true, source: config.source, environment: config.environment, trial };
  }

  async createLinkToken() {
    try {
      const { data } = await this._client().linkTokenCreate({
        user: { client_user_id: 'expense-tracker-household' },
        client_name: 'Expense Tracker',
        products: [Products.Transactions],
        country_codes: plaidConfig.COUNTRY_CODES,
        language: 'en',
        transactions: { days_requested: plaidConfig.DAYS_REQUESTED }
      });
      return { linkToken: data.link_token, expiration: data.expiration };
    } catch (err) {
      throw toServiceError(err, 'link token creation');
    }
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
    return { ...item, accounts };
  }

  async listItems() {
    const items = await plaidRepository.findAllItems();
    const accounts = await plaidRepository.findAccountsByItemIds(items.map(item => item.id));
    return items.map(item => ({ ...item, accounts: accounts.filter(account => account.plaidItemId === item.id) }));
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
    if (paymentMethodId !== null && paymentMethodId !== undefined && paymentMethodId !== '') {
      mappedId = parseInt(paymentMethodId, 10);
      const paymentMethod = Number.isNaN(mappedId) ? null : await paymentMethodRepository.findById(mappedId);
      if (!paymentMethod || !paymentMethod.is_active) {
        throw fail('Payment method not found or inactive', 400);
      }
    }

    return plaidRepository.updateAccountPaymentMethod(accountId, mappedId);
  }

  /**
   * Pull all changes since the stored cursor and apply them atomically.
   * Pending transactions are skipped; Plaid reports them again once posted.
   */
  async syncItem(id) {
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

      for (let attempt = 0; ; attempt++) {
        try {
          const batch = await this._fetchAllPages(accessToken, item.syncCursor);
          const counts = await plaidRepository.applySyncBatch(id, batch);
          logger.info('Plaid sync completed', { plaidItemId: id, ...counts });
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
          }
          throw toServiceError(err, 'sync');
        }
      }
    } finally {
      this._syncing.delete(id);
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
      for (const txn of [...data.added, ...data.modified]) {
        if (!txn.pending) upserts.push(txn);
      }
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
        results.push(await this.syncItem(item.id));
      } catch (err) {
        results.push({ id: item.id, institutionName: item.institutionName, error: err.message });
      }
    }
    const totals = results.reduce(
      (sum, r) => ({ added: sum.added + (r.added || 0), updated: sum.updated + (r.updated || 0), removed: sum.removed + (r.removed || 0) }),
      { added: 0, updated: 0, removed: 0 }
    );
    await this._logSyncChanges(totals, 'manual');
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
        const result = await this.syncItem(item.id);
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
    await this._logSyncChanges(totals, source);
    return { synced, totals };
  }

  /** Log a sync that changed the inbox, so other tabs refresh it. No-op syncs are not logged. Never throws. */
  async _logSyncChanges({ added, updated, removed }, source) {
    if (added + updated + removed === 0) return;
    try {
      await activityLogService.logEvent(
        'plaid_sync_completed',
        'plaid_transaction',
        null,
        `Bank sync (${source.replace('_', ' ')}): ${added} new, ${updated} updated, ${removed} removed`,
        { source, added, updated, removed }
      );
    } catch (err) {
      logger.warn('Logging the Plaid sync result failed', { error: err.message });
    }
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

    const removedRows = await plaidRepository.deleteUnreviewedForItem(id);
    await plaidRepository.deleteItem(id);

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

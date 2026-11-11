const { Products } = require('plaid/legacy');
const plaidConfig = require('../config/plaid');
const plaidRepository = require('../repositories/plaidRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const settingsRepository = require('../repositories/settingsRepository');
const activityLogService = require('./activityLogService');
const plaidSyncService = require('./plaidSyncService');
const { encrypt, decrypt } = require('../utils/tokenCrypto');
const logger = require('../config/logger');
const { fail } = require('../utils/httpError');
const { GONE_ITEM_CODES, LOGIN_CODES, connectionStatus, plaidErrorOf, toServiceError, plaidClient } = require('./plaidConnectionSupport');

const PRODUCTION_ITEMS_KEY = 'plaid_production_items_created';

/**
 * Plaid connectivity: Link tokens, connecting/disconnecting banks and account mapping. Transaction sync is in
 * plaidSyncService; the sync methods here delegate to it so callers keep one entry point.
 */
class PlaidService {
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
      const { data } = await plaidClient().linkTokenCreate(request);
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
      await plaidClient().transactionsRefresh({ access_token: accessToken });
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
    plaidSyncService.clearAttempt(item.id);
    await activityLogService.logEvent(
      'plaid_item_updated',
      'plaid_item',
      item.id,
      item.lastError ? `Reconnected bank: ${item.institutionName}` : `Logged in to bank again: ${item.institutionName}`,
      { institutionName: item.institutionName, previousError: item.lastError }
    );
    let sync = null;
    try {
      sync = await plaidSyncService.syncItem(item.id, 'login');
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
    const client = plaidClient();

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

  syncItem(id, source) {
    return plaidSyncService.syncItem(id, source);
  }

  syncAll() {
    return plaidSyncService.syncAll();
  }

  findStaleItems(maxAgeMinutes, now) {
    return plaidSyncService.findStaleItems(maxAgeMinutes, now);
  }

  syncItems(items, source) {
    return plaidSyncService.syncItems(items, source);
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
        await plaidClient().itemRemove({ access_token: accessToken });
      } catch (err) {
        const code = plaidErrorOf(err)?.error_code;
        if (!GONE_ITEM_CODES.has(code)) {
          throw toServiceError(err, 'disconnect');
        }
      }
    }

    const removedRows = await plaidRepository.deleteItemWithUnreviewed(id);
    plaidSyncService.clearAttempt(id);

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

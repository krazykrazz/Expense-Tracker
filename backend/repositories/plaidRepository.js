const dbHelper = require('../utils/dbHelper');

const PUBLIC_ITEM_COLUMNS = `id, item_id AS itemId, institution_name AS institutionName, environment, last_synced_at AS lastSyncedAt,
  last_error AS lastError, bank_updated_at AS bankUpdatedAt, bank_update_failed_at AS bankUpdateFailedAt,
  institution_status AS institutionStatus, institution_status_since AS institutionStatusSince, created_at AS createdAt`;
const ACCOUNT_COLUMNS = `id, plaid_item_id AS plaidItemId, account_id AS accountId, name, mask, type, subtype, payment_method_id AS paymentMethodId,
  current_balance AS currentBalance, available_balance AS availableBalance, balance_currency AS balanceCurrency, balance_as_of AS balanceAsOf`;
const TXN_COLUMNS = `pt.id, pt.transaction_id AS transactionId, pt.plaid_account_id AS plaidAccountId, pt.amount,
  pt.iso_currency_code AS isoCurrencyCode, pt.date, pt.authorized_date AS authorizedDate, pt.name,
  pt.merchant_name AS merchantName, pt.status, pt.expense_id AS expenseId, pt.pending,
  pt.pending_transaction_id AS pendingTransactionId, pt.removed_at AS removedAt,
  pt.pfc_primary AS pfcPrimary, pt.pfc_detailed AS pfcDetailed, pt.pfc_confidence AS pfcConfidence`;

/**
 * Data access for Plaid items, accounts and staged transactions.
 * Access tokens are stored encrypted; only the internal *WithToken readers return them.
 * Elsewhere: applying a sync batch (plaidSyncRepository), links to fixed expenses and income (plaidLinkRepository),
 * card payment links (plaidCardPaymentRepository), the billing cycle check (plaidCycleRepository),
 * bank file imports (plaidFileImportRepository), the card balance check (plaidBalanceCheckRepository).
 */
class PlaidRepository {
  // ─── Items ───

  async createItem({ itemId, institutionName, accessTokenEnc, environment }) {
    const { lastID } = await dbHelper.execute(
      'INSERT INTO plaid_items (item_id, institution_name, access_token_enc, environment) VALUES (?, ?, ?, ?)',
      [itemId, institutionName, accessTokenEnc, environment]
    );
    return this.findItemById(lastID);
  }

  async findItemById(id) {
    return dbHelper.queryOne(`SELECT ${PUBLIC_ITEM_COLUMNS} FROM plaid_items WHERE id = ?`, [id]);
  }

  async findAllItems() {
    return dbHelper.queryAll(`SELECT ${PUBLIC_ITEM_COLUMNS} FROM plaid_items ORDER BY institution_name, id`);
  }

  /** Internal only: includes the encrypted token and sync cursor. */
  async findItemWithTokenById(id) {
    return dbHelper.queryOne(
      `SELECT ${PUBLIC_ITEM_COLUMNS}, access_token_enc AS accessTokenEnc, sync_cursor AS syncCursor FROM plaid_items WHERE id = ?`,
      [id]
    );
  }

  async countItemsByEnvironment(environment) {
    return dbHelper.count('plaid_items', 'environment = ?', [environment]);
  }

  async setItemError(id, lastError) {
    await dbHelper.execute('UPDATE plaid_items SET last_error = ? WHERE id = ?', [lastError, id]);
  }

  /**
   * Data freshness from Plaid: when it last fetched from the bank (successfully or not), and its status for
   * the institution. Fields left undefined keep their stored value (e.g. the institution lookup failed).
   */
  async setItemHealth(id, { bankUpdatedAt, bankUpdateFailedAt, institutionStatus, institutionStatusSince }) {
    const sets = [];
    const params = [];
    const add = (column, value) => {
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        params.push(value);
      }
    };
    add('bank_updated_at', bankUpdatedAt);
    add('bank_update_failed_at', bankUpdateFailedAt);
    add('institution_status', institutionStatus);
    add('institution_status_since', institutionStatusSince);
    if (sets.length === 0) return;
    await dbHelper.execute(`UPDATE plaid_items SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  }

  // ─── Accounts ───

  /**
   * Insert or refresh an account's descriptive fields and, when Plaid sent them, its balances (never touches
   * its payment-method mapping). Balances are only overwritten when present, so a page without them keeps the last.
   * @param {object} [tx] runInTransaction helpers; defaults to the shared connection
   */
  async upsertAccount(plaidItemId, { account_id, name, mask, type, subtype, balances }, tx = null) {
    const run = tx ? tx.run : dbHelper.execute;
    const hasBalances = Boolean(balances) && (balances.current != null || balances.available != null);
    const balanceValues = hasBalances
      ? [balances.current ?? null, balances.available ?? null, balances.limit ?? null,
        balances.iso_currency_code ?? balances.unofficial_currency_code ?? null, new Date().toISOString()]
      : [null, null, null, null, null];
    await run(
      `INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, subtype,
         current_balance, available_balance, credit_limit, balance_currency, balance_as_of)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET
         plaid_item_id = excluded.plaid_item_id, name = excluded.name, mask = excluded.mask,
         type = excluded.type, subtype = excluded.subtype
         ${hasBalances ? `, current_balance = excluded.current_balance, available_balance = excluded.available_balance,
         credit_limit = excluded.credit_limit, balance_currency = excluded.balance_currency,
         balance_as_of = excluded.balance_as_of` : ''}`,
      [plaidItemId, account_id, name ?? null, mask ?? null, type ?? null, subtype ?? null, ...balanceValues]
    );
  }

  async findAccountsByItemIds(itemIds) {
    if (itemIds.length === 0) return [];
    return dbHelper.queryAll(
      `SELECT ${ACCOUNT_COLUMNS} FROM plaid_accounts WHERE plaid_item_id IN (${itemIds.map(() => '?').join(',')}) ORDER BY name, id`,
      itemIds
    );
  }

  async findAccountById(id) {
    return dbHelper.queryOne(`SELECT ${ACCOUNT_COLUMNS} FROM plaid_accounts WHERE id = ?`, [id]);
  }

  /**
   * Stored balances of a bank's accounts that import into a payment method (compared before and after a
   * balance refresh, for the activity log).
   */
  async findMappedAccountBalances(plaidItemId) {
    return dbHelper.queryAll(
      `SELECT account_id AS accountId, name, mask, current_balance AS currentBalance, available_balance AS availableBalance
       FROM plaid_accounts WHERE plaid_item_id = ? AND payment_method_id IS NOT NULL ORDER BY name, id`,
      [plaidItemId]
    );
  }

  async updateAccountPaymentMethod(id, paymentMethodId) {
    const { changes } = await dbHelper.execute(
      'UPDATE plaid_accounts SET payment_method_id = ? WHERE id = ?',
      [paymentMethodId, id]
    );
    return changes === 0 ? null : this.findAccountById(id);
  }

  // ─── Connections ───

  /**
   * Delete a bank connection and, in the same transaction, its staged rows that never became (or were
   * linked to) an expense, fixed expense or income. Reviewed rows are kept, so bank-confirmed colours and
   * income/fixed-expense confirmations survive the disconnect (their account link is set to NULL).
   * @returns {Promise<number>} unreviewed rows removed
   */
  async deleteItemWithUnreviewed(plaidItemId) {
    return dbHelper.runInTransaction(async (tx) => {
      const { changes } = await tx.run(
        `DELETE FROM plaid_transactions
         WHERE status IN ('new', 'ignored')
           AND plaid_account_id IN (SELECT id FROM plaid_accounts WHERE plaid_item_id = ?)`,
        [plaidItemId]
      );
      await tx.run('DELETE FROM plaid_items WHERE id = ?', [plaidItemId]);
      return changes;
    });
  }

  // ─── Inbox ───

  /**
   * Staged transactions in a review state, limited to accounts mapped to a payment method.
   */
  async findInbox(status) {
    return dbHelper.queryAll(
      `SELECT ${TXN_COLUMNS},
              pa.name AS accountName, pa.mask AS accountMask,
              pa.payment_method_id AS paymentMethodId, pm.display_name AS paymentMethodName, pm.type AS paymentMethodType,
              pm.billing_cycle_day AS billingCycleDay
       FROM plaid_transactions pt
       JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
       JOIN payment_methods pm ON pm.id = pa.payment_method_id
       WHERE pt.status = ?
       ORDER BY COALESCE(pt.authorized_date, pt.date) DESC, pt.id DESC`,
      [status]
    );
  }

  /**
   * How many rows the Inbox's To review tab lists: new rows on accounts mapped to a payment method (same join as
   * findInbox), plus pending charges the bank dropped that are waiting for a decision (shown at the top).
   */
  async countToReview() {
    const row = await dbHelper.queryOne(
      `SELECT
         (SELECT COUNT(*) FROM plaid_transactions pt
            JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
            JOIN payment_methods pm ON pm.id = pa.payment_method_id
          WHERE pt.status = 'new') AS fresh,
         (SELECT COUNT(*) FROM plaid_transactions
          WHERE pending = 1 AND removed_at IS NOT NULL AND status IN ('added', 'matched')) AS cancelled`
    );
    return row ? row.fresh + row.cancelled : 0;
  }

  /**
   * 'new' rows hidden from the inbox because their account has no payment method.
   */
  async countNewUnmapped() {
    const row = await dbHelper.queryOne(
      `SELECT COUNT(*) AS count FROM plaid_transactions pt
       LEFT JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
       WHERE pt.status = 'new' AND pa.payment_method_id IS NULL`
    );
    return row ? row.count : 0;
  }

  async findTransactionById(id) {
    return dbHelper.queryOne(
      `SELECT ${TXN_COLUMNS},
              pa.payment_method_id AS paymentMethodId, pm.type AS paymentMethodType
       FROM plaid_transactions pt
       LEFT JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
       LEFT JOIN payment_methods pm ON pm.id = pa.payment_method_id
       WHERE pt.id = ?`,
      [id]
    );
  }

  /**
   * Expenses not yet linked to any bank transaction, for the given payment methods and date window.
   * `chargedAmount` is what the card/account was actually charged: `original_cost` for reimbursed or
   * insurance-tracked expenses (where `amount` is only the out-of-pocket share), else `amount`.
   */
  async findUnlinkedExpenses(paymentMethodIds, fromDate, toDate) {
    if (paymentMethodIds.length === 0) return [];
    return dbHelper.queryAll(
      `SELECT e.id, e.date, e.place, e.amount, e.original_cost AS originalCost,
              COALESCE(e.original_cost, e.amount) AS chargedAmount,
              e.type, e.notes, e.payment_method_id AS paymentMethodId
       FROM expenses e
       WHERE e.payment_method_id IN (${paymentMethodIds.map(() => '?').join(',')})
         AND e.date >= ? AND e.date <= ?
         AND NOT EXISTS (SELECT 1 FROM plaid_transactions pt WHERE pt.expense_id = e.id)
       ORDER BY e.date`,
      [...paymentMethodIds, fromDate, toDate]
    );
  }

  /**
   * Move a row out of review state 'new'. Conditional, so concurrent actions cannot both succeed.
   * Pass `conn` (a runInTransaction connection) to commit it with the caller's other writes.
   * @returns {Promise<boolean>} false when the row was no longer 'new' (a sync changed it meanwhile)
   */
  async resolveTransaction(id, status, expenseId = null, conn = null) {
    const { changes } = await (conn ? conn.run : dbHelper.execute)(
      "UPDATE plaid_transactions SET status = ?, expense_id = ? WHERE id = ? AND status = 'new'",
      [status, expenseId, id]
    );
    return changes > 0;
  }

  async unignoreTransaction(id) {
    const { changes } = await dbHelper.execute(
      "UPDATE plaid_transactions SET status = 'new' WHERE id = ? AND status = 'ignored'",
      [id]
    );
    return changes > 0;
  }

  // ─── Learned places ───

  /**
   * Places chosen for bank rows already added or matched as expenses, newest first: what the user
   * calls each bank description.
   * @returns {Promise<Array<{name: string, merchantName: string|null, place: string}>>}
   */
  async findLearnedPlaces() {
    return dbHelper.queryAll(
      `SELECT pt.name, pt.merchant_name AS merchantName, TRIM(e.place) AS place
       FROM plaid_transactions pt
       JOIN expenses e ON e.id = pt.expense_id
       WHERE pt.status IN ('added', 'matched') AND TRIM(COALESCE(e.place, '')) != ''
       ORDER BY e.date DESC, pt.id DESC`
    );
  }

  // ─── Expense list ───

  /**
   * Bank links for the given expense ids.
   * @returns {Promise<Map<number, {bankTransactionId: number, status: string, name: string, date: string, amount: number}>>}
   */
  async findLinksForExpenses(expenseIds) {
    const links = new Map();
    const CHUNK = 500;
    for (let i = 0; i < expenseIds.length; i += CHUNK) {
      const chunk = expenseIds.slice(i, i + CHUNK);
      const rows = await dbHelper.queryAll(
        `SELECT id AS bankTransactionId, expense_id AS expenseId, status, COALESCE(merchant_name, name) AS name, name AS rawName,
                COALESCE(authorized_date, date) AS date, amount, pending, removed_at IS NOT NULL AS removed,
                plaid_account_id IS NULL AS disconnected
         FROM plaid_transactions
         WHERE expense_id IN (${chunk.map(() => '?').join(',')})`,
        chunk
      );
      for (const row of rows) {
        const { expenseId, pending, removed, disconnected, ...link } = row;
        links.set(expenseId, { ...link, pending: Boolean(pending), removed: Boolean(removed), disconnected: Boolean(disconnected) });
      }
    }
    return links;
  }

  // ─── Pending ───

  /**
   * Pending charges that were added or matched as expenses and then dropped by the bank, for review.
   */
  async findCancelledPending() {
    return dbHelper.queryAll(
      `SELECT ${TXN_COLUMNS},
              pa.name AS accountName, pa.mask AS accountMask,
              pa.payment_method_id AS paymentMethodId, pm.display_name AS paymentMethodName, pm.type AS paymentMethodType,
              e.place AS expensePlace, e.amount AS expenseAmount, e.date AS expenseDate
       FROM plaid_transactions pt
       LEFT JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
       LEFT JOIN payment_methods pm ON pm.id = pa.payment_method_id
       LEFT JOIN expenses e ON e.id = pt.expense_id
       WHERE pt.pending = 1 AND pt.removed_at IS NOT NULL AND pt.status IN ('added', 'matched')
       ORDER BY pt.date DESC, pt.id DESC`
    );
  }

  /**
   * Posted rows still waiting for review on the given accounts within a date range: candidates for a
   * cancelled pending charge that actually settled under a new reference.
   */
  async findPostedNewOnAccounts(plaidAccountIds, fromDate, toDate) {
    if (plaidAccountIds.length === 0) return [];
    return dbHelper.queryAll(
      `SELECT ${TXN_COLUMNS} FROM plaid_transactions pt
       WHERE pt.status = 'new' AND pt.pending = 0
         AND pt.plaid_account_id IN (${plaidAccountIds.map(() => '?').join(',')})
         AND pt.date >= ? AND pt.date <= ?
       ORDER BY pt.date`,
      [...plaidAccountIds, fromDate, toDate]
    );
  }

  /**
   * Move an expense link from a dropped pending row to the posted row it settled as, atomically.
   * @returns {Promise<boolean>} false when the posted row was no longer 'new'
   */
  async transferPendingLink(pendingRowId, postedRowId, status, expenseId) {
    return dbHelper.runInTransaction(async (tx) => {
      await tx.run('DELETE FROM plaid_transactions WHERE id = ?', [pendingRowId]);
      const { changes } = await tx.run(
        "UPDATE plaid_transactions SET status = ?, expense_id = ? WHERE id = ? AND status = 'new' AND pending = 0",
        [status, expenseId, postedRowId]
      );
      if (changes === 0) throw Object.assign(new Error('That bank transaction was already reviewed'), { statusCode: 409 });
      return true;
    });
  }
}

module.exports = new PlaidRepository();

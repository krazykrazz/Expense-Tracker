const dbHelper = require('../utils/dbHelper');

const PUBLIC_ITEM_COLUMNS = 'id, item_id AS itemId, institution_name AS institutionName, environment, last_synced_at AS lastSyncedAt, last_error AS lastError, created_at AS createdAt';
const ACCOUNT_COLUMNS = 'id, plaid_item_id AS plaidItemId, account_id AS accountId, name, mask, type, subtype, payment_method_id AS paymentMethodId';
const TXN_COLUMNS = `pt.id, pt.transaction_id AS transactionId, pt.plaid_account_id AS plaidAccountId, pt.amount,
  pt.iso_currency_code AS isoCurrencyCode, pt.date, pt.authorized_date AS authorizedDate, pt.name,
  pt.merchant_name AS merchantName, pt.status, pt.expense_id AS expenseId`;

/**
 * Data access for Plaid items, accounts and staged transactions.
 * Access tokens are stored encrypted; only the internal *WithToken readers return them.
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

  async deleteItem(id) {
    const { changes } = await dbHelper.execute('DELETE FROM plaid_items WHERE id = ?', [id]);
    return changes > 0;
  }

  // ─── Accounts ───

  /**
   * Insert or refresh an account's descriptive fields (never touches its payment-method mapping).
   * @param {object} [tx] runInTransaction helpers; defaults to the shared connection
   */
  async upsertAccount(plaidItemId, { account_id, name, mask, type, subtype }, tx = null) {
    const run = tx ? tx.run : dbHelper.execute;
    await run(
      `INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, subtype)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET
         plaid_item_id = excluded.plaid_item_id, name = excluded.name, mask = excluded.mask,
         type = excluded.type, subtype = excluded.subtype`,
      [plaidItemId, account_id, name ?? null, mask ?? null, type ?? null, subtype ?? null]
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

  async updateAccountPaymentMethod(id, paymentMethodId) {
    const { changes } = await dbHelper.execute(
      'UPDATE plaid_accounts SET payment_method_id = ? WHERE id = ?',
      [paymentMethodId, id]
    );
    return changes === 0 ? null : this.findAccountById(id);
  }

  // ─── Sync ───

  /**
   * Apply one fully-paginated /transactions/sync result atomically, then advance the cursor.
   * Only rows still in review state 'new' are ever modified or removed.
   * @param {number} plaidItemId
   * @param {{accounts: Array, upserts: Array, removedIds: string[], cursor: string}} batch
   * @returns {Promise<{added: number, updated: number, removed: number}>}
   */
  async applySyncBatch(plaidItemId, { accounts, upserts, removedIds, cursor }) {
    return dbHelper.runInTransaction(async (tx) => {
      for (const account of accounts) {
        await this.upsertAccount(plaidItemId, account, tx);
      }

      const accountRows = await tx.all('SELECT id, account_id FROM plaid_accounts WHERE plaid_item_id = ?', [plaidItemId]);
      const accountIdMap = new Map(accountRows.map(row => [row.account_id, row.id]));

      const counts = { added: 0, updated: 0, removed: 0 };

      for (const txn of upserts) {
        const plaidAccountId = accountIdMap.get(txn.account_id) ?? null;
        const values = [
          plaidAccountId, txn.amount, txn.iso_currency_code ?? null, txn.date,
          txn.authorized_date ?? null, txn.name ?? null, txn.merchant_name ?? null
        ];
        const existing = await tx.get('SELECT id, status FROM plaid_transactions WHERE transaction_id = ?', [txn.transaction_id]);
        if (!existing) {
          await tx.run(
            `INSERT INTO plaid_transactions
               (plaid_account_id, amount, iso_currency_code, date, authorized_date, name, merchant_name, transaction_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [...values, txn.transaction_id]
          );
          counts.added++;
        } else if (existing.status === 'new') {
          await tx.run(
            `UPDATE plaid_transactions SET plaid_account_id = ?, amount = ?, iso_currency_code = ?, date = ?,
               authorized_date = ?, name = ?, merchant_name = ?
             WHERE id = ?`,
            [...values, existing.id]
          );
          counts.updated++;
        }
      }

      for (const transactionId of removedIds) {
        const { changes } = await tx.run(
          "DELETE FROM plaid_transactions WHERE transaction_id = ? AND status = 'new'",
          [transactionId]
        );
        counts.removed += changes;
      }

      await tx.run(
        'UPDATE plaid_items SET sync_cursor = ?, last_synced_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?',
        [cursor, plaidItemId]
      );

      return counts;
    });
  }

  /**
   * Remove staged rows of an item that never became (or were linked to) an expense.
   * Added/matched rows are kept so the expense list keeps its bank-confirmed indicator.
   */
  async deleteUnreviewedForItem(plaidItemId) {
    const { changes } = await dbHelper.execute(
      `DELETE FROM plaid_transactions
       WHERE status IN ('new', 'ignored')
         AND plaid_account_id IN (SELECT id FROM plaid_accounts WHERE plaid_item_id = ?)`,
      [plaidItemId]
    );
    return changes;
  }

  // ─── Inbox ───

  /**
   * Staged transactions in a review state, limited to accounts mapped to a payment method.
   */
  async findInbox(status) {
    return dbHelper.queryAll(
      `SELECT ${TXN_COLUMNS},
              pa.name AS accountName, pa.mask AS accountMask,
              pa.payment_method_id AS paymentMethodId, pm.display_name AS paymentMethodName, pm.type AS paymentMethodType
       FROM plaid_transactions pt
       JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
       JOIN payment_methods pm ON pm.id = pa.payment_method_id
       WHERE pt.status = ?
       ORDER BY COALESCE(pt.authorized_date, pt.date) DESC, pt.id DESC`,
      [status]
    );
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
   * @returns {Promise<boolean>} true when the row was still 'new'
   */
  async resolveTransaction(id, status, expenseId = null) {
    const { changes } = await dbHelper.execute(
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

  // ─── Expense list ───

  /**
   * Bank links for the given expense ids.
   * @returns {Promise<Map<number, {status: string, name: string, date: string, amount: number}>>}
   */
  async findLinksForExpenses(expenseIds) {
    const links = new Map();
    const CHUNK = 500;
    for (let i = 0; i < expenseIds.length; i += CHUNK) {
      const chunk = expenseIds.slice(i, i + CHUNK);
      const rows = await dbHelper.queryAll(
        `SELECT expense_id AS expenseId, status, COALESCE(merchant_name, name) AS name, name AS rawName,
                COALESCE(authorized_date, date) AS date, amount
         FROM plaid_transactions
         WHERE expense_id IN (${chunk.map(() => '?').join(',')})`,
        chunk
      );
      for (const row of rows) {
        const { expenseId, ...link } = row;
        links.set(expenseId, link);
      }
    }
    return links;
  }
}

module.exports = new PlaidRepository();

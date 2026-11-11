const dbHelper = require('../utils/dbHelper');
const { FILE_ID_PREFIX, SAME_TXN_DAYS, planFileImport } = require('../utils/bankFileImport');
const { STAGED_COLUMNS, STAGED_COLUMN_NAMES } = require('./plaidSql');

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
/** Share of weekend dates above which a bank's dates are purchase dates, not posting dates (purchases: ~2 in 7). */
const MAX_WEEKEND_POSTING_SHARE = 0.1;

/**
 * Data access for Plaid items, accounts and staged transactions.
 * Access tokens are stored encrypted; only the internal *WithToken readers return them.
 * Elsewhere: applying a sync batch (plaidSyncRepository), links to fixed expenses and income (plaidLinkRepository),
 * card payment links (plaidCardPaymentRepository), the billing cycle check (plaidCycleRepository).
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
   * @returns {Promise<Map<number, {status: string, name: string, date: string, amount: number}>>}
   */
  async findLinksForExpenses(expenseIds) {
    const links = new Map();
    const CHUNK = 500;
    for (let i = 0; i < expenseIds.length; i += CHUNK) {
      const chunk = expenseIds.slice(i, i + CHUNK);
      const rows = await dbHelper.queryAll(
        `SELECT expense_id AS expenseId, status, COALESCE(merchant_name, name) AS name, name AS rawName,
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

  // ─── Bank file import ───

  /** A bank account with what an import needs: its type and mask, mapping, and its bank's environment. */
  async findAccountForImport(id) {
    return dbHelper.queryOne(
      `SELECT pa.id, pa.name, pa.mask, pa.type, pa.payment_method_id AS paymentMethodId,
              pi.id AS plaidItemId, pi.institution_name AS institutionName, pi.environment
       FROM plaid_accounts pa JOIN plaid_items pi ON pi.id = pa.plaid_item_id
       WHERE pa.id = ?`,
      [id]
    );
  }

  /** Earliest date Plaid itself sent for the account (rows from files excluded), or null. */
  async findFirstPlaidDate(plaidAccountId) {
    const row = await dbHelper.queryOne(
      `SELECT MIN(date) AS firstDate FROM plaid_transactions WHERE plaid_account_id = ? AND transaction_id NOT LIKE '${FILE_ID_PREFIX}%'`,
      [plaidAccountId]
    );
    return row?.firstDate ?? null;
  }

  /**
   * Merge parsed file rows into the account's staged rows atomically (see planFileImport): new rows are staged
   * for review; rows already there, from Plaid or an earlier file, keep their review state and expense link and
   * take whatever the file knows better (a pending charge shown settled, a purchase date, a merchant name).
   * With `dryRun` nothing is written.
   * @param {number} plaidAccountId
   * @param {Array<object>} fileRows rows from parseBankFile, already limited to the import's date range
   * @param {{fromDate: string, dateKind: string, dryRun?: boolean}} options
   * @returns {Promise<{added: number, pendingAdded: number, updated: number, settled: number, unchanged: number,
   *   alreadyFromBank: number, settlements: Array}>}
   */
  async applyFileImport(plaidAccountId, fileRows, { fromDate, dateKind, dryRun = false }) {
    return dbHelper.runInTransaction(async (tx) => {
      const existing = await tx.all(
        `SELECT ${STAGED_COLUMNS} FROM plaid_transactions
         WHERE plaid_account_id = ? AND date >= date(?, '-${SAME_TXN_DAYS + 2} days')
         ORDER BY date, id`,
        [plaidAccountId, fromDate]
      );
      const plan = planFileImport(fileRows, existing, dateKind);
      const result = {
        added: plan.inserts.length,
        pendingAdded: plan.inserts.filter(row => row.pending).length,
        updated: plan.updates.length,
        settled: plan.updates.filter(u => u.existing.pending && u.changes.pending === 0).length,
        unchanged: plan.unchanged,
        alreadyFromBank: plan.alreadyFromBank,
        settlements: plan.updates.map(u => u.settlement).filter(Boolean)
      };
      if (dryRun) return result;

      for (const file of plan.inserts) {
        await tx.run(
          `INSERT INTO plaid_transactions
             (transaction_id, plaid_account_id, amount, iso_currency_code, date, authorized_date, name, merchant_name, pending)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [file.key, plaidAccountId, file.amount, file.currency, file.date, file.authorizedDate, file.name, file.merchantName, file.pending ? 1 : 0]
        );
      }
      for (const { existing: row, changes } of plan.updates) {
        const columns = Object.keys(changes).map(name => `${STAGED_COLUMN_NAMES[name]} = ?`);
        await tx.run(`UPDATE plaid_transactions SET ${columns.join(', ')} WHERE id = ?`, [...Object.values(changes), row.id]);
      }
      return result;
    });
  }
  async deleteTransaction(id) {
    const { changes } = await dbHelper.execute('DELETE FROM plaid_transactions WHERE id = ?', [id]);
    return changes > 0;
  }

  // ─── Card balance check ───

  /**
   * Bank credit card accounts mapped to an active credit card payment method in the given environment,
   * with the balances received on the last sync.
   */
  /**
   * Mark pending rows settled (the bank's balance shows they posted). Only rows still pending change.
   * @param {number[]} ids
   * @returns {Promise<number[]>} the ids that were pending and are now settled
   */
  async markSettled(ids) {
    if (ids.length === 0) return [];
    return dbHelper.runInTransaction(async (tx) => {
      const settled = [];
      for (const id of ids) {
        const { changes } = await tx.run('UPDATE plaid_transactions SET pending = 0 WHERE id = ? AND pending = 1', [id]);
        if (changes > 0) settled.push(id);
      }
      return settled;
    });
  }

  /**
   * Does the bank behind this account report real posting dates? Yes when its settled transactions show a date
   * later than the authorization date (CIBC) and hardly any fall on a weekend (banks rarely post then; purchase
   * dates land there about 2 days in 7: Wealthsimple sends the purchase date for most charges). Rows imported
   * from a file are left out.
   */
  async bankReportsPostingDates(plaidAccountId) {
    const row = await dbHelper.queryOne(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(authorized_date IS NOT NULL AND date > authorized_date), 0) AS later,
              COALESCE(SUM(CAST(strftime('%w', date) AS INTEGER) IN (0, 6)), 0) AS weekend
       FROM plaid_transactions
       WHERE plaid_account_id = ? AND pending = 0 AND transaction_id NOT LIKE 'file:%'`,
      [plaidAccountId]
    );
    return row.later > 0 && row.weekend <= row.total * MAX_WEEKEND_POSTING_SHARE;
  }

  async findMappedCardAccounts(environment) {
    return dbHelper.queryAll(
      `SELECT pa.id, pa.plaid_item_id AS plaidItemId, pa.name, pa.mask, pa.payment_method_id AS paymentMethodId,
              pa.current_balance AS currentBalance, pa.available_balance AS availableBalance,
              pa.credit_limit AS creditLimit, pa.balance_currency AS currency, pa.balance_as_of AS balanceAsOf,
              pi.institution_name AS institutionName, pi.last_error AS lastError, pi.bank_updated_at AS bankUpdatedAt,
              pm.display_name AS paymentMethodName, pm.credit_limit AS trackerCreditLimit
       FROM plaid_accounts pa
       JOIN plaid_items pi ON pi.id = pa.plaid_item_id
       JOIN payment_methods pm ON pm.id = pa.payment_method_id
       WHERE pi.environment = ? AND pa.type = 'credit' AND pm.type = 'credit_card' AND pm.is_active = 1
       ORDER BY pm.display_name, pa.id`,
      [environment]
    );
  }

  /**
   * Bank rows on the given accounts that can explain a card balance difference: rows not recorded in the
   * tracker (unreviewed or ignored in the Inbox), pending charges already linked to an expense (including
   * ones the bank cancelled, `removed`), and charges confirmed as a fixed expense (`fixedExpense`: fixed
   * expenses aren't part of the tracker's card balance). Also the earliest date the bank sent, so
   * tracker-only entries are only looked for where bank history exists.
   */
  async findBalanceCheckRows(plaidAccountIds) {
    if (plaidAccountIds.length === 0) return { rows: [], firstDate: null };
    const placeholders = plaidAccountIds.map(() => '?').join(',');
    const [rows, first] = await Promise.all([
      dbHelper.queryAll(
        `SELECT pt.id, pt.amount, COALESCE(pt.authorized_date, pt.date) AS date, pt.date AS postedDate,
                COALESCE(pt.merchant_name, pt.name) AS name, pt.status, pt.pending, pt.expense_id AS expenseId,
                pt.removed_at IS NOT NULL AS removed, pt.transaction_id LIKE 'file:%' AS fromFile,
                (SELECT e.posted_date FROM expenses e WHERE e.id = pt.expense_id) AS expensePostedDate,
                EXISTS (SELECT 1 FROM plaid_fixed_expense_links fl WHERE fl.plaid_transaction_id = pt.id) AS fixedExpense
         FROM plaid_transactions pt
         WHERE pt.plaid_account_id IN (${placeholders})
           AND (
             (pt.removed_at IS NULL AND (pt.status IN ('new', 'ignored') OR (pt.pending = 1 AND pt.expense_id IS NOT NULL)))
             OR (pt.removed_at IS NOT NULL AND pt.pending = 1 AND pt.expense_id IS NOT NULL)
             OR (pt.removed_at IS NULL AND EXISTS (SELECT 1 FROM plaid_fixed_expense_links fl WHERE fl.plaid_transaction_id = pt.id))
             OR (pt.removed_at IS NULL AND pt.transaction_id LIKE 'file:%' AND pt.expense_id IS NOT NULL)
           )
         ORDER BY date, pt.id`,
        plaidAccountIds
      ),
      dbHelper.queryOne(
        `SELECT MIN(COALESCE(authorized_date, date)) AS firstDate FROM plaid_transactions WHERE plaid_account_id IN (${placeholders})`,
        plaidAccountIds
      )
    ]);
    return { rows, firstDate: first?.firstDate ?? null };
  }

  /**
   * Charges Plaid sent as posted since `fromDate` and linked to an expense, for the card balance check: a bank
   * that doesn't tell Plaid which charges are pending (Wealthsimple) may still have some pending.
   */
  async findRecentLinkedCharges(plaidAccountIds, fromDate) {
    if (plaidAccountIds.length === 0) return [];
    const placeholders = plaidAccountIds.map(() => '?').join(',');
    return dbHelper.queryAll(
      `SELECT pt.id, pt.amount, COALESCE(pt.authorized_date, pt.date) AS date, pt.date AS postedDate,
              COALESCE(pt.merchant_name, pt.name) AS name, pt.expense_id AS expenseId,
              COALESCE(e.posted_date, e.date) AS expensePostedDate
       FROM plaid_transactions pt
       JOIN expenses e ON e.id = pt.expense_id
       WHERE pt.plaid_account_id IN (${placeholders}) AND pt.pending = 0 AND pt.removed_at IS NULL
         AND pt.transaction_id NOT LIKE 'file:%' AND COALESCE(pt.authorized_date, pt.date) >= ?
         AND NOT EXISTS (SELECT 1 FROM plaid_fixed_expense_links fl WHERE fl.plaid_transaction_id = pt.id)
       ORDER BY date DESC, pt.id DESC`,
      [...plaidAccountIds, fromDate]
    );
  }

  /**
   * Expenses on a card from `fromDate` to `toDate` (as the balance counts them: posted date when set) that no
   * bank transaction is linked to, and card payments in the same window, for the card balance check.
   */
  async findUnlinkedCardActivity(paymentMethodId, fromDate, toDate) {
    const [expenses, payments] = await Promise.all([
      dbHelper.queryAll(
        `SELECT e.id, e.date, COALESCE(e.posted_date, e.date) AS postedDate, e.place, COALESCE(e.original_cost, e.amount) AS amount
         FROM expenses e
         WHERE e.payment_method_id = ? AND COALESCE(e.posted_date, e.date) >= ? AND COALESCE(e.posted_date, e.date) <= ?
           AND NOT EXISTS (SELECT 1 FROM plaid_transactions pt WHERE pt.expense_id = e.id)
         ORDER BY e.date, e.id`,
        [paymentMethodId, fromDate, toDate]
      ),
      dbHelper.queryAll(
        `SELECT id, payment_date AS date, payment_date AS postedDate, amount FROM credit_card_payments
         WHERE payment_method_id = ? AND payment_date >= ? AND payment_date <= ?
           AND NOT EXISTS (SELECT 1 FROM plaid_card_payment_links l WHERE l.credit_card_payment_id = credit_card_payments.id AND l.side = 'card')
         ORDER BY payment_date, id`,
        [paymentMethodId, fromDate, toDate]
      )
    ]);
    return { expenses, payments };
  }

  /** Card activity dated after today, which the as-of-today tracker balance leaves out. */
  async sumFutureCardActivity(paymentMethodId, today) {
    const row = await dbHelper.queryOne(
      `SELECT
         (SELECT COALESCE(SUM(COALESCE(original_cost, amount)), 0) FROM expenses
            WHERE payment_method_id = ? AND COALESCE(posted_date, date) > ?) AS expenses,
         (SELECT COALESCE(SUM(amount), 0) FROM credit_card_payments
            WHERE payment_method_id = ? AND payment_date > ?) AS payments,
         (SELECT COUNT(*) FROM expenses WHERE payment_method_id = ? AND COALESCE(posted_date, date) > ?) AS count`,
      [paymentMethodId, today, paymentMethodId, today, paymentMethodId, today]
    );
    return { expenses: row?.expenses || 0, payments: row?.payments || 0, count: row?.count || 0 };
  }
}

module.exports = new PlaidRepository();

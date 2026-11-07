const dbHelper = require('../utils/dbHelper');
const { FILE_ID_PREFIX, SAME_TXN_DAYS, planFileImport, mergePlaidIntoFileRow, sameTransaction } = require('../utils/bankFileImport');

const PUBLIC_ITEM_COLUMNS = `id, item_id AS itemId, institution_name AS institutionName, environment, last_synced_at AS lastSyncedAt,
  last_error AS lastError, bank_updated_at AS bankUpdatedAt, bank_update_failed_at AS bankUpdateFailedAt,
  institution_status AS institutionStatus, institution_status_since AS institutionStatusSince, created_at AS createdAt`;
const ACCOUNT_COLUMNS = 'id, plaid_item_id AS plaidItemId, account_id AS accountId, name, mask, type, subtype, payment_method_id AS paymentMethodId';
/** A staged row as the file-import merge sees it (utils/bankFileImport), and its columns by those names. */
const STAGED_COLUMNS = `id, transaction_id AS transactionId, date, authorized_date AS authorizedDate, amount, pending, name,
  merchant_name AS merchantName, status, expense_id AS expenseId, removed_at AS removedAt`;
const STAGED_COLUMN_NAMES = {
  transactionId: 'transaction_id', date: 'date', authorizedDate: 'authorized_date', amount: 'amount', pending: 'pending',
  name: 'name', merchantName: 'merchant_name', removedAt: 'removed_at'
};
const TXN_COLUMNS = `pt.id, pt.transaction_id AS transactionId, pt.plaid_account_id AS plaidAccountId, pt.amount,
  pt.iso_currency_code AS isoCurrencyCode, pt.date, pt.authorized_date AS authorizedDate, pt.name,
  pt.merchant_name AS merchantName, pt.status, pt.expense_id AS expenseId, pt.pending,
  pt.pending_transaction_id AS pendingTransactionId, pt.removed_at AS removedAt,
  pt.pfc_primary AS pfcPrimary, pt.pfc_detailed AS pfcDetailed, pt.pfc_confidence AS pfcConfidence`;
/** Plaid's personal finance category as stored: primary, detailed, confidence level (NULL when not sent). */
const pfcValues = (txn) => {
  const pfc = txn.personal_finance_category || {};
  return [pfc.primary ?? null, pfc.detailed ?? null, pfc.confidence_level ?? null];
};
/** A sync without the category never blanks one already stored. */
const PFC_SET_FIELDS = `pfc_primary = COALESCE(?, pfc_primary), pfc_detailed = COALESCE(?, pfc_detailed),
  pfc_confidence = COALESCE(?, pfc_confidence)`;

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
   * Rows still in review state 'new' follow the bank. Reviewed rows are never changed, except pending ones:
   * - A posted transaction that names its pending version (`pending_transaction_id`) replaces that row in
   *   place, keeping its review state and links (expense, ignore). Linked ones are returned as `settlements`
   *   so the caller can bring the expense in line with the posted amount.
   * - A linked pending row whose amount changes while still pending is updated and reported the same way.
   * - A linked pending row that Plaid removes (cancelled hold, or settled without a reference) is kept and
   *   marked `removed_at` for review; unlinked removed rows are deleted.
   * @param {number} plaidItemId
   * @param {{accounts: Array, upserts: Array, removedIds: string[], cursor: string}} batch
   * @returns {Promise<{added: number, updated: number, removed: number, settlements: Array}>}
   */
  async applySyncBatch(plaidItemId, { accounts, upserts, removedIds, cursor }) {
    return dbHelper.runInTransaction(async (tx) => {
      for (const account of accounts) {
        await this.upsertAccount(plaidItemId, account, tx);
      }

      const accountRows = await tx.all('SELECT id, account_id FROM plaid_accounts WHERE plaid_item_id = ?', [plaidItemId]);
      const accountIdMap = new Map(accountRows.map(row => [row.account_id, row.id]));

      const counts = { added: 0, updated: 0, removed: 0, reattached: 0, fromFile: 0 };
      const settlements = [];
      // Rows kept from a disconnected bank (added/matched) already claimed by a transaction in this batch
      const claimedOrphans = new Set();
      // Keep a purchase date and merchant name another source supplied when Plaid sends none
      const SET_FIELDS = `plaid_account_id = ?, amount = ?, iso_currency_code = ?, date = ?, authorized_date = COALESCE(?, authorized_date),
        name = ?, merchant_name = COALESCE(?, merchant_name), pending = ?, pending_transaction_id = ?, ${PFC_SET_FIELDS}`;
      let reportsPending = null;
      const bankReportsPending = async () => {
        if (reportsPending === null) {
          reportsPending = upserts.some(t => t.pending || t.pending_transaction_id) || Boolean(await tx.get(
            `SELECT 1 AS yes FROM plaid_transactions pt JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
             WHERE pa.plaid_item_id = ? AND pt.transaction_id NOT LIKE '${FILE_ID_PREFIX}%'
               AND (pt.pending = 1 OR pt.pending_transaction_id IS NOT NULL) LIMIT 1`,
            [plaidItemId]
          ));
        }
        return reportsPending;
      };

      for (const txn of upserts) {
        const pending = txn.pending ? 1 : 0;
        const values = [
          accountIdMap.get(txn.account_id) ?? null, txn.amount, txn.iso_currency_code ?? null, txn.date,
          txn.authorized_date ?? null, txn.name ?? null, txn.merchant_name ?? null, pending, txn.pending_transaction_id ?? null,
          ...pfcValues(txn)
        ];
        const existing = await tx.get(
          'SELECT id, status, amount, pending, expense_id AS expenseId FROM plaid_transactions WHERE transaction_id = ?',
          [txn.transaction_id]
        );

        if (!existing && !pending && txn.pending_transaction_id) {
          // Its pending version, still pending, or already shown settled by a bank file (same row, Plaid's id kept)
          const pendingRow = await tx.get(
            'SELECT id, status, amount, pending, expense_id AS expenseId FROM plaid_transactions WHERE transaction_id = ?',
            [txn.pending_transaction_id]
          );
          if (pendingRow) {
            await tx.run(
              `UPDATE plaid_transactions SET transaction_id = ?, ${SET_FIELDS}, removed_at = NULL WHERE id = ?`,
              [txn.transaction_id, ...values, pendingRow.id]
            );
            counts.updated++;
            if (pendingRow.expenseId && pendingRow.pending) {
              settlements.push({
                plaidTransactionId: pendingRow.id, expenseId: pendingRow.expenseId, settled: true,
                previousAmount: pendingRow.amount, amount: txn.amount, postedDate: txn.date
              });
            }
            continue;
          }
        }

        if (!existing) {
          // Brought in from a bank file while Plaid couldn't fetch: Plaid's version takes over that row, keeping
          // its review state, expense link and whatever the file knew better (see utils/bankFileImport).
          const fromFile = await this._findFileRow(tx, txn, accountIdMap.get(txn.account_id), claimedOrphans);
          if (fromFile) {
            claimedOrphans.add(fromFile.id);
            const { fields, settlement } = mergePlaidIntoFileRow(fromFile, txn, await bankReportsPending());
            await tx.run(
              `UPDATE plaid_transactions SET transaction_id = ?, plaid_account_id = ?, amount = ?, iso_currency_code = ?, date = ?,
                 authorized_date = ?, name = ?, merchant_name = ?, pending = ?, pending_transaction_id = ?, removed_at = NULL,
                 ${PFC_SET_FIELDS}
               WHERE id = ?`,
              [fields.transactionId, accountIdMap.get(txn.account_id), fields.amount, fields.isoCurrencyCode, fields.date,
                fields.authorizedDate, fields.name, fields.merchantName, fields.pending, fields.pendingTransactionId,
                ...pfcValues(txn), fromFile.id]
            );
            counts.fromFile++;
            counts.updated++;
            if (settlement) settlements.push(settlement);
            continue;
          }
          // Same bank connected again: Plaid re-sends recent history under new ids. Re-attach rows kept from the
          // old connection instead of staging duplicates the user would have to recognise and ignore.
          const orphan = await this._findReconnectOrphan(tx, txn, claimedOrphans);
          if (orphan) {
            claimedOrphans.add(orphan.id);
            await tx.run(
              `UPDATE plaid_transactions SET transaction_id = ?, ${SET_FIELDS}, removed_at = NULL WHERE id = ?`,
              [txn.transaction_id, ...values, orphan.id]
            );
            counts.reattached++;
            const settledNow = Boolean(orphan.pending) && !pending;
            if (orphan.expenseId && (settledNow || orphan.amount !== txn.amount)) {
              settlements.push({
                plaidTransactionId: orphan.id, expenseId: orphan.expenseId, settled: settledNow,
                previousAmount: orphan.amount, amount: txn.amount, postedDate: pending ? null : txn.date
              });
            }
            continue;
          }
          await tx.run(
            `INSERT INTO plaid_transactions
               (plaid_account_id, amount, iso_currency_code, date, authorized_date, name, merchant_name, pending,
                pending_transaction_id, pfc_primary, pfc_detailed, pfc_confidence, transaction_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [...values, txn.transaction_id]
          );
          counts.added++;
        } else if (!existing.pending && pending) {
          // A file already showed it settled; a pending charge never goes back to pending
          continue;
        } else if (existing.pending && !pending) {
          // Settled under its own id: a charge kept pending because a bank file said so (Wealthsimple) and
          // Plaid now sends a change. Reviewed or not, it follows the bank.
          await tx.run(`UPDATE plaid_transactions SET ${SET_FIELDS}, removed_at = NULL WHERE id = ?`, [...values, existing.id]);
          counts.updated++;
          if (existing.expenseId) {
            settlements.push({
              plaidTransactionId: existing.id, expenseId: existing.expenseId, settled: true,
              previousAmount: existing.amount, amount: txn.amount, postedDate: txn.date
            });
          }
        } else if (existing.status === 'new' || (existing.pending && pending)) {
          await tx.run(`UPDATE plaid_transactions SET ${SET_FIELDS} WHERE id = ?`, [...values, existing.id]);
          counts.updated++;
          if (existing.status !== 'new' && existing.expenseId && existing.amount !== txn.amount) {
            settlements.push({
              plaidTransactionId: existing.id, expenseId: existing.expenseId, settled: false,
              previousAmount: existing.amount, amount: txn.amount, postedDate: null
            });
          }
        }
      }

      for (const transactionId of removedIds) {
        const { changes } = await tx.run(
          "DELETE FROM plaid_transactions WHERE transaction_id = ? AND (status = 'new' OR (status = 'ignored' AND pending = 1))",
          [transactionId]
        );
        const { changes: flagged } = await tx.run(
          `UPDATE plaid_transactions SET removed_at = CURRENT_TIMESTAMP
           WHERE transaction_id = ? AND pending = 1 AND status IN ('added', 'matched') AND removed_at IS NULL`,
          [transactionId]
        );
        counts.removed += changes + flagged;
      }

      await tx.run(
        'UPDATE plaid_items SET sync_cursor = ?, last_synced_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?',
        [cursor, plaidItemId]
      );

      return { ...counts, settlements };
    });
  }

  /**
   * A row imported from a bank file on the same account that an incoming Plaid transaction is the same as
   * (utils/bankFileImport sameTransaction: same amount within SAME_TXN_DAYS, or a pending charge that settled
   * for a different amount), exact amounts and closest dates first.
   * @param {Set<number>} claimed rows already taken over in this batch
   */
  async _findFileRow(tx, txn, plaidAccountId, claimed) {
    if (!plaidAccountId) return null;
    const rows = await tx.all(
      `SELECT ${STAGED_COLUMNS} FROM plaid_transactions
       WHERE plaid_account_id = ? AND transaction_id LIKE '${FILE_ID_PREFIX}%' AND ABS(julianday(date) - julianday(?)) <= ?`,
      [plaidAccountId, txn.date, SAME_TXN_DAYS]
    );
    const incoming = { date: txn.date, amount: txn.amount, pending: Boolean(txn.pending), name: txn.name, merchantName: txn.merchant_name };
    let best = null;
    for (const row of rows) {
      if (claimed.has(row.id)) continue;
      const match = sameTransaction(incoming, row);
      if (match && (!best || (match.exact && !best.match.exact) || (match.exact === best.match.exact && match.gap < best.match.gap))) {
        best = { row, match };
      }
    }
    return best ? best.row : null;
  }
  /**
   * A reviewed row (added/matched) whose bank was disconnected (`plaid_account_id IS NULL`) that an incoming
   * transaction from a newly connected bank is the same as:
   * - same pending state, amount (to the cent), raw description and posted date; or
   * - a pending orphan that has since settled: same purchase date (authorized date, else posted), same
   *   description or merchant, amount within 25%.
   * @param {Set<number>} claimed orphan ids already re-attached in this batch
   */
  async _findReconnectOrphan(tx, txn, claimed) {
    const exclude = claimed.size > 0 ? `AND id NOT IN (${[...claimed].map(() => '?').join(',')})` : '';
    const excluded = [...claimed];
    const columns = 'id, amount, pending, expense_id AS expenseId';
    const exact = await tx.get(
      `SELECT ${columns} FROM plaid_transactions
       WHERE plaid_account_id IS NULL AND status IN ('added', 'matched') ${exclude}
         AND pending = ? AND ABS(amount - ?) < 0.005 AND COALESCE(name, '') = COALESCE(?, '') AND date = ?
       ORDER BY id LIMIT 1`,
      [...excluded, txn.pending ? 1 : 0, txn.amount, txn.name ?? null, txn.date]
    );
    if (exact || txn.pending) return exact || null;

    const purchaseDate = txn.authorized_date || txn.date;
    return (await tx.get(
      `SELECT ${columns} FROM plaid_transactions
       WHERE plaid_account_id IS NULL AND status IN ('added', 'matched') AND pending = 1 ${exclude}
         AND COALESCE(authorized_date, date) = ?
         AND ABS(amount - ?) <= ABS(amount) * 0.25
         AND (COALESCE(name, '') = COALESCE(?, '') OR (merchant_name IS NOT NULL AND merchant_name = ?))
       ORDER BY ABS(amount - ?), id LIMIT 1`,
      [...excluded, purchaseDate, txn.amount, txn.name ?? null, txn.merchant_name ?? null, txn.amount]
    )) || null;
  }

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

  // ─── Fixed expenses ───

  /**
   * Fixed expenses not yet confirmed by a bank transaction, for the given payment methods and an inclusive
   * range of month indexes (year * 12 + month - 1). Most fixed expenses only store the payment method's
   * display name (`payment_type`); `payment_method_id` is used when present.
   */
  async findUnlinkedFixedExpenses(paymentMethodIds, fromMonthIdx, toMonthIdx) {
    if (paymentMethodIds.length === 0) return [];
    return dbHelper.queryAll(
      `SELECT fe.id, fe.year, fe.month, fe.name, fe.amount, fe.category, fe.payment_due_day AS dueDay,
              fe.linked_loan_id AS linkedLoanId, pm.id AS paymentMethodId
       FROM fixed_expenses fe
       JOIN payment_methods pm
         ON pm.id = fe.payment_method_id OR (fe.payment_method_id IS NULL AND pm.display_name = fe.payment_type)
       WHERE pm.id IN (${paymentMethodIds.map(() => '?').join(',')})
         AND fe.year BETWEEN ? AND ?
         AND (fe.year * 12 + fe.month - 1) BETWEEN ? AND ?
         AND NOT EXISTS (SELECT 1 FROM plaid_fixed_expense_links l WHERE l.fixed_expense_id = fe.id)
       ORDER BY fe.year, fe.month, fe.name`,
      [...paymentMethodIds, Math.floor(fromMonthIdx / 12), Math.floor(toMonthIdx / 12), fromMonthIdx, toMonthIdx]
    );
  }

  /** @returns {Promise<Object|null>} the fixed expense with its resolved payment method id */
  async findFixedExpenseForMatching(id) {
    return dbHelper.queryOne(
      `SELECT fe.id, fe.year, fe.month, fe.name, fe.amount, fe.payment_due_day AS dueDay,
              (SELECT pm.id FROM payment_methods pm
               WHERE pm.id = fe.payment_method_id OR (fe.payment_method_id IS NULL AND pm.display_name = fe.payment_type)
               LIMIT 1) AS paymentMethodId,
              EXISTS (SELECT 1 FROM plaid_fixed_expense_links l WHERE l.fixed_expense_id = fe.id) AS linked
       FROM fixed_expenses fe WHERE fe.id = ?`,
      [id]
    );
  }

  /**
   * Atomically mark a 'new' transaction matched and link it to a fixed expense.
   * @returns {Promise<boolean>} false when the transaction was no longer 'new'
   */
  async linkFixedExpense(transactionId, fixedExpenseId, landedDate, plannedAmount) {
    return dbHelper.runInTransaction(async (tx) => {
      const { changes } = await tx.run(
        "UPDATE plaid_transactions SET status = 'matched', expense_id = NULL WHERE id = ? AND status = 'new'",
        [transactionId]
      );
      if (changes === 0) return false;
      await tx.run(
        'INSERT INTO plaid_fixed_expense_links (plaid_transaction_id, fixed_expense_id, landed_date, planned_amount) VALUES (?, ?, ?, ?)',
        [transactionId, fixedExpenseId, landedDate, plannedAmount]
      );
      return true;
    });
  }

  /** Undo linkFixedExpense (used when a follow-up step fails). */
  async unlinkFixedExpense(transactionId) {
    await dbHelper.runInTransaction(async (tx) => {
      await tx.run('DELETE FROM plaid_fixed_expense_links WHERE plaid_transaction_id = ?', [transactionId]);
      await tx.run("UPDATE plaid_transactions SET status = 'new' WHERE id = ? AND status = 'matched'", [transactionId]);
    });
  }

  /**
   * Bank confirmations for the given fixed expenses.
   * @returns {Promise<Map<number, {landedDate: string, amount: number, plannedAmount: (number|null), name: string}>>}
   */
  async findConfirmationsForFixedExpenses(fixedExpenseIds) {
    const confirmations = new Map();
    if (fixedExpenseIds.length === 0) return confirmations;
    const rows = await dbHelper.queryAll(
      `SELECT l.fixed_expense_id AS fixedExpenseId, l.landed_date AS landedDate, l.planned_amount AS plannedAmount,
              pt.amount, COALESCE(pt.merchant_name, pt.name) AS name
       FROM plaid_fixed_expense_links l
       JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id
       WHERE l.fixed_expense_id IN (${fixedExpenseIds.map(() => '?').join(',')})`,
      fixedExpenseIds
    );
    for (const { fixedExpenseId, ...confirmation } of rows) {
      confirmations.set(fixedExpenseId, confirmation);
    }
    return confirmations;
  }

  // ─── Income ───

  /**
   * Income sources not yet confirmed by a bank deposit, for an inclusive range of month indexes
   * (year * 12 + month - 1).
   */
  async findUnlinkedIncomeSources(fromMonthIdx, toMonthIdx) {
    return dbHelper.queryAll(
      `SELECT s.id, s.year, s.month, s.name, s.amount, s.category
       FROM income_sources s
       WHERE s.year BETWEEN ? AND ?
         AND (s.year * 12 + s.month - 1) BETWEEN ? AND ?
         AND NOT EXISTS (SELECT 1 FROM plaid_income_links l WHERE l.income_source_id = s.id)
       ORDER BY s.year, s.month, s.name`,
      [Math.floor(fromMonthIdx / 12), Math.floor(toMonthIdx / 12), fromMonthIdx, toMonthIdx]
    );
  }

  async findIncomeSourceForMatching(id) {
    return dbHelper.queryOne(
      `SELECT s.id, s.year, s.month, s.name, s.amount, s.category,
              EXISTS (SELECT 1 FROM plaid_income_links l WHERE l.income_source_id = s.id) AS linked
       FROM income_sources s WHERE s.id = ?`,
      [id]
    );
  }

  /**
   * Income source names (and categories) that earlier deposits with the same bank description confirmed,
   * most recent first, keyed by the lower-case description (merchant name, else name).
   * @returns {Promise<Map<string, Array<{name: string, category: string}>>>}
   */
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

  async findLearnedIncomeNames() {
    const rows = await dbHelper.queryAll(
      `SELECT LOWER(TRIM(COALESCE(pt.merchant_name, pt.name))) AS description, s.name, s.category
       FROM plaid_income_links l
       JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id
       JOIN income_sources s ON s.id = l.income_source_id
       ORDER BY l.landed_date DESC, l.id DESC`
    );
    const learned = new Map();
    for (const { description, name, category } of rows) {
      if (!description) continue;
      const list = learned.get(description) || [];
      if (!list.some(entry => entry.name.toLowerCase() === name.toLowerCase())) list.push({ name, category });
      learned.set(description, list);
    }
    return learned;
  }

  /**
   * Atomically move a 'new' transaction to `status` and link it to an income source.
   * @param {'matched'|'added'} status matched = confirmed an expected source; added = Add as income
   * @returns {Promise<boolean>} false when the transaction was no longer 'new'
   */
  async linkIncomeSource(transactionId, incomeSourceId, landedDate, plannedAmount, status = 'matched') {
    return dbHelper.runInTransaction(async (tx) => {
      const { changes } = await tx.run(
        "UPDATE plaid_transactions SET status = ?, expense_id = NULL WHERE id = ? AND status = 'new'",
        [status, transactionId]
      );
      if (changes === 0) return false;
      await tx.run(
        'INSERT INTO plaid_income_links (plaid_transaction_id, income_source_id, landed_date, planned_amount) VALUES (?, ?, ?, ?)',
        [transactionId, incomeSourceId, landedDate, plannedAmount]
      );
      return true;
    });
  }

  /** Undo linkIncomeSource (used when a follow-up step fails). */
  async unlinkIncomeSource(transactionId) {
    await dbHelper.runInTransaction(async (tx) => {
      await tx.run('DELETE FROM plaid_income_links WHERE plaid_transaction_id = ?', [transactionId]);
      await tx.run("UPDATE plaid_transactions SET status = 'new' WHERE id = ? AND status IN ('matched', 'added')", [transactionId]);
    });
  }

  /**
   * Bank confirmations for the given income sources.
   * @returns {Promise<Map<number, {landedDate: string, amount: number, plannedAmount: (number|null), name: string}>>}
   */
  async findConfirmationsForIncomeSources(incomeSourceIds) {
    const confirmations = new Map();
    if (incomeSourceIds.length === 0) return confirmations;
    const rows = await dbHelper.queryAll(
      `SELECT l.income_source_id AS incomeSourceId, l.landed_date AS landedDate, l.planned_amount AS plannedAmount,
              ABS(pt.amount) AS amount, COALESCE(pt.merchant_name, pt.name) AS name
       FROM plaid_income_links l
       JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id
       WHERE l.income_source_id IN (${incomeSourceIds.map(() => '?').join(',')})`,
      incomeSourceIds
    );
    for (const { incomeSourceId, ...confirmation } of rows) {
      confirmations.set(incomeSourceId, confirmation);
    }
    return confirmations;
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

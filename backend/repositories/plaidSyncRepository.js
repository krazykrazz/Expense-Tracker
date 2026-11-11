const dbHelper = require('../utils/dbHelper');
const plaidRepository = require('./plaidRepository');
const { FILE_ID_PREFIX, SAME_TXN_DAYS, mergePlaidIntoFileRow, sameTransaction } = require('../utils/bankFileImport');
const { PENDING_AMOUNT_TOLERANCE } = require('../utils/plaidMatching');
const { STAGED_COLUMNS, pfcValues, PFC_SET_FIELDS } = require('./plaidSql');

/** The row a transaction id identifies, as the handlers need it. */
const EXISTING_COLUMNS = 'id, status, amount, pending, expense_id AS expenseId';
/** Columns a Plaid transaction sets; a purchase date and merchant name another source supplied are kept when Plaid sends none. */
const SET_FIELDS = `plaid_account_id = ?, amount = ?, iso_currency_code = ?, date = ?, authorized_date = COALESCE(?, authorized_date),
  name = ?, merchant_name = COALESCE(?, merchant_name), pending = ?, pending_transaction_id = ?, ${PFC_SET_FIELDS}`;

const settlement = (row, txn, { settled, postedDate }) => ({
  plaidTransactionId: row.id, expenseId: row.expenseId, settled, previousAmount: row.amount, amount: txn.amount, postedDate
});

/**
 * Applies one fully-paginated /transactions/sync result to the staged transactions. Each incoming transaction goes
 * to exactly one handler, tried in this order:
 * - new id that names its pending version → {@link _replacePending} (settles in place);
 * - new id matching a bank-file row → {@link _takeOverFileRow};
 * - new id matching a row kept from a disconnected bank → {@link _reattachOrphan};
 * - new id → {@link _insert};
 * - known id, settled row, Plaid says pending → ignored (a charge never goes back to pending);
 * - known id, pending row, Plaid says settled → {@link _settleInPlace};
 * - known id, row still to review (or pending on both sides) → {@link _update};
 * - known id, reviewed and settled → left alone (the user's decision stands).
 */
class PlaidSyncRepository {
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
   * @returns {Promise<{added: number, updated: number, removed: number, reattached: number, fromFile: number, settlements: Array}>}
   */
  async applySyncBatch(plaidItemId, { accounts, upserts, removedIds, cursor }) {
    return dbHelper.runInTransaction(async (tx) => {
      for (const account of accounts) {
        await plaidRepository.upsertAccount(plaidItemId, account, tx);
      }
      const ctx = await this._context(tx, plaidItemId, upserts);

      for (const txn of upserts) {
        await this._applyUpsert(ctx, txn);
      }
      for (const transactionId of removedIds) {
        await this._applyRemoval(ctx, transactionId);
      }

      await tx.run(
        'UPDATE plaid_items SET sync_cursor = ?, last_synced_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?',
        [cursor, plaidItemId]
      );
      return { ...ctx.counts, settlements: ctx.settlements };
    });
  }

  /** What the handlers share for one batch: the connection, account ids, counts and settlements so far. */
  async _context(tx, plaidItemId, upserts) {
    const accountRows = await tx.all('SELECT id, account_id FROM plaid_accounts WHERE plaid_item_id = ?', [plaidItemId]);
    let reportsPending = null;
    return {
      tx,
      accountIdMap: new Map(accountRows.map(row => [row.account_id, row.id])),
      counts: { added: 0, updated: 0, removed: 0, reattached: 0, fromFile: 0 },
      settlements: [],
      // Rows from a file or a disconnected bank already claimed by a transaction in this batch
      claimed: new Set(),
      /** Whether this bank sends pending charges through Plaid at all (Wealthsimple doesn't); asked once per batch. */
      async bankReportsPending() {
        if (reportsPending === null) {
          reportsPending = upserts.some(t => t.pending || t.pending_transaction_id) || Boolean(await tx.get(
            `SELECT 1 AS yes FROM plaid_transactions pt JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
             WHERE pa.plaid_item_id = ? AND pt.transaction_id NOT LIKE '${FILE_ID_PREFIX}%'
               AND (pt.pending = 1 OR pt.pending_transaction_id IS NOT NULL) LIMIT 1`,
            [plaidItemId]
          ));
        }
        return reportsPending;
      }
    };
  }

  /** The values for SET_FIELDS, in order. */
  _values(ctx, txn) {
    return [
      ctx.accountIdMap.get(txn.account_id) ?? null, txn.amount, txn.iso_currency_code ?? null, txn.date,
      txn.authorized_date ?? null, txn.name ?? null, txn.merchant_name ?? null, txn.pending ? 1 : 0,
      txn.pending_transaction_id ?? null, ...pfcValues(txn)
    ];
  }

  async _applyUpsert(ctx, txn) {
    const pending = Boolean(txn.pending);
    const existing = await ctx.tx.get(`SELECT ${EXISTING_COLUMNS} FROM plaid_transactions WHERE transaction_id = ?`, [txn.transaction_id]);

    if (!existing) {
      if (!pending && txn.pending_transaction_id && await this._replacePending(ctx, txn)) return;
      if (await this._takeOverFileRow(ctx, txn)) return;
      if (await this._reattachOrphan(ctx, txn)) return;
      await this._insert(ctx, txn);
    } else if (!existing.pending && pending) {
      // A file already showed it settled; a pending charge never goes back to pending
    } else if (existing.pending && !pending) {
      await this._settleInPlace(ctx, txn, existing);
    } else if (existing.status === 'new' || (existing.pending && pending)) {
      await this._update(ctx, txn, existing);
    }
  }

  /**
   * A settled transaction that names its pending version: it replaces that row in place (Plaid's new id, review
   * state and links kept), whether the row is still pending or a bank file already showed it settled.
   * @returns {Promise<boolean>} false when the pending version isn't staged
   */
  async _replacePending(ctx, txn) {
    const pendingRow = await ctx.tx.get(`SELECT ${EXISTING_COLUMNS} FROM plaid_transactions WHERE transaction_id = ?`, [txn.pending_transaction_id]);
    if (!pendingRow) return false;
    await ctx.tx.run(
      `UPDATE plaid_transactions SET transaction_id = ?, ${SET_FIELDS}, removed_at = NULL WHERE id = ?`,
      [txn.transaction_id, ...this._values(ctx, txn), pendingRow.id]
    );
    ctx.counts.updated++;
    if (pendingRow.expenseId && pendingRow.pending) {
      ctx.settlements.push(settlement(pendingRow, txn, { settled: true, postedDate: txn.date }));
    }
    return true;
  }

  /**
   * Brought in from a bank file while Plaid couldn't fetch: Plaid's version takes over that row, keeping its review
   * state, expense link and whatever the file knew better (see utils/bankFileImport mergePlaidIntoFileRow).
   * @returns {Promise<boolean>} false when no file row matches
   */
  async _takeOverFileRow(ctx, txn) {
    const plaidAccountId = ctx.accountIdMap.get(txn.account_id);
    const fromFile = await this._findFileRow(ctx.tx, txn, plaidAccountId, ctx.claimed);
    if (!fromFile) return false;
    ctx.claimed.add(fromFile.id);
    const { fields, settlement: change } = mergePlaidIntoFileRow(fromFile, txn, await ctx.bankReportsPending());
    await ctx.tx.run(
      `UPDATE plaid_transactions SET transaction_id = ?, plaid_account_id = ?, amount = ?, iso_currency_code = ?, date = ?,
         authorized_date = ?, name = ?, merchant_name = ?, pending = ?, pending_transaction_id = ?, removed_at = NULL,
         ${PFC_SET_FIELDS}
       WHERE id = ?`,
      [fields.transactionId, plaidAccountId, fields.amount, fields.isoCurrencyCode, fields.date,
        fields.authorizedDate, fields.name, fields.merchantName, fields.pending, fields.pendingTransactionId,
        ...pfcValues(txn), fromFile.id]
    );
    ctx.counts.fromFile++;
    ctx.counts.updated++;
    if (change) ctx.settlements.push(change);
    return true;
  }

  /**
   * Same bank connected again: Plaid re-sends recent history under new ids. Re-attach rows kept from the old
   * connection instead of staging duplicates the user would have to recognise and ignore.
   * @returns {Promise<boolean>} false when no kept row matches
   */
  async _reattachOrphan(ctx, txn) {
    const orphan = await this._findReconnectOrphan(ctx.tx, txn, ctx.claimed);
    if (!orphan) return false;
    ctx.claimed.add(orphan.id);
    await ctx.tx.run(
      `UPDATE plaid_transactions SET transaction_id = ?, ${SET_FIELDS}, removed_at = NULL WHERE id = ?`,
      [txn.transaction_id, ...this._values(ctx, txn), orphan.id]
    );
    ctx.counts.reattached++;
    const settledNow = Boolean(orphan.pending) && !txn.pending;
    if (orphan.expenseId && (settledNow || orphan.amount !== txn.amount)) {
      ctx.settlements.push(settlement(orphan, txn, { settled: settledNow, postedDate: txn.pending ? null : txn.date }));
    }
    return true;
  }

  async _insert(ctx, txn) {
    await ctx.tx.run(
      `INSERT INTO plaid_transactions
         (plaid_account_id, amount, iso_currency_code, date, authorized_date, name, merchant_name, pending,
          pending_transaction_id, pfc_primary, pfc_detailed, pfc_confidence, transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...this._values(ctx, txn), txn.transaction_id]
    );
    ctx.counts.added++;
  }

  /**
   * Settled under its own id: a charge kept pending because a bank file said so (Wealthsimple) and Plaid now sends a
   * change. Reviewed or not, it follows the bank.
   */
  async _settleInPlace(ctx, txn, existing) {
    await ctx.tx.run(`UPDATE plaid_transactions SET ${SET_FIELDS}, removed_at = NULL WHERE id = ?`, [...this._values(ctx, txn), existing.id]);
    ctx.counts.updated++;
    if (existing.expenseId) {
      ctx.settlements.push(settlement(existing, txn, { settled: true, postedDate: txn.date }));
    }
  }

  /** A row still to review follows the bank; a linked pending one also reports an amount change. */
  async _update(ctx, txn, existing) {
    await ctx.tx.run(`UPDATE plaid_transactions SET ${SET_FIELDS} WHERE id = ?`, [...this._values(ctx, txn), existing.id]);
    ctx.counts.updated++;
    if (existing.status !== 'new' && existing.expenseId && existing.amount !== txn.amount) {
      ctx.settlements.push(settlement(existing, txn, { settled: false, postedDate: null }));
    }
  }

  /**
   * Plaid removed a transaction: unreviewed rows (and an ignored pending one) are deleted; a linked pending charge is
   * kept and flagged (`removed_at`) for review in the Inbox. Reviewed settled rows stay.
   */
  async _applyRemoval(ctx, transactionId) {
    const { changes } = await ctx.tx.run(
      "DELETE FROM plaid_transactions WHERE transaction_id = ? AND (status = 'new' OR (status = 'ignored' AND pending = 1))",
      [transactionId]
    );
    const { changes: flagged } = await ctx.tx.run(
      `UPDATE plaid_transactions SET removed_at = CURRENT_TIMESTAMP
       WHERE transaction_id = ? AND pending = 1 AND status IN ('added', 'matched') AND removed_at IS NULL`,
      [transactionId]
    );
    ctx.counts.removed += changes + flagged;
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
         AND ABS(amount - ?) <= ABS(amount) * ?
         AND (COALESCE(name, '') = COALESCE(?, '') OR (merchant_name IS NOT NULL AND merchant_name = ?))
       ORDER BY ABS(amount - ?), id LIMIT 1`,
      [...excluded, purchaseDate, txn.amount, PENDING_AMOUNT_TOLERANCE, txn.name ?? null, txn.merchant_name ?? null, txn.amount]
    )) || null;
  }
}

module.exports = new PlaidSyncRepository();

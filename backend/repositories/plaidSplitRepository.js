const dbHelper = require('../utils/dbHelper');

const placeholders = (values) => values.map(() => '?').join(',');
const allOn = (conn) => (conn ? conn.all : dbHelper.queryAll);

/**
 * Expense columns for splits: what was charged, and which bank row (if any) the expense is already linked to,
 * as its primary expense (`primaryOf`) or as a part of a split (`partOf`).
 */
const EXPENSE_SELECT = `
  SELECT e.id, e.date, e.place, e.notes, e.type, e.amount, e.original_cost AS originalCost,
         COALESCE(e.original_cost, e.amount) AS chargedAmount, e.payment_method_id AS paymentMethodId,
         (SELECT pt.id FROM plaid_transactions pt WHERE pt.expense_id = e.id) AS primaryOf,
         (SELECT s.plaid_transaction_id FROM plaid_split_links s WHERE s.expense_id = e.id) AS partOf
  FROM expenses e`;

/**
 * Data access for bank charges split across several expenses (spec 3.9). The bank row's `expense_id` is the
 * primary part; the others are `plaid_split_links`. Writes take the runInTransaction connection.
 */
class PlaidSplitRepository {
  /**
   * Expenses on a payment method dated in [fromDate, toDate] that no bank row is linked to (neither as its
   * primary nor as a part), newest-first order is left to the caller.
   */
  async findUnlinkedExpenses(paymentMethodId, fromDate, toDate) {
    return dbHelper.queryAll(
      `SELECT e.id, e.date, e.place, e.notes, e.type, e.amount, e.original_cost AS originalCost,
              COALESCE(e.original_cost, e.amount) AS chargedAmount, e.payment_method_id AS paymentMethodId
       FROM expenses e
       WHERE e.payment_method_id = ? AND e.date >= ? AND e.date <= ?
         AND NOT EXISTS (SELECT 1 FROM plaid_transactions pt WHERE pt.expense_id = e.id)
         AND NOT EXISTS (SELECT 1 FROM plaid_split_links s WHERE s.expense_id = e.id)
       ORDER BY e.date, e.id`,
      [paymentMethodId, fromDate, toDate]
    );
  }

  /** The given expenses with what they are linked to, on `conn` when given. */
  async findExpensesByIds(expenseIds, conn = null) {
    if (expenseIds.length === 0) return [];
    return allOn(conn)(`${EXPENSE_SELECT} WHERE e.id IN (${placeholders(expenseIds)})`, expenseIds);
  }

  /** The expenses of a bank row: the primary first, then the other parts in the order they were added. */
  async findParts(transactionId, conn = null) {
    return allOn(conn)(
      `${EXPENSE_SELECT}
       WHERE e.id IN (
         SELECT expense_id FROM plaid_transactions WHERE id = ? AND expense_id IS NOT NULL
         UNION SELECT expense_id FROM plaid_split_links WHERE plaid_transaction_id = ?
       )
       ORDER BY (primaryOf IS NULL), (SELECT s.id FROM plaid_split_links s WHERE s.expense_id = e.id), e.id`,
      [transactionId, transactionId]
    );
  }

  /**
   * Parts of the given bank rows, for rows that have any: `{ transactionId, expenseId, chargedAmount }` per part
   * (not including the primary).
   */
  async findPartsForTransactions(transactionIds) {
    if (transactionIds.length === 0) return [];
    return dbHelper.queryAll(
      `SELECT s.plaid_transaction_id AS transactionId, s.expense_id AS expenseId,
              COALESCE(e.original_cost, e.amount) AS chargedAmount
       FROM plaid_split_links s JOIN expenses e ON e.id = s.expense_id
       WHERE s.plaid_transaction_id IN (${placeholders(transactionIds)})
       ORDER BY s.id`,
      transactionIds
    );
  }

  /**
   * For the given bank rows that are split: how many expenses they have and what those were charged in total.
   * @returns {Promise<Map<number, {parts: number, total: number}>>} by bank row id
   */
  async findSplitTotals(transactionIds) {
    const totals = new Map();
    const CHUNK = 500;
    for (let i = 0; i < transactionIds.length; i += CHUNK) {
      const chunk = transactionIds.slice(i, i + CHUNK);
      const rows = await dbHelper.queryAll(
        `SELECT s.plaid_transaction_id AS transactionId, 1 + COUNT(*) AS parts,
                ROUND(COALESCE(pe.original_cost, pe.amount) + SUM(COALESCE(e.original_cost, e.amount)), 2) AS total
         FROM plaid_split_links s
         JOIN expenses e ON e.id = s.expense_id
         JOIN plaid_transactions pt ON pt.id = s.plaid_transaction_id
         JOIN expenses pe ON pe.id = pt.expense_id
         WHERE s.plaid_transaction_id IN (${placeholders(chunk)})
         GROUP BY s.plaid_transaction_id`,
        chunk
      );
      for (const { transactionId, parts, total } of rows) totals.set(transactionId, { parts, total });
    }
    return totals;
  }

  /**
   * The bank row an expense is a part of (not its primary), for the expense list: the same link shape as
   * plaidRepository.findLinksForExpenses.
   * @returns {Promise<Map<number, object>>} by expense id
   */
  async findPartLinks(expenseIds) {
    const links = new Map();
    const CHUNK = 500;
    for (let i = 0; i < expenseIds.length; i += CHUNK) {
      const chunk = expenseIds.slice(i, i + CHUNK);
      const rows = await dbHelper.queryAll(
        `SELECT s.expense_id AS expenseId, pt.id AS bankTransactionId, pt.status, COALESCE(pt.merchant_name, pt.name) AS name,
                pt.name AS rawName, COALESCE(pt.authorized_date, pt.date) AS date, pt.amount, pt.pending,
                pt.removed_at IS NOT NULL AS removed, pt.plaid_account_id IS NULL AS disconnected
         FROM plaid_split_links s JOIN plaid_transactions pt ON pt.id = s.plaid_transaction_id
         WHERE s.expense_id IN (${placeholders(chunk)})`,
        chunk
      );
      for (const { expenseId, pending, removed, disconnected, ...link } of rows) {
        links.set(expenseId, { ...link, pending: Boolean(pending), removed: Boolean(removed), disconnected: Boolean(disconnected) });
      }
    }
    return links;
  }

  /**
   * Bank links for the expense list with splits folded in: the given links (expenses that are a bank row's primary)
   * plus the row's link for expenses that are other parts of a split, each carrying `split: { parts, total }` when
   * its row is split (total: what its expenses were charged in all).
   * @param {Map<number, object>} primaryLinks plaidRepository.findLinksForExpenses
   * @returns {Promise<Map<number, object>>}
   */
  async linksWithSplits(expenseIds, primaryLinks) {
    const partLinks = await this.findPartLinks(expenseIds);
    const merged = new Map(primaryLinks);
    for (const [expenseId, link] of partLinks) merged.set(expenseId, link);
    const totals = await this.findSplitTotals([...new Set([...merged.values()].map(link => link.bankTransactionId))]);
    for (const link of merged.values()) {
      const split = totals.get(link.bankTransactionId);
      if (split) link.split = split;
    }
    return merged;
  }

  async insertParts(conn, transactionId, expenseIds) {
    for (const expenseId of expenseIds) {
      await conn.run('INSERT INTO plaid_split_links (plaid_transaction_id, expense_id) VALUES (?, ?)', [transactionId, expenseId]);
    }
  }

  /** Take a part out of its split. @returns {Promise<boolean>} false when it wasn't a part */
  async deletePart(conn, expenseId) {
    const { changes } = await conn.run('DELETE FROM plaid_split_links WHERE expense_id = ?', [expenseId]);
    return changes > 0;
  }

  /**
   * Make a part the bank row's primary expense: its link row goes and the row's `expense_id` is replaced (the
   * previous primary was removed from the charge by the caller).
   */
  async promotePart(conn, transactionId, expenseId) {
    await conn.run('DELETE FROM plaid_split_links WHERE expense_id = ? AND plaid_transaction_id = ?', [expenseId, transactionId]);
    await conn.run('UPDATE plaid_transactions SET expense_id = ? WHERE id = ?', [expenseId, transactionId]);
  }
}

module.exports = new PlaidSplitRepository();

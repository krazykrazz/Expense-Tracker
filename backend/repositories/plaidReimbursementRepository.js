const dbHelper = require('../utils/dbHelper');

/**
 * Expense columns for reimbursements: what it cost out of pocket and was charged, how much of the difference bank
 * rows account for (`repaidByBank`: each link's amount, whether it lowered the out-of-pocket or claimed a
 * reimbursement entered by hand), and what rules it out (insurance claims have their own flow, 3.7; expenses split
 * between people have per-person shares that would stop adding up).
 */
const EXPENSE_SELECT = `
  SELECT e.id, e.date, e.place, e.notes, e.type, e.method, e.payment_method_id AS paymentMethodId,
         e.amount, e.original_cost AS originalCost, COALESCE(e.insurance_eligible, 0) AS insuranceEligible,
         COALESCE((SELECT SUM(l.amount) FROM plaid_reimbursement_links l WHERE l.expense_id = e.id), 0) AS repaidByBank,
         (SELECT COUNT(*) FROM plaid_reimbursement_links l WHERE l.expense_id = e.id) AS linkCount,
         (SELECT f.previous_original_cost FROM plaid_reimbursement_links f
            WHERE f.expense_id = e.id ORDER BY f.id LIMIT 1) AS firstPreviousOriginalCost,
         (SELECT pt.merchant_entity_id FROM plaid_transactions pt WHERE pt.expense_id = e.id LIMIT 1) AS merchantEntityId,
         EXISTS (SELECT 1 FROM expense_people ep WHERE ep.expense_id = e.id) AS hasPeople
  FROM expenses e`;

const LINK_COLUMNS = `id, plaid_transaction_id AS plaidTransactionId, expense_id AS expenseId, kind, amount,
  applied_amount AS appliedAmount, previous_original_cost AS previousOriginalCost, previous_amount AS previousAmount,
  credit_card_payment_id AS creditCardPaymentId`;

const placeholders = (values) => values.map(() => '?').join(',');
const allOn = (conn) => (conn ? conn.all : dbHelper.queryAll);
const getOn = (conn) => (conn ? conn.get : dbHelper.queryOne);

/**
 * Data access for reimbursements (spec 3.6 refunds, 3.8 deposits): candidate expenses, the links between bank
 * rows and expenses, and the writes, which take the runInTransaction connection so a bank row, its links, the
 * expense changes and a refund's card payment commit together.
 */
class PlaidReimbursementRepository {
  /**
   * Expenses dated in [fromDate, toDate] a bank row could have repaid (not insurance claims, not split between
   * people), optionally only those on one payment method.
   */
  async findCandidateExpenses(fromDate, toDate, paymentMethodId = null) {
    const rows = await dbHelper.queryAll(
      `${EXPENSE_SELECT}
       WHERE e.date BETWEEN ? AND ? AND COALESCE(e.insurance_eligible, 0) = 0
         AND NOT EXISTS (SELECT 1 FROM expense_people ep WHERE ep.expense_id = e.id)
         ${paymentMethodId ? 'AND e.payment_method_id = ?' : ''}
       ORDER BY e.date DESC, e.id DESC`,
      paymentMethodId ? [fromDate, toDate, paymentMethodId] : [fromDate, toDate]
    );
    return rows.map(row => ({ ...row, hasPeople: Boolean(row.hasPeople) }));
  }

  /** The given expenses (whatever they are, for validation), on `conn` when given. */
  async findExpensesByIds(expenseIds, conn = null) {
    if (expenseIds.length === 0) return [];
    const rows = await allOn(conn)(`${EXPENSE_SELECT} WHERE e.id IN (${placeholders(expenseIds)})`, expenseIds);
    return rows.map(row => ({ ...row, hasPeople: Boolean(row.hasPeople) }));
  }

  /** What a bank row repaid, oldest link first. */
  async findLinksForTransaction(transactionId, conn = null) {
    return allOn(conn)(`SELECT ${LINK_COLUMNS} FROM plaid_reimbursement_links WHERE plaid_transaction_id = ? ORDER BY id`, [transactionId]);
  }

  /** An expense's links, oldest first. */
  async findLinksForExpense(expenseId, conn = null) {
    return allOn(conn)(`SELECT ${LINK_COLUMNS} FROM plaid_reimbursement_links WHERE expense_id = ? ORDER BY id`, [expenseId]);
  }

  /** The refund that created a card payment, or null. */
  async findRefundForPayment(paymentId, conn = null) {
    return getOn(conn)(
      `SELECT l.expense_id AS expenseId, l.plaid_transaction_id AS plaidTransactionId, e.place, e.date
       FROM plaid_reimbursement_links l JOIN expenses e ON e.id = l.expense_id
       WHERE l.credit_card_payment_id = ?`,
      [paymentId]
    );
  }

  /**
   * Refunds behind card payments, for the card view.
   * @returns {Promise<Map<number, {expenseId: number, place: (string|null), date: string, bank: object}>>}
   */
  async findRefundsForPayments(paymentIds) {
    const byPayment = new Map();
    const CHUNK = 500;
    for (let i = 0; i < paymentIds.length; i += CHUNK) {
      const chunk = paymentIds.slice(i, i + CHUNK);
      const rows = await dbHelper.queryAll(
        `SELECT l.credit_card_payment_id AS paymentId, l.expense_id AS expenseId, e.place, e.date AS expenseDate,
                pt.date, pt.amount, COALESCE(pt.merchant_name, pt.name) AS name, pa.name AS accountName, pa.mask AS accountMask
         FROM plaid_reimbursement_links l
         JOIN expenses e ON e.id = l.expense_id
         JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id
         LEFT JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
         WHERE l.credit_card_payment_id IN (${placeholders(chunk)})`,
        chunk
      );
      for (const { paymentId, expenseId, place, expenseDate, ...bank } of rows) {
        byPayment.set(paymentId, { expenseId, place, date: expenseDate, bank: { side: 'card', ...bank } });
      }
    }
    return byPayment;
  }

  /**
   * Lower-cased places that deposits with the same bank description were applied to before, keyed by
   * plaidMatching.descriptionKey inputs.
   * @returns {Promise<Array<{merchantName: (string|null), name: string, place: string}>>}
   */
  async findLearnedDepositPlaces() {
    return dbHelper.queryAll(
      `SELECT DISTINCT pt.merchant_name AS merchantName, pt.name, e.place
       FROM plaid_reimbursement_links l
       JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id
       JOIN expenses e ON e.id = l.expense_id
       WHERE l.kind = 'deposit' AND e.place IS NOT NULL`
    );
  }

  /**
   * Bank reimbursements of expenses, oldest first, for the expense list and form. All of them in one query: the
   * table only holds expenses repaid through the bank, far fewer than the expense list.
   * @returns {Promise<Map<number, Array<{plaidTransactionId: number, kind: string, amount: number, date: string, name: string}>>>}
   */
  async findReimbursementsByExpense() {
    const byExpense = new Map();
    const rows = await dbHelper.queryAll(
      `SELECT l.expense_id AS expenseId, l.plaid_transaction_id AS plaidTransactionId, l.kind, l.amount,
              pt.date, COALESCE(pt.merchant_name, pt.name) AS name
       FROM plaid_reimbursement_links l
       JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id
       ORDER BY l.id`
    );
    for (const { expenseId, ...reimbursement } of rows) {
      const list = byExpense.get(expenseId) || [];
      list.push(reimbursement);
      byExpense.set(expenseId, list);
    }
    return byExpense;
  }

  // ─── Writes (on the runInTransaction connection) ───

  /** Move a row still waiting for review to 'matched'. @returns {Promise<boolean>} false when it wasn't 'new' */
  async markMatched(conn, transactionId) {
    const { changes } = await conn.run(
      "UPDATE plaid_transactions SET status = 'matched', expense_id = NULL WHERE id = ? AND status = 'new'",
      [transactionId]
    );
    return changes > 0;
  }

  /** Send a matched row back to the Inbox. @returns {Promise<boolean>} false when it wasn't 'matched' */
  async markNew(conn, transactionId) {
    const { changes } = await conn.run(
      "UPDATE plaid_transactions SET status = 'new' WHERE id = ? AND status = 'matched'",
      [transactionId]
    );
    return changes > 0;
  }

  async insertLink(conn, link) {
    await conn.run(
      `INSERT INTO plaid_reimbursement_links
         (plaid_transaction_id, expense_id, kind, amount, applied_amount, previous_original_cost, previous_amount, credit_card_payment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [link.transactionId, link.expenseId, link.kind, link.amount, link.appliedAmount, link.previousOriginalCost,
        link.previousAmount, link.creditCardPaymentId ?? null]
    );
  }

  async deleteLinksForTransaction(conn, transactionId) {
    await conn.run('DELETE FROM plaid_reimbursement_links WHERE plaid_transaction_id = ?', [transactionId]);
  }

  /** Set an expense's out-of-pocket amount and original cost. */
  async updateExpense(conn, expenseId, { amount, originalCost }) {
    await conn.run('UPDATE expenses SET amount = ?, original_cost = ? WHERE id = ?', [amount, originalCost, expenseId]);
  }

  /** Remove a card payment (the credit a refund recorded), inside the transaction. */
  async deletePayment(conn, paymentId) {
    await conn.run('DELETE FROM credit_card_payments WHERE id = ?', [paymentId]);
  }
}

module.exports = new PlaidReimbursementRepository();

const dbHelper = require('../utils/dbHelper');
const { descriptionKey } = require('../utils/plaidMatching');

/**
 * What a bank transaction can be linked to besides an expense, each in its own link table keyed by
 * `plaid_transaction_id`. Table and column names come only from this map (never from input).
 */
const LINKS = {
  fixedExpense: { table: 'plaid_fixed_expense_links', columns: ['fixed_expense_id', 'landed_date', 'planned_amount'] },
  incomeSource: { table: 'plaid_income_links', columns: ['income_source_id', 'landed_date', 'planned_amount'] },
  cardPayment: { table: 'plaid_card_payment_links', columns: ['credit_card_payment_id', 'side'] }
};

/**
 * Mark a bank row reviewed and add its link row, on `conn` (a runInTransaction connection), so both happen or
 * neither does. The row must still be waiting for review: a sync may have changed it meanwhile.
 * @param {{run: Function}} conn
 * @param {keyof LINKS} kind
 * @param {Array} values one per column of the link table, in LINKS order
 * @param {'matched'|'added'} [status]
 * @returns {Promise<boolean>} false when the row was no longer 'new' (nothing changed); constraint errors propagate
 */
async function linkTransaction(conn, kind, transactionId, values, status = 'matched') {
  const { table, columns } = LINKS[kind];
  const { changes } = await conn.run(
    "UPDATE plaid_transactions SET status = ?, expense_id = NULL WHERE id = ? AND status = 'new'",
    [status, transactionId]
  );
  if (changes === 0) return false;
  await conn.run(
    `INSERT INTO ${table} (plaid_transaction_id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`,
    [transactionId, ...values]
  );
  return true;
}

/**
 * Undo linkTransaction (a follow-up step failed): remove the link row and send the bank row back to the Inbox.
 * @param {Array<'matched'|'added'>} fromStatuses the statuses the row may be in
 */
async function unlinkTransaction(kind, transactionId, fromStatuses = ['matched']) {
  const { table } = LINKS[kind];
  await dbHelper.runInTransaction(async (tx) => {
    await tx.run(`DELETE FROM ${table} WHERE plaid_transaction_id = ?`, [transactionId]);
    await tx.run(
      `UPDATE plaid_transactions SET status = 'new' WHERE id = ? AND status IN (${fromStatuses.map(() => '?').join(', ')})`,
      [transactionId, ...fromStatuses]
    );
  });
}

/**
 * Bank links to fixed expenses and income sources: candidates the Inbox offers, linking (confirming) and the
 * confirmations the Fixed Expenses and Income screens show. Card payment links are in plaidCardPaymentRepository
 * (they commit together with the payment), using the same linkTransaction.
 */
class PlaidLinkRepository {
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
              fe.linked_loan_id AS linkedLoanId,
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
    return dbHelper.runInTransaction(tx => linkTransaction(tx, 'fixedExpense', transactionId, [fixedExpenseId, landedDate, plannedAmount]));
  }

  /** Undo linkFixedExpense (used when a follow-up step fails). */
  async unlinkFixedExpense(transactionId) {
    await unlinkTransaction('fixedExpense', transactionId, ['matched']);
  }

  /**
   * Name the loan payment a bank payment confirming a loan's fixed expense is (spec 3.5). A payment another
   * confirmation already names is a `UNIQUE constraint failed` error.
   * @returns {Promise<boolean>} false when the transaction confirms no fixed expense
   */
  async setLoanPayment(transactionId, loanPaymentId) {
    const { changes } = await dbHelper.execute(
      'UPDATE plaid_fixed_expense_links SET loan_payment_id = ? WHERE plaid_transaction_id = ?',
      [loanPaymentId, transactionId]
    );
    return changes > 0;
  }

  /**
   * The loans (not paid off) and their payments, dated in [fromDate, toDate], that no confirmation names yet:
   * what a bank payment can be recorded as or linked to.
   * @returns {Promise<{loans: Map<number, {id: number, name: string, loanType: string, isPaidOff: boolean}>,
   *   payments: Array<{id: number, loan_id: number, payment_date: string, amount: number}>}>}
   */
  async findLoanPaymentOffers(loanIds, fromDate, toDate) {
    const marks = loanIds.map(() => '?').join(',');
    const loans = await dbHelper.queryAll(
      `SELECT id, name, loan_type AS loanType, is_paid_off AS isPaidOff FROM loans WHERE id IN (${marks})`,
      loanIds
    );
    const payments = await dbHelper.queryAll(
      `SELECT p.id, p.loan_id, p.payment_date, p.amount FROM loan_payments p
       WHERE p.loan_id IN (${marks}) AND p.payment_date BETWEEN ? AND ?
         AND NOT EXISTS (SELECT 1 FROM plaid_fixed_expense_links l WHERE l.loan_payment_id = p.id)`,
      [...loanIds, fromDate, toDate]
    );
    return { loans: new Map(loans.map(loan => [loan.id, { ...loan, isPaidOff: Boolean(loan.isPaidOff) }])), payments };
  }

  /** One loan payment of a loan that no confirmation names yet, or null. */
  async findUnclaimedLoanPayment(paymentId) {
    return dbHelper.queryOne(
      `SELECT p.id, p.loan_id, p.payment_date, p.amount FROM loan_payments p
       WHERE p.id = ? AND NOT EXISTS (SELECT 1 FROM plaid_fixed_expense_links l WHERE l.loan_payment_id = p.id)`,
      [paymentId]
    );
  }

  /**
   * Bank confirmations of the given loan payments (the fixed expense a bank payment confirmed, named for it).
   * @returns {Promise<Map<number, {landedDate: string, amount: number, plannedAmount: (number|null), name: string, fixedExpenseName: string}>>}
   */
  async findConfirmationsForLoanPayments(loanPaymentIds) {
    const confirmations = new Map();
    if (loanPaymentIds.length === 0) return confirmations;
    const rows = await dbHelper.queryAll(
      `SELECT l.loan_payment_id AS loanPaymentId, l.landed_date AS landedDate, l.planned_amount AS plannedAmount,
              pt.amount, COALESCE(pt.merchant_name, pt.name) AS name, fe.name AS fixedExpenseName
       FROM plaid_fixed_expense_links l
       JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id
       JOIN fixed_expenses fe ON fe.id = l.fixed_expense_id
       WHERE l.loan_payment_id IN (${loanPaymentIds.map(() => '?').join(',')})`,
      loanPaymentIds
    );
    for (const { loanPaymentId, ...confirmation } of rows) {
      confirmations.set(loanPaymentId, confirmation);
    }
    return confirmations;
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
   * most recent first, keyed by plaidMatching.descriptionKey (the same key the Inbox looks rows up by).
   * @returns {Promise<Map<string, Array<{name: string, category: string}>>>}
   */
  async findLearnedIncomeNames() {
    const rows = await dbHelper.queryAll(
      `SELECT pt.merchant_name AS merchantName, pt.name AS bankName, s.name, s.category
       FROM plaid_income_links l
       JOIN plaid_transactions pt ON pt.id = l.plaid_transaction_id
       JOIN income_sources s ON s.id = l.income_source_id
       ORDER BY l.landed_date DESC, l.id DESC`
    );
    const learned = new Map();
    for (const { merchantName, bankName, name, category } of rows) {
      const key = descriptionKey({ merchantName, name: bankName });
      if (!key) continue;
      const list = learned.get(key) || [];
      if (!list.some(entry => entry.name.toLowerCase() === name.toLowerCase())) list.push({ name, category });
      learned.set(key, list);
    }
    return learned;
  }

  /**
   * Atomically move a 'new' transaction to `status` and link it to an income source.
   * @param {'matched'|'added'} status matched = confirmed an expected source; added = Add as income
   * @returns {Promise<boolean>} false when the transaction was no longer 'new'
   */
  async linkIncomeSource(transactionId, incomeSourceId, landedDate, plannedAmount, status = 'matched') {
    return dbHelper.runInTransaction(tx => linkTransaction(tx, 'incomeSource', transactionId, [incomeSourceId, landedDate, plannedAmount], status));
  }

  /** Undo linkIncomeSource (used when a follow-up step fails). */
  async unlinkIncomeSource(transactionId) {
    await unlinkTransaction('incomeSource', transactionId, ['matched', 'added']);
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
}

module.exports = new PlaidLinkRepository();
module.exports.linkTransaction = linkTransaction;
module.exports.unlinkTransaction = unlinkTransaction;

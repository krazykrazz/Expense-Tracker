const dbHelper = require('../utils/dbHelper');

const placeholders = (ids) => ids.map(() => '?').join(',');

/**
 * Data access for the billing cycle check: a card's bank transactions and tracker entries over a date range,
 * each with the link to its counterpart so the check can say exactly why a cycle differs.
 */
class PlaidCycleRepository {
  /** The earliest date the bank sent for these accounts: cycles before it can't be checked. */
  async findFirstBankDate(plaidAccountIds) {
    if (plaidAccountIds.length === 0) return null;
    const row = await dbHelper.queryOne(
      `SELECT MIN(date) AS firstDate FROM plaid_transactions WHERE plaid_account_id IN (${placeholders(plaidAccountIds)})`,
      plaidAccountIds
    );
    return row?.firstDate ?? null;
  }

  /**
   * Settled bank transactions posted in the range (money out is positive), with what each is linked to:
   * an expense (and the date it counts on in the tracker), a fixed expense, or a card payment.
   */
  async findBankRows(plaidAccountIds, fromDate, toDate) {
    if (plaidAccountIds.length === 0) return [];
    return dbHelper.queryAll(
      `SELECT pt.id, pt.amount, pt.date, COALESCE(pt.merchant_name, pt.name) AS name, pt.status, pt.review_bucket AS bucket, pt.expense_id AS expenseId,
              COALESCE(e.posted_date, e.date) AS expenseDate, COALESCE(e.original_cost, e.amount) AS expenseAmount,
              EXISTS (SELECT 1 FROM plaid_fixed_expense_links fl WHERE fl.plaid_transaction_id = pt.id) AS fixedExpense,
              cpl.credit_card_payment_id AS paymentId, p.payment_date AS paymentDate
       FROM plaid_transactions pt
       LEFT JOIN expenses e ON e.id = pt.expense_id
       LEFT JOIN plaid_card_payment_links cpl ON cpl.plaid_transaction_id = pt.id AND cpl.side = 'card'
       LEFT JOIN credit_card_payments p ON p.id = cpl.credit_card_payment_id
       WHERE pt.plaid_account_id IN (${placeholders(plaidAccountIds)})
         AND pt.pending = 0 AND pt.removed_at IS NULL AND pt.date >= ? AND pt.date <= ?
       ORDER BY pt.date, pt.id`,
      [...plaidAccountIds, fromDate, toDate]
    );
  }

  /**
   * The card's expenses by the date they count on (posted date, else purchase date), with the bank
   * transaction each is linked to, if any.
   */
  async findTrackerExpenses(paymentMethodId, fromDate, toDate) {
    return dbHelper.queryAll(
      `SELECT e.id, COALESCE(e.posted_date, e.date) AS date, e.place AS name, COALESCE(e.original_cost, e.amount) AS amount,
              pt.id AS bankId, pt.date AS bankDate, pt.pending AS bankPending, pt.removed_at IS NOT NULL AS bankRemoved
       FROM expenses e
       LEFT JOIN plaid_transactions pt ON pt.expense_id = e.id
       WHERE e.payment_method_id = ? AND COALESCE(e.posted_date, e.date) >= ? AND COALESCE(e.posted_date, e.date) <= ?
       ORDER BY date, e.id`,
      [paymentMethodId, fromDate, toDate]
    );
  }

  /** The card's payments in the range, with the bank credit linked on the card side, if any. */
  async findTrackerPayments(paymentMethodId, fromDate, toDate) {
    return dbHelper.queryAll(
      `SELECT p.id, p.payment_date AS date, p.amount, 'Payment' AS name,
              pt.id AS bankId, pt.date AS bankDate, pt.pending AS bankPending, pt.removed_at IS NOT NULL AS bankRemoved
       FROM credit_card_payments p
       LEFT JOIN plaid_card_payment_links cpl ON cpl.credit_card_payment_id = p.id AND cpl.side = 'card'
       LEFT JOIN plaid_transactions pt ON pt.id = cpl.plaid_transaction_id
       WHERE p.payment_method_id = ? AND p.payment_date >= ? AND p.payment_date <= ?
       ORDER BY p.payment_date, p.id`,
      [paymentMethodId, fromDate, toDate]
    );
  }
}

module.exports = new PlaidCycleRepository();

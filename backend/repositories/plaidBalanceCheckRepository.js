const dbHelper = require('../utils/dbHelper');
const { FILE_ID_PREFIX } = require('../utils/bankFileImport');

/** Share of weekend dates above which a bank's dates are purchase dates, not posting dates (purchases: ~2 in 7). */
const MAX_WEEKEND_POSTING_SHARE = 0.1;

/**
 * Data access for the credit card balance check (plaidCardBalanceService) and the billing cycle check: mapped
 * card accounts, the bank and tracker rows that explain a balance difference, and settling pending rows the
 * balance shows have posted.
 */
class PlaidBalanceCheckRepository {
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
       WHERE plaid_account_id = ? AND pending = 0 AND transaction_id NOT LIKE '${FILE_ID_PREFIX}%'`,
      [plaidAccountId]
    );
    return row.later > 0 && row.weekend <= row.total * MAX_WEEKEND_POSTING_SHARE;
  }

  /**
   * Bank credit card accounts mapped to an active credit card payment method in the given environment,
   * with the balances received on the last sync.
   */
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
                pt.removed_at IS NOT NULL AS removed, pt.transaction_id LIKE '${FILE_ID_PREFIX}%' AS fromFile,
                (SELECT e.posted_date FROM expenses e WHERE e.id = pt.expense_id) AS expensePostedDate,
                EXISTS (SELECT 1 FROM plaid_fixed_expense_links fl WHERE fl.plaid_transaction_id = pt.id) AS fixedExpense
         FROM plaid_transactions pt
         WHERE pt.plaid_account_id IN (${placeholders})
           AND (
             (pt.removed_at IS NULL AND (pt.status IN ('new', 'ignored') OR (pt.pending = 1 AND pt.expense_id IS NOT NULL)))
             OR (pt.removed_at IS NOT NULL AND pt.pending = 1 AND pt.expense_id IS NOT NULL)
             OR (pt.removed_at IS NULL AND EXISTS (SELECT 1 FROM plaid_fixed_expense_links fl WHERE fl.plaid_transaction_id = pt.id))
             OR (pt.removed_at IS NULL AND pt.transaction_id LIKE '${FILE_ID_PREFIX}%' AND pt.expense_id IS NOT NULL)
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
         AND pt.transaction_id NOT LIKE '${FILE_ID_PREFIX}%' AND COALESCE(pt.authorized_date, pt.date) >= ?
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

module.exports = new PlaidBalanceCheckRepository();

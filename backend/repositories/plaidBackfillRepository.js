const dbHelper = require('../utils/dbHelper');
const plaidBucketRepository = require('./plaidBucketRepository');
const { FILE_ID_PREFIX } = require('../utils/bankFileFormats');
const { pfcValues, captureValues, CAPTURE_COLUMNS } = require('./plaidSql');

/** The backfill only fills what is empty (the sync helpers in plaidSql let Plaid's value win). */
const FILL_FIELDS = ['pfc_primary', 'pfc_detailed', 'pfc_confidence', ...CAPTURE_COLUMNS]
  .map(column => `${column} = COALESCE(${column}, ?)`).join(', ');

/**
 * Data access for the one-off backfills (spec 2.1 capture fields, spec 2.5.7 posted dates). Every write only
 * fills what is empty; nothing a user or the bank already set is replaced.
 */
class PlaidBackfillRepository {
  /**
   * Plaid rows of a bank still waiting for review (or ignored) that were staged before Plaid's category and
   * payment channel were kept: they lack both, and Plaid always sends the channel.
   * @returns {Promise<Array<{id: number, transactionId: string, date: string}>>}
   */
  async findCaptureCandidates(plaidItemId) {
    return dbHelper.queryAll(
      `SELECT pt.id, pt.transaction_id AS transactionId, pt.date
       FROM plaid_transactions pt
       JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
       WHERE pa.plaid_item_id = ? AND pt.status IN ('new', 'ignored') AND pt.transaction_id NOT LIKE '${FILE_ID_PREFIX}%'
         AND (pt.pfc_primary IS NULL OR pt.payment_channel IS NULL)`,
      [plaidItemId]
    );
  }

  /**
   * Fill the category and the other captured fields of the given Plaid transactions (rows still to review or
   * ignored only), then give the rows still to review the Inbox tab their category now gives them.
   * @param {Array<object>} transactions as /transactions/get returns them
   * @returns {Promise<{filled: number, moved: number}>} rows filled, rows whose Inbox tab changed
   */
  async applyCapture(plaidItemId, transactions) {
    return dbHelper.runInTransaction(async (tx) => {
      let filled = 0;
      for (const txn of transactions) {
        const { changes } = await tx.run(
          `UPDATE plaid_transactions SET ${FILL_FIELDS}
           WHERE transaction_id = ? AND status IN ('new', 'ignored')`,
          [...pfcValues(txn), ...captureValues(txn), txn.transaction_id]
        );
        filled += changes;
      }
      const moved = await plaidBucketRepository.classify(
        tx, 'pt.plaid_account_id IN (SELECT id FROM plaid_accounts WHERE plaid_item_id = ?)', [plaidItemId]
      );
      return { filled, moved };
    });
  }

  /**
   * Credit card expenses without a posted date that are linked to a settled bank transaction, with the bank's
   * date and account.
   * @returns {Promise<Array<{id: number, date: string, bankDate: string, plaidAccountId: (number|null)}>>}
   */
  async findLinkedCardExpensesWithoutPostedDate() {
    return dbHelper.queryAll(
      `SELECT e.id, e.date, pt.date AS bankDate, pt.plaid_account_id AS plaidAccountId
       FROM expenses e
       JOIN payment_methods pm ON pm.id = e.payment_method_id AND pm.type = 'credit_card'
       JOIN plaid_transactions pt ON pt.expense_id = e.id
       WHERE e.posted_date IS NULL AND pt.pending = 0 AND pt.status IN ('added', 'matched')
       ORDER BY e.date, e.id`
    );
  }

  /**
   * Set posted dates, only on expenses that still have none.
   * @param {Array<{id: number, postedDate: string}>} changes
   * @returns {Promise<number>} expenses changed
   */
  async fillPostedDates(changes) {
    return dbHelper.runInTransaction(async (tx) => {
      let changed = 0;
      for (const { id, postedDate } of changes) {
        const { changes: n } = await tx.run('UPDATE expenses SET posted_date = ? WHERE id = ? AND posted_date IS NULL', [postedDate, id]);
        changed += n;
      }
      return changed;
    });
  }
}

module.exports = new PlaidBackfillRepository();

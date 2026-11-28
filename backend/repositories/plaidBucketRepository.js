const dbHelper = require('../utils/dbHelper');
const { bucketFor } = require('../utils/plaidClassification');

/**
 * The Inbox bucket of staged rows (spec 3.1): To review (`spending`) or Not expenses (`not_expense`), computed with
 * utils/plaidClassification bucketFor while a row is still to review, unless the user moved it by hand
 * (`bucket_overridden`).
 */
class PlaidBucketRepository {
  /**
   * Recompute the bucket of the `new`, not overridden rows matching `where` (a condition on `pt`).
   * @param {object|null} conn runInTransaction helpers; defaults to the shared connection
   * @returns {Promise<number>} rows whose bucket changed
   */
  async classify(conn, where, params = []) {
    const all = conn ? conn.all : dbHelper.queryAll;
    const run = conn ? conn.run : dbHelper.execute;
    const rows = await all(
      `SELECT pt.id, pt.amount, pt.name, pt.merchant_name AS merchantName, pt.pfc_primary AS pfcPrimary,
              pt.pfc_detailed AS pfcDetailed, pt.review_bucket AS bucket, pm.type AS paymentMethodType
       FROM plaid_transactions pt
       LEFT JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
       LEFT JOIN payment_methods pm ON pm.id = pa.payment_method_id
       WHERE pt.status = 'new' AND pt.bucket_overridden = 0 AND (${where})`,
      params
    );
    let changed = 0;
    for (const row of rows) {
      const bucket = bucketFor({ ...row, isCard: row.paymentMethodType === 'credit_card' });
      if (bucket === row.bucket) continue;
      await run('UPDATE plaid_transactions SET review_bucket = ? WHERE id = ?', [bucket, row.id]);
      changed++;
    }
    return changed;
  }

  /**
   * Move a row to the other tab by hand; later syncs keep it there.
   * @returns {Promise<boolean>} false when the row was no longer 'new'
   */
  async setBucket(id, bucket) {
    const { changes } = await dbHelper.execute(
      "UPDATE plaid_transactions SET review_bucket = ?, bucket_overridden = 1 WHERE id = ? AND status = 'new'",
      [bucket, id]
    );
    return changes > 0;
  }

  /**
   * Finish a row as not an expense: it leaves the Inbox and is kept with the ignored rows (same retention), its
   * bucket saying why. Only while it is still to review.
   */
  async markNotExpense(id) {
    const { changes } = await dbHelper.execute(
      "UPDATE plaid_transactions SET review_bucket = 'not_expense', bucket_overridden = 1, status = 'ignored' WHERE id = ? AND status = 'new'",
      [id]
    );
    return changes > 0;
  }

  /** The Not expenses rows still waiting (filed there by their category), for Mark all done. */
  async findOpenNotExpenses() {
    return dbHelper.queryAll(
      `SELECT pt.id FROM plaid_transactions pt
       JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
       WHERE pt.status = 'new' AND pt.review_bucket = 'not_expense' AND pa.payment_method_id IS NOT NULL
       ORDER BY pt.id`
    );
  }

  /** Undo of Not an expense: back to To review, to stay there. */
  async restoreToReview(id) {
    const { changes } = await dbHelper.execute(
      "UPDATE plaid_transactions SET status = 'new', review_bucket = 'spending', bucket_overridden = 1 WHERE id = ? AND status = 'ignored'",
      [id]
    );
    return changes > 0;
  }
}

module.exports = new PlaidBucketRepository();

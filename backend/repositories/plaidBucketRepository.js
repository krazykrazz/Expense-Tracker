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
}

module.exports = new PlaidBucketRepository();

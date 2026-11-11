const dbHelper = require('../utils/dbHelper');
const { FILE_ID_PREFIX, SAME_TXN_DAYS, planFileImport } = require('../utils/bankFileImport');
const { STAGED_COLUMNS, STAGED_COLUMN_NAMES } = require('./plaidSql');

/**
 * Data access for bank file imports (CSV exports merged into an account's staged rows, see utils/bankFileImport),
 * and deleting a single staged row.
 */
class PlaidFileImportRepository {
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

  /** Delete one staged row (a dropped pending charge reviewed in the Inbox). */
  async deleteTransaction(id) {
    const { changes } = await dbHelper.execute('DELETE FROM plaid_transactions WHERE id = ?', [id]);
    return changes > 0;
  }
}

module.exports = new PlaidFileImportRepository();

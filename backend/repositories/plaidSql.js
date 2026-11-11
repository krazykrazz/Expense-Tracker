/**
 * SQL fragments shared by the Plaid repositories (plaidFileImportRepository, plaidSyncRepository).
 */

/** A staged row as the file-import merge sees it (utils/bankFileImport), and its columns by those names. */
const STAGED_COLUMNS = `id, transaction_id AS transactionId, date, authorized_date AS authorizedDate, amount, pending, name,
  merchant_name AS merchantName, status, expense_id AS expenseId, removed_at AS removedAt`;
const STAGED_COLUMN_NAMES = {
  transactionId: 'transaction_id', date: 'date', authorizedDate: 'authorized_date', amount: 'amount', pending: 'pending',
  name: 'name', merchantName: 'merchant_name', removedAt: 'removed_at'
};

/** Plaid's personal finance category as stored: primary, detailed, confidence level (NULL when not sent). */
const pfcValues = (txn) => {
  const pfc = txn.personal_finance_category || {};
  return [pfc.primary ?? null, pfc.detailed ?? null, pfc.confidence_level ?? null];
};
/** A sync without the category never blanks one already stored. */
const PFC_SET_FIELDS = `pfc_primary = COALESCE(?, pfc_primary), pfc_detailed = COALESCE(?, pfc_detailed),
  pfc_confidence = COALESCE(?, pfc_confidence)`;

module.exports = { STAGED_COLUMNS, STAGED_COLUMN_NAMES, pfcValues, PFC_SET_FIELDS };

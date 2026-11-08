const plaidConfig = require('../config/plaid');
const plaidRepository = require('../repositories/plaidRepository');
const activityLogService = require('./activityLogService');
const plaidSettlementService = require('./plaidSettlementService');
const { parseBankFile } = require('../utils/bankFileImport');
const { shiftDate } = require('../utils/plaidMatching');
const { getTodayString } = require('../utils/dateUtils');
const { runWithTabId } = require('../utils/requestContext');

/** Without anything from Plaid for the account, start this many days back. */
const DEFAULT_DAYS_BACK = 30;
const TYPE_LABELS = { credit: 'credit card', depository: 'bank', investment: 'investment', loan: 'loan' };

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

/**
 * Bank file import: a fallback for when Plaid can't fetch from a bank. A CSV exported from the bank's website
 * is merged into the same staged rows as Plaid's, so the Inbox, pending/settled handling and the card balance
 * check all work unchanged, and Plaid takes the rows over when it catches up (plaidRepository._findFileRow).
 */
class PlaidFileImportService {
  /**
   * Preview (`dryRun`) or import a bank CSV into a connected bank account.
   * @param {number|string} accountId plaid_accounts.id
   * @param {{csv: string, fromDate?: string, dryRun?: boolean}} input fromDate defaults to the first date Plaid
   *   sent for the account: older history is already in the tracker
   * @returns {Promise<object>} counts: total, beforeFrom, alreadyFromBank, unchanged, updated, added, pendingAdded, settled
   */
  async importFile(accountId, { csv, fromDate, dryRun = false } = {}) {
    const account = await plaidRepository.findAccountForImport(parseInt(accountId, 10));
    if (!account) throw fail('Bank account not found', 404);
    const { environment } = plaidConfig.getPlaidConfig();
    if (account.environment !== environment) {
      throw fail(`${account.institutionName} was connected in ${account.environment}; Plaid is now set to ${environment}.`, 409);
    }
    if (account.paymentMethodId == null) {
      throw fail(`Choose a payment method for ${account.name} first, so its transactions show in the Inbox.`, 400);
    }
    if (fromDate !== undefined && fromDate !== null && fromDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      throw fail('From date must be YYYY-MM-DD', 400);
    }

    const file = parseBankFile(csv, account.id);
    if (file.accountType !== account.type) {
      throw fail(`This is a ${file.label} file, but ${account.name} is a ${TYPE_LABELS[account.type] || account.type} account.`, 400);
    }
    // A card file can list more than one card on the account (a second cardholder); one must be this account's
    if (file.accountNumbers.length > 0 && account.mask && !file.accountNumbers.some(number => number.endsWith(account.mask))) {
      const numbers = file.accountNumbers.map(number => `••${number.slice(-4)}`).join(', ');
      throw fail(`This file is for ${numbers}, not ${account.name} ••${account.mask}.`, 400);
    }

    const defaultFromDate = (await plaidRepository.findFirstPlaidDate(account.id)) || shiftDate(getTodayString(), -DEFAULT_DAYS_BACK);
    const from = fromDate || defaultFromDate;
    const rows = file.rows.filter(row => row.date >= from);
    const { settlements, ...counts } = await plaidRepository.applyFileImport(account.id, rows, { fromDate: from, dateKind: file.dateKind, dryRun });

    const result = {
      format: file.format,
      formatLabel: file.label,
      accountName: account.name,
      fromDate: from,
      defaultFromDate,
      total: file.rows.length,
      beforeFrom: file.rows.length - rows.length,
      ...counts,
      dryRun: Boolean(dryRun)
    };
    if (dryRun || counts.added + counts.updated === 0) return result;

    if (settlements.length > 0) {
      // Outside the request's tab context so every tab, including this one, refreshes the updated expenses
      await runWithTabId(null, () => plaidSettlementService.applySettlements(settlements));
    }
    await activityLogService.logEvent(
      'plaid_file_imported',
      'plaid_transaction',
      null,
      `Imported ${file.label} file into ${account.institutionName} ${account.name}: ${counts.added} new, ${counts.updated} updated`,
      {
        institutionName: account.institutionName, accountName: account.name, format: file.format, fromDate: from,
        added: counts.added, updated: counts.updated, alreadyFromBank: counts.alreadyFromBank
      }
    );
    return result;
  }
}

module.exports = new PlaidFileImportService();

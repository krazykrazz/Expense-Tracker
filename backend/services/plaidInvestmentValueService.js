const plaidConfig = require('../config/plaid');
const plaidRepository = require('../repositories/plaidRepository');
const investmentValueRepository = require('../repositories/investmentValueRepository');
const activityLogService = require('./activityLogService');
const timeBoundaryService = require('./timeBoundaryService');
const { round2 } = require('../utils/money');

const EXPECTED_CURRENCY = 'CAD';

/**
 * The sum of an investment's linked accounts, or null when a sum would be wrong: an account isn't an investment
 * account, belongs to a bank of another Plaid environment or one whose last sync failed, has no balance yet, or the
 * currencies differ (the same rules as the bank balance shown on the Financial page).
 */
function totalOf(accounts, environment) {
  const usable = accounts.every(account => account.accountType === 'investment'
    && account.environment === environment
    && !account.lastError
    && typeof account.currentBalance === 'number');
  if (!usable) return null;
  const currencies = new Set(accounts.map(account => account.balanceCurrency || EXPECTED_CURRENCY));
  if (currencies.size > 1) return null;
  const total = round2(accounts.reduce((sum, account) => sum + account.currentBalance, 0));
  return total >= 0 ? total : null;
}

const money = (value) => `$${value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Monthly investment values from the bank (spec 4.1b). After a sync, each investment linked to that bank's accounts
 * gets this month's value from their balance: created when the month has none, updated while it is still the bank's.
 * When the month ends the row stops changing, so a past month holds its month-end balance. A value entered or edited
 * by hand is never overwritten, and earlier months are never filled in.
 */
class PlaidInvestmentValueService {
  /**
   * @param {number} plaidItemId the bank that was just synced
   * @param {Date} [now]
   * @returns {Promise<Array<{investmentId: number, name: string, value: number}>>} the values written
   */
  async applyLinkedBalances(plaidItemId, now = new Date()) {
    const accounts = await plaidRepository.findInvestmentAccountsSharingItem(plaidItemId);
    if (accounts.length === 0) return [];

    const { environment } = plaidConfig.getPlaidConfig();
    const timezone = await timeBoundaryService.getBusinessTimezone();
    const [year, month] = timeBoundaryService.getBusinessDate(now, timezone).split('-').map(Number);

    const byInvestment = new Map();
    for (const account of accounts) {
      if (!byInvestment.has(account.investmentId)) byInvestment.set(account.investmentId, []);
      byInvestment.get(account.investmentId).push(account);
    }

    const written = [];
    for (const [investmentId, linked] of byInvestment) {
      const value = totalOf(linked, environment);
      if (value === null) continue;
      if (await investmentValueRepository.upsertFromBank({ investment_id: investmentId, year, month, value })) {
        written.push({ investmentId, name: linked[0].investmentName, value });
      }
    }

    if (written.length > 0) {
      const label = `${year}-${String(month).padStart(2, '0')}`;
      await activityLogService.logEvent(
        'plaid_balances_updated',
        'investment_value',
        null,
        `Investment values for ${label} from the bank: ${written.map(w => `${w.name} ${money(w.value)}`).join(', ')}`,
        { year, month, plaidItemId, values: written }
      );
    }
    return written;
  }
}

module.exports = new PlaidInvestmentValueService();
module.exports.totalOf = totalOf;

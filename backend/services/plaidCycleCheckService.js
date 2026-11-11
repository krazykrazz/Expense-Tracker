const plaidConfig = require('../config/plaid');
const plaidBalanceCheckRepository = require('../repositories/plaidBalanceCheckRepository');
const plaidCycleRepository = require('../repositories/plaidCycleRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const statementBalanceService = require('./statementBalanceService');
const { pairUp } = require('./plaidCardBalanceService')._internal;
const { getTodayString } = require('../utils/dateUtils');

/** Closed cycles to show, newest first. */
const MAX_CYCLES = 3;

const { round2, toCents: cents } = require('../utils/money');

const bankItem = (row) => ({ effect: row.amount, date: row.date, name: row.name, transactionId: row.id, status: row.status });
const trackerItem = (row, effect, kind) => ({ effect, date: row.date, name: row.name, kind, id: row.id });

/**
 * Per-cycle check of a bank-linked credit card: for each closed statement cycle the bank's history fully
 * covers, the bank's posted total vs the tracker's, and every entry that accounts for the difference.
 * A difference is bank − tracker, so a charge only the bank has is positive.
 */
class PlaidCycleCheckService {
  /**
   * @param {number|string} paymentMethodId
   * @returns {Promise<{paymentMethodId: number, name: string, billingCycleDay: number|null, cycles: Array<object>}>}
   */
  async getCycleChecks(paymentMethodId) {
    const id = parseInt(paymentMethodId, 10);
    const { environment } = plaidConfig.getPlaidConfig();
    const accounts = (await plaidBalanceCheckRepository.findMappedCardAccounts(environment)).filter(a => a.paymentMethodId === id);
    if (accounts.length === 0) {
      throw Object.assign(new Error('No bank account is linked to this credit card'), { statusCode: 404 });
    }
    const card = await paymentMethodRepository.findById(id);
    const result = { paymentMethodId: id, name: accounts[0].paymentMethodName, billingCycleDay: card?.billing_cycle_day ?? null, cycles: [] };
    if (!result.billingCycleDay) return result;

    const accountIds = accounts.map(a => a.id);
    const firstBankDate = await plaidCycleRepository.findFirstBankDate(accountIds);
    if (!firstBankDate) return result;

    let reference = getTodayString();
    for (let i = 0; i < MAX_CYCLES; i++) {
      const { startDate, endDate } = statementBalanceService.calculatePreviousCycleDates(result.billingCycleDay, reference);
      // Bank history that starts mid-cycle can't say what the statement held
      if (startDate < firstBankDate) break;
      result.cycles.push(await this._checkCycle(id, accountIds, startDate, endDate));
      reference = startDate;
    }
    return result;
  }

  async _checkCycle(paymentMethodId, accountIds, startDate, endDate) {
    const [bankRows, expenses, payments] = await Promise.all([
      plaidCycleRepository.findBankRows(accountIds, startDate, endDate),
      plaidCycleRepository.findTrackerExpenses(paymentMethodId, startDate, endDate),
      plaidCycleRepository.findTrackerPayments(paymentMethodId, startDate, endDate)
    ]);

    const trackerItems = [
      ...expenses.map(row => trackerItem(row, row.amount, 'expense')),
      ...payments.map(row => trackerItem(row, -row.amount, 'payment'))
    ];
    const trackerByLink = new Map();
    for (const item of trackerItems) trackerByLink.set(`${item.kind}:${item.id}`, item);
    const bankIds = new Set(bankRows.map(row => row.id));

    const causes = [];
    const unlinkedBank = [];
    const matched = new Set();
    let matchedCount = 0;

    for (const row of bankRows) {
      const linkKey = row.expenseId ? `expense:${row.expenseId}` : row.paymentId ? `payment:${row.paymentId}` : null;
      if (row.fixedExpense) {
        causes.push({ ...bankItem(row), type: 'fixed_expense', effect: round2(row.amount) });
      } else if (linkKey) {
        const tracker = trackerByLink.get(linkKey);
        if (tracker) {
          matched.add(linkKey);
          matchedCount++;
          const gap = round2(row.amount - tracker.effect);
          if (cents(gap) !== 0) {
            causes.push({ ...bankItem(row), type: 'amount_differs', effect: gap, bankAmount: row.amount, trackerAmount: tracker.effect });
          }
        } else {
          causes.push({ ...bankItem(row), type: 'other_statement', effect: round2(row.amount), trackerDate: row.expenseDate ?? row.paymentDate ?? null });
        }
      } else {
        unlinkedBank.push(bankItem(row));
      }
    }

    const unlinkedTracker = [];
    for (const item of trackerItems) {
      if (matched.has(`${item.kind}:${item.id}`)) continue;
      const source = item.kind === 'expense' ? expenses : payments;
      const row = source.find(r => r.id === item.id);
      if (row.bankId && bankIds.has(row.bankId)) continue;
      if (row.bankId) {
        // Linked to a bank row that isn't a settled one in this cycle
        const type = row.bankRemoved ? 'cancelled' : row.bankPending ? 'pending' : 'other_statement';
        causes.push({ ...item, type, effect: round2(-item.effect), bankDate: row.bankDate });
      } else {
        unlinkedTracker.push(item);
      }
    }

    const { bankOnly, trackerOnly, pairs, splits } = pairUp(unlinkedBank, unlinkedTracker);
    for (const item of bankOnly) causes.push({ ...item, type: 'bank_only', effect: round2(item.effect) });
    for (const item of trackerOnly) causes.push({ ...item, type: 'tracker_only', effect: round2(-item.effect) });

    const bankTotal = round2(bankRows.reduce((sum, row) => sum + row.amount, 0));
    const trackerTotal = round2(trackerItems.reduce((sum, item) => sum + item.effect, 0));
    const difference = round2(bankTotal - trackerTotal);
    causes.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    return {
      startDate,
      endDate,
      bank: { total: bankTotal, count: bankRows.length },
      tracker: { total: trackerTotal, count: trackerItems.length },
      difference,
      status: cents(difference) === 0 ? 'match' : 'differs',
      matchedCount: matchedCount + pairs.length + splits.length,
      awaitingMatch: pairs.filter(pair => pair.bank.status === 'new').length,
      causes
    };
  }
}

module.exports = new PlaidCycleCheckService();

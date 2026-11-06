const plaidConfig = require('../config/plaid');
const plaidRepository = require('../repositories/plaidRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const paymentMethodBalanceService = require('./paymentMethodBalanceService');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const { calculateEffectiveBalance } = require('../utils/effectiveBalanceUtil');
const paymentMethodService = require('./paymentMethodService');
const { getTodayString } = require('../utils/dateUtils');
const { isBankDataStale } = require('../utils/plaidFreshness');

/** Bank and tracker items on either side within this many days, same amount, are the same transaction. */
const PAIR_DAYS = 5;

const round2 = (n) => Math.round(n * 100) / 100;
const cents = (n) => Math.round(n * 100);
const dayNumber = (dateStr) => Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10)) / 86400000;

/**
 * What the bank says is owed on one card account.
 * - `limit − available` when the bank sends both: includes pending charges (CIBC).
 * - otherwise `current`, which may leave out pending charges (Wealthsimple).
 */
function bankOwed(account) {
  if (account.currentBalance == null && account.availableBalance == null) return null;
  if (account.creditLimit != null && account.availableBalance != null) {
    return { owed: round2(account.creditLimit - account.availableBalance), includesPending: true };
  }
  if (account.currentBalance == null) return null;
  return { owed: round2(account.currentBalance), includesPending: false };
}

/**
 * Pair bank rows with tracker entries for the same money (signed effect on the balance equal to the cent,
 * dates within PAIR_DAYS), then one tracker entry with two bank rows that add up to it. Paired items cancel
 * out; what's left explains the difference.
 * @returns {{bankOnly: Array, trackerOnly: Array, pairs: Array<{bank: object, tracker: object}>,
 *   splits: Array<{bank: object[], tracker: object}>}}
 */
function pairUp(bankItems, trackerItems) {
  const unusedTracker = [...trackerItems];
  const bankOnly = [];
  const pairs = [];
  for (const bank of bankItems) {
    let best = -1;
    let bestGap = Infinity;
    unusedTracker.forEach((tracker, index) => {
      if (cents(tracker.effect) !== cents(bank.effect)) return;
      const gap = Math.abs(dayNumber(tracker.date) - dayNumber(bank.date));
      if (gap <= PAIR_DAYS && gap < bestGap) {
        best = index;
        bestGap = gap;
      }
    });
    if (best === -1) {
      bankOnly.push(bank);
    } else {
      pairs.push({ bank, tracker: unusedTracker[best] });
      unusedTracker.splice(best, 1);
    }
  }

  // One order charged in two parts (Amazon ships separately): two bank rows adding up to one tracker entry
  const splits = [];
  for (let t = unusedTracker.length - 1; t >= 0; t--) {
    const tracker = unusedTracker[t];
    const near = bankOnly.filter(bank => Math.abs(dayNumber(bank.date) - dayNumber(tracker.date)) <= PAIR_DAYS);
    let found = null;
    for (let i = 0; i < near.length && !found; i++) {
      for (let j = i + 1; j < near.length && !found; j++) {
        if (cents(near[i].effect) + cents(near[j].effect) === cents(tracker.effect)) found = [near[i], near[j]];
      }
    }
    if (found) {
      splits.push({ bank: found, tracker });
      unusedTracker.splice(t, 1);
      for (const bank of found) bankOnly.splice(bankOnly.indexOf(bank), 1);
    }
  }
  return { bankOnly, trackerOnly: unusedTracker, pairs, splits };
}

/**
 * Credit card balance check: the bank's balance (from the last sync) against the tracker's balance as of
 * today, with the likely causes of any difference. Read-only, apart from `applyBankCreditLimit`.
 */
class PlaidCardBalanceService {
  /**
   * @returns {Promise<{cards: Array<object>}>} one entry per credit card mapped to a bank account
   */
  async getCardBalances() {
    const { environment } = plaidConfig.getPlaidConfig();
    const accounts = await plaidRepository.findMappedCardAccounts(environment);
    const byCard = new Map();
    for (const account of accounts) {
      const list = byCard.get(account.paymentMethodId) || [];
      list.push(account);
      byCard.set(account.paymentMethodId, list);
    }
    const today = getTodayString();
    const cards = [];
    for (const [paymentMethodId, cardAccounts] of byCard) {
      cards.push(await this._checkCard(paymentMethodId, cardAccounts, today));
    }
    return { cards };
  }

  async _checkCard(paymentMethodId, accounts, today) {
    const first = accounts[0];
    const owedParts = accounts.map(bankOwed);
    const bank = owedParts.some(part => part === null) ? null : {
      owed: round2(owedParts.reduce((sum, part) => sum + part.owed, 0)),
      includesPending: owedParts.every(part => part.includesPending),
      asOf: accounts.map(a => a.balanceAsOf).sort()[0] || null,
      currency: first.currency || null
    };

    const [tracker, future] = await Promise.all([
      paymentMethodBalanceService.calculateCurrentBalance(paymentMethodId),
      plaidRepository.sumFutureCardActivity(paymentMethodId, today)
    ]);

    const difference = bank ? round2(bank.owed - tracker) : null;
    const status = bank === null ? 'unknown' : Math.abs(difference) < 0.005 ? 'match' : 'differs';
    const explanation = await this._explain(paymentMethodId, accounts, bank, tracker, today);
    const explained = round2(explanation.causes.reduce((sum, cause) => sum + cause.effect, 0));

    const bankLimit = accounts.every(a => a.creditLimit != null)
      ? round2(accounts.reduce((sum, a) => sum + a.creditLimit, 0))
      : null;

    return {
      paymentMethodId,
      name: first.paymentMethodName,
      accounts: accounts.map(a => ({ institutionName: a.institutionName, name: a.name, mask: a.mask ?? null })),
      bankError: this._bankWarning(accounts),
      status,
      bank,
      tracker,
      difference,
      futureDated: { amount: round2(future.expenses - future.payments), count: future.count },
      causes: explanation.causes,
      unexplained: difference === null || status === 'match' ? 0 : round2(difference - explained),
      awaitingMatch: explanation.awaitingMatch,
      splitCharges: explanation.splitCharges,
      limit: {
        bank: bankLimit,
        tracker: first.trackerCreditLimit ?? null,
        utilization: bank && bankLimit ? Math.round((bank.owed / bankLimit) * 1000) / 10 : null
      }
    };
  }

  /**
   * The billing cycle the tracker's current balance starts from, when its balance is the one entered from the
   * real statement: everything posted up to its end date is already reconciled by that statement, so only
   * later activity can explain a difference. Null without such a cycle (calculated balances are sums of the
   * tracker's own entries, so earlier entries still count).
   */
  async _statementAnchorEnd(paymentMethodId) {
    const latest = await billingCycleRepository.findByPaymentMethod(paymentMethodId, { limit: 1 });
    const cycle = Array.isArray(latest) && latest.length > 0 ? latest[0] : null;
    if (!cycle || !cycle.cycle_end_date) return null;
    return calculateEffectiveBalance(cycle).balanceType === 'actual' ? cycle.cycle_end_date : null;
  }

  /** Why the bank's balance may be out of date: our sync failing, or Plaid not getting new data from the bank. */
  _bankWarning(accounts) {
    if (accounts.some(a => a.lastError)) return 'This bank is not syncing; its balance may be out of date.';
    const stale = accounts.find(a => isBankDataStale(a.bankUpdatedAt));
    if (stale) {
      return `Plaid hasn't had new data from this bank since ${stale.bankUpdatedAt.slice(0, 10)}; its balance may be out of date.`;
    }
    return null;
  }

  /**
   * Likely causes of a difference, each with its `effect` on (bank − tracker):
   * - `bank_only`: at the bank (unreviewed or ignored in the Inbox), not in the tracker (a refund, fee,
   *   or charge nobody entered);
   * - `tracker_only`: entered in the tracker since the bank history starts, but not at the bank (a typo,
   *   a wrong card, a duplicate, or not posted yet);
   * - `settling`: added from a pending charge on a bank whose balance leaves pending charges out;
   * - `from_file`: in the tracker from a bank file row Plaid hasn't sent yet, so the bank's balance from Plaid
   *   doesn't include it (Plaid takes the row over once it catches up);
   * - `cancelled`: added from a pending charge the bank then dropped (review it in the Inbox);
   * - `fixed_expense`: a charge confirmed as a fixed expense, which the card balance doesn't include;
   * - `credit_balance`: the card is in credit at the bank, and the tracker's balance stops at $0.
   * Only activity posted after a statement entered from the real statement counts (see _statementAnchorEnd).
   * Inbox rows that match an entry already in the tracker cancel out; they are counted in `awaitingMatch`.
   */
  async _explain(paymentMethodId, accounts, bank, tracker, today) {
    const includesPending = bank ? bank.includesPending : true;
    const [{ rows, firstDate }, anchorEnd] = await Promise.all([
      plaidRepository.findBalanceCheckRows(accounts.map(a => a.id)),
      this._statementAnchorEnd(paymentMethodId)
    ]);
    const afterAnchor = (postedDate) => !anchorEnd || postedDate > anchorEnd;

    const bankItems = [];
    const settling = [];
    const fromFile = [];
    const cancelled = [];
    const fixedCharges = [];
    for (const row of rows) {
      if (row.date > today || !afterAnchor(row.postedDate)) continue;
      if (row.fromFile) {
        // Only in a bank file: Plaid hasn't sent it, so its balance doesn't include it yet (if Plaid had
        // fetched it, it would have taken the row over). Unreviewed or ignored ones are in neither balance,
        // but still pair with an entry already in the tracker.
        if (row.fixedExpense) continue;
        if (row.expenseId != null) fromFile.push(row);
        else bankItems.push({ ...row, effect: row.amount });
      } else if (row.removed) {
        // The bank dropped it, the tracker still has its expense
        cancelled.push(row);
      } else if (row.fixedExpense) {
        fixedCharges.push(row);
      } else if (row.expenseId != null) {
        // Linked pending charge: in the tracker; in the bank balance only when the bank counts pending
        if (!includesPending) settling.push(row);
      } else if (!(row.pending && !includesPending)) {
        bankItems.push({ ...row, effect: row.amount });
      }
    }

    let trackerItems = [];
    if (firstDate) {
      const { expenses, payments } = await plaidRepository.findUnlinkedCardActivity(paymentMethodId, firstDate, today);
      trackerItems = [
        ...expenses.map(e => ({ kind: 'expense', id: e.id, date: e.date, postedDate: e.postedDate, name: e.place, amount: e.amount, effect: e.amount })),
        ...payments.map(p => ({ kind: 'payment', id: p.id, date: p.date, postedDate: p.postedDate, name: 'Payment', amount: p.amount, effect: -p.amount }))
      ].filter(item => afterAnchor(item.postedDate));
    }

    // Ignored bank rows only explain something when nothing in the tracker accounts for them, e.g. a refund
    // that was ignored because it couldn't be recorded. A card payment recorded by hand pairs with its bank row.
    const { bankOnly, trackerOnly, pairs, splits } = pairUp(bankItems, trackerItems);
    // A file row and its tracker entry: the entry is in the tracker's balance, not yet in the bank's
    const fileHeld = [
      ...pairs.filter(pair => pair.bank.fromFile).map(pair => pair.tracker),
      ...splits.filter(split => split.bank.some(bank => bank.fromFile)).map(split => split.tracker)
    ];

    const bankCause = (type, row, effect, extra = {}) => ({
      type, transactionId: row.id, date: row.date, name: row.name, amount: row.amount, effect: round2(effect), ...extra
    });
    const trackerCause = (type, item) => ({
      type, kind: item.kind, id: item.id, date: item.date, name: item.name, amount: item.amount, effect: round2(-item.effect)
    });
    const causes = [
      ...bankOnly.filter(row => !row.fromFile)
        .map(row => bankCause('bank_only', row, row.amount, { pending: Boolean(row.pending), inboxStatus: row.status })),
      ...trackerOnly.map(item => trackerCause('tracker_only', item)),
      ...settling.map(row => bankCause('settling', row, -row.amount, { expenseId: row.expenseId })),
      ...fromFile.map(row => bankCause('from_file', row, -row.amount, { expenseId: row.expenseId, pending: Boolean(row.pending) })),
      ...fileHeld.map(item => trackerCause('from_file', item)),
      ...cancelled.map(row => bankCause('cancelled', row, -row.amount, { expenseId: row.expenseId })),
      ...fixedCharges.map(row => bankCause('fixed_expense', row, row.amount))
    ].sort((a, b) => a.date.localeCompare(b.date));

    // The tracker's balance never goes below $0 (paymentMethodBalanceService), so a credit at the bank can't match
    if (bank && bank.owed < 0 && tracker === 0) {
      causes.push({ type: 'credit_balance', date: today, name: 'Credit balance', amount: bank.owed, effect: round2(bank.owed) });
    }

    return {
      causes,
      awaitingMatch: pairs.filter(pair => pair.bank.status === 'new').length,
      splitCharges: splits.length
    };
  }
  /**
   * Set a card's credit limit to the one the bank reports (the user chose to). Logged as payment_method_updated.
   */
  async applyBankCreditLimit(paymentMethodId) {
    const id = parseInt(paymentMethodId, 10);
    const { cards } = await this.getCardBalances();
    const card = cards.find(c => c.paymentMethodId === id);
    if (!card) {
      throw Object.assign(new Error('No bank account is linked to this credit card'), { statusCode: 404 });
    }
    if (card.limit.bank == null) {
      throw Object.assign(new Error('The bank did not report a credit limit for this card'), { statusCode: 400 });
    }
    const existing = await paymentMethodRepository.findById(id);
    return paymentMethodService.updatePaymentMethod(id, { ...existing, credit_limit: card.limit.bank });
  }
}

module.exports = new PlaidCardBalanceService();
module.exports._internal = { bankOwed, pairUp };

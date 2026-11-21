const plaidRepository = require('../repositories/plaidRepository');
const plaidLinkRepository = require('../repositories/plaidLinkRepository');
const expenseRepository = require('../repositories/expenseRepository');
const categorySuggestionService = require('./categorySuggestionService');
const plaidCardPaymentService = require('./plaidCardPaymentService');
const plaidInsuranceService = require('./plaidInsuranceService');
const plaidReimbursementService = require('./plaidReimbursementService');
const plaidSplitService = require('./plaidSplitService');
const {
  MATCH_WINDOW_DAYS, POSTING_LAG_DAYS, PENDING_AMOUNT_TOLERANCE, toCents, shiftDate, transactionDate, findMatchCandidates,
  fixedExpectedDate, findFixedCandidates, isDeposit, findIncomeCandidates, monthWindow, descriptionKey
} = require('../utils/plaidMatching');
const { isFileRow } = require('../utils/bankFileImport');
const { BUCKETS, kindFor } = require('../utils/plaidClassification');
const { buildLearnedPlaces, buildPlaceIndex, suggestPlace } = require('../utils/placeSuggestion');
const { fail, defaultPlace, incomeDescription } = require('./plaidInboxSupport');

const INBOX_STATUSES = ['new', 'ignored'];
/** A dropped pending charge may reappear as a posted row up to this many days later (within PENDING_AMOUNT_TOLERANCE). */
const SETTLE_WINDOW_DAYS = 10;

/**
 * Import Inbox listing: staged bank transactions waiting for review, each with what it could be matched to and
 * the place and category to pre-fill. Decisions are plaidReviewService; pending charges that settle or are
 * dropped are plaidSettlementService.
 */
class PlaidInboxService {
  /**
   * @param {'new'|'ignored'} status
   * @param {'spending'|'not_expense'} bucket the tab of new rows: To review or Not expenses (spec 3.1); ignored
   *   rows are listed whatever their bucket
   * @returns {Promise<{transactions: Array, hiddenUnmapped: number, hiddenUnknown: number,
   *   counts: {toReview: number, notExpenses: number}, cancelled: Array, unconnectedCards: Array}>}
   */
  async listInbox(status = 'new', bucket = 'spending') {
    if (!INBOX_STATUSES.includes(status)) {
      throw fail(`status must be one of: ${INBOX_STATUSES.join(', ')}`, 400);
    }
    if (!BUCKETS.includes(bucket)) {
      throw fail(`bucket must be one of: ${BUCKETS.join(', ')}`, 400);
    }

    const [allRows, hiddenUnmapped, hiddenUnknown, counts] = await Promise.all([
      plaidRepository.findInbox(status),
      plaidRepository.countNewUnmapped(),
      plaidRepository.countNewUnknownAccount(),
      plaidRepository.countInbox()
    ]);

    const isNew = status === 'new';
    const rows = isNew ? allRows.filter(row => row.bucket === bucket) : allRows;
    const placeByRow = isNew ? await this._suggestPlaces(rows) : new Map();
    const placeOf = (row) => placeByRow.get(row.id) || defaultPlace(row);
    const [candidatesByRow, fixedByRow, incomeByRow, suggestions, cardPayments, insuranceByRow, reimbursementByRow, splitByRow] = await Promise.all([
      isNew ? this._matchCandidates(rows) : new Map(),
      isNew ? this._fixedCandidates(rows) : new Map(),
      isNew ? this._incomeCandidates(rows) : new Map(),
      isNew ? this._suggestCategories([...new Set(rows.flatMap(row => [placeOf(row), defaultPlace(row)]))]) : new Map(),
      // Both tabs: a card payment's two sides can sit in different tabs (a funding debit without a category)
      isNew ? plaidCardPaymentService.describeRows(allRows) : { byRow: new Map(), unconnectedCards: [] },
      isNew ? plaidInsuranceService.describeDeposits(rows) : new Map(),
      isNew ? plaidReimbursementService.describeRows(rows) : new Map(),
      isNew ? plaidSplitService.describeRows(rows) : new Map()
    ]);

    const transactions = rows.map(row => {
      const place = placeOf(row);
      const income = incomeByRow.get(row.id);
      return {
        id: row.id,
        transactionId: row.transactionId,
        // 'file': imported from a bank CSV while Plaid couldn't fetch (Plaid takes the row over when it catches up)
        source: isFileRow(row.transactionId) ? 'file' : 'plaid',
        date: transactionDate(row),
        postedDate: row.date,
        place,
        rawName: row.name,
        amount: row.amount,
        isoCurrencyCode: row.isoCurrencyCode,
        accountName: row.accountName,
        accountMask: row.accountMask,
        paymentMethodId: row.paymentMethodId,
        paymentMethodName: row.paymentMethodName,
        paymentMethodType: row.paymentMethodType,
        billingCycleDay: row.billingCycleDay ?? null,
        status: row.status,
        bucket: row.bucket,
        // What kind of money movement it is, when known: 'card_payment' | 'transfer' | 'loan_payment' | null
        kind: kindFor({ ...row, isCard: row.paymentMethodType === 'credit_card' }),
        pending: Boolean(row.pending),
        canAdd: row.amount > 0,
        isDeposit: isDeposit(row),
        suggestedCategory: suggestions.get(place.toLowerCase()) ?? suggestions.get(defaultPlace(row).toLowerCase()) ?? null,
        matchCandidates: candidatesByRow.get(row.id) ?? [],
        fixedCandidates: fixedByRow.get(row.id) ?? [],
        incomeCandidates: income ? income.candidates : [],
        incomeSuggestion: income ? income.suggestion : null,
        cardPayment: cardPayments.byRow.get(row.id) ?? null,
        // Deposits only: whether "Apply to insurance claims" is the primary action (spec 3.7)
        insurance: insuranceByRow.get(row.id) ?? null,
        // Settled credits on a card and deposits that could repay an expense: { kind: 'refund'|'deposit', suggested } (spec 3.6, 3.8)
        reimbursement: reimbursementByRow.get(row.id) ?? null,
        // A settled charge that at least two unlinked expenses could be parts of: { suggested } (exactly one combination
        // adds up to it), else null (spec 3.9)
        split: splitByRow.get(row.id) ?? null
      };
    });

    return {
      transactions,
      hiddenUnmapped,
      hiddenUnknown,
      counts,
      cancelled: isNew && bucket === 'spending' ? await this._cancelledPending() : [],
      unconnectedCards: cardPayments.unconnectedCards
    };
  }

  /**
   * Pending charges added or matched as expenses and then dropped by the bank: a cancelled hold, or a charge
   * that settled under a new reference without Plaid linking the two. For the second case, posted rows on the
   * same account within 10 days and 25% of the amount are offered.
   */
  async _cancelledPending() {
    const rows = await plaidRepository.findCancelledPending();
    if (rows.length === 0) return [];
    const dates = rows.map(row => row.date).sort();
    const posted = await plaidRepository.findPostedNewOnAccounts(
      [...new Set(rows.map(row => row.plaidAccountId).filter(Boolean))],
      dates[0],
      shiftDate(dates[dates.length - 1], SETTLE_WINDOW_DAYS)
    );
    return rows.map(row => ({
      id: row.id,
      date: transactionDate(row),
      place: defaultPlace(row),
      amount: row.amount,
      accountMask: row.accountMask,
      paymentMethodName: row.paymentMethodName,
      expense: { id: row.expenseId, place: row.expensePlace, amount: row.expenseAmount, date: row.expenseDate },
      settledCandidates: posted
        .filter(p => p.plaidAccountId === row.plaidAccountId && p.date >= row.date
          && p.date <= shiftDate(row.date, SETTLE_WINDOW_DAYS)
          && Math.abs(p.amount - row.amount) <= Math.abs(row.amount) * PENDING_AMOUNT_TOLERANCE)
        .map(p => ({ id: p.id, date: p.date, place: defaultPlace(p), amount: p.amount }))
    }));
  }

  /**
   * Expected income sources each deposit could confirm, plus a name/category to pre-fill Add as income
   * (learned from earlier confirmations of the same bank description).
   */
  async _incomeCandidates(rows) {
    const result = new Map();
    const deposits = rows.filter(isDeposit);
    if (deposits.length === 0) return result;

    // Income near a month boundary can be confirmed by a deposit in the neighbouring month
    const [fromMonth, toMonth] = monthWindow(deposits.map(row => row.date), 1);
    const [sources, learned] = await Promise.all([
      plaidLinkRepository.findUnlinkedIncomeSources(fromMonth, toMonth),
      plaidLinkRepository.findLearnedIncomeNames()
    ]);

    for (const row of deposits) {
      const learnedEntries = learned.get(descriptionKey(row)) || [];
      const learnedNames = new Set(learnedEntries.map(entry => entry.name.toLowerCase()));
      const candidates = findIncomeCandidates(row, sources, learnedNames).map(source => ({
        id: source.id,
        year: source.year,
        month: source.month,
        name: source.name,
        category: source.category,
        amount: source.amount,
        amountDiffers: toCents(source.amount) !== Math.abs(toCents(row.amount)),
        nameMatch: source.nameScore > 0
      }));
      const suggestion = learnedEntries[0]
        ? { name: learnedEntries[0].name, category: learnedEntries[0].category || 'Other' }
        : { name: incomeDescription(row).slice(0, 100), category: 'Other' };
      result.set(row.id, { candidates, suggestion });
    }
    return result;
  }

  async _fixedCandidates(rows) {
    const result = new Map();
    const charges = rows.filter(row => row.amount > 0);
    if (charges.length === 0) return result;

    // The landing window can reach into the previous or next month
    const [fromMonth, toMonth] = monthWindow(charges.map(row => row.date), 1);
    const fixedExpenses = await plaidLinkRepository.findUnlinkedFixedExpenses(
      [...new Set(charges.map(row => row.paymentMethodId))],
      fromMonth,
      toMonth
    );

    for (const row of charges) {
      result.set(row.id, findFixedCandidates(row, fixedExpenses).map(fixed => ({
        id: fixed.id,
        year: fixed.year,
        month: fixed.month,
        name: fixed.name,
        category: fixed.category,
        amount: fixed.amount,
        dueDay: fixed.dueDay ?? null,
        expectedDate: fixedExpectedDate(fixed),
        amountDiffers: toCents(fixed.amount) !== toCents(row.amount),
        linkedLoanId: fixed.linkedLoanId ?? null
      })));
    }
    return result;
  }

  async _matchCandidates(rows) {
    const result = new Map();
    if (rows.length === 0) return result;

    const dates = rows.map(transactionDate).sort();
    const paymentMethodIds = [...new Set(rows.map(row => row.paymentMethodId))];
    const expenses = await plaidRepository.findUnlinkedExpenses(
      paymentMethodIds,
      shiftDate(dates[0], -POSTING_LAG_DAYS),
      shiftDate(dates[dates.length - 1], MATCH_WINDOW_DAYS)
    );

    for (const row of rows) {
      result.set(row.id, findMatchCandidates(row, expenses).map(({ id, date, place, amount, originalCost, chargedAmount, amountDiff, insuranceEligible, type, notes }) => ({
        id, date, place, amount, originalCost: originalCost ?? null, chargedAmount, type, notes,
        // The bank's amount minus the expense's charged amount: 0 for an exact match
        amountDiff,
        // Match & use the bank's amount: only for a plain expense (a reimbursed or insured one has its own amounts)
        canUseBankAmount: amountDiff !== 0 && row.amount > 0 && originalCost == null && !insuranceEligible
      })));
    }
    return result;
  }

  /**
   * Place to pre-fill for each charge: the place chosen before for the same bank description, else the
   * existing place the description starts with ("Sobeys" for "SOBEYS #4123"). Rows without one keep the bank's text.
   */
  async _suggestPlaces(rows) {
    const result = new Map();
    const charges = rows.filter(row => !isDeposit(row));
    if (charges.length === 0) return result;
    const [learnedRows, places] = await Promise.all([
      plaidRepository.findLearnedPlaces(),
      expenseRepository.getPlaceUsage()
    ]);
    const learned = buildLearnedPlaces(learnedRows);
    const index = buildPlaceIndex(places);
    for (const row of charges) {
      const place = suggestPlace([row.merchantName, row.name], learned, index);
      if (place) result.set(row.id, place);
    }
    return result;
  }

  async _suggestCategories(places) {
    places = places.filter(Boolean);
    const byPlace = await categorySuggestionService.getSuggestedCategories(places);
    const suggestions = new Map();
    for (const [place, suggestion] of byPlace) {
      suggestions.set(place.toLowerCase(), suggestion ? suggestion.category : null);
    }
    return suggestions;
  }
}

module.exports = new PlaidInboxService();

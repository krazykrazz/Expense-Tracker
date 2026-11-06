const plaidRepository = require('../repositories/plaidRepository');
const expenseRepository = require('../repositories/expenseRepository');
const expenseService = require('./expenseService');
const fixedExpenseService = require('./fixedExpenseService');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const incomeService = require('./incomeService');
const incomeRepository = require('../repositories/incomeRepository');
const categorySuggestionService = require('./categorySuggestionService');
const activityLogService = require('./activityLogService');
const logger = require('../config/logger');
const {
  MATCH_WINDOW_DAYS, toCents, shiftDate, transactionDate, findMatchCandidates,
  fixedExpectedDate, isFixedCandidate, findFixedCandidates,
  isDeposit, isIncomeCandidate, findIncomeCandidates
} = require('../utils/plaidMatching');
const { INCOME_CATEGORIES } = require('../utils/constants');
const { isFileRow } = require('../utils/bankFileImport');
const { buildLearnedPlaces, buildPlaceIndex, suggestPlace } = require('../utils/placeSuggestion');

const INBOX_STATUSES = ['new', 'ignored'];
/** A dropped pending charge may reappear as a posted row up to this many days later, within this share of its amount. */
const SETTLE_WINDOW_DAYS = 10;
const SETTLE_AMOUNT_TOLERANCE = 0.25;

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
/**
 * The expense/income services throw plain Errors for invalid input: those become 400. Database errors
 * (sqlite `code`) and programming errors stay 500, so the error handler doesn't present them as bad input.
 */
const asInputError = (err) => {
  if (!err.statusCode && !err.code && !(err instanceof TypeError) && !(err instanceof ReferenceError)) err.statusCode = 400;
  return err;
};
const round2 = (n) => Math.round(n * 100) / 100;
const defaultPlace = (txn) => (txn.merchantName || txn.name || '').trim();
/** The bank description used to learn income names: same choice as the default place. */
const incomeDescription = defaultPlace;
const money = (amount) => `$${Math.abs(Number(amount)).toFixed(2)}`;
/** e.g. `"Coffee Shop" ($25.50, 2026-10-12)` */
const describeTxn = (txn) => `"${defaultPlace(txn) || 'bank transaction'}" (${money(txn.amount)}, ${txn.date})`;
const monthIndexOf = (date) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

/**
 * Import Inbox: review staged bank transactions and add them as expenses, match them to
 * existing expenses or fixed expenses, or ignore them. Nothing becomes an expense without an explicit action.
 */
class PlaidInboxService {
  constructor() {
    this._inFlight = new Set();
  }

  /**
   * @param {'new'|'ignored'} status
   * @returns {Promise<{transactions: Array, hiddenUnmapped: number}>}
   */
  async listInbox(status = 'new') {
    if (!INBOX_STATUSES.includes(status)) {
      throw fail(`status must be one of: ${INBOX_STATUSES.join(', ')}`, 400);
    }

    const [rows, hiddenUnmapped] = await Promise.all([
      plaidRepository.findInbox(status),
      plaidRepository.countNewUnmapped()
    ]);

    const isNew = status === 'new';
    const placeByRow = isNew ? await this._suggestPlaces(rows) : new Map();
    const placeOf = (row) => placeByRow.get(row.id) || defaultPlace(row);
    const [candidatesByRow, fixedByRow, incomeByRow, suggestions] = await Promise.all([
      isNew ? this._matchCandidates(rows) : new Map(),
      isNew ? this._fixedCandidates(rows) : new Map(),
      isNew ? this._incomeCandidates(rows) : new Map(),
      isNew ? this._suggestCategories([...new Set(rows.flatMap(row => [placeOf(row), defaultPlace(row)]))]) : new Map()
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
        status: row.status,
        pending: Boolean(row.pending),
        canAdd: row.amount > 0,
        isDeposit: isDeposit(row),
        suggestedCategory: suggestions.get(place.toLowerCase()) ?? suggestions.get(defaultPlace(row).toLowerCase()) ?? null,
        matchCandidates: candidatesByRow.get(row.id) ?? [],
        fixedCandidates: fixedByRow.get(row.id) ?? [],
        incomeCandidates: income ? income.candidates : [],
        incomeSuggestion: income ? income.suggestion : null
      };
    });

    return { transactions, hiddenUnmapped, cancelled: isNew ? await this._cancelledPending() : [] };
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
          && Math.abs(p.amount - row.amount) <= Math.abs(row.amount) * SETTLE_AMOUNT_TOLERANCE)
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

    const monthIdxs = deposits.map(row => monthIndexOf(row.date));
    const [sources, learned] = await Promise.all([
      plaidRepository.findUnlinkedIncomeSources(Math.min(...monthIdxs) - 1, Math.max(...monthIdxs) + 1),
      plaidRepository.findLearnedIncomeNames()
    ]);

    for (const row of deposits) {
      const learnedEntries = learned.get(incomeDescription(row).toLowerCase()) || [];
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
    const monthIdxs = charges.map(row => monthIndexOf(row.date));
    const fixedExpenses = await plaidRepository.findUnlinkedFixedExpenses(
      [...new Set(charges.map(row => row.paymentMethodId))],
      Math.min(...monthIdxs) - 1,
      Math.max(...monthIdxs) + 1
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
      shiftDate(dates[0], -MATCH_WINDOW_DAYS),
      shiftDate(dates[dates.length - 1], MATCH_WINDOW_DAYS)
    );

    for (const row of rows) {
      result.set(row.id, findMatchCandidates(row, expenses).map(({ id, date, place, amount, originalCost, chargedAmount, type, notes }) => (
        { id, date, place, amount, originalCost: originalCost ?? null, chargedAmount, type, notes }
      )));
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

  async _requireNew(id, { settled = false } = {}) {
    const txn = await plaidRepository.findTransactionById(id);
    if (!txn) {
      throw fail('Bank transaction not found', 404);
    }
    if (txn.status !== 'new') {
      throw fail(`Bank transaction was already ${txn.status}`, 409);
    }
    if (settled && txn.pending) {
      throw fail('This transaction is still pending at the bank. Confirm it once it settles.', 400);
    }
    return txn;
  }

  async _exclusive(id, fn) {
    if (this._inFlight.has(id)) {
      throw fail('This bank transaction is already being processed', 409);
    }
    this._inFlight.add(id);
    try {
      return await fn();
    } finally {
      this._inFlight.delete(id);
    }
  }

  /**
   * Activity log for an inbox decision. Entity `plaid_transaction` is routed as `plaid`, so open inboxes in
   * other tabs refresh. Side effects (expense_added, fixed_expense_updated, ...) are logged by their services.
   * @param {'add'|'match'|'match_fixed'|'match_income'|'add_income'|'ignore'|'unignore'|'settled'|'pending_changed'|'cancelled_keep'|'cancelled_delete'} action
   */
  async _logReview(txn, action, description, extra = {}) {
    await activityLogService.logEvent('plaid_transaction_updated', 'plaid_transaction', txn.id, description, {
      action, place: defaultPlace(txn), amount: txn.amount, date: txn.date, ...extra
    });
  }

  /**
   * Create an expense from a staged transaction.
   * @param {number} id
   * @param {{type: string, place?: string, date?: string, notes?: string}} input
   */
  async addAsExpense(id, input = {}, tabId = null) {
    return this._exclusive(id, async () => {
      const txn = await this._requireNew(id);
      if (!(txn.amount > 0)) {
        throw fail('Refunds and credits cannot be added as expenses', 400);
      }
      if (!txn.paymentMethodId) {
        throw fail('Map this bank account to a payment method first', 400);
      }

      const date = input.date || transactionDate(txn);
      const place = typeof input.place === 'string' ? input.place.trim() : defaultPlace(txn);
      // Credit card expenses keep the bank's posting date when it differs from the purchase date (a pending
      // charge has no posting date yet; it is set when it settles)
      const postedDate = !txn.pending && txn.paymentMethodType === 'credit_card' && txn.date > date ? txn.date : null;

      let created;
      try {
        created = await expenseService.createExpense({
          date,
          posted_date: postedDate,
          place: place || null,
          notes: typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : null,
          amount: round2(txn.amount),
          type: input.type,
          payment_method_id: txn.paymentMethodId
        }, 0, tabId);
      } catch (err) {
        throw asInputError(err);
      }

      if (!(await plaidRepository.resolveTransaction(id, 'added', created.id))) {
        // A sync changed or removed the row meanwhile: undo, so no expense exists without its bank row
        await expenseService.deleteExpense(created.id, tabId);
        throw fail('This bank transaction changed while it was being added. Refresh the Inbox and try again.', 409);
      }
      await this._logReview(txn, 'add', `Added bank transaction ${describeTxn(txn)} as an expense`, { expenseId: created.id });
      return { transaction: await plaidRepository.findTransactionById(id), expense: created };
    });
  }

  /**
   * Link a staged transaction to an expense entered by hand. Nothing is created or changed on the expense.
   */
  async matchToExpense(id, expenseId) {
    return this._exclusive(id, async () => {
      const txn = await this._requireNew(id);
      const parsedId = parseInt(expenseId, 10);
      const expense = Number.isNaN(parsedId) ? null : await expenseRepository.findById(parsedId);
      if (!expense) {
        throw fail('Expense not found', 404);
      }
      if (expense.payment_method_id !== txn.paymentMethodId) {
        throw fail('The expense uses a different payment method than this bank account', 400);
      }

      try {
        if (!(await plaidRepository.resolveTransaction(id, 'matched', expense.id))) {
          throw fail('This bank transaction changed meanwhile. Refresh the Inbox and try again.', 409);
        }
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          throw fail('That expense is already linked to another bank transaction', 409);
        }
        throw err;
      }
      await this._logReview(txn, 'match', `Matched bank transaction ${describeTxn(txn)} to an existing expense`, { expenseId: expense.id });
      return { transaction: await plaidRepository.findTransactionById(id) };
    });
  }

  /**
   * Confirm a planned fixed expense with a bank transaction and record when it actually landed.
   * When the bank amount differs from the planned amount, the fixed expense is updated to the bank amount
   * (through fixedExpenseService, so validation and the activity log apply).
   */
  async matchToFixedExpense(id, fixedExpenseId, tabId = null) {
    return this._exclusive(id, async () => {
      const txn = await this._requireNew(id, { settled: true });
      const parsedId = parseInt(fixedExpenseId, 10);
      const fixed = Number.isNaN(parsedId) ? null : await plaidRepository.findFixedExpenseForMatching(parsedId);
      if (!fixed) {
        throw fail('Fixed expense not found', 404);
      }
      if (fixed.linked) {
        throw fail('That fixed expense is already confirmed by another bank transaction', 409);
      }
      if (!isFixedCandidate(txn, fixed)) {
        throw fail('That fixed expense uses a different payment method or is not due around this transaction\'s date', 400);
      }

      const landedDate = txn.date;
      const plannedAmount = fixed.amount;
      try {
        if (!(await plaidRepository.linkFixedExpense(id, fixed.id, landedDate, plannedAmount))) {
          throw fail('Bank transaction was already reviewed', 409);
        }
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          throw fail('That fixed expense is already confirmed by another bank transaction', 409);
        }
        throw err;
      }

      let updated = false;
      if (toCents(plannedAmount) !== toCents(txn.amount)) {
        try {
          const current = await fixedExpenseRepository.findById(fixed.id);
          await fixedExpenseService.updateFixedExpense(fixed.id, { ...current, amount: round2(txn.amount) }, tabId);
          updated = true;
        } catch (err) {
          // Keep link and amount consistent: undo the link if the amount could not be updated
          await plaidRepository.unlinkFixedExpense(id);
          logger.warn('Updating fixed expense amount from bank transaction failed', { fixedExpenseId: fixed.id, error: err.message });
          throw fail(`Could not update the fixed expense amount: ${err.message}`, asInputError(err).statusCode || 500);
        }
      }

      await this._logReview(txn, 'match_fixed', `Confirmed fixed expense "${fixed.name}" with bank transaction ${describeTxn(txn)}`, {
        fixedExpenseId: fixed.id, amountUpdated: updated
      });
      return {
        transaction: await plaidRepository.findTransactionById(id),
        fixedExpense: { id: fixed.id, name: fixed.name, plannedAmount, amount: round2(txn.amount), amountUpdated: updated, landedDate }
      };
    });
  }

  /**
   * Confirm an expected income source with a bank deposit and record when it landed. With `updateAmount`
   * (the default) a different deposit amount becomes the income amount, through incomeService.
   * @param {{updateAmount?: boolean}} options
   */
  async matchToIncome(id, incomeSourceId, { updateAmount = true } = {}, tabId = null) {
    return this._exclusive(id, async () => {
      const txn = await this._requireNew(id, { settled: true });
      const parsedId = parseInt(incomeSourceId, 10);
      const source = Number.isNaN(parsedId) ? null : await plaidRepository.findIncomeSourceForMatching(parsedId);
      if (!source) {
        throw fail('Income source not found', 404);
      }
      if (source.linked) {
        throw fail('That income is already confirmed by another bank deposit', 409);
      }
      if (!isIncomeCandidate(txn, source)) {
        throw fail('Only a deposit into a bank account in the same month (or within 3 days of it) can confirm that income', 400);
      }

      const landedDate = txn.date;
      const plannedAmount = source.amount;
      const depositAmount = round2(Math.abs(txn.amount));
      try {
        if (!(await plaidRepository.linkIncomeSource(id, source.id, landedDate, plannedAmount))) {
          throw fail('Bank transaction was already reviewed', 409);
        }
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          throw fail('That income is already confirmed by another bank deposit', 409);
        }
        throw err;
      }

      let updated = false;
      if (updateAmount !== false && toCents(plannedAmount) !== toCents(depositAmount)) {
        try {
          const current = await incomeRepository.findById(source.id);
          await incomeService.updateIncomeSource(source.id, { ...current, amount: depositAmount }, tabId);
          updated = true;
        } catch (err) {
          await plaidRepository.unlinkIncomeSource(id);
          logger.warn('Updating income amount from bank deposit failed', { incomeSourceId: source.id, error: err.message });
          throw fail(`Could not update the income amount: ${err.message}`, asInputError(err).statusCode || 500);
        }
      }

      await this._logReview(txn, 'match_income', `Confirmed income "${source.name}" with bank deposit ${describeTxn(txn)}`, {
        incomeSourceId: source.id, amountUpdated: updated
      });
      return {
        transaction: await plaidRepository.findTransactionById(id),
        incomeSource: { id: source.id, name: source.name, plannedAmount, amount: depositAmount, amountUpdated: updated, landedDate }
      };
    });
  }

  /**
   * Record an unplanned deposit as a new income source in the deposit's month, linked to the deposit.
   * @param {{name?: string, category?: string}} input
   */
  async addAsIncome(id, input = {}, tabId = null) {
    return this._exclusive(id, async () => {
      const txn = await this._requireNew(id, { settled: true });
      if (!isDeposit(txn)) {
        throw fail('Only deposits into a bank account can be added as income', 400);
      }
      const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : incomeDescription(txn);
      const category = input.category || 'Other';
      if (!INCOME_CATEGORIES.includes(category)) {
        throw fail(`Category must be one of: ${INCOME_CATEGORIES.join(', ')}`, 400);
      }

      let created;
      try {
        created = await incomeService.createIncomeSource({
          year: Number(txn.date.slice(0, 4)),
          month: Number(txn.date.slice(5, 7)),
          name,
          amount: round2(Math.abs(txn.amount)),
          category
        }, tabId);
      } catch (err) {
        throw asInputError(err);
      }

      if (!(await plaidRepository.linkIncomeSource(id, created.id, txn.date, null, 'added'))) {
        await incomeService.deleteIncomeSource(created.id, tabId);
        throw fail('Bank transaction was already reviewed', 409);
      }
      await this._logReview(txn, 'add_income', `Added bank deposit ${describeTxn(txn)} as income "${created.name}"`, { incomeSourceId: created.id });
      return { transaction: await plaidRepository.findTransactionById(id), incomeSource: created };
    });
  }

  /**
   * Bring expenses created from (or matched to) a pending charge in line with the bank once it settled, or
   * when its pending amount changed:
   * - the amount follows the bank only if the expense still has the previous bank amount; an amount edited
   *   by hand, or a reimbursed / insurance-tracked expense, is kept (its payment method pill shows the
   *   difference);
   * - on settlement, credit card expenses get the bank's posting date.
   * Runs after the sync batch is committed. Never throws: a failed update leaves the expense as it was.
   * @param {Array<{plaidTransactionId: number, expenseId: number, settled: boolean, previousAmount: number,
   *   amount: number, postedDate: (string|null)}>} settlements
   */
  async applySettlements(settlements) {
    for (const s of settlements) {
      let txn = null;
      try {
        let expense;
        [expense, txn] = await Promise.all([
          expenseRepository.findById(s.expenseId),
          plaidRepository.findTransactionById(s.plaidTransactionId)
        ]);
        if (!expense || !txn) continue;

        const amountChanged = toCents(s.amount) !== toCents(s.previousAmount);
        const changes = {};
        if (amountChanged && s.amount > 0 && expense.original_cost == null && toCents(expense.amount) === toCents(s.previousAmount)) {
          changes.amount = round2(s.amount);
        }
        // The expense's own payment method decides: after a reconnect the bank account may not be mapped yet
        const isCard = expense.payment_method_type === 'credit_card' || txn.paymentMethodType === 'credit_card';
        if (s.settled && s.postedDate && isCard && !expense.posted_date && s.postedDate > expense.date) {
          changes.posted_date = s.postedDate;
        }
        if (Object.keys(changes).length > 0) {
          await expenseService.updateExpense(expense.id, { ...expense, ...changes });
        }

        let outcome = '';
        if (amountChanged) {
          outcome = `: ${money(s.previousAmount)} → ${money(s.amount)}, ${changes.amount ? 'expense updated' : 'expense amount kept (edited by hand)'}`;
        }
        await this._logReview(
          txn,
          s.settled ? 'settled' : 'pending_changed',
          s.settled ? `Pending charge ${describeTxn(txn)} settled${outcome}` : `Pending charge ${describeTxn(txn)} changed${outcome}`,
          { expenseId: expense.id, previousAmount: s.previousAmount, amountUpdated: Boolean(changes.amount) }
        );
      } catch (err) {
        logger.warn('Updating an expense from a settled bank transaction failed', { expenseId: s.expenseId, error: err.message });
        // The bank row is already settled, so nothing retries this: tell the user what to fix by hand
        if (txn) {
          await this._logReview(
            txn,
            'settle_failed',
            `Pending charge ${describeTxn(txn)} ${s.settled ? 'settled' : 'changed'}, but its expense could not be updated (${err.message}). Check its amount${s.settled && s.postedDate ? ` and posted date (${s.postedDate})` : ''}.`,
            { expenseId: s.expenseId, amount: s.amount, postedDate: s.postedDate ?? null }
          ).catch(() => {});
        }
      }
    }
  }

  /**
   * Review a pending charge that was added (or matched) as an expense and then dropped by the bank.
   * @param {{action: 'keep'|'delete_expense'|'link', postedId?: number}} input
   *   keep: keep the expense, no longer linked to the bank; delete_expense: the charge was cancelled;
   *   link: it settled as `postedId` (a posted row on the same account), which takes over the link
   */
  async resolveCancelled(id, { action, postedId } = {}, tabId = null) {
    return this._exclusive(id, async () => {
      const txn = await plaidRepository.findTransactionById(id);
      if (!txn || !txn.pending || !txn.removedAt || !['added', 'matched'].includes(txn.status)) {
        throw fail('Cancelled pending charge not found', 404);
      }

      if (action === 'keep') {
        await plaidRepository.deleteTransaction(id);
        await this._logReview(txn, 'cancelled_keep', `Kept the expense for cancelled pending charge ${describeTxn(txn)}`, { expenseId: txn.expenseId });
        return { action };
      }

      if (action === 'delete_expense') {
        // Expense first: if that fails nothing has changed
        if (txn.expenseId) await expenseService.deleteExpense(txn.expenseId, tabId);
        await plaidRepository.deleteTransaction(id);
        await this._logReview(txn, 'cancelled_delete', `Deleted the expense for cancelled pending charge ${describeTxn(txn)}`, { expenseId: txn.expenseId });
        return { action };
      }

      if (action === 'link') {
        const parsedId = parseInt(postedId, 10);
        const posted = Number.isNaN(parsedId) ? null : await plaidRepository.findTransactionById(parsedId);
        if (!posted || posted.status !== 'new' || posted.pending || posted.plaidAccountId !== txn.plaidAccountId) {
          throw fail('Choose a settled transaction on the same account that is still waiting for review', 400);
        }
        await plaidRepository.transferPendingLink(id, posted.id, txn.status, txn.expenseId);
        await this.applySettlements([{
          plaidTransactionId: posted.id, expenseId: txn.expenseId, settled: true,
          previousAmount: txn.amount, amount: posted.amount, postedDate: posted.date
        }]);
        return { action, transaction: await plaidRepository.findTransactionById(posted.id) };
      }

      throw fail('action must be one of: keep, delete_expense, link', 400);
    });
  }

  async ignore(id) {
    return this._exclusive(id, async () => {
      const txn = await this._requireNew(id);
      if (!(await plaidRepository.resolveTransaction(id, 'ignored'))) {
        throw fail('This bank transaction changed meanwhile. Refresh the Inbox and try again.', 409);
      }
      await this._logReview(txn, 'ignore', `Ignored bank transaction ${describeTxn(txn)}`);
      return { transaction: await plaidRepository.findTransactionById(id) };
    });
  }

  async unignore(id) {
    const txn = await plaidRepository.findTransactionById(id);
    if (!txn) {
      throw fail('Bank transaction not found', 404);
    }
    if (!(await plaidRepository.unignoreTransaction(id))) {
      throw fail(`Only ignored transactions can be restored (this one is ${txn.status})`, 409);
    }
    await this._logReview(txn, 'unignore', `Restored ignored bank transaction ${describeTxn(txn)} to the inbox`);
    return { transaction: await plaidRepository.findTransactionById(id) };
  }
}

module.exports = new PlaidInboxService();

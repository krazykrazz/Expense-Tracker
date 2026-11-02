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

const INBOX_STATUSES = ['new', 'ignored'];

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
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
    const [candidatesByRow, fixedByRow, incomeByRow, suggestions] = await Promise.all([
      isNew ? this._matchCandidates(rows) : new Map(),
      isNew ? this._fixedCandidates(rows) : new Map(),
      isNew ? this._incomeCandidates(rows) : new Map(),
      isNew ? this._suggestCategories(rows) : new Map()
    ]);

    const transactions = rows.map(row => {
      const place = defaultPlace(row);
      const income = incomeByRow.get(row.id);
      return {
        id: row.id,
        transactionId: row.transactionId,
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
        canAdd: row.amount > 0,
        isDeposit: isDeposit(row),
        suggestedCategory: suggestions.get(place.toLowerCase()) ?? null,
        matchCandidates: candidatesByRow.get(row.id) ?? [],
        fixedCandidates: fixedByRow.get(row.id) ?? [],
        incomeCandidates: income ? income.candidates : [],
        incomeSuggestion: income ? income.suggestion : null
      };
    });

    return { transactions, hiddenUnmapped };
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

  async _suggestCategories(rows) {
    const places = [...new Set(rows.map(defaultPlace).filter(Boolean))];
    const byPlace = await categorySuggestionService.getSuggestedCategories(places);
    const suggestions = new Map();
    for (const [place, suggestion] of byPlace) {
      suggestions.set(place.toLowerCase(), suggestion ? suggestion.category : null);
    }
    return suggestions;
  }

  async _requireNew(id) {
    const txn = await plaidRepository.findTransactionById(id);
    if (!txn) {
      throw fail('Bank transaction not found', 404);
    }
    if (txn.status !== 'new') {
      throw fail(`Bank transaction was already ${txn.status}`, 409);
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
   * @param {'add'|'match'|'match_fixed'|'match_income'|'add_income'|'ignore'|'unignore'} action
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
      // Credit card expenses keep the bank's posting date when it differs from the purchase date
      const postedDate = txn.paymentMethodType === 'credit_card' && txn.date > date ? txn.date : null;

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
        if (!err.statusCode) err.statusCode = 400;
        throw err;
      }

      const linked = await plaidRepository.resolveTransaction(id, 'added', created.id);
      if (!linked) {
        logger.warn('Bank transaction changed state while adding an expense', { plaidTransactionId: id, expenseId: created.id });
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
        await plaidRepository.resolveTransaction(id, 'matched', expense.id);
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
      const txn = await this._requireNew(id);
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
          throw fail(`Could not update the fixed expense amount: ${err.message}`, err.statusCode || 400);
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
      const txn = await this._requireNew(id);
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
          throw fail(`Could not update the income amount: ${err.message}`, err.statusCode || 400);
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
      const txn = await this._requireNew(id);
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
        if (!err.statusCode) err.statusCode = 400;
        throw err;
      }

      if (!(await plaidRepository.linkIncomeSource(id, created.id, txn.date, null, 'added'))) {
        await incomeService.deleteIncomeSource(created.id, tabId);
        throw fail('Bank transaction was already reviewed', 409);
      }
      await this._logReview(txn, 'add_income', `Added bank deposit ${describeTxn(txn)} as income "${created.name}"`, { incomeSourceId: created.id });
      return { transaction: await plaidRepository.findTransactionById(id), incomeSource: created };
    });
  }

  async ignore(id) {
    return this._exclusive(id, async () => {
      const txn = await this._requireNew(id);
      await plaidRepository.resolveTransaction(id, 'ignored');
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

const plaidRepository = require('../repositories/plaidRepository');
const expenseRepository = require('../repositories/expenseRepository');
const expenseService = require('./expenseService');
const categorySuggestionService = require('./categorySuggestionService');
const logger = require('../config/logger');
const { MATCH_WINDOW_DAYS, shiftDate, transactionDate, findMatchCandidates } = require('../utils/plaidMatching');

const INBOX_STATUSES = ['new', 'ignored'];

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const round2 = (n) => Math.round(n * 100) / 100;
const defaultPlace = (txn) => (txn.merchantName || txn.name || '').trim();

/**
 * Import Inbox: review staged bank transactions and add them as expenses, match them to
 * existing expenses, or ignore them. Nothing becomes an expense without an explicit action.
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

    const candidatesByRow = status === 'new' ? await this._matchCandidates(rows) : new Map();
    const suggestions = status === 'new' ? await this._suggestCategories(rows) : new Map();

    const transactions = rows.map(row => {
      const place = defaultPlace(row);
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
        suggestedCategory: suggestions.get(place.toLowerCase()) ?? null,
        matchCandidates: candidatesByRow.get(row.id) ?? []
      };
    });

    return { transactions, hiddenUnmapped };
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
    const suggestions = new Map();
    for (const place of new Set(rows.map(defaultPlace).filter(Boolean))) {
      const key = place.toLowerCase();
      if (suggestions.has(key)) continue;
      const suggestion = await categorySuggestionService.getSuggestedCategory(place);
      suggestions.set(key, suggestion ? suggestion.category : null);
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
      return { transaction: await plaidRepository.findTransactionById(id) };
    });
  }

  async ignore(id) {
    return this._exclusive(id, async () => {
      await this._requireNew(id);
      await plaidRepository.resolveTransaction(id, 'ignored');
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
    return { transaction: await plaidRepository.findTransactionById(id) };
  }
}

module.exports = new PlaidInboxService();

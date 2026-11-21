const plaidRepository = require('../repositories/plaidRepository');
const plaidSplitRepository = require('../repositories/plaidSplitRepository');
const expenseRepository = require('../repositories/expenseRepository');
const expenseService = require('./expenseService');
const dbHelper = require('../utils/dbHelper');
const logger = require('../config/logger');
const { toCents, round2 } = require('../utils/money');
const { transactionDate, expenseDateWindow, dayDiff } = require('../utils/plaidMatching');
const { chargedCents, suggestParts } = require('../utils/splitCharge');
const { fail, money, describeTxn, exclusive, logReview, postedDateFor } = require('./plaidInboxSupport');

const CHANGED = 'This bank transaction changed meanwhile. Refresh the Inbox and try again.';
const LIST_LIMIT = 40;

const shape = (expense) => ({
  expenseId: expense.id,
  date: expense.date,
  place: expense.place,
  notes: expense.notes,
  type: expense.type,
  amount: expense.amount,
  originalCost: expense.originalCost ?? null,
  charged: expense.chargedAmount
});

const byDateCloseness = (day) => (a, b) => dayDiff(a.date, day) - dayDiff(b.date, day) || a.id - b.id;

/**
 * A bank charge entered as several expenses (spec 3.9): one bank row, linked to all of them. The bank row's
 * `expense_id` is the primary expense and the rest are `plaid_split_links`. Matching a charge to a set of existing
 * expenses (from the Inbox), completing a charge from one of its expenses, and taking an expense out again.
 * Nothing about the expenses themselves changes (amounts, categories, notes); only a settled credit card charge
 * gives each its posted date, as a plain match does.
 */
class PlaidSplitService {
  /**
   * Whether and how this bank row can take part in a split: 'match' for a settled charge still to review (it needs a
   * complete set of expenses), 'complete' for a settled charge already linked to an expense (more can be added).
   */
  _mode(txn) {
    if (!txn) throw fail('Bank transaction not found', 404);
    if (txn.pending) throw fail('This transaction is still pending at the bank. Split it once it settles.', 400);
    if (txn.removedAt) throw fail('The bank dropped this transaction', 400);
    if (!(txn.amount > 0)) throw fail('Only a charge can be split across expenses', 400);
    if (!txn.paymentMethodId) throw fail('Map this bank account to a payment method first', 400);
    if (txn.status === 'new') return 'match';
    if (['added', 'matched'].includes(txn.status) && txn.expenseId) return 'complete';
    if (txn.status === 'matched') throw fail('This bank transaction is not linked to an expense', 400);
    throw fail(`Bank transaction was already ${txn.status}`, 409);
  }

  /** The expenses that could be a part of this row right now: unlinked, in its date window, and small enough. */
  async _fits(txn, mode, remainingCents) {
    const window = expenseDateWindow(txn);
    const unlinked = await plaidSplitRepository.findUnlinkedExpenses(txn.paymentMethodId, window.from, window.to);
    // To review, an expense as big as the whole charge is a plain match, not part of a split
    const limit = mode === 'match' ? remainingCents - 1 : remainingCents;
    return unlinked
      .filter(expense => chargedCents(expense) > 0 && chargedCents(expense) <= limit)
      .sort(byDateCloseness(transactionDate(txn)));
  }

  /**
   * The expenses this row could be split across, closest dates first, and what to pre-select.
   * @param {number} id bank transaction id
   * @returns {Promise<{mode: 'match'|'complete', row: object, bankAmount: number, partsTotal: number, remaining: number,
   *   minExpenses: number, parts: Array, candidates: Array, suggestion: (Array<number>|null)}>}
   */
  async candidates(id) {
    const txn = await plaidRepository.findTransactionById(id);
    const mode = this._mode(txn);
    const bankCents = toCents(txn.amount);
    const parts = mode === 'complete' ? await plaidSplitRepository.findParts(id) : [];
    const partsCents = parts.reduce((sum, part) => sum + chargedCents(part), 0);
    const remainingCents = bankCents - partsCents;
    const minExpenses = mode === 'match' ? 2 : 1;
    const fits = remainingCents > 0 ? await this._fits(txn, mode, remainingCents) : [];
    return {
      mode,
      row: { id: txn.id, date: txn.date, name: txn.merchantName || txn.name },
      bankAmount: round2(txn.amount),
      partsTotal: partsCents / 100,
      remaining: remainingCents / 100,
      minExpenses,
      parts: parts.map(shape),
      candidates: fits.slice(0, LIST_LIMIT).map(shape),
      suggestion: suggestParts(fits, remainingCents, minExpenses)
    };
  }

  /**
   * `split: { suggested }` for each row of the Inbox listing that has at least two unlinked expenses that could be
   * parts of it (`suggested`: exactly one combination of them adds up to the charge). Rows without are left out.
   * @param {Array} rows inbox rows (plaidRepository.findInbox)
   * @returns {Promise<Map<number, {suggested: boolean}>>}
   */
  async describeRows(rows) {
    const result = new Map();
    const eligible = rows.filter(row => !row.pending && !row.removedAt && row.amount > 0 && row.paymentMethodId);
    if (eligible.length === 0) return result;

    const windows = eligible.map(row => ({ row, ...expenseDateWindow(row) }));
    const methodIds = [...new Set(eligible.map(row => row.paymentMethodId))];
    const expenses = await plaidRepository.findUnlinkedExpenses(
      methodIds,
      windows.reduce((min, w) => (w.from < min ? w.from : min), windows[0].from),
      windows.reduce((max, w) => (w.to > max ? w.to : max), windows[0].to)
    );

    for (const { row, from, to } of windows) {
      const bankCents = toCents(row.amount);
      const fits = expenses
        .filter(expense => expense.paymentMethodId === row.paymentMethodId && expense.date >= from && expense.date <= to
          && chargedCents(expense) > 0 && chargedCents(expense) < bankCents)
        .sort(byDateCloseness(transactionDate(row)));
      if (fits.length < 2) continue;
      result.set(row.id, { suggested: suggestParts(fits, bankCents, 2) !== null });
    }
    return result;
  }

  /** Validate the request: positive, distinct integer ids. */
  _parse(expenseIds) {
    if (!Array.isArray(expenseIds) || expenseIds.length === 0) throw fail('Pick at least one expense', 400);
    const ids = expenseIds.map(Number);
    if (ids.some(id => !Number.isInteger(id) || id <= 0)) throw fail('Each expense needs a valid id', 400);
    if (new Set(ids).size !== ids.length) throw fail('Each expense can only be picked once', 400);
    return ids;
  }

  /**
   * Link a bank charge to expenses: a charge still to review is matched to a complete set (at least two, adding up
   * to the charge to the cent); a charge already linked to an expense takes more expenses, as long as together they
   * stay within the charge.
   * @param {number} id bank transaction id
   * @param {Array<number>} expenseIds
   */
  async apply(id, expenseIds) {
    return exclusive(id, async () => {
      const txn = await plaidRepository.findTransactionById(id);
      const mode = this._mode(txn);
      const ids = this._parse(expenseIds);
      if (mode === 'match' && ids.length < 2) throw fail('Pick at least two expenses: one expense is a plain match', 400);

      const expenses = await plaidSplitRepository.findExpensesByIds(ids);
      const byId = new Map(expenses.map(expense => [expense.id, expense]));
      for (const expenseId of ids) {
        const expense = byId.get(expenseId);
        if (!expense) throw fail(`Expense ${expenseId} not found`, 404);
        const label = `"${expense.place || 'Expense'}" (${expense.date})`;
        if (expense.paymentMethodId !== txn.paymentMethodId) throw fail(`${label} uses a different payment method than this bank account`, 400);
        if (expense.primaryOf || expense.partOf) throw fail(`${label} is already linked to a bank transaction`, 409);
        if (!(chargedCents(expense) > 0)) throw fail(`${label} has no amount to link`, 400);
      }

      const bankCents = toCents(txn.amount);
      const existing = mode === 'complete' ? await plaidSplitRepository.findParts(id) : [];
      const existingCents = existing.reduce((sum, part) => sum + chargedCents(part), 0);
      const addedCents = expenses.reduce((sum, expense) => sum + chargedCents(expense), 0);
      if (mode === 'match' && addedCents !== bankCents) {
        throw fail(`The expenses add up to ${money(addedCents / 100)} but the charge is ${money(bankCents / 100)}`, 400);
      }
      if (existingCents + addedCents > bankCents) {
        throw fail(`With these expenses the charge would be linked for ${money((existingCents + addedCents) / 100)} but the bank charged ${money(bankCents / 100)}`, 400);
      }

      // The largest part is the one the bank row is "added from / matched to": the rest are its split links
      const ordered = [...expenses].sort((a, b) => chargedCents(b) - chargedCents(a) || a.id - b.id);
      const primary = mode === 'match' ? ordered[0] : null;
      const others = (mode === 'match' ? ordered.slice(1) : ordered).map(expense => expense.id);
      try {
        await dbHelper.runInTransaction(async (tx) => {
          if (primary && !(await plaidRepository.resolveTransaction(id, 'matched', primary.id, tx))) throw fail(CHANGED, 409);
          await plaidSplitRepository.insertParts(tx, id, others);
        });
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          throw fail('One of these expenses is already linked to a bank transaction', 409);
        }
        throw err;
      }

      const postedDates = await this._applyPostedDates(txn, ids);
      const total = (existingCents + addedCents) / 100;
      await logReview(
        txn,
        mode === 'match' ? 'match_split' : 'split_added',
        mode === 'match'
          ? `Matched bank transaction ${describeTxn(txn)} to ${ids.length} existing expenses (${money(total)} together)`
          : `Added ${ids.length} expense${ids.length === 1 ? '' : 's'} to the split of bank transaction ${describeTxn(txn)} (${money(total)} of ${money(txn.amount)})`,
        { expenseIds: ids, ...(primary ? { primaryExpenseId: primary.id } : {}), total, postedDatesUpdated: postedDates }
      );
      return {
        transaction: await plaidRepository.findTransactionById(id),
        expenseIds: [...existing.map(part => part.id), ...ids],
        total,
        complete: toCents(total) === bankCents
      };
    });
  }

  /**
   * Take an expense out of a split charge. The other expenses stay linked (the first of them becomes the bank row's
   * main expense when this was it). A charge with a single expense has nothing to take out.
   * @param {number} id bank transaction id
   * @param {number} expenseId
   */
  async remove(id, expenseId) {
    return exclusive(id, async () => {
      const txn = await plaidRepository.findTransactionById(id);
      if (!txn) throw fail('Bank transaction not found', 404);
      if (!['added', 'matched'].includes(txn.status) || !txn.expenseId) throw fail('This bank transaction is not linked to expenses', 400);
      const parts = await plaidSplitRepository.findParts(id);
      const target = parts.find(part => part.id === Number(expenseId));
      if (!target) throw fail('That expense is not part of this bank charge', 404);
      if (parts.length < 2) throw fail('This charge has a single expense: there is nothing to take it out of', 400);

      await dbHelper.runInTransaction(async (tx) => {
        if (target.primaryOf === id) {
          const next = parts.find(part => part.id !== target.id);
          await plaidSplitRepository.promotePart(tx, id, next.id);
        } else if (!(await plaidSplitRepository.deletePart(tx, target.id))) {
          throw fail(CHANGED, 409);
        }
      });

      await logReview(
        txn, 'split_removed',
        `Took "${target.place || 'expense'}" (${target.date}) out of the split of bank transaction ${describeTxn(txn)}`,
        { expenseId: target.id, remaining: parts.length - 1 }
      );
      return {
        transaction: await plaidRepository.findTransactionById(id),
        expenseIds: parts.filter(part => part.id !== target.id).map(part => part.id)
      };
    });
  }

  /**
   * A settled credit card charge gives each expense its posted date, as a plain match does (statements are built
   * from it). Best effort: the link stands when an expense can't be updated.
   * @returns {Promise<number>} expenses whose posted date changed
   */
  async _applyPostedDates(txn, expenseIds) {
    if (txn.pending || txn.paymentMethodType !== 'credit_card') return 0;
    let changed = 0;
    for (const expenseId of expenseIds) {
      try {
        const expense = await expenseRepository.findById(expenseId);
        const change = expense && await postedDateFor(expense, txn.date, txn.plaidAccountId);
        if (change) {
          await expenseService.updateExpense(expenseId, { ...expense, ...change });
          changed++;
        }
      } catch (err) {
        logger.warn('Updating the posted date of a split expense failed', { expenseId, error: err.message });
      }
    }
    return changed;
  }
}

module.exports = new PlaidSplitService();

const plaidRepository = require('../repositories/plaidRepository');
const plaidLinkRepository = require('../repositories/plaidLinkRepository');
const plaidBucketRepository = require('../repositories/plaidBucketRepository');
const expenseRepository = require('../repositories/expenseRepository');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const incomeRepository = require('../repositories/incomeRepository');
const expenseService = require('./expenseService');
const fixedExpenseService = require('./fixedExpenseService');
const incomeService = require('./incomeService');
const logger = require('../config/logger');
const dbHelper = require('../utils/dbHelper');
const { getDatabase } = require('../database/db');
const { toCents, transactionDate, isFixedCandidate, isDeposit, isIncomeCandidate } = require('../utils/plaidMatching');
const { INCOME_CATEGORIES } = require('../utils/constants');
const { BUCKETS } = require('../utils/plaidClassification');
const {
  fail, asInputError, round2, defaultPlace, describeTxn, exclusive, requireNew, logReview, postedDateFor, incomeDescription
} = require('./plaidInboxSupport');

/**
 * Import Inbox decisions: add a staged bank transaction as an expense or income, match it to an existing
 * expense, planned fixed expense or expected income, or ignore it. Nothing becomes an expense without an
 * explicit action. Listing is plaidInboxService; settling pending charges is plaidSettlementService.
 */
class PlaidReviewService {
  /**
   * Create an expense from a staged transaction.
   * @param {number} id
   * @param {{type: string, place?: string, date?: string, notes?: string}} input
   */
  async addAsExpense(id, input = {}, tabId = null) {
    return exclusive(id, async () => {
      const txn = await requireNew(id);
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

      // The expense and its bank link commit together: if a sync changed the row meanwhile, the expense
      // (and its card balance update) rolls back, so no expense exists without its bank row
      const added = await dbHelper.runInTransaction(async (tx) => {
        let result;
        try {
          result = await expenseService.createExpenseInTransaction({
            date,
            posted_date: postedDate,
            place: place || null,
            notes: typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : null,
            amount: round2(txn.amount),
            type: input.type,
            payment_method_id: txn.paymentMethodId
          }, await getDatabase(), tabId);
        } catch (err) {
          throw asInputError(err);
        }
        if (!(await plaidRepository.resolveTransaction(id, 'added', result.expense.id, tx))) {
          throw fail('This bank transaction changed while it was being added. Refresh the Inbox and try again.', 409);
        }
        return result;
      });
      const created = added.expense;
      await added.logCreated();
      await logReview(txn, 'add', `Added bank transaction ${describeTxn(txn)} as an expense`, { expenseId: created.id });
      return { transaction: await plaidRepository.findTransactionById(id), expense: created };
    });
  }

  /**
   * Link a staged transaction to an expense entered by hand. Nothing is created and the expense keeps its
   * purchase date, amount and category; a settled card transaction brings its posted date to the expense
   * (replacing an estimate), since statements are built from it. A pending one does that when it settles.
   */
  async matchToExpense(id, expenseId) {
    return exclusive(id, async () => {
      const txn = await requireNew(id);
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

      // Best effort: the match stands even when the posted date can't be updated (it is logged either way)
      let postedDate;
      if (!txn.pending && txn.paymentMethodType === 'credit_card') {
        const change = await postedDateFor(expense, txn.date, txn.plaidAccountId);
        if (change) {
          try {
            await expenseService.updateExpense(expense.id, { ...expense, ...change });
            postedDate = change.posted_date ?? expense.date;
          } catch (err) {
            logger.warn('Updating the posted date of a matched expense failed', { expenseId: expense.id, error: err.message });
          }
        }
      }
      await logReview(
        txn,
        'match',
        `Matched bank transaction ${describeTxn(txn)} to an existing expense${postedDate ? `; posted date ${postedDate}` : ''}`,
        { expenseId: expense.id, ...(postedDate ? { postedDateUpdated: true } : {}) }
      );
      return { transaction: await plaidRepository.findTransactionById(id), postedDateUpdated: Boolean(postedDate) };
    });
  }

  /**
   * Confirm a planned fixed expense with a bank transaction and record when it actually landed.
   * When the bank amount differs from the planned amount, the fixed expense is updated to the bank amount
   * (through fixedExpenseService, so validation and the activity log apply).
   */
  async matchToFixedExpense(id, fixedExpenseId, tabId = null) {
    return exclusive(id, async () => {
      const txn = await requireNew(id, { settled: true });
      const parsedId = parseInt(fixedExpenseId, 10);
      const fixed = Number.isNaN(parsedId) ? null : await plaidLinkRepository.findFixedExpenseForMatching(parsedId);
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
        if (!(await plaidLinkRepository.linkFixedExpense(id, fixed.id, landedDate, plannedAmount))) {
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
          await plaidLinkRepository.unlinkFixedExpense(id);
          logger.warn('Updating fixed expense amount from bank transaction failed', { fixedExpenseId: fixed.id, error: err.message });
          throw fail(`Could not update the fixed expense amount: ${err.message}`, asInputError(err).statusCode || 500);
        }
      }

      await logReview(txn, 'match_fixed', `Confirmed fixed expense "${fixed.name}" with bank transaction ${describeTxn(txn)}`, {
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
    return exclusive(id, async () => {
      const txn = await requireNew(id, { settled: true });
      const parsedId = parseInt(incomeSourceId, 10);
      const source = Number.isNaN(parsedId) ? null : await plaidLinkRepository.findIncomeSourceForMatching(parsedId);
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
        if (!(await plaidLinkRepository.linkIncomeSource(id, source.id, landedDate, plannedAmount))) {
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
          await plaidLinkRepository.unlinkIncomeSource(id);
          logger.warn('Updating income amount from bank deposit failed', { incomeSourceId: source.id, error: err.message });
          throw fail(`Could not update the income amount: ${err.message}`, asInputError(err).statusCode || 500);
        }
      }

      await logReview(txn, 'match_income', `Confirmed income "${source.name}" with bank deposit ${describeTxn(txn)}`, {
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
    return exclusive(id, async () => {
      const txn = await requireNew(id, { settled: true });
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

      if (!(await plaidLinkRepository.linkIncomeSource(id, created.id, txn.date, null, 'added'))) {
        await incomeService.deleteIncomeSource(created.id, tabId);
        throw fail('Bank transaction was already reviewed', 409);
      }
      await logReview(txn, 'add_income', `Added bank deposit ${describeTxn(txn)} as income "${created.name}"`, { incomeSourceId: created.id });
      return { transaction: await plaidRepository.findTransactionById(id), incomeSource: created };
    });
  }

  async ignore(id) {
    return exclusive(id, async () => {
      const txn = await requireNew(id);
      if (!(await plaidRepository.resolveTransaction(id, 'ignored'))) {
        throw fail('This bank transaction changed meanwhile. Refresh the Inbox and try again.', 409);
      }
      await logReview(txn, 'ignore', `Ignored bank transaction ${describeTxn(txn)}`);
      return { transaction: await plaidRepository.findTransactionById(id) };
    });
  }

  /**
   * Move a row still to review between the Inbox tabs (To review = 'spending', Not expenses = 'not_expense'). The
   * choice sticks: later syncs no longer classify the row.
   */
  async setBucket(id, bucket) {
    if (!BUCKETS.includes(bucket)) {
      throw fail(`bucket must be one of: ${BUCKETS.join(', ')}`, 400);
    }
    return exclusive(id, async () => {
      const txn = await requireNew(id);
      if (!(await plaidBucketRepository.setBucket(id, bucket))) {
        throw fail('This bank transaction changed meanwhile. Refresh the Inbox and try again.', 409);
      }
      const tab = bucket === 'spending' ? 'To review' : 'Not expenses';
      await logReview(txn, 'bucket', `Moved bank transaction ${describeTxn(txn)} to ${tab}`, { bucket, previousBucket: txn.bucket });
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
    await logReview(txn, 'unignore', `Restored ignored bank transaction ${describeTxn(txn)} to the inbox`);
    return { transaction: await plaidRepository.findTransactionById(id) };
  }
}

module.exports = new PlaidReviewService();

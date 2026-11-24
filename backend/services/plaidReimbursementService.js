const plaidRepository = require('../repositories/plaidRepository');
const plaidReimbursementRepository = require('../repositories/plaidReimbursementRepository');
const expenseRepository = require('../repositories/expenseRepository');
const creditCardPaymentService = require('./creditCardPaymentService');
const activityLogService = require('./activityLogService');
const dbHelper = require('../utils/dbHelper');
const { toCents, round2 } = require('../utils/money');
const { isDeposit, isCardCredit, descriptionKey, transactionDate, shiftDate } = require('../utils/plaidMatching');
const { kindFor } = require('../utils/plaidClassification');
const { buildLearnedPlaces, buildPlaceIndex, suggestPlace } = require('../utils/placeSuggestion');
const {
  WINDOW_DAYS, chargedOf, enteredPoolCents, planApply, rankDeposit, rankRefund, suggestedAmount
} = require('../utils/reimbursement');
const { fail, asInputError, money, defaultPlace, describeTxn, exclusive, requireNew, logReview } = require('./plaidInboxSupport');

const CHANGED = 'This bank transaction changed meanwhile. Refresh the Inbox and try again.';
/** Candidates listed when not asked for all of them. */
const LIST_LIMIT = 40;
const ALL_LIMIT = 300;

const hasTwoDecimalsAtMost = (amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;

/**
 * Bank rows that paid part of an expense back (spec 3.6 and 3.8):
 * - a **refund**: a settled credit on a credit card, for a purchase on that card. It lowers the expense's
 *   out-of-pocket and is recorded as a payment on the card on its posted date, so the card balance matches the bank;
 * - a **deposit** from a person or business into a bank account, for one or more expenses on any payment method.
 *   The card, if the expense was on one, is unaffected: it was charged the full original cost.
 * Both make the expense a reimbursement (original cost = what was charged, amount = what it cost out of pocket;
 * $0.00 for a full refund), never touch what was already entered by hand, and undo exactly (Undo, deleting the
 * card payment, or deleting the expense return the bank row to the Inbox).
 */
class PlaidReimbursementService {
  /** 'refund' for a settled credit on a card, 'deposit' for money into a mapped bank account. */
  _kind(txn) {
    if (txn.pending) throw fail('This transaction is still pending at the bank. Confirm it once it settles.', 400);
    if (isCardCredit(txn)) return 'refund';
    if (isDeposit(txn) && txn.paymentMethodId) return 'deposit';
    throw fail('Only a credit on a credit card or a deposit into a mapped bank account can repay an expense', 400);
  }

  /** The place the Inbox would suggest for a bank description: learned, else an existing place it starts with. */
  async _placeSuggester() {
    const [learnedRows, places] = await Promise.all([plaidRepository.findLearnedPlaces(), expenseRepository.getPlaceUsage()]);
    const learned = buildLearnedPlaces(learnedRows);
    const index = buildPlaceIndex(places);
    return (txn) => suggestPlace([txn.merchantName, txn.name], learned, index) || defaultPlace(txn);
  }

  /** Lower-cased places earlier deposits with this bank row's description were applied to. */
  async _learnedPlaces(txn) {
    const key = descriptionKey(txn);
    const rows = await plaidReimbursementRepository.findLearnedDepositPlaces();
    return new Set(rows.filter(row => descriptionKey(row) === key).map(row => String(row.place).trim().toLowerCase()));
  }

  _shape(candidate) {
    return {
      expenseId: candidate.id,
      date: candidate.date,
      place: candidate.place,
      notes: candidate.notes,
      type: candidate.type,
      method: candidate.method,
      paymentMethodId: candidate.paymentMethodId,
      amount: candidate.amount,
      originalCost: candidate.originalCost,
      charged: chargedOf(candidate),
      reimbursed: round2(chargedOf(candidate) - candidate.amount),
      tags: candidate.tags,
      alreadyEntered: candidate.tags.includes('entered'),
      // What was entered by hand as reimbursed and no bank row accounts for yet: a deposit can claim part of it
      enteredPool: enteredPoolCents(candidate) / 100
    };
  }

  /**
   * Expenses a settled credit on a card or a deposit could repay, best first, with what to pre-fill.
   * @param {number} id bank transaction id
   * @param {{all?: boolean}} options `all`: more candidates (every purchase on the card; the whole window)
   */
  async candidates(id, { all = false } = {}) {
    const txn = await requireNew(id, { settled: true });
    const kind = this._kind(txn);
    const bankCents = toCents(Math.abs(txn.amount));
    const fromDate = shiftDate(transactionDate(txn), -WINDOW_DAYS);
    const row = { id: txn.id, amount: round2(Math.abs(txn.amount)), date: txn.date, name: defaultPlace(txn) };

    if (kind === 'refund') {
      const expenses = await plaidReimbursementRepository.findCandidateExpenses(fromDate, txn.date, txn.paymentMethodId);
      const place = (await this._placeSuggester())(txn);
      const ranked = rankRefund(expenses, bankCents, txn, place, { all });
      const first = ranked[0];
      return {
        kind, row, place,
        candidates: ranked.slice(0, ALL_LIMIT).map(candidate => this._shape(candidate)),
        suggestion: first ? [{ expenseId: first.id, amount: row.amount, alreadyEntered: first.tags.includes('entered') }] : null,
        moreAvailable: !all && expenses.filter(e => toCents(chargedOf(e)) >= bankCents).length > ranked.length
      };
    }

    const expenses = await plaidReimbursementRepository.findCandidateExpenses(fromDate, txn.date);
    const ranked = rankDeposit(expenses, bankCents, txn, await this._learnedPlaces(txn));
    const limit = all ? ALL_LIMIT : LIST_LIMIT;
    const first = ranked[0];
    const suggestion = first && first.tags.length > 0
      ? [{ expenseId: first.id, amount: suggestedAmount(first, bankCents), alreadyEntered: first.tags.includes('entered') }]
      : null;
    return {
      kind, row,
      candidates: ranked.slice(0, limit).map(candidate => this._shape(candidate)),
      suggestion,
      moreAvailable: ranked.length > limit
    };
  }

  /**
   * `reimbursement: { kind, suggested }` for each row of the Inbox listing that could repay an expense: a settled
   * credit on a card (not a card payment) and a settled deposit into a mapped account. `suggested`: something fits.
   * @param {Array} rows inbox rows (plaidRepository.findInbox)
   * @returns {Promise<Map<number, {kind: 'refund'|'deposit', suggested: boolean}>>}
   */
  async describeRows(rows) {
    const result = new Map();
    const eligible = rows.filter(row => !row.pending && (
      (isCardCredit(row) && kindFor({ ...row, isCard: true }) !== 'card_payment') || (isDeposit(row) && row.paymentMethodId)
    ));
    if (eligible.length === 0) return result;

    const dates = eligible.map(row => row.date).sort();
    const [expenses, suggest, learnedRows] = await Promise.all([
      plaidReimbursementRepository.findCandidateExpenses(shiftDate(dates[0], -WINDOW_DAYS), dates[dates.length - 1]),
      eligible.some(isCardCredit) ? this._placeSuggester() : null,
      eligible.some(isDeposit) ? plaidReimbursementRepository.findLearnedDepositPlaces() : []
    ]);

    for (const row of eligible) {
      const from = shiftDate(row.date, -WINDOW_DAYS);
      const inWindow = expenses.filter(expense => expense.date >= from && expense.date <= row.date);
      const bankCents = toCents(Math.abs(row.amount));
      if (isCardCredit(row)) {
        const onCard = inWindow.filter(expense => expense.paymentMethodId === row.paymentMethodId);
        result.set(row.id, { kind: 'refund', suggested: rankRefund(onCard, bankCents, row, suggest(row)).length > 0 });
      } else {
        const key = descriptionKey(row);
        const learned = new Set(learnedRows.filter(l => descriptionKey(l) === key).map(l => String(l.place).trim().toLowerCase()));
        const [best] = rankDeposit(inWindow, bankCents, row, learned);
        result.set(row.id, { kind: 'deposit', suggested: Boolean(best && best.tags.length > 0) });
      }
    }
    return result;
  }

  /**
   * Validate the request: at least one expense, each once, amounts above $0 in dollars and cents. A refund repays
   * exactly one expense, for the whole credit; a deposit's amounts add up to the deposit to the cent.
   * @returns {Array<{expenseId: number, amount: number, amountCents: number, alreadyEntered: boolean}>}
   */
  _parse(expenses, kind, bankCents) {
    if (!Array.isArray(expenses) || expenses.length === 0) throw fail('Pick at least one expense', 400);
    if (kind === 'refund' && expenses.length !== 1) throw fail('A refund is applied to one purchase', 400);
    const seen = new Set();
    const parsed = expenses.map((entry) => {
      const expenseId = Number(entry && entry.expenseId);
      const amount = Number(entry && entry.amount);
      if (!Number.isInteger(expenseId) || expenseId <= 0) throw fail('Each expense needs a valid expenseId', 400);
      if (seen.has(expenseId)) throw fail('Each expense can only be picked once', 400);
      seen.add(expenseId);
      if (!Number.isFinite(amount) || amount <= 0 || !hasTwoDecimalsAtMost(amount)) {
        throw fail('Each amount must be above $0.00, in dollars and cents', 400);
      }
      return { expenseId, amount: round2(amount), amountCents: toCents(amount), alreadyEntered: entry.alreadyEntered === true };
    });
    const total = parsed.reduce((sum, entry) => sum + entry.amountCents, 0);
    if (total !== bankCents) {
      throw fail(`The amounts add up to ${money(total / 100)} but the ${kind === 'refund' ? 'refund' : 'deposit'} is ${money(bankCents / 100)}`, 400);
    }
    return parsed;
  }

  /** Reasons an expense can't take this bank row (checked inside the transaction, on the stored expense). */
  _assertEligible(expense, txn, kind, amountCents) {
    const label = `"${expense.place || 'Expense'}" (${expense.date})`;
    if (expense.insuranceEligible) {
      throw fail(`${label} is an insurance claim: apply the deposit to it with Apply to insurance`, 400);
    }
    if (expense.hasPeople) {
      throw fail(`${label} is split between people: change its reimbursement in the expense form`, 400);
    }
    if (kind === 'refund') {
      if (expense.paymentMethodId !== txn.paymentMethodId) {
        throw fail(`${label} is on another payment method than the card this refund is on`, 400);
      }
      if (toCents(chargedOf(expense)) < amountCents) {
        throw fail(`${label} was charged less than this refund`, 400);
      }
    }
  }

  /**
   * Apply a bank row to expenses. One transaction covers the bank row, the links, each expense and, for a refund,
   * the payment on the card, so nothing is left half done when the row was reviewed meanwhile.
   * @param {number} id bank transaction id
   * @param {Array<{expenseId: number, amount: number, alreadyEntered?: boolean}>} expenses
   */
  async apply(id, expenses, tabId = null) {
    return exclusive(id, async () => {
      const txn = await requireNew(id, { settled: true });
      const kind = this._kind(txn);
      const bankCents = toCents(Math.abs(txn.amount));
      const wanted = this._parse(expenses, kind, bankCents);

      const applyAll = async (tx, payment) => {
        const rows = new Map((await plaidReimbursementRepository.findExpensesByIds(wanted.map(w => w.expenseId), tx)).map(row => [row.id, row]));
        if (!(await plaidReimbursementRepository.markMatched(tx, id))) throw fail(CHANGED, 409);
        const results = [];
        for (const entry of wanted) {
          const expense = rows.get(entry.expenseId);
          if (!expense) throw fail(`Expense ${entry.expenseId} not found`, 404);
          this._assertEligible(expense, txn, kind, entry.amountCents);
          const plan = planApply(expense, entry.amountCents, entry.alreadyEntered);
          if (plan.error === 'over') {
            throw fail(`"${expense.place || 'Expense'}" (${expense.date}) has at most ${money(plan.leftCents / 100)} left to reimburse`, 400);
          }
          if (plan.error === 'notEntered') {
            throw fail(`"${expense.place || 'Expense'}" (${expense.date}) has no reimbursement of ${money(entry.amount)} entered by hand`, 400);
          }
          await plaidReimbursementRepository.insertLink(tx, {
            transactionId: id,
            expenseId: expense.id,
            kind,
            amount: entry.amount,
            appliedAmount: plan.appliedCents / 100,
            // The original cost before the first bank row: later links carry the first one's, so undoing the last restores it
            previousOriginalCost: expense.linkCount > 0 ? expense.firstPreviousOriginalCost : (expense.originalCost ?? null),
            previousAmount: expense.amount,
            creditCardPaymentId: payment ? payment.id : null
          });
          if (plan.appliedCents > 0) {
            await plaidReimbursementRepository.updateExpense(tx, expense.id, { amount: plan.amount, originalCost: plan.originalCost });
          }
          results.push({
            expenseId: expense.id, place: expense.place, date: expense.date, type: expense.type, method: expense.method,
            reimbursed: entry.amount, previousAmount: expense.amount, amount: plan.amount, originalCost: plan.originalCost,
            alreadyEntered: entry.alreadyEntered
          });
        }
        return results;
      };

      let applied;
      let payment = null;
      if (kind === 'refund') {
        const [target] = await plaidReimbursementRepository.findExpensesByIds([wanted[0].expenseId]);
        if (!target) throw fail(`Expense ${wanted[0].expenseId} not found`, 404);
        try {
          payment = await creditCardPaymentService.recordPayment({
            payment_method_id: txn.paymentMethodId,
            amount: round2(Math.abs(txn.amount)),
            payment_date: txn.date,
            notes: `Refund: ${target.place || 'purchase'}`.slice(0, 500)
          }, {
            withinTransaction: async (tx, created) => { applied = await applyAll(tx, created); }
          });
        } catch (err) {
          throw asInputError(err);
        }
      } else {
        applied = await dbHelper.runInTransaction((tx) => applyAll(tx, null));
      }

      await logReview(
        txn, 'reimbursement',
        `Applied bank ${kind === 'refund' ? 'refund' : 'deposit'} ${describeTxn(txn)} to ${applied.length} expense${applied.length === 1 ? '' : 's'}`,
        {
          kind,
          expenses: applied.map(({ expenseId, reimbursed }) => ({ expenseId, amount: reimbursed })),
          ...(payment ? { creditCardPaymentId: payment.id } : {})
        }
      );
      for (const result of applied) {
        await this._logExpenseUpdated(result, `${kind === 'refund' ? 'refunded' : 'reimbursed'} ${money(result.reimbursed)} by bank`, tabId);
      }
      return { transaction: await plaidRepository.findTransactionById(id), kind, expenses: applied, ...(payment ? { payment } : {}) };
    });
  }

  /**
   * Undo apply: each expense gets back what the bank row took off it (and its original cost when no other bank row
   * still reimburses it), the card payment a refund recorded is deleted, and the row returns to the Inbox.
   */
  async unlink(id, tabId = null) {
    return exclusive(id, async () => {
      const txn = await plaidRepository.findTransactionById(id);
      if (!txn) throw fail('Bank transaction not found', 404);
      const links = await plaidReimbursementRepository.findLinksForTransaction(id);
      if (links.length === 0) throw fail('This bank transaction is not applied to an expense', 404);
      if (txn.status !== 'matched') throw fail(`Bank transaction is ${txn.status}, not applied to an expense`, 409);

      const { restored, paymentIds } = await dbHelper.runInTransaction(async (tx) => {
        const current = await plaidReimbursementRepository.findLinksForTransaction(id, tx);
        if (current.length === 0) throw fail(CHANGED, 409);
        const restoredExpenses = [];
        for (const link of current) {
          const [expense] = await plaidReimbursementRepository.findExpensesByIds([link.expenseId], tx);
          if (!expense) continue;
          const others = (await plaidReimbursementRepository.findLinksForExpense(link.expenseId, tx)).filter(other => other.id !== link.id);
          const amount = round2(expense.amount + link.appliedAmount);
          const originalCost = others.length > 0 ? expense.originalCost : link.previousOriginalCost;
          await plaidReimbursementRepository.updateExpense(tx, expense.id, { amount, originalCost });
          restoredExpenses.push({
            expenseId: expense.id, place: expense.place, date: expense.date, type: expense.type, method: expense.method,
            reimbursed: link.amount, previousAmount: expense.amount, amount, originalCost
          });
        }
        // Links first: the card payment's own delete trigger then has nothing left to restore
        await plaidReimbursementRepository.deleteLinksForTransaction(tx, id);
        const ids = current.map(link => link.creditCardPaymentId).filter(Boolean);
        for (const paymentId of ids) await plaidReimbursementRepository.deletePayment(tx, paymentId);
        if (!(await plaidReimbursementRepository.markNew(tx, id))) throw fail(CHANGED, 409);
        return { restored: restoredExpenses, paymentIds: ids };
      });

      await logReview(
        txn, 'reimbursement_undone',
        `Undid bank transaction ${describeTxn(txn)} on ${restored.length} expense${restored.length === 1 ? '' : 's'}`,
        { expenses: restored.map(({ expenseId, reimbursed }) => ({ expenseId, amount: reimbursed })) }
      );
      for (const result of restored) {
        await this._logExpenseUpdated(result, `bank reimbursement of ${money(result.reimbursed)} undone`, tabId);
      }
      for (const paymentId of paymentIds) {
        await activityLogService.logEvent(
          'credit_card_payment_deleted', 'credit_card_payment', paymentId,
          `Deleted the ${money(txn.amount)} refund recorded as a payment (${txn.date}): its bank credit returned to the Inbox`,
          { paymentMethodId: txn.paymentMethodId, amount: Math.abs(txn.amount), payment_date: txn.date }
        );
      }
      return { transaction: await plaidRepository.findTransactionById(id), expenses: restored };
    });
  }

  /** expense_updated, as expenseService logs a hand edit, so other tabs refresh. Nothing when the expense is unchanged. */
  async _logExpenseUpdated(result, reason, tabId) {
    if (toCents(result.previousAmount) === toCents(result.amount)) return;
    const changes = [reason, `amount: $${Number(result.previousAmount).toFixed(2)} → $${Number(result.amount).toFixed(2)}`];
    await activityLogService.logEvent(
      'expense_updated',
      'expense',
      result.expenseId,
      `Updated expense: ${result.place || 'Unknown'} - ${Number(result.amount).toFixed(2)} on ${result.date} (${changes.join(', ')})`,
      { amount: result.amount, category: result.type, date: result.date, place: result.place, method: result.method, changes, tabId }
    );
  }
}

module.exports = new PlaidReimbursementService();

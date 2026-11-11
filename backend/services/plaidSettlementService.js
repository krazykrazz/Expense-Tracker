const plaidRepository = require('../repositories/plaidRepository');
const plaidFileImportRepository = require('../repositories/plaidFileImportRepository');
const expenseRepository = require('../repositories/expenseRepository');
const expenseService = require('./expenseService');
const logger = require('../config/logger');
const { toCents } = require('../utils/plaidMatching');
const { fail, round2, money, describeTxn, exclusive, logReview, postedDateFor } = require('./plaidInboxSupport');

/** What to correct by hand when the expense update after a bank change failed (nothing retries it). */
function settleFailedMessage(s, txn, err) {
  const [subject, happened, check] = s.postedDateOnly
    ? ['Bank transaction', 'got its posting date from the bank', `posted date (${s.postedDate})`]
    : ['Pending charge', s.settled ? 'settled' : 'changed', s.settled && s.postedDate ? `amount and posted date (${s.postedDate})` : 'amount'];
  return `${subject} ${describeTxn(txn)} ${happened}, but its expense could not be updated (${err.message}). Check its ${check}.`;
}

/**
 * What happens to expenses linked to a bank transaction after the bank changes it: a pending charge that settles
 * or changes amount (applySettlements), and a pending charge the bank dropped (resolveCancelled).
 */
class PlaidSettlementService {
  /**
   * Bring expenses created from (or matched to) a pending charge in line with the bank once it settled, or
   * when its pending amount changed:
   * - the amount follows the bank only if the expense still has the previous bank amount; an amount edited
   *   by hand, or a reimbursed / insurance-tracked expense, is kept (its payment method pill shows the
   *   difference);
   * - on settlement, credit card expenses take the bank's posting date (see postedDateChange).
   * Runs after the sync batch is committed. Never throws: a failed update leaves the expense as it was.
   * @param {Array<{plaidTransactionId: number, expenseId: number, settled: boolean, previousAmount: number,
   *   amount: number, postedDate: (string|null), postedDateOnly?: boolean}>} settlements
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
        if (s.settled && isCard) {
          Object.assign(changes, await postedDateFor(expense, s.postedDate, txn.plaidAccountId));
        }
        // Plaid took over a settled bank-file row with another date: only worth a log entry when the expense changed
        if (s.postedDateOnly && !('posted_date' in changes)) continue;
        if (Object.keys(changes).length > 0) {
          await expenseService.updateExpense(expense.id, { ...expense, ...changes });
        }

        let outcome = '';
        if (amountChanged) {
          outcome = `: ${money(s.previousAmount)} → ${money(s.amount)}, ${changes.amount ? 'expense updated' : 'expense amount kept (edited by hand)'}`;
        }
        if ('posted_date' in changes) {
          outcome += `${outcome ? '; ' : ': '}posted date ${changes.posted_date ?? 'same as the purchase date'}`;
        }
        const action = s.postedDateOnly ? 'posted_date' : s.settled ? 'settled' : 'pending_changed';
        const description = {
          posted_date: `Bank transaction ${describeTxn(txn)} from a bank file, posting date from the bank${outcome}`,
          settled: `Pending charge ${describeTxn(txn)} settled${outcome}`,
          pending_changed: `Pending charge ${describeTxn(txn)} changed${outcome}`
        }[action];
        await logReview(
          txn,
          action,
          description,
          { expenseId: expense.id, previousAmount: s.previousAmount, amountUpdated: Boolean(changes.amount), postedDateUpdated: 'posted_date' in changes }
        );
      } catch (err) {
        logger.warn('Updating an expense from a settled bank transaction failed', { expenseId: s.expenseId, error: err.message });
        // The bank row is already settled, so nothing retries this: tell the user what to fix by hand
        if (txn) {
          await logReview(txn, 'settle_failed', settleFailedMessage(s, txn, err), {
            expenseId: s.expenseId, amount: s.amount, postedDate: s.postedDate ?? null
          }).catch(() => {});
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
    return exclusive(id, async () => {
      const txn = await plaidRepository.findTransactionById(id);
      if (!txn || !txn.pending || !txn.removedAt || !['added', 'matched'].includes(txn.status)) {
        throw fail('Cancelled pending charge not found', 404);
      }

      if (action === 'keep') {
        await plaidFileImportRepository.deleteTransaction(id);
        await logReview(txn, 'cancelled_keep', `Kept the expense for cancelled pending charge ${describeTxn(txn)}`, { expenseId: txn.expenseId });
        return { action };
      }

      if (action === 'delete_expense') {
        // Expense first: if that fails nothing has changed
        if (txn.expenseId) await expenseService.deleteExpense(txn.expenseId, tabId);
        await plaidFileImportRepository.deleteTransaction(id);
        await logReview(txn, 'cancelled_delete', `Deleted the expense for cancelled pending charge ${describeTxn(txn)}`, { expenseId: txn.expenseId });
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
}

module.exports = new PlaidSettlementService();
module.exports._internal = { settleFailedMessage };

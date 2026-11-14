const plaidRepository = require('../repositories/plaidRepository');
const plaidBalanceCheckRepository = require('../repositories/plaidBalanceCheckRepository');
const activityLogService = require('./activityLogService');

/**
 * Helpers shared by the Import Inbox services (plaidInboxService, plaidReviewService, plaidSettlementService,
 * plaidCardPaymentService): errors with a status code, how a bank transaction reads in messages, the
 * one-action-per-row lock, the review log and the posted date a settled card transaction gives its expense.
 */

const { fail } = require('../utils/httpError');
const { nextBusinessDay } = require('../utils/businessDays');

/**
 * The expense/income/payment services throw plain Errors for invalid input: those become 400. Database errors
 * (sqlite `code`) and programming errors stay 500, so the error handler doesn't present them as bad input.
 */
const asInputError = (err) => {
  if (!err.statusCode && !err.code && !(err instanceof TypeError) && !(err instanceof ReferenceError)) err.statusCode = 400;
  return err;
};

const { round2 } = require('../utils/money');
const defaultPlace = (txn) => (txn.merchantName || txn.name || '').trim();
/** The bank description used to learn income names (Inbox suggestion and Add as income): same choice as the default place. */
const incomeDescription = defaultPlace;
const money = (amount) => `$${Math.abs(Number(amount)).toFixed(2)}`;
/** e.g. `"Coffee Shop" ($25.50, 2026-10-12)` */
const describeTxn = (txn) => `"${defaultPlace(txn) || 'bank transaction'}" (${money(txn.amount)}, ${txn.date})`;

/** Rows being acted on right now, across every inbox service. */
const inFlight = new Set();

/** Run `fn` as the only action on bank transaction `id`; a second action on the same row meanwhile is a 409. */
async function exclusive(id, fn) {
  if (inFlight.has(id)) {
    throw fail('This bank transaction is already being processed', 409);
  }
  inFlight.add(id);
  try {
    return await fn();
  } finally {
    inFlight.delete(id);
  }
}

/** The row, which must still be waiting for review (and settled, when `settled`). */
async function requireNew(id, { settled = false } = {}) {
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

/**
 * Activity log for an inbox decision. Entity `plaid_transaction` is routed as `plaid`, so open inboxes in
 * other tabs refresh. Side effects (expense_added, fixed_expense_updated, ...) are logged by their services.
 * @param {'add'|'match'|'match_fixed'|'match_income'|'add_income'|'card_payment'|'insurance'|'insurance_undone'|'ignore'|'unignore'|'settled'|'pending_changed'|'posted_date'|'cancelled_keep'|'cancelled_delete'|'settle_failed'} action
 */
async function logReview(txn, action, description, extra = {}) {
  await activityLogService.logEvent('plaid_transaction_updated', 'plaid_transaction', txn.id, description, {
    action, place: defaultPlace(txn), amount: txn.amount, date: txn.date, ...extra
  });
}

/**
 * The posted date a settled card transaction gives its expense. The purchase date is never changed. The bank's
 * posted date replaces whatever the expense had (a hand-set estimate included), because statements are built
 * from it. One equal to the purchase date is stored as none (same thing, and no marker in the expense list);
 * one before it is ignored, since an expense can't post before it was made.
 * Exception: a bank date equal to the purchase date says nothing when the bank doesn't report real posting
 * dates (`bankDatesAreReal` false: Wealthsimple sends the purchase date, often a weekend), so a posted date
 * already on the expense is kept rather than wiped.
 * @returns {{posted_date: (string|null)}|null} the change, or null when the expense already agrees
 */
const postedDateChange = (expense, bankPostedDate, bankDatesAreReal = true) => {
  if (!bankPostedDate || bankPostedDate < expense.date) return null;
  if (bankPostedDate === expense.date && !bankDatesAreReal) return null;
  const wanted = bankPostedDate === expense.date ? null : bankPostedDate;
  return wanted === (expense.posted_date || null) ? null : { posted_date: wanted };
};

/**
 * postedDateChange for a settled card transaction. Whether the bank's dates are real posting dates is only
 * asked when it matters: the bank's date equals the purchase date and the expense already has a posted date.
 */
async function postedDateFor(expense, bankPostedDate, plaidAccountId) {
  const needsCheck = expense.posted_date && bankPostedDate === expense.date && plaidAccountId;
  const real = needsCheck ? await plaidBalanceCheckRepository.bankReportsPostingDates(plaidAccountId) : true;
  return postedDateChange(expense, bankPostedDate, real);
}

/**
 * Posted date for a card charge that settled without one from the bank (Wealthsimple, settled from the balance):
 * the expense form's estimate (next business day after the purchase), but not after `today`, when the settlement
 * was seen. A posted date already on the expense is kept.
 * @returns {{posted_date: string}|null}
 */
function estimatedPostedDate(expense, today) {
  if (expense.posted_date) return null;
  const estimate = nextBusinessDay(expense.date);
  return postedDateChange(expense, estimate < today ? estimate : today);
}

module.exports = {
  fail, asInputError, round2, defaultPlace, incomeDescription, money, describeTxn, exclusive, requireNew, logReview,
  postedDateChange, postedDateFor, estimatedPostedDate
};

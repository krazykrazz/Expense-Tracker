const plaidRepository = require('../repositories/plaidRepository');
const activityLogService = require('./activityLogService');

/**
 * Helpers shared by the Import Inbox services (plaidInboxService, plaidCardPaymentService): errors with a
 * status code, how a bank transaction reads in messages, the one-action-per-row lock and the review log.
 */

const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });

/**
 * The expense/income/payment services throw plain Errors for invalid input: those become 400. Database errors
 * (sqlite `code`) and programming errors stay 500, so the error handler doesn't present them as bad input.
 */
const asInputError = (err) => {
  if (!err.statusCode && !err.code && !(err instanceof TypeError) && !(err instanceof ReferenceError)) err.statusCode = 400;
  return err;
};

const round2 = (n) => Math.round(n * 100) / 100;
const defaultPlace = (txn) => (txn.merchantName || txn.name || '').trim();
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
 * @param {'add'|'match'|'match_fixed'|'match_income'|'add_income'|'card_payment'|'ignore'|'unignore'|'settled'|'pending_changed'|'cancelled_keep'|'cancelled_delete'|'settle_failed'} action
 */
async function logReview(txn, action, description, extra = {}) {
  await activityLogService.logEvent('plaid_transaction_updated', 'plaid_transaction', txn.id, description, {
    action, place: defaultPlace(txn), amount: txn.amount, date: txn.date, ...extra
  });
}

module.exports = { fail, asInputError, round2, defaultPlace, money, describeTxn, exclusive, requireNew, logReview };

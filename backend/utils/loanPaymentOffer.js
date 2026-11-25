/**
 * Pure rules for tying a bank payment that confirms a loan's fixed expense to a loan payment (spec 3.5): which
 * payment already logged for the loan the bank payment could be, and what the Inbox offers.
 * All money is compared in whole cents.
 */

const { toCents, dayDiff } = require('./plaidMatching');

/** A logged payment this many days either side of the day the bank payment landed can be the same payment. */
const LOAN_PAYMENT_WINDOW_DAYS = 5;

/**
 * The logged payment a bank payment most likely is: dated within the window of the day it landed, an exact amount
 * first, then the closest date, then the newest. Payments another confirmation already claims must not be passed.
 * @param {Array<{id: number, payment_date: string, amount: number}>} payments payments of the one loan
 * @param {{date: string, amount: number}} txn the bank row (`date`: the day it landed)
 * @returns {object|null}
 */
function pickExistingPayment(payments, txn) {
  const bankCents = toCents(Math.abs(txn.amount));
  const fits = payments
    .map(payment => ({ payment, gap: dayDiff(payment.payment_date, txn.date) }))
    .filter(({ gap }) => gap <= LOAN_PAYMENT_WINDOW_DAYS);
  fits.sort((a, b) => Number(toCents(b.payment.amount) === bankCents) - Number(toCents(a.payment.amount) === bankCents)
    || a.gap - b.gap
    || b.payment.id - a.payment.id);
  return fits.length > 0 ? fits[0].payment : null;
}

module.exports = { LOAN_PAYMENT_WINDOW_DAYS, pickExistingPayment };

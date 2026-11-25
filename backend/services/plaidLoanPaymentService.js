const plaidLinkRepository = require('../repositories/plaidLinkRepository');
const loanRepository = require('../repositories/loanRepository');
const loanPaymentService = require('./loanPaymentService');
const { shiftDate, dayDiff } = require('../utils/plaidMatching');
const { LOAN_PAYMENT_WINDOW_DAYS, pickExistingPayment } = require('../utils/loanPaymentOffer');
const { fail, round2 } = require('./plaidInboxSupport');

/**
 * Loan payments from bank payments (spec 3.5). A bank payment that confirms a fixed expense linked to a loan can
 * also be the loan's payment: recorded at the bank's date and amount, or linked to the payment already logged
 * (the due-day suggestion, or by hand). The link (`plaid_fixed_expense_links.loan_payment_id`) is what the loan's
 * payment history shows as "from the bank". Nothing is done unless the request asks for it.
 */
class PlaidLoanPaymentService {
  /**
   * Add `loanPayment` to the fixed-expense candidates of Inbox rows that are linked to a loan that isn't paid off:
   * `{ loanId, loanName, existing: {id, date, amount} | null }`, `existing` being the logged payment the row most
   * likely is (no other bank payment confirms it).
   * @param {Array<{id: number, date: string, amount: number}>} rows
   * @param {Map<number, Array<{linkedLoanId: (number|null)}>>} candidatesByRow row id → fixed-expense candidates (changed in place)
   */
  async attachOffers(rows, candidatesByRow) {
    const offered = [];
    for (const row of rows) {
      for (const candidate of candidatesByRow.get(row.id) || []) {
        if (candidate.linkedLoanId) offered.push({ row, candidate });
      }
    }
    if (offered.length === 0) return;

    const dates = offered.map(({ row }) => row.date).sort();
    const { loans, payments } = await plaidLinkRepository.findLoanPaymentOffers(
      [...new Set(offered.map(({ candidate }) => candidate.linkedLoanId))],
      shiftDate(dates[0], -LOAN_PAYMENT_WINDOW_DAYS),
      shiftDate(dates[dates.length - 1], LOAN_PAYMENT_WINDOW_DAYS)
    );
    for (const { row, candidate } of offered) {
      const loan = loans.get(candidate.linkedLoanId);
      if (!loan || loan.isPaidOff) continue;
      const existing = pickExistingPayment(payments.filter(payment => payment.loan_id === loan.id), row);
      candidate.loanPayment = {
        loanId: loan.id,
        loanName: loan.name,
        existing: existing ? { id: existing.id, date: existing.payment_date, amount: existing.amount } : null
      };
    }
  }

  /**
   * Check a request to record or link a loan payment before anything is changed.
   * @param {{name: string, linkedLoanId: (number|null)}} fixed the fixed expense being confirmed
   * @param {{date: string}} txn the bank row
   * @param {{loanPayment?: ('log'|'link'|'none'), loanPaymentId?: number}} choice
   * @returns {Promise<null | {mode: 'log', loan: object} | {mode: 'link', loan: object, payment: object}>} null: nothing to do
   */
  async plan(fixed, txn, { loanPayment = 'none', loanPaymentId } = {}) {
    if (loanPayment === 'none' || loanPayment == null) return null;
    if (loanPayment !== 'log' && loanPayment !== 'link') throw fail("loanPayment must be 'log', 'link' or 'none'", 400);
    if (!fixed.linkedLoanId) throw fail(`"${fixed.name}" is not linked to a loan`, 400);
    const loan = await loanRepository.findById(fixed.linkedLoanId);
    if (!loan) throw fail('The loan linked to that fixed expense was not found', 404);
    if (loan.is_paid_off) throw fail(`${loan.name} is paid off`, 400);
    if (loanPayment === 'log') return { mode: 'log', loan };

    const paymentId = Number(loanPaymentId);
    if (!Number.isInteger(paymentId) || paymentId <= 0) throw fail('Pick the loan payment to link', 400);
    const payment = await plaidLinkRepository.findUnclaimedLoanPayment(paymentId);
    if (!payment) throw fail('That loan payment was not found, or another bank payment already confirms it', 409);
    if (payment.loan_id !== loan.id) throw fail(`That payment is not a payment of ${loan.name}`, 400);
    if (dayDiff(payment.payment_date, txn.date) > LOAN_PAYMENT_WINDOW_DAYS) {
      throw fail(`That payment is dated more than ${LOAN_PAYMENT_WINDOW_DAYS} days from the bank payment`, 400);
    }
    return { mode: 'link', loan, payment };
  }

  /**
   * Do what `plan` returned, once the bank payment confirms the fixed expense: record the payment at the bank's
   * date and amount (through loanPaymentService, so validation, a mortgage's balances and the log apply) or link
   * the logged one, then name it on the confirmation. Nothing is left behind when naming it fails.
   * @returns {Promise<{id: number, loanId: number, loanName: string, amount: number, date: string, created: boolean}>}
   */
  async apply(txn, fixed, plan) {
    let payment = plan.payment;
    const created = plan.mode === 'log';
    if (created) {
      payment = await loanPaymentService.createPayment(plan.loan.id, {
        amount: round2(txn.amount),
        payment_date: txn.date,
        notes: `Recorded from bank: ${fixed.name}`.slice(0, 500)
      });
    }
    try {
      await plaidLinkRepository.setLoanPayment(txn.id, payment.id);
    } catch (err) {
      if (created) await loanPaymentService.deletePayment(payment.id).catch(() => {});
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw fail('That loan payment is already confirmed by another bank payment', 409);
      }
      throw err;
    }
    return {
      id: payment.id, loanId: plan.loan.id, loanName: plan.loan.name, amount: payment.amount, date: payment.payment_date, created
    };
  }
}

module.exports = new PlaidLoanPaymentService();

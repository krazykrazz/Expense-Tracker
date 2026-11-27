const plaidConfig = require('../config/plaid');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const autoPaymentLoggerService = require('./autoPaymentLoggerService');
const notificationService = require('./notificationService');
const timeBoundaryService = require('./timeBoundaryService');

const { bankWaitEnds } = autoPaymentLoggerService;

/** Messages are only sent during the day (business timezone): a wait that ends at midnight is announced at 8 am. */
const FIRST_HOUR = 8;
const LAST_HOUR = 21;

const dueDateOf = (year, month, dueDay) => {
  const day = Math.min(dueDay, new Date(year, month, 0).getDate());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const hourIn = (now, timezone) =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23' }).format(now));

/**
 * Loan payments the bank hasn't confirmed (Discord notification `loan_payment_unconfirmed`). For a fixed expense linked
 * to a loan and paid from a payment method that imports from the bank, the in-app prompt waits 5 days after the due
 * date for the bank payment to be confirmed in the Inbox (autoPaymentLoggerService). Past that wait, this check tells
 * the notification service whether the loan's latest due payment is recorded; it announces a missing one once, and
 * again when it (or a later month's) is recorded. Nothing happens without Plaid.
 */
class LoanPaymentBankCheckService {
  /**
   * @param {Date} [now]
   * @returns {Promise<Array<{loanId: number, dueDate: string, recorded: boolean}>>} the loans reported
   */
  async check(now = new Date()) {
    if (!plaidConfig.getPlaidConfig().enabled) return [];
    const timezone = await timeBoundaryService.getBusinessTimezone();
    const hour = hourIn(now, timezone);
    if (hour < FIRST_HOUR || hour > LAST_HOUR) return [];

    const bankPaid = await autoPaymentLoggerService.bankImportedPaymentMethodIds();
    if (bankPaid.size === 0) return [];

    const today = timeBoundaryService.getBusinessDate(now, timezone);
    const [year, month] = today.split('-').map(Number);
    const previous = month === 1 ? [year - 1, 12] : [year, month - 1];

    // Per loan, the latest payment whose wait for the bank is over (a due day late in the month ends next month)
    const latestByLoan = new Map();
    for (const [y, m] of [previous, [year, month]]) {
      for (const expense of await fixedExpenseRepository.getLinkedFixedExpensesForMonth(y, m)) {
        if (expense.is_paid_off === 1 || !bankPaid.has(expense.payment_method_id)) continue;
        const dueDate = dueDateOf(y, m, expense.payment_due_day);
        if (today < bankWaitEnds(dueDate)) continue;
        const latest = latestByLoan.get(expense.loan_id);
        if (!latest || dueDate > latest.dueDate) latestByLoan.set(expense.loan_id, { expense, dueDate, year: y, month: m });
      }
    }

    const reported = [];
    for (const { expense, dueDate, year: y, month: m } of latestByLoan.values()) {
      const status = await loanPaymentRepository.getPaymentStatusForMonth([expense.loan_id], y, m);
      const recorded = Boolean(status.get(expense.loan_id));
      await notificationService.reportLoanPayment({
        loanId: expense.loan_id,
        loanName: expense.loan_name,
        fixedExpenseName: expense.fixed_expense_name,
        amount: expense.amount,
        dueDate,
        paymentMethodName: expense.payment_method_name ?? null,
        recorded
      });
      reported.push({ loanId: expense.loan_id, dueDate, recorded });
    }
    return reported;
  }
}

module.exports = new LoanPaymentBankCheckService();

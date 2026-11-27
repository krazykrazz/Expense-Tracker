/**
 * Unit tests: loanPaymentBankCheckService decides, per loan paid from a bank-imported account, whether its latest
 * due payment is recorded once the 5-day wait for the bank is over, and reports it for the Discord notification.
 */

jest.mock('../repositories/fixedExpenseRepository');
jest.mock('../repositories/loanPaymentRepository');
jest.mock('./notificationService', () => ({ reportLoanPayment: jest.fn() }));
jest.mock('./activityLogService');
jest.mock('../config/plaid', () => ({ getPlaidConfig: jest.fn() }));

const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const notificationService = require('./notificationService');
const plaidConfig = require('../config/plaid');
const autoPaymentLoggerService = require('./autoPaymentLoggerService');
const timeBoundaryService = require('./timeBoundaryService');
const loanPaymentBankCheckService = require('./loanPaymentBankCheckService');

const DEBIT_WS = 8;
const CASH = 1;

const linked = (loanId, dueDay, { paymentMethodId = DEBIT_WS, paidOff = 0, name = `Loan ${loanId}` } = {}) => ({
  fixed_expense_id: loanId * 10, fixed_expense_name: name, amount: 100, payment_due_day: dueDay, payment_method_id: paymentMethodId,
  payment_method_name: 'Debit - WS', loan_id: loanId, loan_name: name, loan_type: 'loan', is_paid_off: paidOff
});

/** Fixed expenses by 'YYYY-M', and the loans with a payment recorded in that month. */
function given(byMonth, recorded = {}) {
  fixedExpenseRepository.getLinkedFixedExpensesForMonth.mockImplementation(async (y, m) => byMonth[`${y}-${m}`] || []);
  loanPaymentRepository.getPaymentStatusForMonth.mockImplementation(async (ids, y, m) =>
    new Map(ids.map(id => [id, (recorded[`${y}-${m}`] || []).includes(id)])));
}

// 10 am in Toronto on the given day of 2026
const at = (month, day, hourUtc = 15) => new Date(Date.UTC(2026, month - 1, day, hourUtc));

beforeEach(() => {
  jest.clearAllMocks();
  plaidConfig.getPlaidConfig.mockReturnValue({ enabled: true, environment: 'production' });
  jest.spyOn(timeBoundaryService, 'getBusinessTimezone').mockResolvedValue('America/Toronto');
  jest.spyOn(autoPaymentLoggerService, 'bankImportedPaymentMethodIds').mockResolvedValue(new Set([DEBIT_WS]));
});

describe('loanPaymentBankCheckService.check', () => {
  it('waits 5 days after the due date, then reports a missing payment with its details', async () => {
    given({ '2026-12': [linked(32, 1, { name: 'Pine Mortgage' })] });

    expect(await loanPaymentBankCheckService.check(at(12, 5))).toEqual([]);
    expect(await loanPaymentBankCheckService.check(at(12, 6))).toEqual([{ loanId: 32, dueDate: '2026-12-01', recorded: false }]);
    expect(notificationService.reportLoanPayment).toHaveBeenCalledWith({
      loanId: 32, loanName: 'Pine Mortgage', fixedExpenseName: 'Pine Mortgage', amount: 100, dueDate: '2026-12-01',
      paymentMethodName: 'Debit - WS', recorded: false
    });
  });

  it('reports a recorded payment as recorded', async () => {
    given({ '2026-12': [linked(32, 1)] }, { '2026-12': [32] });
    expect(await loanPaymentBankCheckService.check(at(12, 6))).toEqual([{ loanId: 32, dueDate: '2026-12-01', recorded: true }]);
  });

  it('a due day late in the month is checked from the next month, against its own month, and in January for December', async () => {
    given({ '2025-12': [linked(14, 28)], '2026-1': [linked(14, 28)] });
    expect(await loanPaymentBankCheckService.check(at(1, 3))).toEqual([{ loanId: 14, dueDate: '2025-12-28', recorded: false }]);
    expect(loanPaymentRepository.getPaymentStatusForMonth).toHaveBeenCalledWith([14], 2025, 12);
  });

  it('per loan only the latest payment whose wait is over is reported', async () => {
    given({ '2026-11': [linked(32, 1)], '2026-12': [linked(32, 1)] }, { '2026-11': [32] });
    expect(await loanPaymentBankCheckService.check(at(12, 3))).toEqual([{ loanId: 32, dueDate: '2026-11-01', recorded: true }]);
    expect(await loanPaymentBankCheckService.check(at(12, 7))).toEqual([{ loanId: 32, dueDate: '2026-12-01', recorded: false }]);
  });

  it('skips loans paid off or paid from an account that is not imported from the bank', async () => {
    given({ '2026-12': [linked(1, 1, { paidOff: 1 }), linked(2, 1, { paymentMethodId: CASH })] });
    expect(await loanPaymentBankCheckService.check(at(12, 10))).toEqual([]);
  });

  it.each([
    ['Plaid is not set up', () => plaidConfig.getPlaidConfig.mockReturnValue({ enabled: false })],
    ['no payment method imports from the bank', () => autoPaymentLoggerService.bankImportedPaymentMethodIds.mockResolvedValue(new Set())]
  ])('does nothing when %s', async (_label, setUp) => {
    given({ '2026-12': [linked(32, 1)] });
    setUp();
    expect(await loanPaymentBankCheckService.check(at(12, 10))).toEqual([]);
    expect(notificationService.reportLoanPayment).not.toHaveBeenCalled();
  });

  it.each([
    ['7:59 am', 12, 59],
    ['10:00 pm', 3, 0]
  ])('sends nothing at night (%s in Toronto)', async (_label, hourUtc, minute) => {
    given({ '2026-12': [linked(32, 1)] });
    const night = new Date(Date.UTC(2026, 11, 10, hourUtc, minute));
    expect(await loanPaymentBankCheckService.check(night)).toEqual([]);
  });
});

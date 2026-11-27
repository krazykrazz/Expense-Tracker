/**
 * Unit tests: the loan payment prompt waits for the bank when the fixed expense is paid from a bank-imported
 * account (confirming the bank payment in the Import Inbox records the loan payment, spec 3.4).
 */

jest.mock('../repositories/loanPaymentRepository');
jest.mock('../repositories/fixedExpenseRepository');
jest.mock('../repositories/loanRepository');
jest.mock('../repositories/plaidRepository');
jest.mock('./activityLogService');
jest.mock('./loanPaymentService');
jest.mock('../config/plaid', () => ({ getPlaidConfig: jest.fn() }));

const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const plaidRepository = require('../repositories/plaidRepository');
const plaidConfig = require('../config/plaid');
const autoPaymentLoggerService = require('./autoPaymentLoggerService');

const DEBIT_WS = 8;
const CASH = 1;

const mortgage = (paymentMethodId) => ({
  fixed_expense_id: 281, fixed_expense_name: 'Pine Mortgage', amount: 2800, payment_due_day: 1,
  linked_loan_id: 32, loan_id: 32, loan_name: 'Pine Mortgage', loan_type: 'mortgage', is_paid_off: 0,
  year: 2026, month: 12, payment_method_id: paymentMethodId
});

const suggestionsOn = (day, paymentMethodId = DEBIT_WS) => {
  fixedExpenseRepository.getLinkedFixedExpensesForMonth.mockResolvedValue([mortgage(paymentMethodId)]);
  return autoPaymentLoggerService.getPendingAutoLogSuggestions(2026, 12, new Date(2026, 11, day, 9));
};

beforeEach(() => {
  jest.clearAllMocks();
  loanPaymentRepository.getPaymentStatusForMonth.mockResolvedValue(new Map());
  plaidConfig.getPlaidConfig.mockReturnValue({ enabled: true, environment: 'production' });
  plaidRepository.findImportingPaymentMethodIds.mockResolvedValue([DEBIT_WS]);
});

describe('getPendingAutoLogSuggestions with a bank-imported payment method', () => {
  it.each([
    [1, false],
    [5, false],
    [6, true]
  ])('on day %i of the month shows the prompt: %s (due on the 1st, the bank gets 5 days)', async (day, shown) => {
    const suggestions = await suggestionsOn(day);
    expect(suggestions.map(s => s.fixedExpenseId)).toEqual(shown ? [281] : []);
  });

  it('asks on the due day as before when the payment method is not imported from the bank', async () => {
    const [suggestion] = await suggestionsOn(1, CASH);
    expect(suggestion).toEqual(expect.objectContaining({ fixedExpenseId: 281, suggestedPaymentDate: '2026-12-01' }));
    expect(suggestion).not.toHaveProperty('paymentMethodId');
  });

  it('asks on the due day without Plaid, and never reads bank accounts', async () => {
    plaidConfig.getPlaidConfig.mockReturnValue({ enabled: false, environment: '' });
    expect(await suggestionsOn(1)).toHaveLength(1);
    expect(plaidRepository.findImportingPaymentMethodIds).not.toHaveBeenCalled();
  });

  it('asks on the due day when the bank accounts cannot be read', async () => {
    plaidRepository.findImportingPaymentMethodIds.mockRejectedValue(new Error('SQLITE_BUSY'));
    expect(await suggestionsOn(1)).toHaveLength(1);
  });

  it('reads the accounts of the configured Plaid environment', async () => {
    await suggestionsOn(1);
    expect(plaidRepository.findImportingPaymentMethodIds).toHaveBeenCalledWith('production');
  });
});

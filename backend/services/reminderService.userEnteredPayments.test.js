/**
 * A payment made after a user-entered statement closed clears that card's payment reminder.
 */

jest.mock('../repositories/reminderRepository');
jest.mock('./statementBalanceService');
jest.mock('../repositories/billingCycleRepository');
jest.mock('../repositories/fixedExpenseRepository');
jest.mock('../repositories/loanPaymentRepository');
jest.mock('./activityLogService');
jest.mock('./timeBoundaryService');

const reminderRepository = require('../repositories/reminderRepository');
const statementBalanceService = require('./statementBalanceService');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const timeBoundaryService = require('./timeBoundaryService');
const reminderService = require('./reminderService');

const REFERENCE = new Date('2025-01-20');
const card = { id: 1, display_name: 'WS VISA', full_name: 'WS VISA', current_balance: 900, credit_limit: 10000, payment_due_day: 22, billing_cycle_day: 10, is_active: 1 };

function setup({ actual, totalPayments, isUserEntered = 1 }) {
  reminderRepository.getCreditCardsWithDueDates.mockResolvedValue([card]);
  statementBalanceService.calculateStatementBalance.mockResolvedValue({
    statementBalance: Math.max(0, actual - totalPayments),
    totalPayments,
    cycleStartDate: '2024-12-10',
    cycleEndDate: '2025-01-09',
    isPaid: actual - totalPayments <= 0
  });
  billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue({
    id: 5, payment_method_id: 1, cycle_end_date: '2025-01-09', actual_statement_balance: actual, is_user_entered: isUserEntered
  });
}

async function reminderFor() {
  const result = await reminderService.getCreditCardReminders(REFERENCE);
  return { result, row: result.allCreditCards[0] };
}

describe('credit card reminder for a user-entered statement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
    timeBoundaryService.getBusinessDate.mockReturnValue('2025-01-20');
  });

  test('is due for the whole printed balance when nothing was paid since', async () => {
    setup({ actual: 3471.31, totalPayments: 0 });

    const { result, row } = await reminderFor();

    expect(row).toMatchObject({ required_payment: 3471.31, statement_balance: 3471.31, has_actual_balance: true, is_due_soon: true });
    expect(result.dueSoonCards.map(c => c.id)).toEqual([1]);
  });

  test('is due for what is left after a part payment', async () => {
    setup({ actual: 3471.31, totalPayments: 1000.1 });

    const { row } = await reminderFor();

    expect(row).toMatchObject({ required_payment: 2471.21, statement_balance: 2471.21, is_due_soon: true });
  });

  test('clears once the statement has been paid in full', async () => {
    setup({ actual: 3471.31, totalPayments: 3471.31 });

    const { result, row } = await reminderFor();

    expect(row).toMatchObject({ required_payment: 0, is_statement_paid: true, is_due_soon: false, is_overdue: false });
    expect(result.dueSoonCards).toEqual([]);
    expect(result.overdueCards).toEqual([]);
  });

  test('stays at zero when the statement was overpaid', async () => {
    setup({ actual: 100, totalPayments: 250 });

    const { row } = await reminderFor();

    expect(row).toMatchObject({ required_payment: 0, is_statement_paid: true, is_due_soon: false });
  });

  test('a calculated (not user-entered) statement still follows the statement balance', async () => {
    setup({ actual: 3471.31, totalPayments: 1000, isUserEntered: 0 });

    const { row } = await reminderFor();

    expect(row).toMatchObject({ has_actual_balance: false, required_payment: 2471.31 });
  });
});

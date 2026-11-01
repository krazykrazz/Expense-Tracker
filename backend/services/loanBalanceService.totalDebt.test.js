/**
 * Unit tests for LoanBalanceService.buildTotalDebtHistory
 * Covers the Total Debt Trend series: paid-off loans, carry-forward and loan_count
 */

jest.mock('./activityLogService');
jest.mock('../repositories/loanBalanceRepository');
jest.mock('../repositories/loanRepository');
jest.mock('../repositories/loanPaymentRepository');

const loanBalanceService = require('./loanBalanceService');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const loanPaymentRepository = require('../repositories/loanPaymentRepository');

const snap = (loan_id, year, month, remaining_balance, is_paid_off = 0) => ({
  loan_id, is_paid_off, year, month, remaining_balance
});
const pay = (loan_id, year, month, total) => ({ loan_id, year, month, total });

describe('LoanBalanceService.buildTotalDebtHistory', () => {
  const build = (snapshots, payments, year, month) =>
    loanBalanceService.buildTotalDebtHistory(snapshots, payments, year, month);

  test('includes a paid-off loan for the months it had balances and stops at its last snapshot', () => {
    const result = build(
      [
        snap(1, 2024, 1, 5000),
        snap(1, 2024, 2, 4500),
        snap(2, 2024, 1, 2000, 1),
        snap(2, 2024, 2, 0, 1)
      ],
      [],
      2024, 2
    );

    expect(result).toEqual([
      { year: 2024, month: 1, total_debt: 7000, loan_count: 2 },
      { year: 2024, month: 2, total_debt: 4500, loan_count: 1 }
    ]);
  });

  test('does not carry a paid-off loan forward past its last snapshot', () => {
    const result = build(
      [snap(1, 2024, 1, 5000), snap(2, 2024, 1, 2000, 1)],
      [],
      2024, 3
    );

    expect(result).toEqual([
      { year: 2024, month: 1, total_debt: 7000, loan_count: 2 },
      { year: 2024, month: 2, total_debt: 5000, loan_count: 1 },
      { year: 2024, month: 3, total_debt: 5000, loan_count: 1 }
    ]);
  });

  test('carries a paid-off loan forward through its last payment, anchored on its first snapshot', () => {
    // Tracking began mid-life: payments before the first snapshot are ignored
    const result = build(
      [snap(1, 2025, 1, 1000, 1), snap(1, 2025, 2, 900, 1)],
      [pay(1, 2024, 12, 500), pay(1, 2025, 2, 100), pay(1, 2025, 3, 100), pay(1, 2025, 4, 100)],
      2025, 8
    );

    expect(result.map(r => [r.year, r.month, r.total_debt, r.loan_count])).toEqual([
      [2025, 1, 1000, 1],
      [2025, 2, 900, 1],
      [2025, 3, 800, 1],
      [2025, 4, 700, 1]
    ]);
  });

  test('fills months without a snapshot using the last snapshot minus later payments', () => {
    const result = build(
      [snap(1, 2024, 1, 1000)],
      [pay(1, 2024, 1, 100), pay(1, 2024, 2, 100), pay(1, 2024, 3, 100)],
      2024, 3
    );

    // The payment in the snapshot month is already reflected in the snapshot
    expect(result).toEqual([
      { year: 2024, month: 1, total_debt: 1000, loan_count: 1 },
      { year: 2024, month: 2, total_debt: 900, loan_count: 1 },
      { year: 2024, month: 3, total_debt: 800, loan_count: 1 }
    ]);
  });

  test('prefers a real snapshot over the carried-forward balance', () => {
    const result = build(
      [snap(1, 2024, 1, 1000), snap(1, 2024, 3, 700)],
      [pay(1, 2024, 2, 100), pay(1, 2024, 3, 100)],
      2024, 3
    );

    expect(result.map(r => r.total_debt)).toEqual([1000, 900, 700]);
  });

  test('counts every active loan in the current month even if only some have a snapshot', () => {
    const result = build(
      [
        snap(1, 2026, 10, 4575),
        snap(2, 2026, 10, 383859.92),
        snap(2, 2026, 11, 382195.51),
        snap(3, 2026, 2, 15423.14)
      ],
      [pay(1, 2026, 11, 275), pay(3, 2026, 3, 135.29)],
      2026, 11
    );

    const nov = result.find(r => r.year === 2026 && r.month === 11);
    expect(nov.loan_count).toBe(3);
    expect(nov.total_debt).toBeCloseTo(4300 + 382195.51 + (15423.14 - 135.29), 2);
  });

  test('clamps carried-forward balances at zero and does not count them', () => {
    const result = build(
      [snap(1, 2024, 1, 100)],
      [pay(1, 2024, 2, 150)],
      2024, 3
    );

    expect(result[1]).toEqual({ year: 2024, month: 2, total_debt: 0, loan_count: 0 });
    expect(result[2]).toEqual({ year: 2024, month: 3, total_debt: 0, loan_count: 0 });
  });

  test('crosses year boundaries and returns months in chronological order', () => {
    const result = build([snap(1, 2024, 11, 300)], [pay(1, 2025, 1, 50)], 2025, 2);

    expect(result.map(r => [r.year, r.month, r.total_debt])).toEqual([
      [2024, 11, 300],
      [2024, 12, 300],
      [2025, 1, 250],
      [2025, 2, 250]
    ]);
  });

  test('returns an empty series when there are no snapshots', () => {
    expect(build([], [], 2024, 1)).toEqual([]);
  });
});

describe('LoanBalanceService.getTotalDebtOverTime', () => {
  test('combines repository snapshots and payment totals', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-03-15T12:00:00Z'));
    try {
      loanBalanceRepository.getAllSnapshotsWithLoanStatus.mockResolvedValue([snap(1, 2024, 2, 1000)]);
      loanPaymentRepository.getMonthlyTotalsByLoan.mockResolvedValue([pay(1, 2024, 3, 100)]);

      const result = await loanBalanceService.getTotalDebtOverTime();

      expect(result).toEqual([
        { year: 2024, month: 2, total_debt: 1000, loan_count: 1 },
        { year: 2024, month: 3, total_debt: 900, loan_count: 1 }
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});

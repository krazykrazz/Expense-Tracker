/**
 * Unit tests for BalanceCalculationService.calculateMortgageBalance()
 * 
 * Tests the interest accrual engine that computes mortgage balances by
 * walking month-by-month from an anchor point, adding monthly interest,
 * and subtracting payments.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 9.2, 9.4
 */

const balanceCalculationService = require('./balanceCalculationService');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const loanPaymentRepository = require('../repositories/loanPaymentRepository');

// Mock the repositories
jest.mock('../repositories/loanBalanceRepository');
jest.mock('../repositories/loanPaymentRepository');

describe('BalanceCalculationService.calculateMortgageBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: freeze "now" concept by mocking Date
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('uses initial_balance and start_date as anchor when no snapshots exist', async () => {
    const loan = {
      id: 1,
      initial_balance: 500000,
      loan_type: 'mortgage',
      start_date: '2025-01-01',
      fixed_interest_rate: 5.0
    };

    loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
    loanPaymentRepository.findByLoanOrdered.mockResolvedValue([]);

    const result = await balanceCalculationService.calculateMortgageBalance(loan);

    expect(result.anchorBased).toBe(false);
    expect(result.interestAware).toBe(true);
    expect(result.loanId).toBe(1);
    expect(result.initialBalance).toBe(500000);
    // 5 months of interest (Feb-Jun) on 500000 at 5%
    // Each month: 500000 * 0.05 / 12 = 2083.33
    expect(result.currentBalance).toBeGreaterThan(500000);
    expect(result.totalInterestAccrued).toBeGreaterThan(0);
  });

  test('uses most recent snapshot as anchor when snapshots exist', async () => {
    const loan = {
      id: 1,
      initial_balance: 500000,
      loan_type: 'mortgage',
      start_date: '2024-01-01',
      fixed_interest_rate: 5.0
    };

    // Snapshot at 2025-03 with balance 480000 and rate 5.0
    loanBalanceRepository.getBalanceHistory.mockResolvedValue([
      { year: 2025, month: 3, remaining_balance: 480000, rate: 5.0 }
    ]);
    loanPaymentRepository.findByLoanOrdered.mockResolvedValue([]);

    const result = await balanceCalculationService.calculateMortgageBalance(loan);

    expect(result.anchorBased).toBe(true);
    expect(result.interestAware).toBe(true);
    // 3 months of interest (Apr, May, Jun) on ~480000 at 5%
    expect(result.currentBalance).toBeGreaterThan(480000);
    expect(result.totalInterestAccrued).toBeGreaterThan(0);
  });

  test('subtracts payments in the correct months', async () => {
    const loan = {
      id: 1,
      initial_balance: 500000,
      loan_type: 'mortgage',
      start_date: '2025-01-01',
      fixed_interest_rate: 5.0
    };

    loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
    // Payments in Feb, Mar, Apr, May (reverse chronological from findByLoanOrdered)
    loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
      { id: 4, amount: 2500, payment_date: '2025-05-15', notes: null },
      { id: 3, amount: 2500, payment_date: '2025-04-15', notes: null },
      { id: 2, amount: 2500, payment_date: '2025-03-15', notes: null },
      { id: 1, amount: 2500, payment_date: '2025-02-15', notes: null },
    ]);

    const result = await balanceCalculationService.calculateMortgageBalance(loan);

    expect(result.interestAware).toBe(true);
    expect(result.paymentCount).toBe(4);
    expect(result.totalPayments).toBe(10000);
    // Monthly interest on 500k at 5% ≈ $2083, so 4 payments of $2500 don't fully offset
    // interest over 5 months. Balance will be above initial minus payments.
    expect(result.currentBalance).toBeGreaterThan(500000 - 10000);
    expect(result.totalInterestAccrued).toBeGreaterThan(0);
  });

  test('clamps balance to zero when payments exceed balance plus interest', async () => {
    const loan = {
      id: 1,
      initial_balance: 5000,
      loan_type: 'mortgage',
      start_date: '2025-01-01',
      fixed_interest_rate: 3.0
    };

    loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
    // Massive payment that exceeds balance
    loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
      { id: 1, amount: 100000, payment_date: '2025-02-15', notes: null },
    ]);

    const result = await balanceCalculationService.calculateMortgageBalance(loan);

    expect(result.currentBalance).toBe(0);
    expect(result.interestAware).toBe(true);
  });

  test('falls back to naive calculation when no rate is available', async () => {
    const loan = {
      id: 1,
      initial_balance: 500000,
      loan_type: 'mortgage',
      start_date: '2025-01-01',
      fixed_interest_rate: null
    };

    // No snapshots with rates
    loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
    loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
      { id: 1, amount: 2500, payment_date: '2025-02-15', notes: null },
    ]);

    const result = await balanceCalculationService.calculateMortgageBalance(loan);

    expect(result.interestAware).toBe(false);
    expect(result.totalInterestAccrued).toBe(0);
    expect(result.currentBalance).toBe(500000 - 2500);
  });

  test('updates rate from newer snapshots during walk', async () => {
    const loan = {
      id: 1,
      initial_balance: 500000,
      loan_type: 'mortgage',
      start_date: '2025-01-01',
      fixed_interest_rate: 4.0
    };

    // Rate changes from 4.0 to 6.0 in April
    loanBalanceRepository.getBalanceHistory.mockResolvedValue([
      { year: 2025, month: 1, remaining_balance: 500000, rate: 4.0 },
      { year: 2025, month: 4, remaining_balance: 495000, rate: 6.0 },
    ]);
    loanPaymentRepository.findByLoanOrdered.mockResolvedValue([]);

    const result = await balanceCalculationService.calculateMortgageBalance(loan);

    expect(result.anchorBased).toBe(true);
    expect(result.interestAware).toBe(true);
    // The anchor is the MOST RECENT snapshot (2025-04, balance 495000)
    // Walk from May to June at 6% rate
    // May interest: 495000 * 0.06 / 12 = 2475
    // Jun interest: (495000 + 2475) * 0.06 / 12 ≈ 2487.38
    expect(result.totalInterestAccrued).toBeGreaterThan(0);
  });

  test('handles multiple payments in the same month', async () => {
    const loan = {
      id: 1,
      initial_balance: 500000,
      loan_type: 'mortgage',
      start_date: '2025-01-01',
      fixed_interest_rate: 5.0
    };

    loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
    // Two payments in February
    loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
      { id: 2, amount: 1500, payment_date: '2025-02-20', notes: null },
      { id: 1, amount: 1000, payment_date: '2025-02-10', notes: null },
    ]);

    const result = await balanceCalculationService.calculateMortgageBalance(loan);

    expect(result.interestAware).toBe(true);
    expect(result.totalPayments).toBe(2500);
    // Both payments should be subtracted in February, but interest accrues over remaining months
    expect(result.currentBalance).toBeGreaterThan(500000 - 2500);
  });

  test('returns correct structure with all expected fields', async () => {
    const loan = {
      id: 42,
      initial_balance: 300000,
      loan_type: 'mortgage',
      start_date: '2025-01-01',
      fixed_interest_rate: 4.5
    };

    loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
    loanPaymentRepository.findByLoanOrdered.mockResolvedValue([]);

    const result = await balanceCalculationService.calculateMortgageBalance(loan);

    expect(result).toHaveProperty('loanId', 42);
    expect(result).toHaveProperty('initialBalance', 300000);
    expect(result).toHaveProperty('totalPayments');
    expect(result).toHaveProperty('currentBalance');
    expect(result).toHaveProperty('calculatedBalance');
    expect(result).toHaveProperty('actualBalance');
    expect(result).toHaveProperty('paymentCount');
    expect(result).toHaveProperty('lastPaymentDate');
    expect(result).toHaveProperty('hasDiscrepancy');
    expect(result).toHaveProperty('anchorBased');
    expect(result).toHaveProperty('totalInterestAccrued');
    expect(result).toHaveProperty('interestAware', true);
  });

  test('handles no start_date by using current date as fallback', async () => {
    const loan = {
      id: 1,
      initial_balance: 500000,
      loan_type: 'mortgage',
      start_date: null,
      fixed_interest_rate: 5.0
    };

    loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
    loanPaymentRepository.findByLoanOrdered.mockResolvedValue([]);

    const result = await balanceCalculationService.calculateMortgageBalance(loan);

    // Anchor is current month (June 2025), so no months to walk
    expect(result.interestAware).toBe(true);
    expect(result.currentBalance).toBe(500000);
    expect(result.totalInterestAccrued).toBe(0);
  });

  test('accrues interest correctly for a known scenario', async () => {
    // Precise test: anchor at Jan 2025, rate 6%, balance 100000
    // Walk Feb, Mar, Apr, May, Jun (5 months)
    // No payments
    const loan = {
      id: 1,
      initial_balance: 100000,
      loan_type: 'mortgage',
      start_date: '2025-01-01',
      fixed_interest_rate: 6.0
    };

    loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
    loanPaymentRepository.findByLoanOrdered.mockResolvedValue([]);

    const result = await balanceCalculationService.calculateMortgageBalance(loan);

    // Month-by-month at 6% (0.5% per month):
    // Feb: 100000 + 500 = 100500
    // Mar: 100500 + 502.50 = 101002.50
    // Apr: 101002.50 + 505.01 = 101507.51
    // May: 101507.51 + 507.54 = 102015.05
    // Jun: 102015.05 + 510.08 = 102525.13
    // Total interest ≈ 2525.13
    expect(result.currentBalance).toBeCloseTo(102525.13, 0);
    expect(result.totalInterestAccrued).toBeCloseTo(2525.13, 0);
  });
});

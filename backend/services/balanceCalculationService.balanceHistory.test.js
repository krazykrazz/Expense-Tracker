/**
 * Unit tests for BalanceCalculationService.getBalanceHistory()
 * 
 * Tests the interest-aware running balance history for mortgages
 * and verifies non-mortgage loans remain unchanged.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

const balanceCalculationService = require('./balanceCalculationService');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const loanPaymentRepository = require('../repositories/loanPaymentRepository');

// Mock the repositories
jest.mock('../repositories/loanRepository');
jest.mock('../repositories/loanBalanceRepository');
jest.mock('../repositories/loanPaymentRepository');

describe('BalanceCalculationService.getBalanceHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('non-mortgage loans (unchanged behavior)', () => {
    test('returns naive running balance for regular loans', async () => {
      loanRepository.findById.mockResolvedValue({
        id: 1,
        initial_balance: 10000,
        loan_type: 'loan',
        start_date: '2025-01-01'
      });

      // Payments in reverse chronological order (as returned by findByLoanOrdered)
      loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
        { id: 3, amount: 1000, payment_date: '2025-04-15', notes: 'Apr' },
        { id: 2, amount: 1000, payment_date: '2025-03-15', notes: 'Mar' },
        { id: 1, amount: 1000, payment_date: '2025-02-15', notes: 'Feb' },
      ]);

      const history = await balanceCalculationService.getBalanceHistory(1);

      // Should be in reverse chronological order (newest first)
      expect(history).toHaveLength(3);
      expect(history[0].id).toBe(3);
      expect(history[0].runningBalance).toBe(7000);
      expect(history[1].id).toBe(2);
      expect(history[1].runningBalance).toBe(8000);
      expect(history[2].id).toBe(1);
      expect(history[2].runningBalance).toBe(9000);

      // Non-mortgage entries should NOT have interestAccrued/principalPaid
      expect(history[0]).not.toHaveProperty('interestAccrued');
      expect(history[0]).not.toHaveProperty('principalPaid');
    });

    test('clamps running balance to zero for non-mortgage loans', async () => {
      loanRepository.findById.mockResolvedValue({
        id: 1,
        initial_balance: 1000,
        loan_type: 'loan',
        start_date: '2025-01-01'
      });

      loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
        { id: 1, amount: 5000, payment_date: '2025-02-15', notes: null },
      ]);

      const history = await balanceCalculationService.getBalanceHistory(1);

      expect(history).toHaveLength(1);
      expect(history[0].runningBalance).toBe(0);
    });

    test('returns empty array when no payments exist for non-mortgage', async () => {
      loanRepository.findById.mockResolvedValue({
        id: 1,
        initial_balance: 10000,
        loan_type: 'loan',
        start_date: '2025-01-01'
      });

      loanPaymentRepository.findByLoanOrdered.mockResolvedValue([]);

      const history = await balanceCalculationService.getBalanceHistory(1);

      expect(history).toHaveLength(0);
    });
  });

  describe('mortgage loans (interest-aware)', () => {
    test('returns interest-aware running balances with interestAccrued and principalPaid', async () => {
      loanRepository.findById.mockResolvedValue({
        id: 1,
        initial_balance: 100000,
        loan_type: 'mortgage',
        start_date: '2025-01-01',
        fixed_interest_rate: 6.0
      });

      loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
      // Single payment in February
      loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
        { id: 1, amount: 2500, payment_date: '2025-02-15', notes: 'Feb payment' },
      ]);

      const history = await balanceCalculationService.getBalanceHistory(1);

      expect(history).toHaveLength(1);
      const entry = history[0];
      expect(entry.id).toBe(1);
      expect(entry.date).toBe('2025-02-15');
      expect(entry.payment).toBe(2500);
      expect(entry.notes).toBe('Feb payment');
      expect(entry).toHaveProperty('interestAccrued');
      expect(entry).toHaveProperty('principalPaid');
      expect(entry).toHaveProperty('runningBalance');

      // Feb interest on 100000 at 6%: 100000 * 0.06 / 12 = 500
      expect(entry.interestAccrued).toBe(500);
      // principalPaid = payment - interest = 2500 - 500 = 2000
      expect(entry.principalPaid).toBe(2000);
      // runningBalance = 100000 + 500 - 2500 = 98000
      expect(entry.runningBalance).toBe(98000);
    });

    test('accrues interest correctly across multiple months with payments', async () => {
      loanRepository.findById.mockResolvedValue({
        id: 1,
        initial_balance: 100000,
        loan_type: 'mortgage',
        start_date: '2025-01-01',
        fixed_interest_rate: 6.0
      });

      loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
      loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
        { id: 2, amount: 2500, payment_date: '2025-03-15', notes: null },
        { id: 1, amount: 2500, payment_date: '2025-02-15', notes: null },
      ]);

      const history = await balanceCalculationService.getBalanceHistory(1);

      expect(history).toHaveLength(2);

      // Newest first
      const marchEntry = history[0];
      const febEntry = history[1];

      expect(febEntry.id).toBe(1);
      expect(marchEntry.id).toBe(2);

      // Feb: interest = 100000 * 0.06/12 = 500, balance = 100000 + 500 - 2500 = 98000
      expect(febEntry.interestAccrued).toBe(500);
      expect(febEntry.principalPaid).toBe(2000);
      expect(febEntry.runningBalance).toBe(98000);

      // Mar: interest = 98000 * 0.06/12 = 490, balance = 98000 + 490 - 2500 = 95990
      expect(marchEntry.interestAccrued).toBe(490);
      expect(marchEntry.principalPaid).toBe(2010);
      expect(marchEntry.runningBalance).toBe(95990);
    });

    test('uses snapshot as anchor for mortgage balance history', async () => {
      loanRepository.findById.mockResolvedValue({
        id: 1,
        initial_balance: 500000,
        loan_type: 'mortgage',
        start_date: '2024-01-01',
        fixed_interest_rate: 5.0
      });

      // Snapshot at March 2025 with balance 480000
      loanBalanceRepository.getBalanceHistory.mockResolvedValue([
        { year: 2025, month: 3, remaining_balance: 480000, rate: 5.0 }
      ]);

      // Payment in April
      loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
        { id: 1, amount: 2500, payment_date: '2025-04-15', notes: null },
      ]);

      const history = await balanceCalculationService.getBalanceHistory(1);

      expect(history).toHaveLength(1);
      const entry = history[0];

      // Apr interest on 480000 at 5%: 480000 * 0.05 / 12 = 2000
      expect(entry.interestAccrued).toBe(2000);
      expect(entry.principalPaid).toBe(500);
      // runningBalance = 480000 + 2000 - 2500 = 479500
      expect(entry.runningBalance).toBe(479500);
    });

    test('falls back to naive calculation when no rate available', async () => {
      loanRepository.findById.mockResolvedValue({
        id: 1,
        initial_balance: 100000,
        loan_type: 'mortgage',
        start_date: '2025-01-01',
        fixed_interest_rate: null
      });

      loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
      loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
        { id: 1, amount: 2500, payment_date: '2025-02-15', notes: null },
      ]);

      const history = await balanceCalculationService.getBalanceHistory(1);

      expect(history).toHaveLength(1);
      const entry = history[0];
      // Naive: 100000 - 2500 = 97500
      expect(entry.runningBalance).toBe(97500);
      expect(entry.interestAccrued).toBe(0);
      expect(entry.principalPaid).toBe(2500);
    });

    test('handles rate changes from snapshots during walk', async () => {
      loanRepository.findById.mockResolvedValue({
        id: 1,
        initial_balance: 100000,
        loan_type: 'mortgage',
        start_date: '2025-01-01',
        fixed_interest_rate: 4.0
      });

      // Rate changes from 4% to 6% in March
      loanBalanceRepository.getBalanceHistory.mockResolvedValue([
        { year: 2025, month: 1, remaining_balance: 100000, rate: 4.0 },
        { year: 2025, month: 3, remaining_balance: 97500, rate: 6.0 },
      ]);

      // Payments in April (after the latest snapshot anchor)
      loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
        { id: 1, amount: 2500, payment_date: '2025-04-15', notes: null },
      ]);

      const history = await balanceCalculationService.getBalanceHistory(1);

      expect(history).toHaveLength(1);
      const entry = history[0];
      // Anchor is latest snapshot: March 2025, balance 97500, rate 6%
      // Apr interest: 97500 * 0.06 / 12 = 487.50
      expect(entry.interestAccrued).toBe(487.5);
      expect(entry.principalPaid).toBe(2012.5);
      // runningBalance = 97500 + 487.5 - 2500 = 95487.5
      expect(entry.runningBalance).toBe(95487.5);
    });

    test('clamps balance to zero when payment exceeds balance plus interest', async () => {
      loanRepository.findById.mockResolvedValue({
        id: 1,
        initial_balance: 5000,
        loan_type: 'mortgage',
        start_date: '2025-01-01',
        fixed_interest_rate: 3.0
      });

      loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
      loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
        { id: 1, amount: 100000, payment_date: '2025-02-15', notes: null },
      ]);

      const history = await balanceCalculationService.getBalanceHistory(1);

      expect(history).toHaveLength(1);
      expect(history[0].runningBalance).toBe(0);
    });

    test('handles multiple payments in the same month', async () => {
      loanRepository.findById.mockResolvedValue({
        id: 1,
        initial_balance: 100000,
        loan_type: 'mortgage',
        start_date: '2025-01-01',
        fixed_interest_rate: 6.0
      });

      loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
      // Two payments in February
      loanPaymentRepository.findByLoanOrdered.mockResolvedValue([
        { id: 2, amount: 1500, payment_date: '2025-02-20', notes: null },
        { id: 1, amount: 1000, payment_date: '2025-02-10', notes: null },
      ]);

      const history = await balanceCalculationService.getBalanceHistory(1);

      expect(history).toHaveLength(2);
      // Both share the same month's interest (500)
      // First payment (id=1): balance = 100000 + 500 - 1000 = 99500
      // Second payment (id=2): balance = 99500 - 1500 = 98000
      const firstPayment = history.find(h => h.id === 1);
      const secondPayment = history.find(h => h.id === 2);

      expect(firstPayment.interestAccrued).toBe(500);
      expect(firstPayment.runningBalance).toBe(99500);
      expect(secondPayment.interestAccrued).toBe(500);
      expect(secondPayment.runningBalance).toBe(98000);
    });

    test('returns empty array when no payments exist for mortgage', async () => {
      loanRepository.findById.mockResolvedValue({
        id: 1,
        initial_balance: 100000,
        loan_type: 'mortgage',
        start_date: '2025-01-01',
        fixed_interest_rate: 6.0
      });

      loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
      loanPaymentRepository.findByLoanOrdered.mockResolvedValue([]);

      const history = await balanceCalculationService.getBalanceHistory(1);

      expect(history).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    test('throws error when loan not found', async () => {
      loanRepository.findById.mockResolvedValue(null);

      await expect(balanceCalculationService.getBalanceHistory(999))
        .rejects.toThrow('Loan not found');
    });
  });
});

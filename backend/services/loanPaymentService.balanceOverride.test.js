/**
 * Unit tests for LoanPaymentService balance override validation and activity logging
 *
 * Tests the balance override flow in createPayment():
 * - Validation: negative, non-number, NaN overrides rejected
 * - Non-mortgage loans: override silently ignored
 * - Mortgage loans: snapshot created, activity log with correct metadata
 * - Edge case: override of 0 (mortgage paid off)
 *
 * Requirements: 2.2, 2.5, 8.1, 8.2, 8.3
 */

// Mock dependencies before requiring the service
jest.mock('../repositories/loanPaymentRepository');
jest.mock('../repositories/loanRepository');
jest.mock('../repositories/loanBalanceRepository');
jest.mock('./activityLogService');
jest.mock('./loanBalanceService');
jest.mock('./balanceCalculationService');
jest.mock('../config/logger');

const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const activityLogService = require('./activityLogService');
const loanBalanceService = require('./loanBalanceService');
const balanceCalculationService = require('./balanceCalculationService');
const loanPaymentService = require('./loanPaymentService');

describe('LoanPaymentService - Balance Override', () => {
  const baseMortgage = {
    id: 1,
    name: 'Home Mortgage',
    initial_balance: 500000,
    loan_type: 'mortgage',
    start_date: '2025-01-01',
    fixed_interest_rate: 5.0
  };

  const baseLoan = {
    id: 2,
    name: 'Car Loan',
    initial_balance: 30000,
    loan_type: 'loan',
    start_date: '2025-01-01',
    fixed_interest_rate: null
  };

  const validPaymentData = {
    amount: 2500,
    payment_date: '2025-01-15',
    notes: 'January payment'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Freeze time so payment_date validation (no future dates) passes
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-06-15T12:00:00Z'));

    // Default mock returns
    loanPaymentRepository.create.mockResolvedValue({ id: 100, ...validPaymentData, loan_id: 1 });
    activityLogService.logEvent.mockResolvedValue(undefined);
    loanBalanceService.createOrUpdateBalance.mockResolvedValue({ id: 10 });
    balanceCalculationService.calculateBalance.mockResolvedValue({ currentBalance: 495000 });
    balanceCalculationService.resolveRateAtDate.mockReturnValue(5.0);
    loanBalanceRepository.getBalanceHistory.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // --- Validation tests (Requirements 2.2, 2.5) ---

  describe('validation', () => {
    beforeEach(() => {
      loanRepository.findById.mockResolvedValue(baseMortgage);
    });

    test('rejects negative balance override', async () => {
      await expect(
        loanPaymentService.createPayment(1, { ...validPaymentData, balanceOverride: -100 })
      ).rejects.toThrow('Balance override must be a non-negative number');

      expect(loanPaymentRepository.create).not.toHaveBeenCalled();
    });

    test('rejects non-number (string) balance override', async () => {
      await expect(
        loanPaymentService.createPayment(1, { ...validPaymentData, balanceOverride: 'abc' })
      ).rejects.toThrow('Balance override must be a non-negative number');

      expect(loanPaymentRepository.create).not.toHaveBeenCalled();
    });

    test('rejects NaN balance override', async () => {
      await expect(
        loanPaymentService.createPayment(1, { ...validPaymentData, balanceOverride: NaN })
      ).rejects.toThrow('Balance override must be a non-negative number');

      expect(loanPaymentRepository.create).not.toHaveBeenCalled();
    });
  });

  // --- Non-mortgage override ignored (Requirement 2.2) ---

  describe('non-mortgage loan with override', () => {
    beforeEach(() => {
      loanRepository.findById.mockResolvedValue(baseLoan);
      loanPaymentRepository.create.mockResolvedValue({ id: 101, ...validPaymentData, loan_id: 2 });
    });

    test('creates payment but does not create snapshot or log override event', async () => {
      const result = await loanPaymentService.createPayment(2, {
        ...validPaymentData,
        balanceOverride: 25000
      });

      // Payment should be created
      expect(loanPaymentRepository.create).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('id', 101);

      // No snapshot should be created
      expect(loanBalanceService.createOrUpdateBalance).not.toHaveBeenCalled();

      // Activity log should have the payment_added event but NOT balance_override_applied
      const overrideCalls = activityLogService.logEvent.mock.calls.filter(
        call => call[0] === 'balance_override_applied'
      );
      expect(overrideCalls).toHaveLength(0);

      // The normal payment log should still happen
      const paymentCalls = activityLogService.logEvent.mock.calls.filter(
        call => call[0] === 'loan_payment_added'
      );
      expect(paymentCalls).toHaveLength(1);
    });
  });

  // --- Valid mortgage override (Requirements 2.2, 8.1, 8.2, 8.3) ---

  describe('mortgage with valid override', () => {
    beforeEach(() => {
      loanRepository.findById.mockResolvedValue(baseMortgage);
    });

    test('creates snapshot and logs activity with correct metadata', async () => {
      await loanPaymentService.createPayment(1, {
        ...validPaymentData,
        balanceOverride: 485000
      });

      // Payment created
      expect(loanPaymentRepository.create).toHaveBeenCalledTimes(1);

      // Snapshot created with override value
      expect(loanBalanceService.createOrUpdateBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 1,
          year: 2025,
          month: 1,
          remaining_balance: 485000
        })
      );

      // Activity log: balance_override_applied event
      const overrideCalls = activityLogService.logEvent.mock.calls.filter(
        call => call[0] === 'balance_override_applied'
      );
      expect(overrideCalls).toHaveLength(1);

      const [eventType, entityType, entityId, description, metadata] = overrideCalls[0];
      expect(eventType).toBe('balance_override_applied');
      expect(entityType).toBe('loan_balance');
      expect(entityId).toBe(1);
      expect(description).toContain('Home Mortgage');
      expect(description).toContain('485000.00');

      // Verify metadata fields (Requirements 8.1, 8.2, 8.3)
      expect(metadata).toEqual(expect.objectContaining({
        overrideValue: 485000,
        calculatedValue: 495000,
        mortgageName: 'Home Mortgage',
        paymentDate: '2025-01-15',
        source: 'balance_override'
      }));
    });

    test('override of 0 is valid (mortgage paid off)', async () => {
      await loanPaymentService.createPayment(1, {
        ...validPaymentData,
        balanceOverride: 0
      });

      // Snapshot created with 0 balance
      expect(loanBalanceService.createOrUpdateBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 1,
          remaining_balance: 0
        })
      );

      // Override event logged
      const overrideCalls = activityLogService.logEvent.mock.calls.filter(
        call => call[0] === 'balance_override_applied'
      );
      expect(overrideCalls).toHaveLength(1);
      expect(overrideCalls[0][4].overrideValue).toBe(0);
    });

    test('activity log metadata includes all required fields', async () => {
      balanceCalculationService.calculateBalance.mockResolvedValue({ currentBalance: 498000 });

      await loanPaymentService.createPayment(1, {
        ...validPaymentData,
        payment_date: '2025-03-20',
        balanceOverride: 490000
      });

      const overrideCalls = activityLogService.logEvent.mock.calls.filter(
        call => call[0] === 'balance_override_applied'
      );
      const metadata = overrideCalls[0][4];

      // All required metadata fields present
      expect(metadata).toHaveProperty('overrideValue', 490000);
      expect(metadata).toHaveProperty('calculatedValue', 498000);
      expect(metadata).toHaveProperty('mortgageName', 'Home Mortgage');
      expect(metadata).toHaveProperty('paymentDate', '2025-03-20');
      expect(metadata).toHaveProperty('source', 'balance_override');
    });

    test('snapshot uses correct year/month from payment date', async () => {
      await loanPaymentService.createPayment(1, {
        amount: 2500,
        payment_date: '2025-05-22',
        balanceOverride: 480000
      });

      expect(loanBalanceService.createOrUpdateBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          year: 2025,
          month: 5
        })
      );
    });
  });

  // --- Auto-snapshot tests (no override provided) ---

  describe('mortgage auto-snapshot on createPayment', () => {
    beforeEach(() => {
      loanRepository.findById.mockResolvedValue(baseMortgage);
    });

    test('auto-creates snapshot from calculated balance when no override provided', async () => {
      balanceCalculationService.calculateBalance.mockResolvedValue({
        currentBalance: 497500,
        interestAware: true
      });

      await loanPaymentService.createPayment(1, validPaymentData);

      // Snapshot created with calculated balance
      expect(loanBalanceService.createOrUpdateBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 1,
          year: 2025,
          month: 1,
          remaining_balance: 497500
        })
      );

      // No override event logged
      const overrideCalls = activityLogService.logEvent.mock.calls.filter(
        call => call[0] === 'balance_override_applied'
      );
      expect(overrideCalls).toHaveLength(0);
    });

    test('skips auto-snapshot when calculation is not interest-aware', async () => {
      balanceCalculationService.calculateBalance.mockResolvedValue({
        currentBalance: 497500,
        interestAware: false
      });

      await loanPaymentService.createPayment(1, validPaymentData);

      expect(loanBalanceService.createOrUpdateBalance).not.toHaveBeenCalled();
    });

    test('skips auto-snapshot when calculateBalance fails', async () => {
      balanceCalculationService.calculateBalance.mockRejectedValue(new Error('calc error'));

      // Should not throw — auto-snapshot failure is non-fatal
      const result = await loanPaymentService.createPayment(1, validPaymentData);
      expect(result).toHaveProperty('id');
      expect(loanBalanceService.createOrUpdateBalance).not.toHaveBeenCalled();
    });

    test('does not auto-snapshot for non-mortgage loans', async () => {
      loanRepository.findById.mockResolvedValue(baseLoan);
      loanPaymentRepository.create.mockResolvedValue({ id: 101, ...validPaymentData, loan_id: 2 });

      await loanPaymentService.createPayment(2, validPaymentData);

      expect(loanBalanceService.createOrUpdateBalance).not.toHaveBeenCalled();
    });
  });

  // --- updatePayment balance override tests ---

  describe('updatePayment with balance override', () => {
    const existingPayment = {
      id: 100,
      loan_id: 1,
      amount: 2500,
      payment_date: '2025-01-15',
      notes: 'January payment'
    };

    beforeEach(() => {
      loanRepository.findById.mockResolvedValue(baseMortgage);
      loanPaymentRepository.findById.mockResolvedValue(existingPayment);
      loanPaymentRepository.update.mockResolvedValue({ ...existingPayment, amount: 2600 });
    });

    test('creates snapshot and logs activity when updating with override', async () => {
      await loanPaymentService.updatePayment(100, {
        ...validPaymentData,
        amount: 2600,
        balanceOverride: 485000
      });

      // Payment updated
      expect(loanPaymentRepository.update).toHaveBeenCalledTimes(1);

      // Snapshot created with override value
      expect(loanBalanceService.createOrUpdateBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 1,
          year: 2025,
          month: 1,
          remaining_balance: 485000
        })
      );

      // Activity log: balance_override_applied event
      const overrideCalls = activityLogService.logEvent.mock.calls.filter(
        call => call[0] === 'balance_override_applied'
      );
      expect(overrideCalls).toHaveLength(1);
      expect(overrideCalls[0][4]).toEqual(expect.objectContaining({
        overrideValue: 485000,
        mortgageName: 'Home Mortgage',
        paymentDate: '2025-01-15',
        source: 'balance_override'
      }));
    });

    test('auto-creates snapshot from calculated balance when no override provided on update', async () => {
      balanceCalculationService.calculateBalance.mockResolvedValue({
        currentBalance: 492000,
        interestAware: true
      });

      await loanPaymentService.updatePayment(100, {
        ...validPaymentData,
        amount: 2600
      });

      expect(loanPaymentRepository.update).toHaveBeenCalledTimes(1);

      // Auto-snapshot should be created with calculated balance
      expect(loanBalanceService.createOrUpdateBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 1,
          remaining_balance: 492000
        })
      );

      // No override event logged (auto-snapshot is silent)
      const overrideCalls = activityLogService.logEvent.mock.calls.filter(
        call => call[0] === 'balance_override_applied'
      );
      expect(overrideCalls).toHaveLength(0);
    });

    test('rejects negative balance override on update', async () => {
      await expect(
        loanPaymentService.updatePayment(100, { ...validPaymentData, balanceOverride: -50 })
      ).rejects.toThrow('Balance override must be a non-negative number');

      expect(loanPaymentRepository.update).not.toHaveBeenCalled();
    });

    test('override of 0 is valid on update (mortgage paid off)', async () => {
      await loanPaymentService.updatePayment(100, {
        ...validPaymentData,
        balanceOverride: 0
      });

      expect(loanBalanceService.createOrUpdateBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 1,
          remaining_balance: 0
        })
      );
    });

    test('does not create snapshot for non-mortgage loan on update', async () => {
      loanRepository.findById.mockResolvedValue(baseLoan);
      loanPaymentRepository.findById.mockResolvedValue({ ...existingPayment, loan_id: 2 });
      loanPaymentRepository.update.mockResolvedValue({ ...existingPayment, loan_id: 2 });

      await loanPaymentService.updatePayment(100, {
        ...validPaymentData,
        balanceOverride: 25000
      });

      expect(loanBalanceService.createOrUpdateBalance).not.toHaveBeenCalled();
    });
  });
});

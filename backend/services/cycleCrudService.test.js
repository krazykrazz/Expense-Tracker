/**
 * Unit Tests for CycleCrudService
 * Tests validatePaymentMethod, createBillingCycle, getBillingCycleHistory,
 * updateBillingCycle, and deleteBillingCycle with mocked dependencies.
 *
 * **Validates: Requirements 4.1, 5.2**
 */

jest.mock('../repositories/billingCycleRepository');
jest.mock('../repositories/paymentMethodRepository');
jest.mock('./statementBalanceService');
jest.mock('./activityLogService');
jest.mock('./cycleGenerationService');
jest.mock('./cycleAnalyticsService');

const billingCycleRepository = require('../repositories/billingCycleRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const statementBalanceService = require('./statementBalanceService');
const activityLogService = require('./activityLogService');
const cycleGenerationService = require('./cycleGenerationService');
const cycleAnalyticsService = require('./cycleAnalyticsService');

const cycleCrudService = require('./cycleCrudService');

// Shared test fixtures
const validCreditCard = {
  id: 1,
  type: 'credit_card',
  display_name: 'Test Visa',
  billing_cycle_day: 15
};

beforeEach(() => {
  jest.clearAllMocks();
  activityLogService.logEvent.mockResolvedValue(undefined);
});

describe('CycleCrudService', () => {
  // ─── validatePaymentMethod ───────────────────────────────────────────

  describe('validatePaymentMethod', () => {
    it('returns payment method when valid credit card with billing cycle day', async () => {
      paymentMethodRepository.findById.mockResolvedValue(validCreditCard);

      const result = await cycleCrudService.validatePaymentMethod(1);

      expect(result).toEqual(validCreditCard);
      expect(paymentMethodRepository.findById).toHaveBeenCalledWith(1);
    });

    it('throws NOT_FOUND when payment method does not exist', async () => {
      paymentMethodRepository.findById.mockResolvedValue(null);

      await expect(cycleCrudService.validatePaymentMethod(999))
        .rejects.toMatchObject({ message: 'Payment method not found', code: 'NOT_FOUND' });
    });

    it('throws VALIDATION_ERROR when payment method is not a credit card', async () => {
      paymentMethodRepository.findById.mockResolvedValue({
        id: 2, type: 'debit', display_name: 'Debit', billing_cycle_day: null
      });

      await expect(cycleCrudService.validatePaymentMethod(2))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('throws VALIDATION_ERROR when no billing cycle day configured', async () => {
      paymentMethodRepository.findById.mockResolvedValue({
        id: 3, type: 'credit_card', display_name: 'No Cycle Card', billing_cycle_day: null
      });

      await expect(cycleCrudService.validatePaymentMethod(3))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });


  // ─── createBillingCycle ──────────────────────────────────────────────

  describe('createBillingCycle', () => {
    const cycleDates = { startDate: '2025-01-16', endDate: '2025-02-15' };
    const createData = { actual_statement_balance: 250.75, minimum_payment: 25, notes: 'Test' };

    beforeEach(() => {
      paymentMethodRepository.findById.mockResolvedValue(validCreditCard);
      statementBalanceService.calculatePreviousCycleDates.mockReturnValue(cycleDates);
      billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue(null);
      cycleGenerationService.calculateCycleBalance.mockResolvedValue({
        calculatedBalance: 200.00, previousBalance: 0, totalExpenses: 200, totalPayments: 0
      });
      cycleAnalyticsService.calculateDiscrepancy.mockReturnValue({
        amount: 50.75, type: 'higher', description: 'Actual balance is 50.75 higher than tracked (potential untracked expenses)'
      });
      billingCycleRepository.create.mockResolvedValue({
        id: 10,
        payment_method_id: 1,
        cycle_start_date: cycleDates.startDate,
        cycle_end_date: cycleDates.endDate,
        actual_statement_balance: 250.75,
        calculated_statement_balance: 200.00,
        is_user_entered: 1
      });
    });

    it('creates a billing cycle and returns record with discrepancy', async () => {
      const result = await cycleCrudService.createBillingCycle(1, createData, new Date('2025-02-20'));

      expect(result.id).toBe(10);
      expect(result.discrepancy.amount).toBe(50.75);
      expect(billingCycleRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method_id: 1,
          actual_statement_balance: 250.75,
          calculated_statement_balance: 200.00,
          is_user_entered: 1
        })
      );
    });

    it('throws VALIDATION_ERROR when actual_statement_balance is missing', async () => {
      await expect(cycleCrudService.createBillingCycle(1, {}))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringContaining('Missing required field') });
    });

    it('throws VALIDATION_ERROR when actual_statement_balance is negative', async () => {
      await expect(cycleCrudService.createBillingCycle(1, { actual_statement_balance: -10 }))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('throws VALIDATION_ERROR when actual_statement_balance is not a number', async () => {
      await expect(cycleCrudService.createBillingCycle(1, { actual_statement_balance: 'abc' }))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('throws DUPLICATE_ENTRY when cycle already exists for the period', async () => {
      billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue({ id: 5 });

      await expect(cycleCrudService.createBillingCycle(1, createData))
        .rejects.toMatchObject({ code: 'DUPLICATE_ENTRY' });
    });

    it('logs activity event after creation', async () => {
      await cycleCrudService.createBillingCycle(1, createData, new Date('2025-02-20'));

      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'billing_cycle_added',
        'billing_cycle',
        10,
        expect.stringContaining('Test Visa'),
        expect.objectContaining({
          paymentMethodId: 1,
          actualBalance: 250.75,
          cardName: 'Test Visa'
        })
      );
    });

    it('does not throw when activity logging fails', async () => {
      activityLogService.logEvent.mockRejectedValue(new Error('Log failed'));

      const result = await cycleCrudService.createBillingCycle(1, createData, new Date('2025-02-20'));
      expect(result.id).toBe(10);
    });
  });


  // ─── getBillingCycleHistory ──────────────────────────────────────────

  describe('getBillingCycleHistory', () => {
    beforeEach(() => {
      paymentMethodRepository.findById.mockResolvedValue(validCreditCard);
    });

    it('returns cycles with discrepancy attached', async () => {
      billingCycleRepository.findByPaymentMethod.mockResolvedValue([
        { id: 1, actual_statement_balance: 100, calculated_statement_balance: 90 },
        { id: 2, actual_statement_balance: 200, calculated_statement_balance: 200 }
      ]);
      cycleAnalyticsService.calculateDiscrepancy
        .mockReturnValueOnce({ amount: 10, type: 'higher', description: 'higher' })
        .mockReturnValueOnce({ amount: 0, type: 'match', description: 'Tracking is accurate' });

      const result = await cycleCrudService.getBillingCycleHistory(1);

      expect(result).toHaveLength(2);
      expect(result[0].discrepancy.amount).toBe(10);
      expect(result[1].discrepancy.type).toBe('match');
    });

    it('passes options through to repository', async () => {
      billingCycleRepository.findByPaymentMethod.mockResolvedValue([]);
      cycleAnalyticsService.calculateDiscrepancy.mockReturnValue({ amount: 0, type: 'match', description: '' });

      await cycleCrudService.getBillingCycleHistory(1, { limit: 5, startDate: '2025-01-01' });

      expect(billingCycleRepository.findByPaymentMethod).toHaveBeenCalledWith(1, { limit: 5, startDate: '2025-01-01' });
    });

    it('validates payment method before fetching', async () => {
      paymentMethodRepository.findById.mockResolvedValue(null);

      await expect(cycleCrudService.getBillingCycleHistory(999))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  // ─── updateBillingCycle ──────────────────────────────────────────────

  describe('updateBillingCycle', () => {
    const existingCycle = {
      id: 10,
      payment_method_id: 1,
      cycle_end_date: '2025-02-15',
      actual_statement_balance: 250,
      calculated_statement_balance: 200,
      minimum_payment: 25,
      notes: 'Original',
      statement_pdf_path: null
    };

    beforeEach(() => {
      paymentMethodRepository.findById.mockResolvedValue(validCreditCard);
      billingCycleRepository.findById.mockResolvedValue(existingCycle);
      billingCycleRepository.update.mockResolvedValue({
        ...existingCycle,
        actual_statement_balance: 300,
        minimum_payment: 30,
        notes: 'Updated',
        is_user_entered: 1
      });
      cycleAnalyticsService.calculateDiscrepancy.mockReturnValue({
        amount: 100, type: 'higher', description: 'higher'
      });
    });

    it('updates and returns record with discrepancy', async () => {
      const result = await cycleCrudService.updateBillingCycle(1, 10, {
        actual_statement_balance: 300,
        minimum_payment: 30,
        notes: 'Updated'
      });

      expect(result.actual_statement_balance).toBe(300);
      expect(result.discrepancy.amount).toBe(100);
    });

    it('throws NOT_FOUND when cycle does not exist', async () => {
      billingCycleRepository.findById.mockResolvedValue(null);

      await expect(cycleCrudService.updateBillingCycle(1, 999, { actual_statement_balance: 100 }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws VALIDATION_ERROR when cycle belongs to different payment method', async () => {
      billingCycleRepository.findById.mockResolvedValue({ ...existingCycle, payment_method_id: 99 });

      await expect(cycleCrudService.updateBillingCycle(1, 10, { actual_statement_balance: 100 }))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringContaining('does not belong') });
    });

    it('throws VALIDATION_ERROR when actual_statement_balance is negative', async () => {
      await expect(cycleCrudService.updateBillingCycle(1, 10, { actual_statement_balance: -5 }))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('throws VALIDATION_ERROR when actual_statement_balance is not a number', async () => {
      await expect(cycleCrudService.updateBillingCycle(1, 10, { actual_statement_balance: 'bad' }))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('passes statement_pdf_path when provided', async () => {
      await cycleCrudService.updateBillingCycle(1, 10, {
        actual_statement_balance: 300,
        statement_pdf_path: '/uploads/stmt.pdf'
      });

      expect(billingCycleRepository.update).toHaveBeenCalledWith(10,
        expect.objectContaining({ statement_pdf_path: '/uploads/stmt.pdf' })
      );
    });

    it('logs activity event with changes array', async () => {
      await cycleCrudService.updateBillingCycle(1, 10, {
        actual_statement_balance: 300,
        minimum_payment: 30,
        notes: 'Updated'
      });

      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'billing_cycle_updated',
        'billing_cycle',
        10,
        expect.stringContaining('Test Visa'),
        expect.objectContaining({
          changes: expect.arrayContaining([
            expect.objectContaining({ field: 'actual_statement_balance', from: 250, to: 300 }),
            expect.objectContaining({ field: 'minimum_payment', from: 25, to: 30 }),
            expect.objectContaining({ field: 'notes', from: 'Original', to: 'Updated' })
          ])
        })
      );
    });

    it('does not throw when activity logging fails', async () => {
      activityLogService.logEvent.mockRejectedValue(new Error('Log failed'));

      const result = await cycleCrudService.updateBillingCycle(1, 10, { actual_statement_balance: 300 });
      expect(result.actual_statement_balance).toBe(300);
    });

    it('throws UPDATE_FAILED when repository update returns null', async () => {
      billingCycleRepository.update.mockResolvedValue(null);

      await expect(cycleCrudService.updateBillingCycle(1, 10, { actual_statement_balance: 300 }))
        .rejects.toMatchObject({ code: 'UPDATE_FAILED' });
    });
  });


  // ─── deleteBillingCycle ──────────────────────────────────────────────

  describe('deleteBillingCycle', () => {
    const existingCycle = {
      id: 10,
      payment_method_id: 1,
      cycle_end_date: '2025-02-15'
    };

    beforeEach(() => {
      paymentMethodRepository.findById.mockResolvedValue(validCreditCard);
      billingCycleRepository.findById.mockResolvedValue(existingCycle);
      billingCycleRepository.delete.mockResolvedValue(true);
    });

    it('deletes the cycle and returns true', async () => {
      const result = await cycleCrudService.deleteBillingCycle(1, 10);

      expect(result).toBe(true);
      expect(billingCycleRepository.delete).toHaveBeenCalledWith(10);
    });

    it('throws NOT_FOUND when cycle does not exist', async () => {
      billingCycleRepository.findById.mockResolvedValue(null);

      await expect(cycleCrudService.deleteBillingCycle(1, 999))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws VALIDATION_ERROR when cycle belongs to different payment method', async () => {
      billingCycleRepository.findById.mockResolvedValue({ ...existingCycle, payment_method_id: 99 });

      await expect(cycleCrudService.deleteBillingCycle(1, 10))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringContaining('does not belong') });
    });

    it('logs activity event after deletion', async () => {
      await cycleCrudService.deleteBillingCycle(1, 10);

      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'billing_cycle_deleted',
        'billing_cycle',
        10,
        expect.stringContaining('Test Visa'),
        expect.objectContaining({
          paymentMethodId: 1,
          cycleEndDate: '2025-02-15',
          cardName: 'Test Visa'
        })
      );
    });

    it('does not throw when activity logging fails', async () => {
      activityLogService.logEvent.mockRejectedValue(new Error('Log failed'));

      const result = await cycleCrudService.deleteBillingCycle(1, 10);
      expect(result).toBe(true);
    });
  });
});

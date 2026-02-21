/**
 * Unit Tests for Simplified BillingCycleSchedulerService
 * Feature: billing-cycle-api-optimization
 *
 * Tests the current-date-only scheduler model that delegates gap recovery
 * to CycleGenerationService instead of iterating through date ranges.
 *
 * _Requirements: 1.2, 1.4, 1.5, 1.6, 1.7, 1.9_
 */

jest.mock('./activityLogService');
jest.mock('./timeBoundaryService');
jest.mock('./cycleGenerationService');
jest.mock('../repositories/billingCycleRepository');
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const billingCycleSchedulerService = require('./billingCycleSchedulerService');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const cycleGenerationService = require('./cycleGenerationService');
const activityLogService = require('./activityLogService');
const timeBoundaryService = require('./timeBoundaryService');
const logger = require('../config/logger');

describe('BillingCycleSchedulerService - Simplified Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks for TimeBoundaryService
    timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
    timeBoundaryService.getBusinessDate.mockReturnValue('2026-03-15');
    timeBoundaryService.localDateToUTC.mockImplementation((d) => new Date(d + 'T05:00:00Z'));

    // Default mocks
    activityLogService.logEvent.mockResolvedValue(undefined);
    billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);
    billingCycleRepository.create.mockImplementation(async (data) => ({ id: 1, ...data }));
    cycleGenerationService.getMissingCyclePeriods.mockResolvedValue([]);
    cycleGenerationService.calculateCycleBalance.mockResolvedValue({
      calculatedBalance: 100,
      previousBalance: 0,
      totalExpenses: 100,
      totalPayments: 0
    });

    billingCycleSchedulerService.isRunning = false;
  });

  afterEach(() => {
    billingCycleSchedulerService.isRunning = false;
  });

  // ─── Requirement 1.2: Single business date processing ───

  describe('runAutoGeneration - single date processing (Req 1.2)', () => {
    test('calls getCreditCardsNeedingBillingCycleEntry exactly once with current business date', async () => {
      const utcNow = new Date('2026-03-15T14:00:00Z');
      timeBoundaryService.getBusinessDate.mockReturnValue('2026-03-15');
      timeBoundaryService.localDateToUTC.mockReturnValue(new Date('2026-03-15T05:00:00Z'));

      await billingCycleSchedulerService.runAutoGeneration(utcNow);

      expect(billingCycleRepository.getCreditCardsNeedingBillingCycleEntry).toHaveBeenCalledTimes(1);
      expect(billingCycleRepository.getCreditCardsNeedingBillingCycleEntry).toHaveBeenCalledWith(
        new Date('2026-03-15T05:00:00Z')
      );
    });

    test('uses TimeBoundaryService to determine business date from UTC time', async () => {
      const utcNow = new Date('2026-06-01T03:30:00Z');

      await billingCycleSchedulerService.runAutoGeneration(utcNow);

      expect(timeBoundaryService.getBusinessTimezone).toHaveBeenCalledTimes(1);
      expect(timeBoundaryService.getBusinessDate).toHaveBeenCalledWith(utcNow, 'America/Toronto');
    });
  });

  // ─── Requirement 1.4: Delegation to CycleGenerationService ───

  describe('processCard - CycleGenerationService delegation (Req 1.4)', () => {
    test('delegates to CycleGenerationService.getMissingCyclePeriods with monthsBack=24', async () => {
      const card = { id: 5, display_name: 'Visa', billing_cycle_day: 15 };
      const refDate = new Date('2026-03-15T05:00:00Z');

      cycleGenerationService.getMissingCyclePeriods.mockResolvedValue([]);

      await billingCycleSchedulerService.processCard(card, refDate);

      expect(cycleGenerationService.getMissingCyclePeriods).toHaveBeenCalledWith(5, 15, refDate, 24);
    });

    test('delegates to CycleGenerationService.calculateCycleBalance for each missing period', async () => {
      const card = { id: 7, display_name: 'Amex', billing_cycle_day: 20 };
      const refDate = new Date('2026-03-20T05:00:00Z');

      cycleGenerationService.getMissingCyclePeriods.mockResolvedValue([
        { startDate: '2026-02-21', endDate: '2026-03-20' }
      ]);
      cycleGenerationService.calculateCycleBalance.mockResolvedValue({
        calculatedBalance: 250.50,
        previousBalance: 0,
        totalExpenses: 250.50,
        totalPayments: 0
      });

      await billingCycleSchedulerService.processCard(card, refDate);

      expect(cycleGenerationService.calculateCycleBalance).toHaveBeenCalledWith(7, '2026-02-21', '2026-03-20');
    });

    test('creates billing cycle record with correct data from CycleGenerationService', async () => {
      const card = { id: 3, display_name: 'MC', billing_cycle_day: 10 };
      const refDate = new Date('2026-03-10T05:00:00Z');

      cycleGenerationService.getMissingCyclePeriods.mockResolvedValue([
        { startDate: '2026-02-11', endDate: '2026-03-10' }
      ]);
      cycleGenerationService.calculateCycleBalance.mockResolvedValue({
        calculatedBalance: 475.25,
        previousBalance: 100,
        totalExpenses: 400,
        totalPayments: 24.75
      });

      await billingCycleSchedulerService.processCard(card, refDate);

      expect(billingCycleRepository.create).toHaveBeenCalledWith({
        payment_method_id: 3,
        cycle_start_date: '2026-02-11',
        cycle_end_date: '2026-03-10',
        actual_statement_balance: 0,
        calculated_statement_balance: 475.25,
        minimum_payment: null,
        notes: null,
        statement_pdf_path: null
      });
    });

    test('returns empty array when no missing periods', async () => {
      const card = { id: 1, display_name: 'Visa', billing_cycle_day: 15 };
      cycleGenerationService.getMissingCyclePeriods.mockResolvedValue([]);

      const result = await billingCycleSchedulerService.processCard(card, new Date());

      expect(result).toEqual([]);
      expect(billingCycleRepository.create).not.toHaveBeenCalled();
    });
  });

  // ─── Requirement 1.5: isRunning lock ───

  describe('isRunning lock prevents concurrent execution (Req 1.5)', () => {
    test('returns skipped result when lock is held', async () => {
      billingCycleSchedulerService.isRunning = true;

      const result = await billingCycleSchedulerService.runAutoGeneration(new Date());

      expect(result).toEqual({ generatedCount: 0, errors: [], skipped: true });
      expect(billingCycleRepository.getCreditCardsNeedingBillingCycleEntry).not.toHaveBeenCalled();
    });

    test('releases lock after successful run', async () => {
      await billingCycleSchedulerService.runAutoGeneration(new Date());

      expect(billingCycleSchedulerService.isRunning).toBe(false);
    });

    test('releases lock after failed run', async () => {
      timeBoundaryService.getBusinessTimezone.mockRejectedValue(new Error('DB down'));

      await expect(billingCycleSchedulerService.runAutoGeneration(new Date())).rejects.toThrow('DB down');

      expect(billingCycleSchedulerService.isRunning).toBe(false);
    });
  });

  // ─── Requirement 1.6: Activity log events ───

  describe('activity log events (Req 1.6)', () => {
    test('logs activity event for each auto-generated cycle', async () => {
      const card = { id: 2, display_name: 'Visa Gold', billing_cycle_day: 15 };

      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([card]);
      cycleGenerationService.getMissingCyclePeriods.mockResolvedValue([
        { startDate: '2026-02-16', endDate: '2026-03-15' }
      ]);
      cycleGenerationService.calculateCycleBalance.mockResolvedValue({
        calculatedBalance: 200,
        previousBalance: 0,
        totalExpenses: 200,
        totalPayments: 0
      });
      billingCycleRepository.create.mockResolvedValue({
        id: 42,
        payment_method_id: 2,
        cycle_start_date: '2026-02-16',
        cycle_end_date: '2026-03-15'
      });

      await billingCycleSchedulerService.runAutoGeneration(new Date('2026-03-15T14:00:00Z'));

      // Per-cycle activity log
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'billing_cycle_auto_generated',
        'billing_cycle',
        42,
        expect.stringContaining('Visa Gold'),
        expect.objectContaining({
          cardName: 'Visa Gold',
          cycleStartDate: '2026-02-16',
          cycleEndDate: '2026-03-15',
          calculatedBalance: 200
        })
      );

      // Summary activity log
      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'billing_cycle_scheduler_run',
        'system',
        null,
        expect.stringContaining('1 cycles generated'),
        expect.objectContaining({ generatedCount: 1, errorCount: 0 })
      );
    });

    test('logs activity error event when card processing fails', async () => {
      const card = { id: 8, display_name: 'Broken Card', billing_cycle_day: 5 };

      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([card]);
      cycleGenerationService.getMissingCyclePeriods.mockRejectedValue(new Error('Service unavailable'));

      await billingCycleSchedulerService.runAutoGeneration(new Date('2026-03-05T14:00:00Z'));

      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'billing_cycle_scheduler_error',
        'system',
        null,
        expect.stringContaining('Broken Card'),
        expect.objectContaining({
          errorMessage: 'Service unavailable',
          cardId: 8
        })
      );
    });
  });

  // ─── Requirement 1.7: Duration warning logging ───

  describe('duration warning logging (Req 1.7)', () => {
    test('logs warning when run exceeds 30 seconds', async () => {
      const originalDateNow = Date.now;
      let callCount = 0;
      Date.now = () => {
        callCount++;
        if (callCount <= 1) return 1000000;
        return 1000000 + 31000; // 31 seconds later
      };

      await billingCycleSchedulerService.runAutoGeneration(new Date('2026-03-15T14:00:00Z'));

      Date.now = originalDateNow;

      expect(logger.warn).toHaveBeenCalledWith(
        'Billing cycle scheduler: run exceeded duration threshold',
        expect.objectContaining({ thresholdMs: 30000 })
      );
    });

    test('does not log warning when run completes within 30 seconds', async () => {
      await billingCycleSchedulerService.runAutoGeneration(new Date('2026-03-15T14:00:00Z'));

      expect(logger.warn).not.toHaveBeenCalledWith(
        'Billing cycle scheduler: run exceeded duration threshold',
        expect.anything()
      );
    });
  });

  // ─── Requirement 1.9: UNIQUE constraint error handling ───

  describe('UNIQUE constraint error handling (Req 1.9)', () => {
    test('skips UNIQUE constraint errors and continues processing', async () => {
      const card = { id: 4, display_name: 'Visa', billing_cycle_day: 15 };

      cycleGenerationService.getMissingCyclePeriods.mockResolvedValue([
        { startDate: '2026-01-16', endDate: '2026-02-15' },
        { startDate: '2026-02-16', endDate: '2026-03-15' }
      ]);
      cycleGenerationService.calculateCycleBalance.mockResolvedValue({
        calculatedBalance: 100,
        previousBalance: 0,
        totalExpenses: 100,
        totalPayments: 0
      });

      // First create fails with UNIQUE, second succeeds
      billingCycleRepository.create
        .mockRejectedValueOnce(new Error('UNIQUE constraint failed'))
        .mockResolvedValueOnce({ id: 99, payment_method_id: 4 });

      const result = await billingCycleSchedulerService.processCard(card, new Date());

      // Only the second cycle should be in the result
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(99);
    });

    test('re-throws non-UNIQUE errors', async () => {
      const card = { id: 4, display_name: 'Visa', billing_cycle_day: 15 };

      cycleGenerationService.getMissingCyclePeriods.mockResolvedValue([
        { startDate: '2026-01-16', endDate: '2026-02-15' }
      ]);
      cycleGenerationService.calculateCycleBalance.mockResolvedValue({
        calculatedBalance: 100,
        previousBalance: 0,
        totalExpenses: 100,
        totalPayments: 0
      });
      billingCycleRepository.create.mockRejectedValue(new Error('Disk full'));

      await expect(
        billingCycleSchedulerService.processCard(card, new Date())
      ).rejects.toThrow('Disk full');
    });
  });

  // ─── Removed methods no longer exist ───

  describe('removed methods no longer exist', () => {
    test('getDateRange method does not exist', () => {
      expect(billingCycleSchedulerService.getDateRange).toBeUndefined();
    });

    test('_addOneDay method does not exist', () => {
      expect(billingCycleSchedulerService._addOneDay).toBeUndefined();
    });
  });

  // ─── Integration: full run with multiple cards ───

  describe('full run integration', () => {
    test('processes multiple cards and accumulates generated count', async () => {
      const cards = [
        { id: 1, display_name: 'Visa', billing_cycle_day: 15 },
        { id: 2, display_name: 'MC', billing_cycle_day: 20 }
      ];

      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue(cards);

      cycleGenerationService.getMissingCyclePeriods
        .mockResolvedValueOnce([{ startDate: '2026-02-16', endDate: '2026-03-15' }])
        .mockResolvedValueOnce([
          { startDate: '2026-01-21', endDate: '2026-02-20' },
          { startDate: '2026-02-21', endDate: '2026-03-20' }
        ]);

      cycleGenerationService.calculateCycleBalance.mockResolvedValue({
        calculatedBalance: 100,
        previousBalance: 0,
        totalExpenses: 100,
        totalPayments: 0
      });

      let createId = 1;
      billingCycleRepository.create.mockImplementation(async (data) => ({
        id: createId++,
        ...data
      }));

      const result = await billingCycleSchedulerService.runAutoGeneration(new Date('2026-03-20T14:00:00Z'));

      expect(result.generatedCount).toBe(3);
      expect(result.errors).toHaveLength(0);
    });

    test('continues processing remaining cards when one card fails', async () => {
      const cards = [
        { id: 1, display_name: 'Bad Card', billing_cycle_day: 10 },
        { id: 2, display_name: 'Good Card', billing_cycle_day: 20 }
      ];

      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue(cards);

      cycleGenerationService.getMissingCyclePeriods
        .mockRejectedValueOnce(new Error('Card 1 error'))
        .mockResolvedValueOnce([{ startDate: '2026-02-21', endDate: '2026-03-20' }]);

      cycleGenerationService.calculateCycleBalance.mockResolvedValue({
        calculatedBalance: 50,
        previousBalance: 0,
        totalExpenses: 50,
        totalPayments: 0
      });

      billingCycleRepository.create.mockResolvedValue({ id: 10, payment_method_id: 2 });

      const result = await billingCycleSchedulerService.runAutoGeneration(new Date('2026-03-20T14:00:00Z'));

      expect(result.generatedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].cardId).toBe(1);
    });

    test('uses card full_name as fallback when display_name is missing', async () => {
      const card = { id: 3, full_name: 'My Full Card Name', billing_cycle_day: 5 };

      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([card]);
      cycleGenerationService.getMissingCyclePeriods.mockRejectedValue(new Error('fail'));

      await billingCycleSchedulerService.runAutoGeneration(new Date('2026-03-05T14:00:00Z'));

      expect(activityLogService.logEvent).toHaveBeenCalledWith(
        'billing_cycle_scheduler_error',
        'system',
        null,
        expect.stringContaining('My Full Card Name'),
        expect.anything()
      );
    });
  });
});

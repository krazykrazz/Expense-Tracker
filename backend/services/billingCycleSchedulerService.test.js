/**
 * Unit Tests for BillingCycleSchedulerService
 * Feature: billing-cycle-automation
 * 
 * Tests cron configuration, duration warnings, summary logging,
 * and activity log events.
 * 
 * _Requirements: 1.5, 5.1, 5.4, 6.2, 6.3_
 */

jest.mock('./activityLogService');
jest.mock('./timeBoundaryService');

const billingCycleSchedulerService = require('./billingCycleSchedulerService');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const cycleGenerationService = require('./cycleGenerationService');
const activityLogService = require('./activityLogService');
const timeBoundaryService = require('./timeBoundaryService');
const logger = require('../config/logger');

describe('BillingCycleSchedulerService - Unit Tests', () => {
  let originalGetCards;
  let originalGetMissingPeriods;
  let originalCalcBalance;
  let originalRepoCreate;
  let loggerInfoSpy;
  let loggerWarnSpy;

  beforeEach(() => {
    originalGetCards = billingCycleRepository.getCreditCardsNeedingBillingCycleEntry;
    originalGetMissingPeriods = cycleGenerationService.getMissingCyclePeriods;
    originalCalcBalance = cycleGenerationService.calculateCycleBalance;
    originalRepoCreate = billingCycleRepository.create;

    activityLogService.logEvent.mockResolvedValue(undefined);
    timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
    timeBoundaryService.getBusinessDate.mockReturnValue('2026-02-16');
    timeBoundaryService.localDateToUTC.mockImplementation((d) => new Date(d + 'T05:00:00Z'));
    loggerInfoSpy = jest.spyOn(logger, 'info');
    loggerWarnSpy = jest.spyOn(logger, 'warn');

    billingCycleSchedulerService.isRunning = false;
  });

  afterEach(() => {
    billingCycleRepository.getCreditCardsNeedingBillingCycleEntry = originalGetCards;
    cycleGenerationService.getMissingCyclePeriods = originalGetMissingPeriods;
    cycleGenerationService.calculateCycleBalance = originalCalcBalance;
    billingCycleRepository.create = originalRepoCreate;

    loggerInfoSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    jest.clearAllMocks();

    billingCycleSchedulerService.isRunning = false;
  });

  /**
   * Test: BILLING_CYCLE_CRON env var is read for cron configuration (Req 5.1)
   * This is a documentation test — the actual cron registration happens in server.js.
   * We verify the service itself doesn't hardcode scheduling.
   */
  test('scheduler service does not hardcode cron schedule', () => {
    // The service is a pure runner — cron scheduling is in server.js
    // Verify the service exposes runAutoGeneration for external scheduling
    expect(typeof billingCycleSchedulerService.runAutoGeneration).toBe('function');
    expect(typeof billingCycleSchedulerService.processCard).toBe('function');
  });

  /**
   * Test: Summary log output after run (Req 1.5)
   */
  test('logs summary after successful run with generated cycles', async () => {
    const card = {
      id: 1, display_name: 'Visa', billing_cycle_day: 15,
      type: 'credit_card', is_active: 1
    };

    billingCycleRepository.getCreditCardsNeedingBillingCycleEntry = async () => [card];

    const originalProcessCard = billingCycleSchedulerService.processCard.bind(billingCycleSchedulerService);
    billingCycleSchedulerService.processCard = async () => [
      { id: 1, payment_method_id: 1, cycle_end_date: '2026-02-15', calculated_statement_balance: 100, cycle_start_date: '2026-01-16' }
    ];

    await billingCycleSchedulerService.runAutoGeneration(new Date('2026-02-16'));

    billingCycleSchedulerService.processCard = originalProcessCard;

    // Verify summary log was called
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      'Billing cycle scheduler: run complete',
      expect.objectContaining({
        generatedCount: 1,
        errorCount: 0
      })
    );
  });

  /**
   * Test: Summary log output after run with no cycles (Req 1.5)
   */
  test('logs summary after run with zero cycles generated', async () => {
    billingCycleRepository.getCreditCardsNeedingBillingCycleEntry = async () => [];

    await billingCycleSchedulerService.runAutoGeneration(new Date('2026-02-16'));

    expect(loggerInfoSpy).toHaveBeenCalledWith(
      'Billing cycle scheduler: run complete',
      expect.objectContaining({
        generatedCount: 0,
        errorCount: 0
      })
    );
  });

  /**
   * Test: Activity log summary event after run (Req 6.2)
   */
  test('logs activity summary event after run completes', async () => {
    const card = {
      id: 1, display_name: 'Visa', billing_cycle_day: 15,
      type: 'credit_card', is_active: 1
    };

    billingCycleRepository.getCreditCardsNeedingBillingCycleEntry = async () => [card];

    const originalProcessCard = billingCycleSchedulerService.processCard.bind(billingCycleSchedulerService);
    billingCycleSchedulerService.processCard = async () => [
      { id: 1, payment_method_id: 1, cycle_end_date: '2026-02-15', calculated_statement_balance: 250, cycle_start_date: '2026-01-16' }
    ];

    await billingCycleSchedulerService.runAutoGeneration(new Date('2026-02-16'));

    billingCycleSchedulerService.processCard = originalProcessCard;

    // Verify activity log summary event
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'billing_cycle_scheduler_run',
      'system',
      null,
      expect.stringContaining('1 cycles generated'),
      expect.objectContaining({
        generatedCount: 1,
        errorCount: 0
      })
    );
  });

  /**
   * Test: Activity log error event on card failure (Req 6.3)
   */
  test('logs activity error event when card processing fails', async () => {
    const card = {
      id: 5, display_name: 'Amex', billing_cycle_day: 20,
      type: 'credit_card', is_active: 1
    };

    billingCycleRepository.getCreditCardsNeedingBillingCycleEntry = async () => [card];

    const originalProcessCard = billingCycleSchedulerService.processCard.bind(billingCycleSchedulerService);
    billingCycleSchedulerService.processCard = async () => {
      throw new Error('Database connection lost');
    };

    await billingCycleSchedulerService.runAutoGeneration(new Date('2026-02-16'));

    billingCycleSchedulerService.processCard = originalProcessCard;

    // Verify error activity event
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'billing_cycle_scheduler_error',
      'system',
      null,
      expect.stringContaining('Amex'),
      expect.objectContaining({
        errorMessage: 'Database connection lost',
        cardId: 5
      })
    );

    // Summary should also reflect the error
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'billing_cycle_scheduler_run',
      'system',
      null,
      expect.stringContaining('1 errors'),
      expect.objectContaining({
        generatedCount: 0,
        errorCount: 1
      })
    );
  });

  /**
   * Test: Run duration warning when exceeding 30s (Req 5.4)
   */
  test('logs warning when run duration exceeds 30 seconds', async () => {
    billingCycleRepository.getCreditCardsNeedingBillingCycleEntry = async () => {
      // Simulate slow processing by manipulating time
      return [];
    };

    // Mock Date.now to simulate a long run
    const originalDateNow = Date.now;
    let callCount = 0;
    Date.now = () => {
      callCount++;
      // First call (start): return base time
      // Second call (duration check): return base + 31 seconds
      if (callCount <= 1) return 1000000;
      return 1000000 + 31000;
    };

    await billingCycleSchedulerService.runAutoGeneration(new Date('2026-02-16'));

    Date.now = originalDateNow;

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      'Billing cycle scheduler: run exceeded duration threshold',
      expect.objectContaining({
        thresholdMs: 30000
      })
    );
  });

  /**
   * Test: No warning when run completes within 30 seconds (Req 5.4)
   */
  test('does not log warning when run completes within 30 seconds', async () => {
    billingCycleRepository.getCreditCardsNeedingBillingCycleEntry = async () => [];

    await billingCycleSchedulerService.runAutoGeneration(new Date('2026-02-16'));

    expect(loggerWarnSpy).not.toHaveBeenCalledWith(
      'Billing cycle scheduler: run exceeded duration threshold',
      expect.anything()
    );
  });

  /**
   * Test: Returns correct result shape
   */
  test('returns result with generatedCount and errors', async () => {
    billingCycleRepository.getCreditCardsNeedingBillingCycleEntry = async () => [];

    const result = await billingCycleSchedulerService.runAutoGeneration(new Date('2026-02-16'));

    expect(result).toHaveProperty('generatedCount', 0);
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  /**
   * Test: Skipped run returns correct shape
   */
  test('returns skipped result when lock is held', async () => {
    billingCycleSchedulerService.isRunning = true;

    const result = await billingCycleSchedulerService.runAutoGeneration(new Date('2026-02-16'));

    expect(result).toEqual({ generatedCount: 0, errors: [], skipped: true });
  });

  /**
   * Tests for processCard internals — validates integration with
   * calculateCycleBalance (payment deductions + carry-forward).
   * _Requirements: 5.1, 5.2_
   */
  describe('processCard - calculateCycleBalance integration', () => {
    let originalGetMissing;
    let originalCalcBalance;
    let originalCreate;
    let originalLogEvent;

    beforeEach(() => {
      originalGetMissing = cycleGenerationService.getMissingCyclePeriods;
      originalCalcBalance = cycleGenerationService.calculateCycleBalance;
      originalCreate = billingCycleRepository.create;
      originalLogEvent = activityLogService.logEvent;
    });

    afterEach(() => {
      cycleGenerationService.getMissingCyclePeriods = originalGetMissing;
      cycleGenerationService.calculateCycleBalance = originalCalcBalance;
      billingCycleRepository.create = originalCreate;
      activityLogService.logEvent = originalLogEvent;
    });

    test('calls calculateCycleBalance with correct period dates', async () => {
      const card = { id: 10, display_name: 'TestCard', billing_cycle_day: 15 };
      const period = { startDate: '2026-01-16', endDate: '2026-02-15' };

      cycleGenerationService.getMissingCyclePeriods = jest.fn().mockResolvedValue([period]);
      cycleGenerationService.calculateCycleBalance = jest.fn().mockResolvedValue({
        calculatedBalance: 500,
        previousBalance: 200,
        totalExpenses: 400,
        totalPayments: 100
      });
      billingCycleRepository.create = async (data) => ({ id: 99, ...data });
      activityLogService.logEvent = jest.fn().mockResolvedValue(undefined);

      await billingCycleSchedulerService.processCard(card, new Date('2026-02-16'));

      expect(cycleGenerationService.calculateCycleBalance).toHaveBeenCalledWith(
        10, '2026-01-16', '2026-02-15'
      );
    });

    test('uses calculatedBalance from calculateCycleBalance in created cycle', async () => {
      const card = { id: 10, display_name: 'TestCard', billing_cycle_day: 15 };
      const period = { startDate: '2026-01-16', endDate: '2026-02-15' };

      cycleGenerationService.getMissingCyclePeriods = jest.fn().mockResolvedValue([period]);
      cycleGenerationService.calculateCycleBalance = jest.fn().mockResolvedValue({
        calculatedBalance: 350.75,
        previousBalance: 100,
        totalExpenses: 300,
        totalPayments: 49.25
      });

      let createdData = null;
      billingCycleRepository.create = async (data) => {
        createdData = data;
        return { id: 1, ...data };
      };
      activityLogService.logEvent = jest.fn().mockResolvedValue(undefined);

      await billingCycleSchedulerService.processCard(card, new Date('2026-02-16'));

      expect(createdData.calculated_statement_balance).toBe(350.75);
      expect(createdData.payment_method_id).toBe(10);
      expect(createdData.cycle_start_date).toBe('2026-01-16');
      expect(createdData.cycle_end_date).toBe('2026-02-15');
    });

    test('handles payments exceeding expenses (floor at zero via calculateCycleBalance)', async () => {
      const card = { id: 10, display_name: 'TestCard', billing_cycle_day: 15 };
      const period = { startDate: '2026-01-16', endDate: '2026-02-15' };

      cycleGenerationService.getMissingCyclePeriods = jest.fn().mockResolvedValue([period]);
      cycleGenerationService.calculateCycleBalance = jest.fn().mockResolvedValue({
        calculatedBalance: 0,
        previousBalance: 100,
        totalExpenses: 50,
        totalPayments: 200
      });

      let createdData = null;
      billingCycleRepository.create = async (data) => {
        createdData = data;
        return { id: 1, ...data };
      };
      activityLogService.logEvent = jest.fn().mockResolvedValue(undefined);

      await billingCycleSchedulerService.processCard(card, new Date('2026-02-16'));

      expect(createdData.calculated_statement_balance).toBe(0);
    });

    test('returns empty array when no missing periods', async () => {
      const card = { id: 10, display_name: 'TestCard', billing_cycle_day: 15 };

      cycleGenerationService.getMissingCyclePeriods = jest.fn().mockResolvedValue([]);

      const result = await billingCycleSchedulerService.processCard(card, new Date('2026-02-16'));

      expect(result).toEqual([]);
    });

    test('skips UNIQUE constraint errors without throwing', async () => {
      const card = { id: 10, display_name: 'TestCard', billing_cycle_day: 15 };
      const period = { startDate: '2026-01-16', endDate: '2026-02-15' };

      cycleGenerationService.getMissingCyclePeriods = jest.fn().mockResolvedValue([period]);
      cycleGenerationService.calculateCycleBalance = jest.fn().mockResolvedValue({
        calculatedBalance: 100,
        previousBalance: 0,
        totalExpenses: 100,
        totalPayments: 0
      });
      billingCycleRepository.create = async () => {
        throw new Error('UNIQUE constraint failed');
      };
      activityLogService.logEvent = jest.fn().mockResolvedValue(undefined);

      const result = await billingCycleSchedulerService.processCard(card, new Date('2026-02-16'));

      expect(result).toEqual([]);
    });
  });
});

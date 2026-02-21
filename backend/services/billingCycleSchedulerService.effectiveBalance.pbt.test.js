/**
 * Property-Based Tests for Previous Balance Effective Selection
 * Feature: billing-cycle-payment-deduction
 * 
 * Tests that processCard correctly delegates balance calculation to
 * cycleGenerationService.calculateCycleBalance and uses the result.
 * 
 * After the scheduler simplification (billing-cycle-api-optimization),
 * processCard delegates to cycleGenerationService instead of doing
 * inline DB queries. The effective balance selection logic now lives
 * in cycleGenerationService.calculateCycleBalance.
 * 
 * Using fast-check library for property-based testing
 * 
 * **Validates: Requirements 1.1, 1.5, 2.1, 2.5, 3.2**
 *
 * @invariant Effective Balance Delegation: For any billing cycle, processCard delegates
 * balance calculation to cycleGenerationService.calculateCycleBalance and uses the
 * returned calculatedBalance in the created cycle record.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount } = require('../test/pbtArbitraries');

// Mock activityLogService
jest.mock('./activityLogService');

const billingCycleSchedulerService = require('./billingCycleSchedulerService');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const cycleGenerationService = require('./cycleGenerationService');
const activityLogService = require('./activityLogService');

describe('BillingCycleSchedulerService - Previous Balance Effective Selection (Property 2)', () => {
  let originalGetMissing;
  let originalCalcBalance;
  let originalCreate;

  beforeEach(() => {
    originalGetMissing = cycleGenerationService.getMissingCyclePeriods;
    originalCalcBalance = cycleGenerationService.calculateCycleBalance;
    originalCreate = billingCycleRepository.create;
    jest.clearAllMocks();
    activityLogService.logEvent.mockResolvedValue(undefined);
    billingCycleSchedulerService.isRunning = false;
  });

  afterEach(() => {
    cycleGenerationService.getMissingCyclePeriods = originalGetMissing;
    cycleGenerationService.calculateCycleBalance = originalCalcBalance;
    billingCycleRepository.create = originalCreate;
    billingCycleSchedulerService.isRunning = false;
  });

  /**
   * Helper: run processCard with a mocked calculateCycleBalance that returns
   * the given calculatedBalance. Returns the calculated_statement_balance
   * that was passed to billingCycleRepository.create.
   */
  async function runProcessCardWithBalance(calculatedBalance, previousBalance, totalExpenses, totalPayments) {
    const card = {
      id: 1,
      display_name: 'Test Card',
      billing_cycle_day: 15,
      type: 'credit_card',
      is_active: 1
    };

    cycleGenerationService.getMissingCyclePeriods = jest.fn().mockResolvedValue([
      { startDate: '2024-01-16', endDate: '2024-02-15' }
    ]);

    cycleGenerationService.calculateCycleBalance = jest.fn().mockResolvedValue({
      calculatedBalance,
      previousBalance,
      totalExpenses,
      totalPayments
    });

    let createdBalance = null;
    billingCycleRepository.create = jest.fn().mockImplementation(async (data) => {
      createdBalance = data.calculated_statement_balance;
      return { id: 1, ...data };
    });

    await billingCycleSchedulerService.processCard(card, new Date('2024-02-16'));

    return createdBalance;
  }

  /**
   * Property 2: processCard uses the calculatedBalance returned by
   * cycleGenerationService.calculateCycleBalance (which internally handles
   * effective balance selection based on is_user_entered flag).
   * **Validates: Requirements 1.1, 1.5, 2.1, 2.5, 3.2**
   */
  test('Property 2: processCard uses calculatedBalance from cycleGenerationService', async () => {
    await fc.assert(
      fc.asyncProperty(
        // calculatedBalance (the final result from cycleGenerationService)
        safeAmount({ min: 0, max: 10000 }),
        // previousBalance (for context, not directly used by processCard)
        safeAmount({ min: 0, max: 10000 }),
        // totalExpenses
        safeAmount({ min: 0, max: 5000 }),
        // totalPayments
        safeAmount({ min: 0, max: 5000 }),
        async (calculatedBalance, previousBalance, totalExpenses, totalPayments) => {
          const result = await runProcessCardWithBalance(
            calculatedBalance, previousBalance, totalExpenses, totalPayments
          );

          // processCard should use the calculatedBalance from cycleGenerationService directly
          expect(result).toBe(calculatedBalance);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 2: processCard delegates to cycleGenerationService.calculateCycleBalance
   * with the correct period dates from getMissingCyclePeriods.
   * **Validates: Requirements 1.1, 2.1**
   */
  test('Property 2: processCard delegates balance calculation with correct dates', async () => {
    await fc.assert(
      fc.asyncProperty(
        // billing cycle day (1-28)
        fc.integer({ min: 1, max: 28 }),
        // calculatedBalance
        safeAmount({ min: 0, max: 10000 }),
        async (billingCycleDay, calculatedBalance) => {
          const card = {
            id: 1,
            display_name: 'Test Card',
            billing_cycle_day: billingCycleDay,
            type: 'credit_card',
            is_active: 1
          };

          const period = { startDate: '2024-01-16', endDate: '2024-02-15' };

          cycleGenerationService.getMissingCyclePeriods = jest.fn().mockResolvedValue([period]);
          cycleGenerationService.calculateCycleBalance = jest.fn().mockResolvedValue({
            calculatedBalance,
            previousBalance: 0,
            totalExpenses: calculatedBalance,
            totalPayments: 0
          });
          billingCycleRepository.create = jest.fn().mockImplementation(async (data) => ({ id: 1, ...data }));

          await billingCycleSchedulerService.processCard(card, new Date('2024-02-16'));

          expect(cycleGenerationService.calculateCycleBalance).toHaveBeenCalledWith(
            1, '2024-01-16', '2024-02-15'
          );
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 2: When no missing periods exist, processCard returns empty array
   * without calling calculateCycleBalance.
   * **Validates: Requirements 1.5, 2.5**
   */
  test('Property 2: No missing periods skips balance calculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }),
        async (billingCycleDay) => {
          const card = {
            id: 1,
            display_name: 'Test Card',
            billing_cycle_day: billingCycleDay,
            type: 'credit_card',
            is_active: 1
          };

          cycleGenerationService.getMissingCyclePeriods = jest.fn().mockResolvedValue([]);
          cycleGenerationService.calculateCycleBalance = jest.fn();

          const result = await billingCycleSchedulerService.processCard(card, new Date('2024-02-16'));

          expect(result).toEqual([]);
          expect(cycleGenerationService.calculateCycleBalance).not.toHaveBeenCalled();
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 2: Zero balance from cycleGenerationService is preserved in created cycle.
   * **Validates: Requirements 1.5, 2.5**
   */
  test('Property 2: Zero calculated balance is preserved', async () => {
    await fc.assert(
      fc.asyncProperty(
        // totalExpenses
        safeAmount({ min: 0, max: 5000 }),
        // totalPayments (>= totalExpenses to produce zero balance)
        safeAmount({ min: 0, max: 10000 }),
        async (totalExpenses, totalPayments) => {
          const result = await runProcessCardWithBalance(
            0, 0, totalExpenses, totalPayments
          );

          expect(result).toBe(0);
        }
      ),
      pbtOptions()
    );
  });
});

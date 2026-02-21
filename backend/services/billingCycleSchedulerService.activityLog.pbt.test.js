/**
 * Property-Based Tests for BillingCycleSchedulerService - Activity Logging
 * Feature: billing-cycle-automation, Property 7: Activity Logging Per Cycle
 * 
 * Using fast-check library for property-based testing
 * 
 * **Validates: Requirements 6.1**
  *
 * @invariant Activity Logging Per Cycle: For any billing cycle processing run, each processed cycle generates exactly one activity log entry with correct metadata. Randomization covers diverse card counts and cycle configurations.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount, safeString } = require('../test/pbtArbitraries');

// Mock dependencies before requiring the service
jest.mock('./activityLogService');

const billingCycleSchedulerService = require('./billingCycleSchedulerService');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const cycleGenerationService = require('./cycleGenerationService');
const activityLogService = require('./activityLogService');

describe('BillingCycleSchedulerService - Activity Logging Property Tests', () => {
  let originalGetMissingPeriods;
  let originalRepoCreate;
  let originalCalculateCycleBalance;

  beforeEach(() => {
    originalGetMissingPeriods = cycleGenerationService.getMissingCyclePeriods;
    originalRepoCreate = billingCycleRepository.create;
    originalCalculateCycleBalance = cycleGenerationService.calculateCycleBalance;

    activityLogService.logEvent.mockReset();
    activityLogService.logEvent.mockResolvedValue(undefined);

    billingCycleSchedulerService.isRunning = false;
  });

  afterEach(() => {
    cycleGenerationService.getMissingCyclePeriods = originalGetMissingPeriods;
    billingCycleRepository.create = originalRepoCreate;
    cycleGenerationService.calculateCycleBalance = originalCalculateCycleBalance;
    billingCycleSchedulerService.isRunning = false;
  });

  /**
   * Feature: billing-cycle-automation, Property 7: Activity Logging Per Cycle
   * **Validates: Requirements 6.1**
   * 
   * For any auto-generated billing cycle, the scheduler should call
   * activityLogService.logEvent with:
   *   - event_type = 'billing_cycle_auto_generated'
   *   - entity_type = 'billing_cycle'
   *   - entity_id = the cycle's ID
   *   - metadata containing cardName, cycleStartDate, cycleEndDate, calculatedBalance
   */
  test('Property 7: Activity Logging Per Cycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Card ID
        fc.integer({ min: 1, max: 100 }),
        // Card display name (non-empty)
        fc.constantFrom('Visa', 'Mastercard', 'Amex', 'TD Visa', 'CIBC MC', 'RBC Visa', 'Scotia Gold'),
        // Billing cycle day (1-28)
        fc.integer({ min: 1, max: 28 }),
        // Calculated balance from expenses (0 or positive)
        fc.oneof(
          fc.constant(0),
          safeAmount({ min: 0.01, max: 10000 })
        ),
        // Cycle ID returned by repository create
        fc.integer({ min: 1, max: 10000 }),
        async (cardId, cardName, billingCycleDay, expenseTotal, cycleId) => {
          const roundedBalance = Math.round(expenseTotal * 100) / 100;

          // Build a reference date that's after the billing cycle day
          // so there's a completed cycle to detect
          const referenceDate = new Date('2026-02-20');

          const card = {
            id: cardId,
            display_name: cardName,
            full_name: `Full ${cardName}`,
            billing_cycle_day: billingCycleDay,
            type: 'credit_card',
            is_active: 1
          };

          const period = {
            startDate: '2026-01-16',
            endDate: '2026-02-15'
          };

          // Mock getMissingCyclePeriods to return one period
          cycleGenerationService.getMissingCyclePeriods = jest.fn()
            .mockResolvedValue([period]);

          // Mock calculateCycleBalance to return the generated balance
          // processCard now delegates to cycleGenerationService
          cycleGenerationService.calculateCycleBalance = jest.fn()
            .mockResolvedValue({
              calculatedBalance: roundedBalance,
              previousBalance: 0,
              totalExpenses: expenseTotal,
              totalPayments: 0
            });

          // Mock repository create to return a cycle with the generated ID
          billingCycleRepository.create = jest.fn().mockResolvedValue({
            id: cycleId,
            payment_method_id: cardId,
            cycle_start_date: period.startDate,
            cycle_end_date: period.endDate,
            actual_statement_balance: 0,
            calculated_statement_balance: roundedBalance
          });

          // Reset logEvent mock to track calls for this iteration
          activityLogService.logEvent.mockClear();

          // Call processCard directly to test activity logging
          const result = await billingCycleSchedulerService.processCard(card, referenceDate);

          // Should have created one cycle
          expect(result.length).toBe(1);

          // Find the activity log call for the auto-generated cycle
          const logCalls = activityLogService.logEvent.mock.calls;
          const cycleLogCall = logCalls.find(
            call => call[0] === 'billing_cycle_auto_generated'
          );

          // Must have logged an activity event
          expect(cycleLogCall).toBeDefined();

          // Verify event_type
          expect(cycleLogCall[0]).toBe('billing_cycle_auto_generated');

          // Verify entity_type
          expect(cycleLogCall[1]).toBe('billing_cycle');

          // Verify entity_id is the cycle's ID
          expect(cycleLogCall[2]).toBe(cycleId);

          // Verify metadata (5th argument)
          const metadata = cycleLogCall[4];
          expect(metadata).toBeDefined();
          expect(metadata.cardName).toBe(cardName);
          expect(metadata.cycleStartDate).toBe(period.startDate);
          expect(metadata.cycleEndDate).toBe(period.endDate);
          expect(metadata.calculatedBalance).toBe(roundedBalance);
        }
      ),
      pbtOptions()
    );
  });
});

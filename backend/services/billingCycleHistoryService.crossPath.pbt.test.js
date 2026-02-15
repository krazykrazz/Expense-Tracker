/**
 * Property-Based Tests for Cross-Path Consistency
 * Feature: billing-cycle-payment-deduction
 * 
 * Verifies that all three calculation paths (scheduler processCard,
 * history autoGenerateBillingCycles, and recalculateBalance) produce
 * the same calculated_statement_balance for identical inputs.
 * 
 * Using fast-check library for property-based testing
 * 
 * **Validates: Requirements 4.1, 4.2**
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// Mock the database module before requiring services
jest.mock('../database/db', () => ({
  getDatabase: jest.fn()
}));

// Mock the billing cycle repository
jest.mock('../repositories/billingCycleRepository');

// Mock activityLogService
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const billingCycleHistoryService = require('./billingCycleHistoryService');
const billingCycleSchedulerService = require('./billingCycleSchedulerService');
const activityLogService = require('./activityLogService');

/**
 * Arbitrary for a monetary amount rounded to 2 decimal places.
 */
const moneyArb = fc.float({ min: Math.fround(0), max: Math.fround(50000), noNaN: true })
  .map(n => Math.round(n * 100) / 100);

/**
 * Arbitrary for a previous cycle record (or null for no previous cycle).
 * Generates various combinations of is_user_entered, actual, and calculated balances.
 */
const previousCycleArb = fc.oneof(
  // No previous cycle
  fc.constant(null),
  // User-entered cycle
  fc.record({
    actual_statement_balance: moneyArb,
    calculated_statement_balance: moneyArb,
    is_user_entered: fc.constant(1)
  }),
  // Auto-generated cycle (actual = 0)
  fc.record({
    actual_statement_balance: fc.constant(0),
    calculated_statement_balance: moneyArb,
    is_user_entered: fc.constant(0)
  }),
  // Legacy cycle (non-user-entered but non-zero actual)
  fc.record({
    actual_statement_balance: fc.float({ min: Math.fround(0.01), max: Math.fround(50000), noNaN: true })
      .map(n => Math.round(n * 100) / 100),
    calculated_statement_balance: moneyArb,
    is_user_entered: fc.constant(0)
  })
);

/**
 * Sets up mock database to return controlled expense and payment totals.
 */
function setupMockDb(totalExpenses, totalPayments) {
  const mockDb = {
    get: jest.fn((sql, params, callback) => {
      if (sql.includes('expenses')) {
        callback(null, { total: totalExpenses });
      } else if (sql.includes('credit_card_payments')) {
        callback(null, { total: totalPayments });
      }
    })
  };
  getDatabase.mockResolvedValue(mockDb);
  return mockDb;
}

describe('BillingCycleHistoryService - Cross-Path Consistency (Property 4)', () => {
  const CYCLE_START = '2024-01-16';
  const CYCLE_END = '2024-02-15';
  const PAYMENT_METHOD_ID = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    activityLogService.logEvent.mockResolvedValue(undefined);
    billingCycleSchedulerService.isRunning = false;
  });

  /**
   * Run recalculateBalance and return the calculated balance.
   */
  async function runRecalculateBalance(previousCycle, totalExpenses, totalPayments) {
    setupMockDb(totalExpenses, totalPayments);
    billingCycleRepository.findPreviousCycle.mockResolvedValue(previousCycle);

    return await billingCycleHistoryService.recalculateBalance(
      PAYMENT_METHOD_ID, CYCLE_START, CYCLE_END
    );
  }

  /**
   * Run processCard and return the calculated_statement_balance it created.
   */
  async function runProcessCard(previousCycle, totalExpenses, totalPayments) {
    setupMockDb(totalExpenses, totalPayments);
    billingCycleRepository.findPreviousCycle.mockResolvedValue(previousCycle);

    // Mock getMissingCyclePeriods to return exactly one period
    billingCycleHistoryService.getMissingCyclePeriods = jest.fn().mockResolvedValue([
      { startDate: CYCLE_START, endDate: CYCLE_END }
    ]);

    let createdBalance = null;
    billingCycleRepository.create.mockImplementation(async (data) => {
      createdBalance = data.calculated_statement_balance;
      return { id: 1, ...data };
    });

    const card = {
      id: PAYMENT_METHOD_ID,
      display_name: 'Test Card',
      billing_cycle_day: 15,
      type: 'credit_card',
      is_active: 1
    };

    await billingCycleSchedulerService.processCard(card, new Date('2024-02-16'));
    return createdBalance;
  }

  /**
   * Run autoGenerateBillingCycles and return the calculated_statement_balance it created.
   */
  async function runAutoGenerate(previousCycle, totalExpenses, totalPayments) {
    setupMockDb(totalExpenses, totalPayments);
    billingCycleRepository.findPreviousCycle.mockResolvedValue(previousCycle);

    // Mock getMissingCyclePeriods to return exactly one period
    // (autoGenerate reverses the array, so single-element is order-independent)
    const originalGetMissing = billingCycleHistoryService.getMissingCyclePeriods;
    billingCycleHistoryService.getMissingCyclePeriods = jest.fn().mockResolvedValue([
      { startDate: CYCLE_START, endDate: CYCLE_END }
    ]);

    let createdBalance = null;
    billingCycleRepository.create.mockImplementation(async (data) => {
      createdBalance = data.calculated_statement_balance;
      return { id: 1, ...data };
    });

    await billingCycleHistoryService.autoGenerateBillingCycles(
      PAYMENT_METHOD_ID, 15, new Date('2024-02-16')
    );

    // Restore original method
    billingCycleHistoryService.getMissingCyclePeriods = originalGetMissing;

    return createdBalance;
  }

  /**
   * Feature: billing-cycle-payment-deduction, Property 4: Cross-Path Consistency
   * **Validates: Requirements 4.1, 4.2**
   *
   * For any billing cycle period, payment method, and previous cycle state,
   * the calculated statement balance produced by processCard,
   * autoGenerateBillingCycles, and recalculateBalance SHALL all be equal.
   */
  test('Property 4: All three paths produce identical calculated balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        previousCycleArb,
        moneyArb,
        moneyArb,
        async (previousCycle, totalExpenses, totalPayments) => {
          // Run all three paths with identical inputs
          const recalcResult = await runRecalculateBalance(previousCycle, totalExpenses, totalPayments);
          const schedulerResult = await runProcessCard(previousCycle, totalExpenses, totalPayments);
          const autoGenResult = await runAutoGenerate(previousCycle, totalExpenses, totalPayments);

          // All three must produce the same balance
          expect(schedulerResult).toBe(recalcResult);
          expect(autoGenResult).toBe(recalcResult);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 4: Cross-path consistency holds when formula produces zero (floor case).
   * **Validates: Requirements 4.1, 4.2**
   */
  test('Property 4: Cross-path consistency when payments exceed balance + expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        previousCycleArb,
        moneyArb,
        async (previousCycle, totalExpenses) => {
          // Determine the effective previous balance to guarantee overpayment
          const { effectiveBalance } = billingCycleHistoryService.calculateEffectiveBalance(previousCycle);
          const totalPayments = effectiveBalance + totalExpenses + 0.01;

          const recalcResult = await runRecalculateBalance(previousCycle, totalExpenses, totalPayments);
          const schedulerResult = await runProcessCard(previousCycle, totalExpenses, totalPayments);
          const autoGenResult = await runAutoGenerate(previousCycle, totalExpenses, totalPayments);

          // All three must agree and be zero
          expect(recalcResult).toBe(0);
          expect(schedulerResult).toBe(0);
          expect(autoGenResult).toBe(0);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 4: Cross-path consistency with the expected formula value.
   * Verifies all paths match max(0, round(prev + expenses - payments, 2)).
   * **Validates: Requirements 4.1, 4.2**
   */
  test('Property 4: All paths match the canonical formula', async () => {
    await fc.assert(
      fc.asyncProperty(
        previousCycleArb,
        moneyArb,
        moneyArb,
        async (previousCycle, totalExpenses, totalPayments) => {
          const { effectiveBalance } = billingCycleHistoryService.calculateEffectiveBalance(previousCycle);
          const expected = Math.max(0, Math.round((effectiveBalance + totalExpenses - totalPayments) * 100) / 100);

          const recalcResult = await runRecalculateBalance(previousCycle, totalExpenses, totalPayments);
          const schedulerResult = await runProcessCard(previousCycle, totalExpenses, totalPayments);
          const autoGenResult = await runAutoGenerate(previousCycle, totalExpenses, totalPayments);

          expect(recalcResult).toBe(expected);
          expect(schedulerResult).toBe(expected);
          expect(autoGenResult).toBe(expected);
        }
      ),
      pbtOptions()
    );
  });
});

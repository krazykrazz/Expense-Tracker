/**
 * Property-Based Tests for Previous Balance Effective Selection
 * Feature: billing-cycle-payment-deduction
 * 
 * Tests that processCard correctly selects the effective balance from the
 * previous cycle based on is_user_entered flag, and uses it in the formula.
 * 
 * Using fast-check library for property-based testing
 * 
 * **Validates: Requirements 1.1, 1.5, 2.1, 2.5, 3.2**
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// Mock the database module before requiring the service
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

describe('BillingCycleSchedulerService - Previous Balance Effective Selection (Property 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activityLogService.logEvent.mockResolvedValue(undefined);
    billingCycleSchedulerService.isRunning = false;
  });

  /**
   * Helper: set up mocks for processCard with controlled previous cycle, expenses, and payments.
   * Returns the calculated_statement_balance that was passed to billingCycleRepository.create.
   */
  async function runProcessCardWithPreviousCycle(previousCycle, totalExpenses, totalPayments) {
    const card = {
      id: 1,
      display_name: 'Test Card',
      billing_cycle_day: 15,
      type: 'credit_card',
      is_active: 1
    };

    // Mock getMissingCyclePeriods to return one period
    billingCycleHistoryService.getMissingCyclePeriods = jest.fn().mockResolvedValue([
      { startDate: '2024-01-16', endDate: '2024-02-15' }
    ]);

    // Mock database queries for expenses and payments
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

    // Mock findPreviousCycle to return the provided previous cycle
    billingCycleRepository.findPreviousCycle.mockResolvedValue(previousCycle);

    // Capture what gets created
    let createdBalance = null;
    billingCycleRepository.create.mockImplementation(async (data) => {
      createdBalance = data.calculated_statement_balance;
      return { id: 1, ...data };
    });

    await billingCycleSchedulerService.processCard(card, new Date('2024-02-16'));

    return createdBalance;
  }

  /**
   * Feature: billing-cycle-payment-deduction, Property 2: Previous Balance Effective Selection
   * **Validates: Requirements 1.1, 1.5, 2.1, 2.5, 3.2**
   *
   * When is_user_entered === 1, processCard uses actual_statement_balance as the
   * previous balance in the formula, regardless of calculated_statement_balance.
   */
  test('Property 2: User-entered previous cycle uses actual_statement_balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        // actual_statement_balance for user-entered cycle
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // calculated_statement_balance (should be ignored for user-entered)
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // total expenses in current cycle
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // total payments in current cycle
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        async (actualBalance, calculatedBalance, totalExpenses, totalPayments) => {
          const previousCycle = {
            actual_statement_balance: actualBalance,
            calculated_statement_balance: calculatedBalance,
            is_user_entered: 1
          };

          const result = await runProcessCardWithPreviousCycle(
            previousCycle, totalExpenses, totalPayments
          );

          // The formula should use actualBalance (not calculatedBalance)
          const expected = Math.max(0, Math.round((actualBalance + totalExpenses - totalPayments) * 100) / 100);
          expect(result).toBe(expected);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 2: Non-user-entered previous cycle with actual_statement_balance = 0
   * uses calculated_statement_balance.
   * **Validates: Requirements 1.1, 2.1, 3.2**
   */
  test('Property 2: Auto-generated previous cycle (actual=0) uses calculated_statement_balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        // calculated_statement_balance for auto-generated cycle
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // total expenses
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // total payments
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        async (calculatedBalance, totalExpenses, totalPayments) => {
          const previousCycle = {
            actual_statement_balance: 0,
            calculated_statement_balance: calculatedBalance,
            is_user_entered: 0
          };

          const result = await runProcessCardWithPreviousCycle(
            previousCycle, totalExpenses, totalPayments
          );

          // Should use calculatedBalance since actual=0 and not user-entered
          const expected = Math.max(0, Math.round((calculatedBalance + totalExpenses - totalPayments) * 100) / 100);
          expect(result).toBe(expected);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 2: Legacy non-user-entered cycle with non-zero actual_statement_balance
   * uses actual_statement_balance (backward compatibility).
   * **Validates: Requirements 1.1, 2.1, 3.2**
   */
  test('Property 2: Legacy cycle (non-user-entered, actual!=0) uses actual_statement_balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        // actual_statement_balance > 0 (legacy data)
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // calculated_statement_balance (should be ignored due to legacy check)
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // total expenses
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // total payments
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        async (actualBalance, calculatedBalance, totalExpenses, totalPayments) => {
          const previousCycle = {
            actual_statement_balance: actualBalance,
            calculated_statement_balance: calculatedBalance,
            is_user_entered: 0
          };

          const result = await runProcessCardWithPreviousCycle(
            previousCycle, totalExpenses, totalPayments
          );

          // Legacy: non-zero actual on non-user-entered cycle → use actual
          const expected = Math.max(0, Math.round((actualBalance + totalExpenses - totalPayments) * 100) / 100);
          expect(result).toBe(expected);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 2: No previous cycle → effective balance is 0.
   * **Validates: Requirements 1.5, 2.5**
   */
  test('Property 2: No previous cycle uses zero as previous balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        // total expenses
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // total payments
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        async (totalExpenses, totalPayments) => {
          const result = await runProcessCardWithPreviousCycle(
            null, totalExpenses, totalPayments
          );

          // No previous cycle → previousBalance = 0
          const expected = Math.max(0, Math.round((0 + totalExpenses - totalPayments) * 100) / 100);
          expect(result).toBe(expected);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 2: The is_user_entered flag is the primary selector, not the balance values.
   * When is_user_entered=1, actual_statement_balance is used even if it equals 0.
   * **Validates: Requirements 1.1, 2.1, 3.2**
   */
  test('Property 2: User-entered cycle with actual=0 still uses actual (zero) balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        // calculated_statement_balance (should be ignored since user-entered)
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // total expenses
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // total payments
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        async (calculatedBalance, totalExpenses, totalPayments) => {
          const previousCycle = {
            actual_statement_balance: 0,
            calculated_statement_balance: calculatedBalance,
            is_user_entered: 1
          };

          const result = await runProcessCardWithPreviousCycle(
            previousCycle, totalExpenses, totalPayments
          );

          // User-entered with actual=0 → use 0 as previous balance (not calculated)
          const expected = Math.max(0, Math.round((0 + totalExpenses - totalPayments) * 100) / 100);
          expect(result).toBe(expected);
        }
      ),
      pbtOptions()
    );
  });
});

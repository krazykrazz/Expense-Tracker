/**
 * Property-Based Tests for BillingCycleHistoryService Balance Formula Correctness
 * Feature: billing-cycle-payment-deduction
 * 
 * Using fast-check library for property-based testing
 * 
 * **Validates: Requirements 1.3, 1.4, 2.3, 2.4, 3.3, 3.4**
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// Mock the database module before requiring the service
jest.mock('../database/db', () => ({
  getDatabase: jest.fn()
}));

// Mock the billing cycle repository
jest.mock('../repositories/billingCycleRepository');

// Mock activityLogService (imported by the service)
jest.mock('./activityLogService');

const { getDatabase } = require('../database/db');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const billingCycleHistoryService = require('./billingCycleHistoryService');

describe('BillingCycleHistoryService - Balance Formula Correctness (Property 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Feature: billing-cycle-payment-deduction, Property 1: Balance Formula Correctness
   * **Validates: Requirements 1.3, 1.4, 2.3, 2.4, 3.3, 3.4**
   *
   * For any combination of previous effective balance (>= 0), total expenses (>= 0),
   * and total payments (>= 0), the calculated statement balance SHALL equal
   * max(0, round(previousBalance + totalExpenses - totalPayments, 2)).
   * This includes the edge case where payments exceed the sum of previous balance
   * and expenses, in which case the result is zero (Floor_At_Zero).
   */
  test('Property 1: Balance Formula Correctness - recalculateBalance produces correct result', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Previous effective balance (>= 0, up to 50000, rounded to 2 decimals)
        fc.float({ min: Math.fround(0), max: Math.fround(50000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Total expenses (>= 0, up to 50000, rounded to 2 decimals)
        fc.float({ min: Math.fround(0), max: Math.fround(50000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Total payments (>= 0, up to 50000, rounded to 2 decimals)
        fc.float({ min: Math.fround(0), max: Math.fround(50000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        async (previousBalance, totalExpenses, totalPayments) => {
          // Set up mock database that returns controlled expense and payment totals
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

          // Mock findPreviousCycle to return a cycle with the desired effective balance
          // Use a user-entered cycle so calculateEffectiveBalance returns actual_statement_balance
          if (previousBalance === 0) {
            billingCycleRepository.findPreviousCycle.mockResolvedValue(null);
          } else {
            billingCycleRepository.findPreviousCycle.mockResolvedValue({
              actual_statement_balance: previousBalance,
              calculated_statement_balance: 0,
              is_user_entered: 1
            });
          }

          const result = await billingCycleHistoryService.recalculateBalance(
            1, '2024-01-16', '2024-02-15'
          );

          const expected = Math.max(0, Math.round((previousBalance + totalExpenses - totalPayments) * 100) / 100);

          expect(result).toBe(expected);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 1 edge case: payments exceed previous balance + expenses (Floor_At_Zero)
   * **Validates: Requirements 1.4, 2.4, 3.4**
   */
  test('Property 1: Floor at zero when payments exceed balance + expenses', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Previous balance
        fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Total expenses
        fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Overpayment amount (> 0, ensures payments > prev + expenses)
        fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        async (previousBalance, totalExpenses, overpayment) => {
          const totalPayments = previousBalance + totalExpenses + overpayment;

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

          if (previousBalance === 0) {
            billingCycleRepository.findPreviousCycle.mockResolvedValue(null);
          } else {
            billingCycleRepository.findPreviousCycle.mockResolvedValue({
              actual_statement_balance: previousBalance,
              calculated_statement_balance: 0,
              is_user_entered: 1
            });
          }

          const result = await billingCycleHistoryService.recalculateBalance(
            1, '2024-01-16', '2024-02-15'
          );

          // When payments exceed prev + expenses, result must be floored at 0
          expect(result).toBe(0);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 1 edge case: no previous cycle means previousBalance = 0
   * **Validates: Requirements 1.3, 2.3, 3.3**
   */
  test('Property 1: No previous cycle uses zero as previous balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0), max: Math.fround(50000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(0), max: Math.fround(50000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        async (totalExpenses, totalPayments) => {
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

          // No previous cycle
          billingCycleRepository.findPreviousCycle.mockResolvedValue(null);

          const result = await billingCycleHistoryService.recalculateBalance(
            1, '2024-01-16', '2024-02-15'
          );

          const expected = Math.max(0, Math.round((0 + totalExpenses - totalPayments) * 100) / 100);
          expect(result).toBe(expected);
        }
      ),
      pbtOptions()
    );
  });
});

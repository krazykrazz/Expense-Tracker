/**
 * Unit Tests for CycleAnalyticsService
 * Tests calculateDiscrepancy, calculateTrendIndicator, getTransactionCount,
 * and getUnifiedBillingCycles with mocked dependencies.
 *
 * **Validates: Requirements 4.2, 5.3**
 */

jest.mock('../repositories/billingCycleRepository');
jest.mock('./cycleGenerationService');
jest.mock('./cycleCrudService');
jest.mock('../database/db');

const billingCycleRepository = require('../repositories/billingCycleRepository');
const cycleGenerationService = require('./cycleGenerationService');
const cycleCrudService = require('./cycleCrudService');
const { getDatabase } = require('../database/db');

const cycleAnalyticsService = require('./cycleAnalyticsService');

// Mock database helper
const mockDb = {
  get: jest.fn()
};

const validCreditCard = {
  id: 1,
  type: 'credit_card',
  display_name: 'Test Visa',
  billing_cycle_day: 15
};

beforeEach(() => {
  jest.clearAllMocks();
  getDatabase.mockResolvedValue(mockDb);
});

describe('CycleAnalyticsService', () => {
  // ─── calculateDiscrepancy ────────────────────────────────────────────

  describe('calculateDiscrepancy', () => {
    it('returns match when balances are equal', () => {
      const result = cycleAnalyticsService.calculateDiscrepancy(100, 100);
      expect(result).toEqual({
        amount: 0,
        type: 'match',
        description: 'Tracking is accurate'
      });
    });

    it('returns higher when actual exceeds calculated', () => {
      const result = cycleAnalyticsService.calculateDiscrepancy(150, 100);
      expect(result.amount).toBe(50);
      expect(result.type).toBe('higher');
      expect(result.description).toContain('50.00');
      expect(result.description).toContain('higher');
    });

    it('returns lower when actual is less than calculated', () => {
      const result = cycleAnalyticsService.calculateDiscrepancy(80, 100);
      expect(result.amount).toBe(-20);
      expect(result.type).toBe('lower');
      expect(result.description).toContain('20.00');
      expect(result.description).toContain('lower');
    });

    it('rounds to two decimal places', () => {
      const result = cycleAnalyticsService.calculateDiscrepancy(100.333, 100);
      expect(result.amount).toBe(0.33);
    });

    it('handles zero balances', () => {
      const result = cycleAnalyticsService.calculateDiscrepancy(0, 0);
      expect(result.type).toBe('match');
      expect(result.amount).toBe(0);
    });

    it('handles large values', () => {
      const result = cycleAnalyticsService.calculateDiscrepancy(50000, 49000);
      expect(result.amount).toBe(1000);
      expect(result.type).toBe('higher');
    });
  });


  // ─── calculateTrendIndicator ─────────────────────────────────────────

  describe('calculateTrendIndicator', () => {
    it('returns null when previous balance is null', () => {
      expect(cycleAnalyticsService.calculateTrendIndicator(100, null)).toBeNull();
    });

    it('returns null when previous balance is undefined', () => {
      expect(cycleAnalyticsService.calculateTrendIndicator(100, undefined)).toBeNull();
    });

    it('returns same when difference is within $1 tolerance', () => {
      const result = cycleAnalyticsService.calculateTrendIndicator(100.50, 100);
      expect(result.type).toBe('same');
      expect(result.icon).toBe('✓');
      expect(result.amount).toBe(0);
      expect(result.cssClass).toBe('trend-same');
    });

    it('returns same when balances are exactly equal', () => {
      const result = cycleAnalyticsService.calculateTrendIndicator(200, 200);
      expect(result.type).toBe('same');
    });

    it('returns higher when current exceeds previous by more than $1', () => {
      const result = cycleAnalyticsService.calculateTrendIndicator(200, 100);
      expect(result.type).toBe('higher');
      expect(result.icon).toBe('↑');
      expect(result.amount).toBe(100);
      expect(result.cssClass).toBe('trend-higher');
    });

    it('returns lower when current is less than previous by more than $1', () => {
      const result = cycleAnalyticsService.calculateTrendIndicator(50, 200);
      expect(result.type).toBe('lower');
      expect(result.icon).toBe('↓');
      expect(result.amount).toBe(150);
      expect(result.cssClass).toBe('trend-lower');
    });

    it('rounds the difference amount to two decimal places', () => {
      const result = cycleAnalyticsService.calculateTrendIndicator(105.555, 100);
      expect(result.amount).toBe(5.56);
    });

    it('treats $1.00 difference as same', () => {
      const result = cycleAnalyticsService.calculateTrendIndicator(101, 100);
      expect(result.type).toBe('same');
    });

    it('treats $1.01 difference as higher', () => {
      const result = cycleAnalyticsService.calculateTrendIndicator(101.01, 100);
      expect(result.type).toBe('higher');
    });
  });


  // ─── getTransactionCount ─────────────────────────────────────────────

  describe('getTransactionCount', () => {
    it('returns count from database query', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => cb(null, { count: 5 }));

      const result = await cycleAnalyticsService.getTransactionCount(1, '2025-01-16', '2025-02-15');

      expect(result).toBe(5);
    });

    it('returns 0 when no transactions found', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => cb(null, { count: 0 }));

      const result = await cycleAnalyticsService.getTransactionCount(1, '2025-01-16', '2025-02-15');

      expect(result).toBe(0);
    });

    it('returns 0 when row is null', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => cb(null, null));

      const result = await cycleAnalyticsService.getTransactionCount(1, '2025-01-16', '2025-02-15');

      expect(result).toBe(0);
    });

    it('rejects when database query fails', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => cb(new Error('DB error')));

      await expect(cycleAnalyticsService.getTransactionCount(1, '2025-01-16', '2025-02-15'))
        .rejects.toThrow('DB error');
    });

    it('passes correct parameters to SQL query', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        expect(params).toEqual([1, '2025-01-16', '2025-02-15']);
        cb(null, { count: 3 });
      });

      await cycleAnalyticsService.getTransactionCount(1, '2025-01-16', '2025-02-15');
    });
  });


  // ─── getUnifiedBillingCycles ─────────────────────────────────────────

  describe('getUnifiedBillingCycles', () => {
    beforeEach(() => {
      cycleCrudService.validatePaymentMethod.mockResolvedValue(validCreditCard);
      cycleGenerationService.autoGenerateBillingCycles.mockResolvedValue([]);
      cycleGenerationService.recalculateBalance.mockResolvedValue(100);
      billingCycleRepository.findByPaymentMethod.mockResolvedValue([]);
      billingCycleRepository.updateCalculatedBalance.mockResolvedValue(true);
      mockDb.get.mockImplementation((sql, params, cb) => cb(null, { count: 0 }));
    });

    it('validates payment method before proceeding', async () => {
      await cycleAnalyticsService.getUnifiedBillingCycles(1);

      expect(cycleCrudService.validatePaymentMethod).toHaveBeenCalledWith(1);
    });

    it('auto-generates missing cycles by default', async () => {
      await cycleAnalyticsService.getUnifiedBillingCycles(1);

      expect(cycleGenerationService.autoGenerateBillingCycles).toHaveBeenCalledWith(
        1, 15, expect.any(Date)
      );
    });

    it('skips auto-generation when includeAutoGenerate is false', async () => {
      await cycleAnalyticsService.getUnifiedBillingCycles(1, { includeAutoGenerate: false });

      expect(cycleGenerationService.autoGenerateBillingCycles).not.toHaveBeenCalled();
    });

    it('returns empty result when no cycles exist', async () => {
      const result = await cycleAnalyticsService.getUnifiedBillingCycles(1);

      expect(result).toEqual({
        billingCycles: [],
        autoGeneratedCount: 0,
        totalCount: 0
      });
    });

    it('enriches cycles with effective_balance and balance_type', async () => {
      billingCycleRepository.findByPaymentMethod.mockResolvedValue([
        {
          id: 1,
          actual_statement_balance: 500,
          calculated_statement_balance: 450,
          is_user_entered: 1,
          cycle_start_date: '2025-01-16',
          cycle_end_date: '2025-02-15'
        }
      ]);

      const result = await cycleAnalyticsService.getUnifiedBillingCycles(1);

      expect(result.billingCycles[0].effective_balance).toBe(500);
      expect(result.billingCycles[0].balance_type).toBe('actual');
    });

    it('enriches cycles with transaction_count', async () => {
      billingCycleRepository.findByPaymentMethod.mockResolvedValue([
        {
          id: 1,
          actual_statement_balance: 100,
          calculated_statement_balance: 100,
          is_user_entered: 1,
          cycle_start_date: '2025-01-16',
          cycle_end_date: '2025-02-15'
        }
      ]);
      mockDb.get.mockImplementation((sql, params, cb) => cb(null, { count: 7 }));

      const result = await cycleAnalyticsService.getUnifiedBillingCycles(1);

      expect(result.billingCycles[0].transaction_count).toBe(7);
    });

    it('calculates trend_indicator between consecutive cycles', async () => {
      billingCycleRepository.findByPaymentMethod.mockResolvedValue([
        {
          id: 2,
          actual_statement_balance: 300,
          calculated_statement_balance: 300,
          is_user_entered: 1,
          cycle_start_date: '2025-02-16',
          cycle_end_date: '2025-03-15'
        },
        {
          id: 1,
          actual_statement_balance: 100,
          calculated_statement_balance: 100,
          is_user_entered: 1,
          cycle_start_date: '2025-01-16',
          cycle_end_date: '2025-02-15'
        }
      ]);

      const result = await cycleAnalyticsService.getUnifiedBillingCycles(1);

      // First cycle (newest) should have trend compared to second (older)
      expect(result.billingCycles[0].trend_indicator).not.toBeNull();
      expect(result.billingCycles[0].trend_indicator.type).toBe('higher');
      // Last cycle has no previous to compare
      expect(result.billingCycles[1].trend_indicator).toBeNull();
    });

    it('recalculates balance for auto-generated cycles', async () => {
      billingCycleRepository.findByPaymentMethod.mockResolvedValue([
        {
          id: 1,
          actual_statement_balance: 0,
          calculated_statement_balance: 100,
          is_user_entered: 0,
          cycle_start_date: '2025-01-16',
          cycle_end_date: '2025-02-15'
        }
      ]);
      cycleGenerationService.recalculateBalance.mockResolvedValue(150);

      const result = await cycleAnalyticsService.getUnifiedBillingCycles(1);

      expect(cycleGenerationService.recalculateBalance).toHaveBeenCalledWith(
        1, '2025-01-16', '2025-02-15'
      );
      // Balance was updated from 100 to 150
      expect(billingCycleRepository.updateCalculatedBalance).toHaveBeenCalledWith(1, 150, {
        effective_balance: 150,
        balance_type: 'calculated'
      });
    });

    it('does not recalculate balance for user-entered cycles', async () => {
      billingCycleRepository.findByPaymentMethod.mockResolvedValue([
        {
          id: 1,
          actual_statement_balance: 500,
          calculated_statement_balance: 450,
          is_user_entered: 1,
          cycle_start_date: '2025-01-16',
          cycle_end_date: '2025-02-15'
        }
      ]);

      await cycleAnalyticsService.getUnifiedBillingCycles(1);

      expect(cycleGenerationService.recalculateBalance).not.toHaveBeenCalled();
    });

    it('does not update DB when recalculated balance matches existing', async () => {
      billingCycleRepository.findByPaymentMethod.mockResolvedValue([
        {
          id: 1,
          actual_statement_balance: 0,
          calculated_statement_balance: 100,
          is_user_entered: 0,
          cycle_start_date: '2025-01-16',
          cycle_end_date: '2025-02-15'
        }
      ]);
      cycleGenerationService.recalculateBalance.mockResolvedValue(100); // same as existing

      await cycleAnalyticsService.getUnifiedBillingCycles(1);

      expect(billingCycleRepository.updateCalculatedBalance).not.toHaveBeenCalled();
    });

    it('reports autoGeneratedCount from generation service', async () => {
      cycleGenerationService.autoGenerateBillingCycles.mockResolvedValue([
        { id: 10 }, { id: 11 }
      ]);

      const result = await cycleAnalyticsService.getUnifiedBillingCycles(1);

      expect(result.autoGeneratedCount).toBe(2);
    });

    it('passes limit option to repository', async () => {
      await cycleAnalyticsService.getUnifiedBillingCycles(1, { limit: 6 });

      expect(billingCycleRepository.findByPaymentMethod).toHaveBeenCalledWith(1, { limit: 6 });
    });

    it('defaults limit to 12', async () => {
      await cycleAnalyticsService.getUnifiedBillingCycles(1);

      expect(billingCycleRepository.findByPaymentMethod).toHaveBeenCalledWith(1, { limit: 12 });
    });
  });
});

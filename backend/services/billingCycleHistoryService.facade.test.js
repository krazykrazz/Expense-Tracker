/**
 * Facade Tests for billingCycleHistoryService
 * Feature: billing-cycle-simplification, Property 3: Facade behavioral equivalence
 *
 * Verifies that the facade module:
 *   1. Exports all 15 public methods from the original monolithic service
 *   2. Delegates each method to the correct underlying service
 *   3. Forwards arguments and return values without modification
 *
 * **Validates: Requirements 4.5, 4.6, 4.7**
 */

// Mock the three services and the utility BEFORE requiring the facade
jest.mock('./cycleCrudService', () => ({
  validatePaymentMethod: jest.fn(),
  createBillingCycle: jest.fn(),
  getBillingCycleHistory: jest.fn(),
  updateBillingCycle: jest.fn(),
  deleteBillingCycle: jest.fn(),
}));

jest.mock('./cycleAnalyticsService', () => ({
  calculateDiscrepancy: jest.fn(),
  calculateTrendIndicator: jest.fn(),
  getTransactionCount: jest.fn(),
  getUnifiedBillingCycles: jest.fn(),
}));

jest.mock('./cycleGenerationService', () => ({
  calculateCycleBalance: jest.fn(),
  recalculateBalance: jest.fn(),
  getMissingCyclePeriods: jest.fn(),
  autoGenerateBillingCycles: jest.fn(),
  getCurrentCycleStatus: jest.fn(),
}));

jest.mock('../utils/effectiveBalanceUtil', () => ({
  calculateEffectiveBalance: jest.fn(),
}));

const facade = require('./billingCycleHistoryService');
const cycleCrudService = require('./cycleCrudService');
const cycleAnalyticsService = require('./cycleAnalyticsService');
const cycleGenerationService = require('./cycleGenerationService');
const { calculateEffectiveBalance } = require('../utils/effectiveBalanceUtil');

describe('billingCycleHistoryService facade', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Property 3: Facade behavioral equivalence — all 15 methods must be exported
  describe('exports all 15 public methods', () => {
    const expectedMethods = [
      'validatePaymentMethod',
      'createBillingCycle',
      'getBillingCycleHistory',
      'updateBillingCycle',
      'deleteBillingCycle',
      'calculateDiscrepancy',
      'calculateEffectiveBalance',
      'calculateTrendIndicator',
      'getTransactionCount',
      'getUnifiedBillingCycles',
      'calculateCycleBalance',
      'recalculateBalance',
      'getMissingCyclePeriods',
      'autoGenerateBillingCycles',
      'getCurrentCycleStatus',
    ];

    test('facade exports exactly 15 methods', () => {
      const exportedKeys = Object.keys(facade);
      expect(exportedKeys).toHaveLength(15);
    });

    test.each(expectedMethods)('exports %s as a function', (methodName) => {
      expect(typeof facade[methodName]).toBe('function');
    });
  });

  // Property 3: Each method delegates to the correct underlying service
  describe('CRUD delegation to cycleCrudService', () => {
    test('validatePaymentMethod delegates with correct args', async () => {
      const expected = { id: 1, type: 'credit_card', billing_cycle_day: 15 };
      cycleCrudService.validatePaymentMethod.mockResolvedValue(expected);

      const result = await facade.validatePaymentMethod(42);

      expect(cycleCrudService.validatePaymentMethod).toHaveBeenCalledWith(42);
      expect(result).toBe(expected);
    });

    test('createBillingCycle delegates with correct args', async () => {
      const data = { actual_statement_balance: 100 };
      const refDate = new Date('2025-06-01');
      const expected = { id: 10 };
      cycleCrudService.createBillingCycle.mockResolvedValue(expected);

      const result = await facade.createBillingCycle(1, data, refDate);

      expect(cycleCrudService.createBillingCycle).toHaveBeenCalledWith(1, data, refDate);
      expect(result).toBe(expected);
    });

    test('getBillingCycleHistory delegates with correct args', async () => {
      const options = { limit: 5 };
      const expected = [{ id: 1 }];
      cycleCrudService.getBillingCycleHistory.mockResolvedValue(expected);

      const result = await facade.getBillingCycleHistory(1, options);

      expect(cycleCrudService.getBillingCycleHistory).toHaveBeenCalledWith(1, options);
      expect(result).toBe(expected);
    });

    test('updateBillingCycle delegates with correct args', async () => {
      const data = { actual_statement_balance: 200 };
      const expected = { id: 5, actual_statement_balance: 200 };
      cycleCrudService.updateBillingCycle.mockResolvedValue(expected);

      const result = await facade.updateBillingCycle(1, 5, data);

      expect(cycleCrudService.updateBillingCycle).toHaveBeenCalledWith(1, 5, data);
      expect(result).toBe(expected);
    });

    test('deleteBillingCycle delegates with correct args', async () => {
      const expected = { deleted: true };
      cycleCrudService.deleteBillingCycle.mockResolvedValue(expected);

      const result = await facade.deleteBillingCycle(1, 5);

      expect(cycleCrudService.deleteBillingCycle).toHaveBeenCalledWith(1, 5);
      expect(result).toBe(expected);
    });
  });

  describe('Analytics delegation to cycleAnalyticsService', () => {
    test('calculateDiscrepancy delegates with correct args', () => {
      const expected = { amount: 10, type: 'higher', description: 'test' };
      cycleAnalyticsService.calculateDiscrepancy.mockReturnValue(expected);

      const result = facade.calculateDiscrepancy(110, 100);

      expect(cycleAnalyticsService.calculateDiscrepancy).toHaveBeenCalledWith(110, 100);
      expect(result).toBe(expected);
    });

    test('calculateTrendIndicator delegates with correct args', () => {
      const expected = { type: 'higher', icon: '↑', amount: 50, cssClass: 'trend-higher' };
      cycleAnalyticsService.calculateTrendIndicator.mockReturnValue(expected);

      const result = facade.calculateTrendIndicator(150, 100);

      expect(cycleAnalyticsService.calculateTrendIndicator).toHaveBeenCalledWith(150, 100);
      expect(result).toBe(expected);
    });

    test('getTransactionCount delegates with correct args', async () => {
      cycleAnalyticsService.getTransactionCount.mockResolvedValue(7);

      const result = await facade.getTransactionCount(1, '2025-01-01', '2025-01-31');

      expect(cycleAnalyticsService.getTransactionCount).toHaveBeenCalledWith(1, '2025-01-01', '2025-01-31');
      expect(result).toBe(7);
    });

    test('getUnifiedBillingCycles delegates with correct args', async () => {
      const options = { limit: 6, includeAutoGenerate: false };
      const expected = { billingCycles: [], autoGeneratedCount: 0, totalCount: 0 };
      cycleAnalyticsService.getUnifiedBillingCycles.mockResolvedValue(expected);

      const result = await facade.getUnifiedBillingCycles(1, options);

      expect(cycleAnalyticsService.getUnifiedBillingCycles).toHaveBeenCalledWith(1, options);
      expect(result).toBe(expected);
    });
  });

  describe('effectiveBalanceUtil delegation', () => {
    test('calculateEffectiveBalance delegates to utility with correct args', () => {
      const cycle = { is_user_entered: 1, actual_statement_balance: 500, calculated_statement_balance: 400 };
      const expected = { effectiveBalance: 500, balanceType: 'actual' };
      calculateEffectiveBalance.mockReturnValue(expected);

      const result = facade.calculateEffectiveBalance(cycle);

      expect(calculateEffectiveBalance).toHaveBeenCalledWith(cycle);
      expect(result).toBe(expected);
    });

    test('calculateEffectiveBalance handles null input', () => {
      const expected = { effectiveBalance: 0, balanceType: 'calculated' };
      calculateEffectiveBalance.mockReturnValue(expected);

      const result = facade.calculateEffectiveBalance(null);

      expect(calculateEffectiveBalance).toHaveBeenCalledWith(null);
      expect(result).toBe(expected);
    });
  });

  describe('Generation delegation to cycleGenerationService', () => {
    test('calculateCycleBalance delegates with correct args', async () => {
      const expected = { balance: 1234.56 };
      cycleGenerationService.calculateCycleBalance.mockResolvedValue(expected);

      const result = await facade.calculateCycleBalance(1, '2025-01-01', '2025-01-31', null);

      expect(cycleGenerationService.calculateCycleBalance).toHaveBeenCalledWith(1, '2025-01-01', '2025-01-31', null);
      expect(result).toBe(expected);
    });

    test('recalculateBalance delegates with correct args', async () => {
      cycleGenerationService.recalculateBalance.mockResolvedValue(999.99);

      const result = await facade.recalculateBalance(1, '2025-01-01', '2025-01-31');

      expect(cycleGenerationService.recalculateBalance).toHaveBeenCalledWith(1, '2025-01-01', '2025-01-31');
      expect(result).toBe(999.99);
    });

    test('getMissingCyclePeriods delegates with correct args', async () => {
      const refDate = new Date('2025-06-01');
      const expected = [{ startDate: '2025-05-15', endDate: '2025-06-14' }];
      cycleGenerationService.getMissingCyclePeriods.mockResolvedValue(expected);

      const result = await facade.getMissingCyclePeriods(1, 15, refDate, 6);

      expect(cycleGenerationService.getMissingCyclePeriods).toHaveBeenCalledWith(1, 15, refDate, 6);
      expect(result).toBe(expected);
    });

    test('autoGenerateBillingCycles delegates with correct args', async () => {
      const refDate = new Date('2025-06-01');
      const expected = [{ id: 20 }, { id: 21 }];
      cycleGenerationService.autoGenerateBillingCycles.mockResolvedValue(expected);

      const result = await facade.autoGenerateBillingCycles(1, 15, refDate);

      expect(cycleGenerationService.autoGenerateBillingCycles).toHaveBeenCalledWith(1, 15, refDate, expect.objectContaining({
        getMissingCyclePeriods: expect.any(Function),
        calculateCycleBalance: expect.any(Function),
      }));
      expect(result).toBe(expected);
    });

    test('getCurrentCycleStatus delegates with correct args', async () => {
      const refDate = new Date('2025-06-01');
      const expected = { hasActualBalance: false, daysUntilCycleEnd: 10 };
      cycleGenerationService.getCurrentCycleStatus.mockResolvedValue(expected);

      const result = await facade.getCurrentCycleStatus(1, refDate);

      expect(cycleGenerationService.getCurrentCycleStatus).toHaveBeenCalledWith(1, refDate);
      expect(result).toBe(expected);
    });
  });

  // Verify facade is NOT a class (no constructor, no prototype methods)
  describe('facade is a plain module, not a class', () => {
    test('facade is a plain object, not a class constructor', () => {
      expect(typeof facade).toBe('object');
      expect(typeof facade).not.toBe('function');
    });
  });
});

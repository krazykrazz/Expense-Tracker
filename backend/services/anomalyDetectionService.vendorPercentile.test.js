/**
 * Unit tests for vendor-percentile large transaction detection.
 * Tests _detectAmountAnomalies with vendor baselines and cluster exclusion.
 *
 * Requirements: 10.3
 */

const service = require('./anomalyDetectionService');
const {
  DETECTION_THRESHOLDS,
  ANOMALY_CLASSIFICATIONS,
  ANOMALY_TYPES
} = require('../utils/analyticsConstants');

jest.mock('./activityLogService');

// Helper: create expenses for a vendor
function makeVendorExpenses(place, amounts, opts = {}) {
  return amounts.map((amount, i) => {
    const d = new Date(opts.startDate || '2024-01-15');
    d.setDate(d.getDate() + i * (opts.intervalDays || 30));
    return {
      id: opts.idStart ? opts.idStart + i : i + 1,
      place,
      amount,
      type: opts.type || 'Dining',
      date: d.toISOString().split('T')[0]
    };
  });
}

describe('AnomalyDetectionService._detectAmountAnomalies (vendor-percentile)', () => {
  describe('detection when amount > p95 and outside clusters', () => {
    test('should flag transaction exceeding vendor p95 when outside clusters', async () => {
      // Build 12 transactions at a vendor with amounts 10-120 (step 10)
      const historicalAmounts = Array.from({ length: 12 }, (_, i) => (i + 1) * 10);
      const allExpenses = makeVendorExpenses('TestStore', historicalAmounts);

      // Build vendor baselines
      service._vendorBaselineCache = service._buildVendorBaselines(allExpenses);
      const baseline = service._vendorBaselineCache.get('teststore');

      // Create a recent expense that exceeds p95 and is outside any cluster
      const recentExpense = {
        id: 999,
        place: 'TestStore',
        amount: 500, // way above p95
        type: 'Dining',
        date: '2025-01-15'
      };

      const anomalies = await service._detectAmountAnomalies([recentExpense], [...allExpenses, recentExpense]);

      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      const match = anomalies.find(a => a.expenseId === 999);
      expect(match).toBeDefined();
      expect(match.anomalyType).toBe(ANOMALY_TYPES.AMOUNT);
      expect(match.reason).toContain('vendor p95');
    });
  });

  describe('suppression when amount is inside a known cluster', () => {
    test('should NOT flag transaction inside a known amount cluster even if above p95', async () => {
      // Create amounts that form a clear cluster at the high end
      // Low cluster: [10, 12, 14], High cluster: [100, 105, 110, 115, 120, 125, 130]
      const amounts = [10, 12, 14, 100, 105, 110, 115, 120, 125, 130];
      const allExpenses = makeVendorExpenses('ClusterStore', amounts);

      service._vendorBaselineCache = service._buildVendorBaselines(allExpenses);
      const baseline = service._vendorBaselineCache.get('clusterstore');

      // A transaction at 128 — above p95 but within the high cluster [100..130]
      const recentExpense = {
        id: 999,
        place: 'ClusterStore',
        amount: 128,
        type: 'Dining',
        date: '2025-01-15'
      };

      const anomalies = await service._detectAmountAnomalies([recentExpense], [...allExpenses, recentExpense]);

      // Should NOT be flagged because 128 is inside the [100, 130] cluster
      const match = anomalies.find(a => a.expenseId === 999);
      expect(match).toBeUndefined();
    });
  });

  describe('fallback to category-level stdDev for vendors with < 10 transactions', () => {
    test('should use category stdDev when vendor has fewer than 10 transactions', async () => {
      // Only 5 transactions at vendor — below MIN_VENDOR_TRANSACTIONS threshold
      const vendorExpenses = makeVendorExpenses('SmallShop', [10, 12, 11, 13, 14]);

      // Add more expenses in the same category from other vendors to build a category baseline
      const otherExpenses = makeVendorExpenses('OtherShop', [10, 11, 12, 13, 14, 15], {
        idStart: 100,
        type: 'Dining'
      });

      const allExpenses = [...vendorExpenses, ...otherExpenses];
      service._vendorBaselineCache = service._buildVendorBaselines(allExpenses);

      // Mock calculateCategoryBaseline to return a known baseline
      const originalCalc = service.calculateCategoryBaseline.bind(service);
      service.calculateCategoryBaseline = jest.fn().mockResolvedValue({
        category: 'Dining',
        mean: 12,
        stdDev: 1.5,
        count: 11,
        monthsWithData: 6,
        hasValidBaseline: true,
        monthlyAverages: {},
        transactionCounts: {}
      });

      // A transaction that's > 3 stdDevs above category mean (12 + 3*1.5 = 16.5)
      const recentExpense = {
        id: 999,
        place: 'SmallShop',
        amount: 50, // way above 16.5
        type: 'Dining',
        date: '2025-01-15'
      };

      const anomalies = await service._detectAmountAnomalies([recentExpense], [...allExpenses, recentExpense]);

      expect(service.calculateCategoryBaseline).toHaveBeenCalledWith('Dining');
      const match = anomalies.find(a => a.expenseId === 999);
      expect(match).toBeDefined();
      expect(match.anomalyType).toBe(ANOMALY_TYPES.AMOUNT);
      // Should reference standard deviations, not vendor p95
      expect(match.reason).toContain('standard deviations');
    });
  });
});

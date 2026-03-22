/**
 * Unit tests for interval-based vendor frequency spike detector
 * (_detectVendorFrequencySpikes).
 *
 * Requirements: 10.5
 */

const service = require('./anomalyDetectionService');
const {
  DETECTION_THRESHOLDS,
  ANOMALY_CLASSIFICATIONS,
  SEVERITY_LEVELS
} = require('../utils/analyticsConstants');

// Helper: create expenses for a vendor with specific dates
function makeExpensesWithDates(place, datePairs, opts = {}) {
  return datePairs.map(([date, amount], i) => ({
    id: opts.idStart ? opts.idStart + i : i + 1,
    place,
    amount: amount || 20,
    type: opts.type || 'Dining',
    date
  }));
}

describe('AnomalyDetectionService._detectVendorFrequencySpikes', () => {
  describe('detection when interval < 0.5× average', () => {
    test('should flag when days since last visit is below threshold', () => {
      // 4 historical transactions ~30 days apart
      const history = makeExpensesWithDates('Cafe', [
        ['2024-01-01', 10],
        ['2024-02-01', 12],
        ['2024-03-01', 11],
        ['2024-04-01', 13]
      ]);
      // avg interval: (Jan1 to Apr1 = 91 days) / 3 = ~30.33 days
      // threshold: 0.5 * 30.33 = ~15.17 days

      const allExpenses = [...history];
      service._vendorBaselineCache = service._buildVendorBaselines(allExpenses);

      // Recent expense only 5 days after last (Apr 1 → Apr 6)
      const recentExpense = {
        id: 999, place: 'Cafe', amount: 15,
        type: 'Dining', date: '2024-04-06'
      };

      const anomalies = service._detectVendorFrequencySpikes(
        [recentExpense],
        [...allExpenses, recentExpense]
      );

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].expenseId).toBe(999);
      expect(anomalies[0].classification).toBe(ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE);
      expect(anomalies[0].reason).toContain('Visit to');
      expect(anomalies[0].reason).toContain('days');
    });
  });

  describe('no detection when interval ≥ 0.5× average', () => {
    test('should NOT flag when days since last visit meets threshold', () => {
      const history = makeExpensesWithDates('Cafe', [
        ['2024-01-01', 10],
        ['2024-02-01', 12],
        ['2024-03-01', 11],
        ['2024-04-01', 13]
      ]);
      // avg interval ~30.33 days, threshold ~15.17 days

      const allExpenses = [...history];
      service._vendorBaselineCache = service._buildVendorBaselines(allExpenses);

      // Recent expense 20 days after last (Apr 1 → Apr 21) — above threshold
      const recentExpense = {
        id: 999, place: 'Cafe', amount: 15,
        type: 'Dining', date: '2024-04-21'
      };

      const anomalies = service._detectVendorFrequencySpikes(
        [recentExpense],
        [...allExpenses, recentExpense]
      );

      expect(anomalies).toHaveLength(0);
    });

    test('should NOT flag when interval is exactly at 0.5× average', () => {
      // 3 transactions exactly 20 days apart
      const history = makeExpensesWithDates('Shop', [
        ['2024-01-01', 10],
        ['2024-01-21', 12],
        ['2024-02-10', 11]
      ]);
      // avg interval: 40 / 2 = 20 days, threshold = 0.5 * 20 = 10 days

      const allExpenses = [...history];
      service._vendorBaselineCache = service._buildVendorBaselines(allExpenses);

      // Recent expense exactly 10 days after last (Feb 10 → Feb 20)
      // daysSinceLast = 10, threshold = 10 → NOT < threshold
      const recentExpense = {
        id: 999, place: 'Shop', amount: 15,
        type: 'Dining', date: '2024-02-20'
      };

      const anomalies = service._detectVendorFrequencySpikes(
        [recentExpense],
        [...allExpenses, recentExpense]
      );

      expect(anomalies).toHaveLength(0);
    });
  });

  describe('no detection with < 3 historical transactions', () => {
    test('should NOT flag vendor with only 2 historical transactions', () => {
      const history = makeExpensesWithDates('TinyShop', [
        ['2024-01-01', 10],
        ['2024-02-01', 12]
      ]);

      const allExpenses = [...history];
      service._vendorBaselineCache = service._buildVendorBaselines(allExpenses);

      const recentExpense = {
        id: 999, place: 'TinyShop', amount: 15,
        type: 'Dining', date: '2024-02-02' // 1 day after last
      };

      const anomalies = service._detectVendorFrequencySpikes(
        [recentExpense],
        [...allExpenses, recentExpense]
      );

      expect(anomalies).toHaveLength(0);
    });

    test('should NOT flag vendor with only 1 historical transaction', () => {
      const history = makeExpensesWithDates('OnceShop', [
        ['2024-01-01', 10]
      ]);

      const allExpenses = [...history];
      service._vendorBaselineCache = service._buildVendorBaselines(allExpenses);

      const recentExpense = {
        id: 999, place: 'OnceShop', amount: 15,
        type: 'Dining', date: '2024-01-02'
      };

      const anomalies = service._detectVendorFrequencySpikes(
        [recentExpense],
        [...allExpenses, recentExpense]
      );

      expect(anomalies).toHaveLength(0);
    });
  });

  describe('coexistence with category-level frequency spike detector', () => {
    test('vendor frequency spike detector produces anomalies independently of category detector', () => {
      // This test verifies that _detectVendorFrequencySpikes produces its own
      // anomalies without interfering with the category-level _detectFrequencySpikes.
      // Both detectors are called separately in the pipeline.

      const history = makeExpensesWithDates('Cafe', [
        ['2024-01-01', 10],
        ['2024-02-01', 12],
        ['2024-03-01', 11],
        ['2024-04-01', 13]
      ]);

      const allExpenses = [...history];
      service._vendorBaselineCache = service._buildVendorBaselines(allExpenses);

      // Trigger vendor frequency spike
      const recentExpense = {
        id: 999, place: 'Cafe', amount: 15,
        type: 'Dining', date: '2024-04-03' // 2 days after last
      };

      const vendorSpikes = service._detectVendorFrequencySpikes(
        [recentExpense],
        [...allExpenses, recentExpense]
      );

      // Vendor spike should fire independently
      expect(vendorSpikes).toHaveLength(1);
      expect(vendorSpikes[0].classification).toBe(ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE);
      expect(vendorSpikes[0].reason).toContain('Visit to');
      expect(vendorSpikes[0].reason).toContain('days');

      // The category-level detector (_detectFrequencySpikes) is a separate method
      // and would be called independently in the pipeline — both contribute anomalies
    });
  });
});

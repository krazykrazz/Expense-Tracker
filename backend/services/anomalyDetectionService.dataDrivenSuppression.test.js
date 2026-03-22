/**
 * Unit tests for data-driven suppression rules in _suppressBenignPatterns.
 * Tests insufficient vendor history suppression, low category frequency
 * suppression, and preservation of existing rules.
 *
 * Requirements: 10.6
 */

const service = require('./anomalyDetectionService');
const {
  SUPPRESSION_CONFIG,
  SEVERITY_LEVELS,
  ANOMALY_CLASSIFICATIONS
} = require('../utils/analyticsConstants');

// Helper: create a mock anomaly
function makeAnomaly(overrides = {}) {
  return {
    id: overrides.id || Date.now() + Math.random(),
    expenseId: overrides.expenseId != null ? overrides.expenseId : 1,
    date: overrides.date || '2025-01-15',
    place: overrides.place || 'TestMerchant',
    amount: overrides.amount || 100,
    category: overrides.category || 'Dining',
    anomalyType: overrides.anomalyType || 'amount',
    classification: overrides.classification || ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
    severity: overrides.severity || SEVERITY_LEVELS.LOW,
    dismissed: false,
    categoryAverage: 50,
    standardDeviations: 3.5,
    cluster: null,
    reason: overrides.reason || null,
    ...overrides
  };
}

// Helper: create expenses for a category across months
function makeExpenses(category, count, opts = {}) {
  const expenses = [];
  const startYear = opts.startYear || 2023;
  const startMonth = opts.startMonth || 1;
  for (let i = 0; i < count; i++) {
    const month = ((startMonth - 1 + i) % 12) + 1;
    const year = startYear + Math.floor((startMonth - 1 + i) / 12);
    expenses.push({
      id: (opts.idStart || 0) + i + 1,
      date: `${year}-${String(month).padStart(2, '0')}-15`,
      place: opts.place || 'Store',
      amount: opts.amount || 50,
      type: category
    });
  }
  return expenses;
}

describe('AnomalyDetectionService._suppressBenignPatterns (data-driven rules)', () => {
  describe('Rule 4: Insufficient vendor history suppression', () => {
    test('should suppress vendor-level anomaly when vendor has < 10 transactions', () => {
      // Build vendor baseline with 5 transactions
      const vendorExpenses = makeExpenses('Dining', 5, { place: 'SmallCafe' });
      service._vendorBaselineCache = service._buildVendorBaselines(vendorExpenses);

      const anomaly = makeAnomaly({
        place: 'SmallCafe',
        category: 'Dining',
        anomalyType: 'new_spending_tier',
        reason: 'Amount 500 is 10x the historical max'
      });

      const result = service._suppressBenignPatterns([anomaly], vendorExpenses);
      expect(result).toHaveLength(0);
    });

    test('should suppress vendor p95 anomaly when vendor has < 10 transactions', () => {
      const vendorExpenses = makeExpenses('Dining', 5, { place: 'SmallCafe' });
      service._vendorBaselineCache = service._buildVendorBaselines(vendorExpenses);

      const anomaly = makeAnomaly({
        place: 'SmallCafe',
        category: 'Dining',
        anomalyType: 'amount',
        reason: 'Amount 100 exceeds vendor p95 of 50'
      });

      const result = service._suppressBenignPatterns([anomaly], vendorExpenses);
      expect(result).toHaveLength(0);
    });

    test('should suppress vendor frequency spike anomaly when vendor has < 10 transactions', () => {
      const vendorExpenses = makeExpenses('Dining', 5, { place: 'SmallCafe' });
      service._vendorBaselineCache = service._buildVendorBaselines(vendorExpenses);

      const anomaly = makeAnomaly({
        place: 'SmallCafe',
        category: 'Dining',
        anomalyType: 'frequency_spike',
        reason: 'Visit to "SmallCafe" after 2.0 days, below threshold of 15.0 days (avg interval: 30.0 days)'
      });

      // The reason includes 'days since last visit' — check the actual implementation
      // Actually the implementation checks for 'days since last visit' in reason
      // Let me use the exact pattern from the code
      const anomaly2 = makeAnomaly({
        place: 'SmallCafe',
        category: 'Dining',
        anomalyType: 'frequency_spike',
        reason: 'Visit to "SmallCafe" after 2.0 days since last visit'
      });

      const result = service._suppressBenignPatterns([anomaly2], vendorExpenses);
      expect(result).toHaveLength(0);
    });

    test('should NOT suppress when vendor has exactly 10 transactions', () => {
      const vendorExpenses = makeExpenses('Dining', 10, { place: 'BigCafe' });
      service._vendorBaselineCache = service._buildVendorBaselines(vendorExpenses);

      const anomaly = makeAnomaly({
        place: 'BigCafe',
        category: 'Dining',
        anomalyType: 'new_spending_tier',
        reason: 'Amount 500 is 10x the historical max'
      });

      const result = service._suppressBenignPatterns([anomaly], vendorExpenses);
      expect(result).toHaveLength(1);
    });

    test('should NOT suppress category-level anomalies (stdDev fallback) for small vendors', () => {
      const vendorExpenses = makeExpenses('Dining', 5, { place: 'SmallCafe' });
      service._vendorBaselineCache = service._buildVendorBaselines(vendorExpenses);

      // Category-level anomaly uses stdDev reason, not vendor-level
      const anomaly = makeAnomaly({
        place: 'SmallCafe',
        category: 'Dining',
        anomalyType: 'amount',
        reason: 'Amount 100 is 4.5 standard deviations above the category average of 20'
      });

      const result = service._suppressBenignPatterns([anomaly], vendorExpenses);
      // Should NOT be suppressed — it's a category-level detection, not vendor-level
      expect(result).toHaveLength(1);
    });
  });

  describe('Rule 5: Low category frequency suppression', () => {
    test('should suppress anomaly for category with annual frequency < 2', () => {
      // 1 transaction over 2 years → annual frequency = 1/2 = 0.5
      const expenses = [
        { id: 1, date: '2023-01-15', place: 'Store', amount: 50, type: 'Rare' },
        { id: 2, date: '2025-01-15', place: 'Store', amount: 50, type: 'Rare' }
      ];
      // No vendor baseline needed for this rule
      service._vendorBaselineCache = new Map();

      const anomaly = makeAnomaly({
        category: 'Rare',
        anomalyType: 'amount',
        reason: 'Amount 200 is 5.0 standard deviations above the category average'
      });

      const result = service._suppressBenignPatterns([anomaly], expenses);
      expect(result).toHaveLength(0);
    });

    test('should NOT suppress anomaly for category with annual frequency ≥ 2', () => {
      // 10 transactions over 2 years → annual frequency = 10/2 = 5
      const expenses = [];
      for (let i = 0; i < 10; i++) {
        const month = (i % 12) + 1;
        const year = 2023 + Math.floor(i / 12);
        expenses.push({
          id: i + 1,
          date: `${year}-${String(month).padStart(2, '0')}-15`,
          place: 'Store',
          amount: 50,
          type: 'Frequent'
        });
      }
      service._vendorBaselineCache = new Map();

      const anomaly = makeAnomaly({
        category: 'Frequent',
        anomalyType: 'amount'
      });

      const result = service._suppressBenignPatterns([anomaly], expenses);
      expect(result).toHaveLength(1);
    });

    test('should only apply to category-baseline anomaly types (amount, category_spending_spike)', () => {
      // Low frequency category but anomaly type is new_merchant — should NOT be suppressed by Rule 5
      const expenses = [
        { id: 1, date: '2023-01-15', place: 'Store', amount: 50, type: 'Rare' },
        { id: 2, date: '2025-01-15', place: 'Store', amount: 50, type: 'Rare' }
      ];
      service._vendorBaselineCache = new Map();

      const anomaly = makeAnomaly({
        category: 'Rare',
        anomalyType: 'new_merchant' // not in categoryBaselineTypes
      });

      const result = service._suppressBenignPatterns([anomaly], expenses);
      expect(result).toHaveLength(1);
    });
  });

  describe('correct annual frequency calculation', () => {
    test('should compute annual frequency as count / years (min 1 year denominator)', () => {
      // 3 transactions within 6 months → years = max(0.5, 1) = 1 → freq = 3/1 = 3
      const expenses = [
        { id: 1, date: '2024-01-15', place: 'Store', amount: 50, type: 'Short' },
        { id: 2, date: '2024-03-15', place: 'Store', amount: 50, type: 'Short' },
        { id: 3, date: '2024-06-15', place: 'Store', amount: 50, type: 'Short' }
      ];
      service._vendorBaselineCache = new Map();

      const anomaly = makeAnomaly({
        category: 'Short',
        anomalyType: 'amount'
      });

      // Annual frequency = 3 / max(~0.41 years, 1) = 3/1 = 3 ≥ 2 → NOT suppressed
      const result = service._suppressBenignPatterns([anomaly], expenses);
      expect(result).toHaveLength(1);
    });

    test('should suppress when 1 transaction over 1+ years', () => {
      // 1 transaction spanning > 1 year → freq = 1/1 = 1 < 2
      // Actually need at least 1 expense in the category for the rule to fire
      // With a single expense, earliest = latest, so yearsSpanned = max(0, 1) = 1
      // annualFrequency = 1/1 = 1 < 2 → suppressed
      const expenses = [
        { id: 1, date: '2024-01-15', place: 'Store', amount: 50, type: 'VeryRare' }
      ];
      service._vendorBaselineCache = new Map();

      const anomaly = makeAnomaly({
        category: 'VeryRare',
        anomalyType: 'amount'
      });

      const result = service._suppressBenignPatterns([anomaly], expenses);
      expect(result).toHaveLength(0);
    });
  });

  describe('preservation of existing rare-category and seasonal suppression rules', () => {
    test('should still suppress rare-category anomalies (Rule 1)', () => {
      const rareCategory = SUPPRESSION_CONFIG.RARE_PURCHASE_CATEGORIES[0]; // 'Electronics'
      service._vendorBaselineCache = new Map();

      const anomaly = makeAnomaly({
        category: rareCategory,
        anomalyType: 'amount'
      });

      // Only 2 transactions — below MIN_TRANSACTIONS_FOR_RARE (4)
      const expenses = makeExpenses(rareCategory, 2);

      const result = service._suppressBenignPatterns([anomaly], expenses);
      expect(result).toHaveLength(0);
    });

    test('should still suppress seasonal spike anomalies (Rule 2)', () => {
      jest.useFakeTimers({ now: new Date(2025, 11, 15) }); // December

      service._vendorBaselineCache = new Map();

      const anomaly = makeAnomaly({
        category: 'Gifts',
        anomalyType: 'amount'
      });

      // 14 months of data for Gifts
      const expenses = makeExpenses('Gifts', 14, { startYear: 2024, startMonth: 1 });

      const result = service._suppressBenignPatterns([anomaly], expenses);
      expect(result).toHaveLength(0);

      jest.useRealTimers();
    });

    test('existing rules and new rules work together', () => {
      jest.useFakeTimers({ now: new Date(2025, 11, 15) }); // December

      // Rare category anomaly (Rule 1)
      const rareAnomaly = makeAnomaly({
        category: 'Electronics',
        anomalyType: 'amount',
        expenseId: 1
      });

      // Seasonal anomaly (Rule 2)
      const seasonalAnomaly = makeAnomaly({
        category: 'Gifts',
        anomalyType: 'amount',
        expenseId: 2
      });

      // Vendor-level anomaly with insufficient history (Rule 4)
      const vendorExpenses = makeExpenses('Dining', 3, { place: 'TinyCafe' });
      service._vendorBaselineCache = service._buildVendorBaselines(vendorExpenses);

      const vendorAnomaly = makeAnomaly({
        place: 'TinyCafe',
        category: 'Dining',
        anomalyType: 'new_spending_tier',
        reason: 'Amount 500 is 10x the historical max',
        expenseId: 3
      });

      // Normal anomaly that should survive
      const normalAnomaly = makeAnomaly({
        category: 'Groceries',
        anomalyType: 'amount',
        expenseId: 4
      });

      const allExpenses = [
        ...makeExpenses('Electronics', 2),
        ...makeExpenses('Gifts', 14, { startYear: 2024, startMonth: 1, idStart: 100 }),
        ...vendorExpenses,
        ...makeExpenses('Groceries', 20, { idStart: 200 })
      ];

      const result = service._suppressBenignPatterns(
        [rareAnomaly, seasonalAnomaly, vendorAnomaly, normalAnomaly],
        allExpenses
      );

      // Only normalAnomaly should survive
      expect(result).toHaveLength(1);
      expect(result[0].expenseId).toBe(4);

      jest.useRealTimers();
    });
  });
});

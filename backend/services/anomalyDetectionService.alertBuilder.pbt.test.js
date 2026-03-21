/**
 * Property-Based Tests for AnomalyDetectionService — Alert_Builder
 *
 * Property 1: Alert_Builder output field completeness
 * Property 2: Summary text length constraint
 * Property 3: Explanation text length and jargon-free constraint
 * Property 4: Typical range conditional presence
 *
 * Feature: anomaly-alert-ux, Property 1: Alert_Builder output field completeness
 * Feature: anomaly-alert-ux, Property 2: Summary text length constraint
 * Feature: anomaly-alert-ux, Property 3: Explanation text length and jargon-free constraint
 * Feature: anomaly-alert-ux, Property 4: Typical range conditional presence
 *
 * @invariant Alert_Builder Correctness: For any enriched anomaly processed through
 * the Alert_Builder methods, the output contains all required simplified fields
 * (summary non-empty string ≤40 chars, explanationText string ≤120 chars with no
 * statistical jargon, typicalRange string or null, simplifiedClassification string),
 * all existing enriched fields remain present and unmodified, typicalRange is non-null
 * for Large_Transaction/Frequency_Spike/Recurring_Expense_Increase/New_Spending_Tier
 * (when baseline data exists) and null for Emerging_Behavior_Trend/Category_Spending_Spike/
 * Seasonal_Deviation/New_Merchant, and truncated strings end with '…'.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const {
  ANOMALY_CLASSIFICATIONS,
  ALERT_TEXT_LIMITS,
  BEHAVIOR_PATTERNS,
  CONFIDENCE_LEVELS,
  SEVERITY_LEVELS
} = require('../utils/analyticsConstants');

const service = require('./anomalyDetectionService');

// ─── Constants ───
const ALL_CLASSIFICATIONS = Object.values(ANOMALY_CLASSIFICATIONS);
const BEHAVIOR_PATTERN_VALUES = Object.values(BEHAVIOR_PATTERNS);
const CONFIDENCE_VALUES = Object.values(CONFIDENCE_LEVELS);
const SEVERITY_VALUES = Object.values(SEVERITY_LEVELS);

// Types that should return non-null typicalRange (when baseline data present)
const RANGE_TYPES = [
  ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION,
  ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE,
  ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE,
  ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER
];

// Types that should always return null typicalRange
const NULL_RANGE_TYPES = [
  ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND,
  ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE,
  ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION,
  ANOMALY_CLASSIFICATIONS.NEW_MERCHANT
];

// Jargon patterns forbidden in explanation text
const JARGON_PATTERNS = [
  /standard deviation/i,
  /std dev/i,
  /percentile/i,
  /z-score/i,
  /σ/
];

// ─── Generators ───

/** Arbitrary vendor name with varying lengths including very long names */
const arbVendorName = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 8 }).filter(s => s.trim().length > 0).map(s => s.trim()),
  fc.constantFrom('Walmart', 'Costco', 'Amazon', 'Starbucks', 'Netflix', 'Ikea', 'Shell', 'Target'),
  // Long names to test truncation
  fc.string({ minLength: 30, maxLength: 60 }).filter(s => s.trim().length >= 30).map(s => s.trim())
);

/** Arbitrary category name */
const arbCategory = fc.constantFrom(
  'Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing',
  'Gifts', 'Housing', 'Insurance', 'Subscriptions', 'Utilities'
);

/** Arbitrary classification from the 8 types */
const arbClassification = fc.constantFrom(...ALL_CLASSIFICATIONS);

/** Arbitrary enriched anomaly object */
const arbEnrichedAnomaly = fc.record({
  id: fc.integer({ min: 1, max: 100000 }),
  expenseId: fc.integer({ min: 1, max: 100000 }),
  date: fc.constantFrom('2024-01-15', '2024-06-15', '2024-12-01', '2025-03-10'),
  place: arbVendorName,
  amount: fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }).filter(n => isFinite(n) && n >= 1),
  category: arbCategory,
  anomalyType: fc.constantFrom('amount', 'daily_total', 'new_merchant'),
  classification: arbClassification,
  reason: fc.constant('test reason'),
  severity: fc.constantFrom(...SEVERITY_VALUES),
  categoryAverage: fc.oneof(
    fc.constant(null),
    fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 1)
  ),
  standardDeviations: fc.float({ min: Math.fround(1), max: Math.fround(10), noNaN: true }).filter(n => isFinite(n)),
  dismissed: fc.boolean(),
  explanation: fc.record({
    typeLabel: fc.constantFrom('Large Transaction', 'Category Spending Spike', 'New Merchant', 'Frequency Spike'),
    observedValue: fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }).filter(n => isFinite(n) && n >= 1),
    expectedRange: fc.record({
      min: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 0),
      max: fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 1)
    }),
    deviationPercent: fc.float({ min: Math.fround(0), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 0),
    comparisonPeriod: fc.constantFrom('last 12 months', 'all available data (6 months)')
  }),
  historicalContext: fc.record({
    purchaseRank: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
    purchaseRankTotal: fc.option(fc.integer({ min: 1, max: 500 }), { nil: null }),
    percentile: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    deviationFromAverage: fc.float({ min: Math.fround(-100), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n)),
    frequency: fc.option(fc.constantFrom('monthly', 'weekly', 'approximately once every 2 months'), { nil: null })
  }),
  impactEstimate: fc.record({
    annualizedChange: fc.float({ min: Math.fround(-10000), max: Math.fround(50000), noNaN: true }).filter(n => isFinite(n)),
    savingsRateChange: fc.option(fc.float({ min: Math.fround(-50), max: Math.fround(50), noNaN: true }).filter(n => isFinite(n)), { nil: null }),
    budgetImpact: fc.constant(null)
  }),
  behaviorPattern: fc.constantFrom(...BEHAVIOR_PATTERN_VALUES),
  confidence: fc.constantFrom(...CONFIDENCE_VALUES)
});

/** Arbitrary category baseline */
const arbBaseline = fc.record({
  category: arbCategory,
  mean: fc.float({ min: Math.fround(10), max: Math.fround(2000), noNaN: true }).filter(n => isFinite(n) && n >= 10),
  stdDev: fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 1),
  count: fc.integer({ min: 3, max: 100 }),
  monthsWithData: fc.integer({ min: 3, max: 24 }),
  hasValidBaseline: fc.constant(true)
});

/** Arbitrary vendor baseline for populating the cache */
const arbVendorBaseline = fc.record({
  transactionCount: fc.integer({ min: 2, max: 100 }),
  medianAmount: fc.float({ min: Math.fround(5), max: Math.fround(500), noNaN: true }).filter(n => isFinite(n) && n >= 5),
  p25: fc.float({ min: Math.fround(1), max: Math.fround(200), noNaN: true }).filter(n => isFinite(n) && n >= 1),
  p75: fc.float({ min: Math.fround(10), max: Math.fround(1000), noNaN: true }).filter(n => isFinite(n) && n >= 10),
  p95: fc.float({ min: Math.fround(50), max: Math.fround(2000), noNaN: true }).filter(n => isFinite(n) && n >= 50),
  maxAmount: fc.float({ min: Math.fround(10), max: Math.fround(5000), noNaN: true }).filter(n => isFinite(n) && n >= 10),
  avgAmount: fc.float({ min: Math.fround(5), max: Math.fround(1000), noNaN: true }).filter(n => isFinite(n) && n >= 5),
  avgDaysBetweenTransactions: fc.integer({ min: 1, max: 90 }),
  sortedAmounts: fc.constant([10, 20, 30, 40, 50]),
  lastTransactionDate: fc.constant('2024-06-01')
});

// ─── Helpers ───

function setVendorBaseline(vendor, baseline) {
  if (!service._vendorBaselineCache) {
    service._vendorBaselineCache = new Map();
  }
  service._vendorBaselineCache.set(vendor.toLowerCase(), {
    vendor: vendor.toLowerCase(),
    ...baseline
  });
}

// ─── Property 1: Alert_Builder output field completeness ───
// **Validates: Requirements 1.1, 1.6, 14.1**

describe('Property 1: Alert_Builder output field completeness', () => {
  beforeEach(() => {
    service._vendorBaselineCache = new Map();
  });

  it('all required simplified fields present and enriched fields preserved for any anomaly', () => {
    fc.assert(
      fc.property(arbEnrichedAnomaly, arbBaseline, (anomaly, baseline) => {
        // Snapshot enriched field keys and types before builder
        const origExplanationKeys = Object.keys(anomaly.explanation).sort();
        const origHistoricalKeys = Object.keys(anomaly.historicalContext).sort();
        const origImpactKeys = Object.keys(anomaly.impactEstimate).sort();
        const origBehavior = anomaly.behaviorPattern;
        const origConfidence = anomaly.confidence;
        const origClassification = anomaly.classification;
        const origAnomalyType = anomaly.anomalyType;
        const origExplanationTypeLabel = anomaly.explanation.typeLabel;
        const origHistoricalPurchaseRank = anomaly.historicalContext.purchaseRank;

        // Run builder methods
        const summary = service._buildSummaryText(anomaly);
        const explanationText = service._buildExplanationText(anomaly, baseline);
        const typicalRange = service._buildTypicalRange(anomaly);

        // Simplified fields: summary is non-empty string
        expect(typeof summary).toBe('string');
        expect(summary.length).toBeGreaterThan(0);

        // Simplified fields: explanationText is string
        expect(typeof explanationText).toBe('string');

        // Simplified fields: typicalRange is string or null
        expect(typicalRange === null || typeof typicalRange === 'string').toBe(true);

        // Enriched fields remain unmodified (check structure and key values)
        expect(Object.keys(anomaly.explanation).sort()).toEqual(origExplanationKeys);
        expect(Object.keys(anomaly.historicalContext).sort()).toEqual(origHistoricalKeys);
        expect(Object.keys(anomaly.impactEstimate).sort()).toEqual(origImpactKeys);
        expect(anomaly.explanation.typeLabel).toBe(origExplanationTypeLabel);
        expect(anomaly.historicalContext.purchaseRank).toBe(origHistoricalPurchaseRank);
        expect(anomaly.behaviorPattern).toBe(origBehavior);
        expect(anomaly.confidence).toBe(origConfidence);
        expect(anomaly.classification).toBe(origClassification);
        expect(anomaly.anomalyType).toBe(origAnomalyType);
      }),
      pbtOptions()
    );
  });
});

// ─── Property 2: Summary text length constraint ───
// **Validates: Requirements 1.2, 2.7**

describe('Property 2: Summary text length constraint', () => {
  it('summary ≤ 40 chars for any anomaly; truncated summaries end with "…"', () => {
    fc.assert(
      fc.property(arbEnrichedAnomaly, (anomaly) => {
        const summary = service._buildSummaryText(anomaly);
        const maxLen = ALERT_TEXT_LIMITS.SUMMARY_MAX_LENGTH;

        // Length constraint
        expect(summary.length).toBeLessThanOrEqual(maxLen);

        // If at max length, last char must be ellipsis (truncation indicator)
        if (summary.length === maxLen) {
          expect(summary.endsWith('\u2026')).toBe(true);
        }
      }),
      pbtOptions()
    );
  });
});

// ─── Property 3: Explanation text length and jargon-free constraint ───
// **Validates: Requirements 1.3, 3.2, 3.7**

describe('Property 3: Explanation text length and jargon-free constraint', () => {
  beforeEach(() => {
    service._vendorBaselineCache = new Map();
  });

  it('explanationText ≤ 120 chars, no statistical jargon for any anomaly', () => {
    fc.assert(
      fc.property(arbEnrichedAnomaly, arbBaseline, arbVendorBaseline, (anomaly, baseline, vBaseline) => {
        // Set up vendor baseline if vendor is present
        if (anomaly.place && anomaly.place.trim().length > 0) {
          setVendorBaseline(anomaly.place, vBaseline);
        }

        const text = service._buildExplanationText(anomaly, baseline);
        const maxLen = ALERT_TEXT_LIMITS.EXPLANATION_MAX_LENGTH;

        // Length constraint
        expect(text.length).toBeLessThanOrEqual(maxLen);

        // Jargon-free constraint
        for (const pattern of JARGON_PATTERNS) {
          expect(text).not.toMatch(pattern);
        }
      }),
      pbtOptions()
    );
  });
});

// ─── Property 4: Typical range conditional presence ───
// **Validates: Requirements 1.4, 1.5**

describe('Property 4: Typical range conditional presence', () => {
  beforeEach(() => {
    service._vendorBaselineCache = new Map();
  });

  it('non-null for range types with baseline data, null for null-range types', () => {
    // Test types that should return non-null when baseline data exists
    fc.assert(
      fc.property(
        arbEnrichedAnomaly,
        arbVendorBaseline,
        fc.float({ min: Math.fround(5), max: Math.fround(200), noNaN: true }).filter(n => isFinite(n) && n >= 5),
        (anomaly, vBaseline, categoryAvg) => {
          // Only test range types
          fc.pre(RANGE_TYPES.includes(anomaly.classification));

          // Ensure vendor is present for vendor-dependent types
          if (!anomaly.place || anomaly.place.trim().length === 0) {
            anomaly.place = 'TestVendor';
          }

          // Set up vendor baseline
          setVendorBaseline(anomaly.place, vBaseline);

          // Set categoryAverage for Recurring_Expense_Increase
          anomaly.categoryAverage = categoryAvg;

          const range = service._buildTypicalRange(anomaly);
          expect(typeof range).toBe('string');
          expect(range.length).toBeGreaterThan(0);
        }
      ),
      pbtOptions()
    );
  });

  it('null for types that never have typical range', () => {
    fc.assert(
      fc.property(
        arbEnrichedAnomaly,
        arbVendorBaseline,
        (anomaly, vBaseline) => {
          // Only test null-range types
          fc.pre(NULL_RANGE_TYPES.includes(anomaly.classification));

          // Even with vendor baseline present, these types return null
          if (anomaly.place && anomaly.place.trim().length > 0) {
            setVendorBaseline(anomaly.place, vBaseline);
          }

          const range = service._buildTypicalRange(anomaly);
          expect(range).toBeNull();
        }
      ),
      pbtOptions()
    );
  });
});

/**
 * Unit tests for Alert_Builder methods in AnomalyDetectionService.
 * Tests _buildSummaryText, _buildExplanationText, _buildTypicalRange.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1–2.7, 3.1–3.7, 13.1, 14.1, 19.1
 */

const service = require('./anomalyDetectionService');
const {
  ANOMALY_CLASSIFICATIONS,
  ALERT_TEXT_LIMITS,
  BEHAVIOR_PATTERNS,
  CONFIDENCE_LEVELS
} = require('../utils/analyticsConstants');

// ─── Helpers ──────────────────────────────────────────────────────────

/** Build a minimal enriched anomaly object for a given classification. */
function makeAnomaly(classification, overrides = {}) {
  return {
    id: 1,
    expenseId: 100,
    date: '2024-06-15',
    place: overrides.place !== undefined ? overrides.place : 'Walmart',
    amount: overrides.amount || 250,
    category: overrides.category || 'Groceries',
    anomalyType: 'amount',
    classification,
    reason: 'test reason',
    severity: 'medium',
    categoryAverage: overrides.categoryAverage || 50,
    standardDeviations: 3.5,
    dismissed: false,
    explanation: { typeLabel: 'Large Transaction', observedValue: 250, expectedRange: { min: 10, max: 80 }, deviationPercent: 200, comparisonPeriod: '6 months' },
    historicalContext: { purchaseRank: 1, purchaseRankTotal: 50, percentile: 98, deviationFromAverage: 200, frequency: 'monthly' },
    impactEstimate: { annualizedChange: 2400, savingsRateChange: -5, budgetImpact: null },
    behaviorPattern: overrides.behaviorPattern || BEHAVIOR_PATTERNS.ONE_TIME_EVENT,
    confidence: overrides.confidence || CONFIDENCE_LEVELS.HIGH,
    ...overrides
  };
}

/** Set up vendor baseline cache on the service for testing. */
function setVendorBaseline(vendor, baseline) {
  if (!service._vendorBaselineCache) {
    service._vendorBaselineCache = new Map();
  }
  service._vendorBaselineCache.set(vendor.toLowerCase(), {
    vendor: vendor.toLowerCase(),
    transactionCount: baseline.transactionCount || 10,
    medianAmount: baseline.medianAmount || 30,
    p25: baseline.p25 || 10,
    p75: baseline.p75 || 60,
    p95: baseline.p95 || 90,
    maxAmount: baseline.maxAmount || 100,
    avgAmount: baseline.avgAmount || 35,
    avgDaysBetweenTransactions: baseline.avgDaysBetweenTransactions || 14,
    sortedAmounts: baseline.sortedAmounts || [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    lastTransactionDate: '2024-06-01'
  });
}

// ─── _buildSummaryText ─────────────────────────────────────────────

describe('AnomalyDetectionService._buildSummaryText', () => {
  test('Large_Transaction with vendor → "Large purchase at {vendor}"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, { place: 'Costco' });
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('Large purchase at Costco');
  });

  test('Large_Transaction without vendor → "Unusual purchase size"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, { place: '' });
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('Unusual purchase size');
  });

  test('New_Spending_Tier with vendor → "New spending level at {vendor}"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER, { place: 'Amazon' });
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('New spending level at Amazon');
  });

  test('Category_Spending_Spike with category → "{category} spending spike"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE, { category: 'Dining' });
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('Dining spending spike');
  });

  test('Frequency_Spike with vendor → "Frequent visits to {vendor}"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE, { place: 'Starbucks' });
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('Frequent visits to Starbucks');
  });

  test('Frequency_Spike without vendor → "{category} frequency up"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE, { place: '', category: 'Coffee' });
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('Coffee frequency up');
  });

  test('Recurring_Expense_Increase with vendor → "{vendor} cost changed"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE, { place: 'Netflix' });
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('Netflix cost changed');
  });

  test('Recurring_Expense_Increase without vendor → "Subscription price increased"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE, { place: '' });
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('Subscription price increased');
  });

  test('Emerging_Behavior_Trend with category → "{category} spending trend shift"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND, { category: 'Dining' });
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('Dining spending trend shift');
  });

  test('Seasonal_Deviation with category → "{category} seasonal change"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION, { category: 'Gifts' });
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('Gifts seasonal change');
  });

  test('New_Merchant with vendor → "New merchant: {vendor}"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.NEW_MERCHANT, { place: 'Ikea' });
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('New merchant: Ikea');
  });

  test('unknown classification → "Unusual activity detected"', () => {
    const anomaly = makeAnomaly('Unknown_Type');
    const summary = service._buildSummaryText(anomaly);
    expect(summary).toBe('Unusual activity detected');
  });

  // Truncation
  test('long vendor name truncates summary to 40 chars with ellipsis', () => {
    const longVendor = 'The Extremely Long Restaurant Name Here';
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, { place: longVendor });
    const summary = service._buildSummaryText(anomaly);
    expect(summary.length).toBeLessThanOrEqual(ALERT_TEXT_LIMITS.SUMMARY_MAX_LENGTH);
    expect(summary.endsWith('\u2026')).toBe(true);
  });

  test('summary at exactly 40 chars is not truncated', () => {
    // "Large purchase at " = 18 chars, need vendor of 22 chars to hit exactly 40
    const vendor = 'A'.repeat(22);
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, { place: vendor });
    const summary = service._buildSummaryText(anomaly);
    expect(summary.length).toBe(40);
    expect(summary.endsWith('\u2026')).toBe(false);
  });
});

// ─── _buildExplanationText ─────────────────────────────────────────

describe('AnomalyDetectionService._buildExplanationText', () => {
  beforeEach(() => {
    service._vendorBaselineCache = new Map();
  });

  const defaultBaseline = { category: 'Groceries', mean: 200, stdDev: 50, count: 20, monthsWithData: 6, hasValidBaseline: true };

  test('Large_Transaction with vendor baseline → references vendor range', () => {
    setVendorBaseline('Walmart', { p25: 5, p75: 59, transactionCount: 10 });
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, { place: 'Walmart' });
    const text = service._buildExplanationText(anomaly, defaultBaseline);
    expect(text).toContain('typical');
    expect(text).toContain('Walmart');
    expect(text).toContain('5');
    expect(text).toContain('59');
  });

  test('Large_Transaction without vendor baseline → category fallback', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, { place: 'NewStore' });
    const text = service._buildExplanationText(anomaly, defaultBaseline);
    expect(text).toContain('higher than usual');
  });

  test('Category_Spending_Spike with baseline mean → references monthly average', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE, { category: 'Dining' });
    const baseline = { ...defaultBaseline, mean: 200 };
    const text = service._buildExplanationText(anomaly, baseline);
    expect(text).toContain('200');
    expect(text).toContain('Dining');
  });

  test('Category_Spending_Spike without baseline mean → generic fallback', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE, { category: 'Dining' });
    const text = service._buildExplanationText(anomaly, { mean: 0 });
    expect(text).toContain('higher than usual');
  });

  test('Recurring_Expense_Increase with categoryAverage → references previous amount', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE, { categoryAverage: 12.99 });
    const text = service._buildExplanationText(anomaly, defaultBaseline);
    expect(text).toContain('12.99');
    expect(text).toContain('last month');
  });

  test('Recurring_Expense_Increase without categoryAverage → vendor fallback', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE, { categoryAverage: null, place: 'Netflix' });
    const text = service._buildExplanationText(anomaly, defaultBaseline);
    expect(text).toContain('Netflix');
    expect(text).toContain('increased');
  });

  test('Emerging_Behavior_Trend → references gradual increase', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND, { category: 'Groceries' });
    const text = service._buildExplanationText(anomaly, defaultBaseline);
    expect(text).toContain('Groceries');
    expect(text).toContain('gradually increasing');
  });

  test('New_Spending_Tier with vendor baseline → references ratio', () => {
    setVendorBaseline('Amazon', { maxAmount: 50, transactionCount: 10 });
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER, { place: 'Amazon', amount: 200 });
    const text = service._buildExplanationText(anomaly, defaultBaseline);
    expect(text).toContain('Amazon');
    expect(text).toContain('4.0');
    expect(text).toContain('\u00d7');
  });

  test('Frequency_Spike with vendor baseline → references visit interval', () => {
    setVendorBaseline('Starbucks', { avgDaysBetweenTransactions: 7 });
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE, { place: 'Starbucks' });
    const text = service._buildExplanationText(anomaly, defaultBaseline);
    expect(text).toContain('Starbucks');
    expect(text).toContain('7 days');
  });

  test('Frequency_Spike without vendor baseline → generic fallback', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE, { place: 'NewCafe' });
    const text = service._buildExplanationText(anomaly, defaultBaseline);
    expect(text).toContain('more often than usual');
  });

  test('Seasonal_Deviation → references last year', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION, { category: 'Gifts' });
    const text = service._buildExplanationText(anomaly, defaultBaseline);
    expect(text).toContain('Gifts');
    expect(text).toContain('last year');
  });

  test('New_Merchant → "First purchase at {vendor}"', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.NEW_MERCHANT, { place: 'Ikea' });
    const text = service._buildExplanationText(anomaly, defaultBaseline);
    expect(text).toBe('First purchase at Ikea.');
  });

  test('explanation never exceeds 120 characters', () => {
    setVendorBaseline('the very long merchant name that goes on and on', { p25: 5, p75: 59, transactionCount: 10 });
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, {
      place: 'The Very Long Merchant Name That Goes On And On'
    });
    const text = service._buildExplanationText(anomaly, defaultBaseline);
    expect(text.length).toBeLessThanOrEqual(ALERT_TEXT_LIMITS.EXPLANATION_MAX_LENGTH);
  });

  test('explanation does not contain jargon terms', () => {
    setVendorBaseline('Walmart', { p25: 5, p75: 59, transactionCount: 10 });
    const classifications = Object.values(ANOMALY_CLASSIFICATIONS);
    for (const cls of classifications) {
      const anomaly = makeAnomaly(cls, { place: 'Walmart', category: 'Groceries' });
      const text = service._buildExplanationText(anomaly, defaultBaseline);
      expect(text).not.toMatch(/standard deviation/i);
      expect(text).not.toMatch(/std dev/i);
      expect(text).not.toMatch(/percentile/i);
      expect(text).not.toMatch(/z-score/i);
      expect(text).not.toMatch(/σ/);
    }
  });
});

// ─── _buildTypicalRange ───────────────────────────────────────────

describe('AnomalyDetectionService._buildTypicalRange', () => {
  beforeEach(() => {
    service._vendorBaselineCache = new Map();
  });

  test('Large_Transaction with vendor baseline → returns range string', () => {
    setVendorBaseline('Walmart', { p25: 5, p75: 59, transactionCount: 10 });
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, { place: 'Walmart' });
    const range = service._buildTypicalRange(anomaly);
    expect(range).toBe('Typical purchase: $5\u2013$59');
  });

  test('Large_Transaction without vendor baseline → null', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, { place: 'NewStore' });
    const range = service._buildTypicalRange(anomaly);
    expect(range).toBeNull();
  });

  test('New_Spending_Tier with vendor baseline → returns range string', () => {
    setVendorBaseline('Amazon', { p25: 10, p75: 80, transactionCount: 5 });
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER, { place: 'Amazon' });
    const range = service._buildTypicalRange(anomaly);
    expect(range).toBe('Typical purchase: $10\u2013$80');
  });

  test('Frequency_Spike with vendor baseline → returns frequency string', () => {
    setVendorBaseline('Starbucks', { avgDaysBetweenTransactions: 7 });
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE, { place: 'Starbucks' });
    const range = service._buildTypicalRange(anomaly);
    expect(range).toBe('Typical frequency: every 7 days');
  });

  test('Frequency_Spike without vendor baseline → null', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE, { place: 'NewCafe' });
    const range = service._buildTypicalRange(anomaly);
    expect(range).toBeNull();
  });

  test('Recurring_Expense_Increase with categoryAverage → returns previous amount', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE, { categoryAverage: 12.99 });
    const range = service._buildTypicalRange(anomaly);
    expect(range).toBe('Previous amount: $12.99');
  });

  test('Recurring_Expense_Increase without categoryAverage → null', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE, { categoryAverage: null });
    const range = service._buildTypicalRange(anomaly);
    expect(range).toBeNull();
  });

  // Types that always return null
  test('Emerging_Behavior_Trend → null', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND);
    expect(service._buildTypicalRange(anomaly)).toBeNull();
  });

  test('Category_Spending_Spike → null', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE);
    expect(service._buildTypicalRange(anomaly)).toBeNull();
  });

  test('Seasonal_Deviation → null', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION);
    expect(service._buildTypicalRange(anomaly)).toBeNull();
  });

  test('New_Merchant → null', () => {
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.NEW_MERCHANT);
    expect(service._buildTypicalRange(anomaly)).toBeNull();
  });
});

// ─── Error Fallback ───────────────────────────────────────────────

describe('Alert_Builder error fallback', () => {
  test('malformed anomaly with null classification produces safe summary', () => {
    const anomaly = makeAnomaly(null, { place: null, category: null });
    const summary = service._buildSummaryText(anomaly);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.length).toBeLessThanOrEqual(ALERT_TEXT_LIMITS.SUMMARY_MAX_LENGTH);
  });

  test('malformed anomaly with undefined fields produces safe explanation', () => {
    const anomaly = makeAnomaly(undefined);
    const text = service._buildExplanationText(anomaly, null);
    expect(typeof text).toBe('string');
    expect(text.length).toBeLessThanOrEqual(ALERT_TEXT_LIMITS.EXPLANATION_MAX_LENGTH);
  });

  test('malformed anomaly produces null typicalRange', () => {
    const anomaly = makeAnomaly(undefined);
    service._vendorBaselineCache = null;
    const range = service._buildTypicalRange(anomaly);
    expect(range).toBeNull();
  });
});

// ─── Backward Compatibility ───────────────────────────────────────

describe('Alert_Builder backward compatibility', () => {
  beforeEach(() => {
    service._vendorBaselineCache = new Map();
  });

  test('enriched fields remain unchanged after builder runs', () => {
    setVendorBaseline('Walmart', { p25: 5, p75: 59, transactionCount: 10 });
    const anomaly = makeAnomaly(ANOMALY_CLASSIFICATIONS.LARGE_TRANSACTION, { place: 'Walmart' });

    // Snapshot enriched fields before builder
    const originalExplanation = JSON.parse(JSON.stringify(anomaly.explanation));
    const originalHistoricalContext = JSON.parse(JSON.stringify(anomaly.historicalContext));
    const originalImpactEstimate = JSON.parse(JSON.stringify(anomaly.impactEstimate));
    const originalBehaviorPattern = anomaly.behaviorPattern;
    const originalConfidence = anomaly.confidence;
    const originalClassification = anomaly.classification;
    const originalAnomalyType = anomaly.anomalyType;

    // Run builder methods
    anomaly.summary = service._buildSummaryText(anomaly);
    anomaly.explanationText = service._buildExplanationText(anomaly, { mean: 200 });
    anomaly.typicalRange = service._buildTypicalRange(anomaly);

    // Verify enriched fields are untouched
    expect(anomaly.explanation).toEqual(originalExplanation);
    expect(anomaly.historicalContext).toEqual(originalHistoricalContext);
    expect(anomaly.impactEstimate).toEqual(originalImpactEstimate);
    expect(anomaly.behaviorPattern).toBe(originalBehaviorPattern);
    expect(anomaly.confidence).toBe(originalConfidence);
    expect(anomaly.classification).toBe(originalClassification);
    expect(anomaly.anomalyType).toBe(originalAnomalyType);

    // Verify new fields are present
    expect(typeof anomaly.summary).toBe('string');
    expect(typeof anomaly.explanationText).toBe('string');
    expect(anomaly.summary.length).toBeGreaterThan(0);
  });
});

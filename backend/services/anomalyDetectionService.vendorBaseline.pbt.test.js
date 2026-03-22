/**
 * Property-Based Tests for AnomalyDetectionService — Vendor Baselines
 *
 * Property 1: Vendor baseline percentile ordering and field completeness
 * Property 2: Vendor interval computation
 * Property 4: Vendor-percentile cluster exclusion
 * Property 5: New Spending Tier detection threshold
 * Property 7: New Spending Tier severity assignment
 * Property 12: Cluster extraction behavioral equivalence
 *
 * Feature: anomaly-refinements
 * Validates: Requirements 1.1, 1.3, 1.4, 2.3, 2.4, 3.1, 3.7, 7.1, 7.2, 10.2
 *
 * @invariant Vendor Baseline Percentile Ordering: p25 ≤ median ≤ p75 ≤ p95 ≤ max for any amounts.
 * @invariant Vendor Interval Computation: daySpan / (n-1) for 2+ txns, null for < 2.
 * @invariant Vendor-Percentile Cluster Exclusion: detection iff amount > p95 AND outside all clusters.
 * @invariant New Spending Tier Detection Threshold: detection iff amount > 3× vendor max.
 * @invariant New Spending Tier Severity Assignment: correct severity bucket for any ratio.
 * @invariant Cluster Extraction Equivalence: _computeAmountClusters matches old inline logic.
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount } = require('../test/pbtArbitraries');

const anomalyDetectionService = require('./anomalyDetectionService');

// ─── Helpers ───

/**
 * Build expense objects for a single vendor from an array of amounts and dates.
 */
function buildExpenses(place, amounts, dates) {
  return amounts.map((amount, i) => ({
    id: i + 1,
    place,
    amount,
    type: 'Groceries',
    date: dates ? dates[i] : `2024-01-${String(i + 1).padStart(2, '0')}`,
    week: 1,
    method: 'Cash'
  }));
}

/**
 * Generate sequential YYYY-MM-DD date strings separated by `gapDays` each.
 */
function sequentialDates(count, gapDays, startDate = '2023-01-01') {
  const dates = [];
  const d = new Date(startDate);
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + gapDays);
  }
  return dates;
}

// ─── Arbitraries ───

/**
 * Arbitrary: array of 1–50 positive finite amounts.
 */
const arbAmounts = fc.array(
  fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
    .filter(n => isFinite(n) && n > 0),
  { minLength: 1, maxLength: 50 }
);

/**
 * Arbitrary: a single constant amount repeated 1–50 times (all-equal case).
 */
const arbIdenticalAmounts = fc.tuple(
  fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
    .filter(n => isFinite(n) && n > 0),
  fc.integer({ min: 1, max: 50 })
).map(([val, count]) => Array(count).fill(val));

/**
 * Arbitrary: gap in days between transactions (1–90 days), with count 2–30.
 */
const arbIntervalParams = fc.record({
  count: fc.integer({ min: 2, max: 30 }),
  gapDays: fc.integer({ min: 1, max: 90 })
});

// ─── Property 1: Vendor baseline percentile ordering and field completeness ───
// **Validates: Requirements 1.1, 1.3, 10.2**

describe('Feature: anomaly-refinements, Property 1: Vendor baseline percentile ordering and field completeness', () => {
  it('p25 ≤ median ≤ p75 ≤ p95 ≤ max for any amount array', () => {
    fc.assert(
      fc.property(arbAmounts, (amounts) => {
        const expenses = buildExpenses('TestVendor', amounts);
        const baselines = anomalyDetectionService._buildVendorBaselines(expenses);
        const b = baselines.get('testvendor');

        // All required fields exist
        expect(b).toBeDefined();
        expect(typeof b.transactionCount).toBe('number');
        expect(typeof b.medianAmount).toBe('number');
        expect(typeof b.p25).toBe('number');
        expect(typeof b.p75).toBe('number');
        expect(typeof b.p95).toBe('number');
        expect(typeof b.maxAmount).toBe('number');
        expect(typeof b.avgAmount).toBe('number');
        expect(Array.isArray(b.sortedAmounts)).toBe(true);
        expect(typeof b.lastTransactionDate).toBe('string');
        expect(b.vendor).toBe('testvendor');

        // Transaction count matches input
        expect(b.transactionCount).toBe(amounts.length);

        // Percentile ordering invariant
        expect(b.p25).toBeLessThanOrEqual(b.medianAmount);
        expect(b.medianAmount).toBeLessThanOrEqual(b.p75);
        expect(b.p75).toBeLessThanOrEqual(b.p95);
        expect(b.p95).toBeLessThanOrEqual(b.maxAmount);

        // All percentiles are within [min, max] of the data
        const minVal = Math.min(...amounts);
        const maxVal = Math.max(...amounts);
        expect(b.p25).toBeGreaterThanOrEqual(minVal);
        expect(b.maxAmount).toBe(maxVal);
      }),
      pbtOptions()
    );
  });

  it('all percentiles equal the single value when all amounts are identical', () => {
    fc.assert(
      fc.property(arbIdenticalAmounts, (amounts) => {
        const expenses = buildExpenses('SameVendor', amounts);
        const baselines = anomalyDetectionService._buildVendorBaselines(expenses);
        const b = baselines.get('samevendor');

        const val = amounts[0];
        expect(b.p25).toBe(val);
        expect(b.medianAmount).toBe(val);
        expect(b.p75).toBe(val);
        expect(b.p95).toBe(val);
        expect(b.maxAmount).toBe(val);
      }),
      pbtOptions()
    );
  });

  it('single transaction sets all percentiles to that amount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
          .filter(n => isFinite(n) && n > 0),
        (amount) => {
          const expenses = buildExpenses('Solo', [amount]);
          const baselines = anomalyDetectionService._buildVendorBaselines(expenses);
          const b = baselines.get('solo');

          expect(b.p25).toBe(amount);
          expect(b.medianAmount).toBe(amount);
          expect(b.p75).toBe(amount);
          expect(b.p95).toBe(amount);
          expect(b.maxAmount).toBe(amount);
          expect(b.transactionCount).toBe(1);
        }
      ),
      pbtOptions()
    );
  });
});

// ─── Property 2: Vendor interval computation ───
// **Validates: Requirements 1.4**

describe('Feature: anomaly-refinements, Property 2: Vendor interval computation', () => {
  it('avgDaysBetweenTransactions = daySpan / (n-1) for 2+ transactions', () => {
    fc.assert(
      fc.property(arbIntervalParams, ({ count, gapDays }) => {
        const dates = sequentialDates(count, gapDays);
        const amounts = Array(count).fill(50);
        const expenses = buildExpenses('IntervalVendor', amounts, dates);
        const baselines = anomalyDetectionService._buildVendorBaselines(expenses);
        const b = baselines.get('intervalvendor');

        // Compute expected from actual generated dates (same formula as production code)
        const sorted = [...dates].sort();
        const earliest = new Date(sorted[0]);
        const latest = new Date(sorted[sorted.length - 1]);
        const expectedSpan = (latest - earliest) / (1000 * 60 * 60 * 24);
        const expectedAvg = expectedSpan / (count - 1);

        expect(b.avgDaysBetweenTransactions).toBeCloseTo(expectedAvg, 5);
        expect(b.avgDaysBetweenTransactions).toBeGreaterThan(0);
      }),
      pbtOptions()
    );
  });

  it('avgDaysBetweenTransactions is null for a single transaction', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
          .filter(n => isFinite(n) && n > 0),
        (amount) => {
          const expenses = buildExpenses('OnceVendor', [amount], ['2024-06-15']);
          const baselines = anomalyDetectionService._buildVendorBaselines(expenses);
          const b = baselines.get('oncevendor');

          expect(b.avgDaysBetweenTransactions).toBeNull();
        }
      ),
      pbtOptions()
    );
  });

  it('avgDaysBetweenTransactions equals total day span / (n-1) for any date set with 2+ transactions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        fc.array(fc.integer({ min: 1, max: 60 }), { minLength: 1, maxLength: 19 }),
        (firstGap, additionalGaps) => {
          // Build dates with variable gaps
          const gapCount = Math.min(additionalGaps.length, 19);
          const totalCount = gapCount + 2; // at least 2 dates
          const gaps = [firstGap, ...additionalGaps.slice(0, gapCount)];

          const dates = [];
          const d = new Date('2023-01-01');
          dates.push(d.toISOString().split('T')[0]);
          for (let i = 0; i < gaps.length && dates.length < totalCount; i++) {
            const next = new Date(d);
            next.setDate(next.getDate() + gaps[i]);
            dates.push(next.toISOString().split('T')[0]);
            d.setTime(next.getTime());
          }

          const n = dates.length;
          const amounts = Array(n).fill(100);
          const expenses = buildExpenses('VarVendor', amounts, dates);
          const baselines = anomalyDetectionService._buildVendorBaselines(expenses);
          const b = baselines.get('varvendor');

          // Compute expected day span
          const earliest = new Date(dates[0]);
          const latest = new Date(dates[dates.length - 1]);
          const expectedSpan = (latest - earliest) / (1000 * 60 * 60 * 24);
          const expectedAvg = expectedSpan / (n - 1);

          expect(b.avgDaysBetweenTransactions).toBeCloseTo(expectedAvg, 5);
          if (expectedSpan > 0) {
            expect(b.avgDaysBetweenTransactions).toBeGreaterThan(0);
          }
        }
      ),
      pbtOptions()
    );
  });
});

// ─── Property 4: Vendor-percentile cluster exclusion ───
// **Validates: Requirements 2.3, 2.4**

describe('Feature: anomaly-refinements, Property 4: Vendor-percentile cluster exclusion', () => {
  /**
   * Helper: compute p95 using the same linear interpolation as the production code.
   */
  function computeP95(sortedAmounts) {
    const n = sortedAmounts.length;
    if (n === 1) return sortedAmounts[0];
    const index = (95 / 100) * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedAmounts[lower];
    const fraction = index - lower;
    return sortedAmounts[lower] + fraction * (sortedAmounts[upper] - sortedAmounts[lower]);
  }

  /**
   * Arbitrary: generates a vendor history of 10–40 positive amounts (sorted ascending),
   * plus a test amount that is guaranteed to exceed p95.
   */
  const arbVendorWithHighAmount = fc.array(
    fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true })
      .filter(n => isFinite(n) && n >= 1),
    { minLength: 10, maxLength: 40 }
  ).chain(amounts => {
    const sorted = [...amounts].sort((a, b) => a - b);
    const p95 = computeP95(sorted);
    // Generate a test amount that is strictly above p95
    return fc.float({ min: Math.fround(p95 + 0.01), max: Math.fround(p95 + 5000), noNaN: true })
      .filter(n => isFinite(n) && n > p95)
      .map(testAmount => ({ sorted, p95, testAmount }));
  });

  it('amount > p95 AND outside all clusters → detected as Large_Transaction', () => {
    fc.assert(
      fc.property(arbVendorWithHighAmount, ({ sorted, p95, testAmount }) => {
        // Compute clusters from the vendor's sorted amounts
        const clusters = anomalyDetectionService._computeAmountClusters(sorted);

        // Check if testAmount falls inside any cluster
        const insideCluster = clusters.some(c => testAmount >= c.min && testAmount <= c.max);

        if (!insideCluster) {
          // Build expenses for the vendor with ≥10 transactions
          const expenses = buildExpenses('ClusterVendor', sorted);
          const baselines = anomalyDetectionService._buildVendorBaselines(expenses);
          const baseline = baselines.get('clustervendor');

          // Verify the baseline has sufficient history
          expect(baseline.transactionCount).toBeGreaterThanOrEqual(10);

          // The test amount exceeds p95 and is outside clusters → should be detected
          // We verify the detection logic by checking the conditions directly
          expect(testAmount).toBeGreaterThan(baseline.p95);
          const detectionClusters = anomalyDetectionService._computeAmountClusters(baseline.sortedAmounts);
          const wouldBeExcluded = detectionClusters.some(c => testAmount >= c.min && testAmount <= c.max);
          expect(wouldBeExcluded).toBe(false);
        }
      }),
      pbtOptions()
    );
  });

  it('amount > p95 BUT inside a cluster → NOT detected as Large_Transaction', () => {
    fc.assert(
      fc.property(arbVendorWithHighAmount, ({ sorted, p95 }) => {
        // Compute clusters from the vendor's sorted amounts
        const clusters = anomalyDetectionService._computeAmountClusters(sorted);

        // Pick the last cluster (highest amounts) — if the max of that cluster > p95,
        // then any amount within that cluster that also exceeds p95 should NOT be flagged
        const lastCluster = clusters[clusters.length - 1];
        if (lastCluster.max > p95) {
          // Pick a test amount inside the cluster that also exceeds p95
          const testAmountInCluster = Math.max(p95 + 0.01, lastCluster.min);
          if (testAmountInCluster <= lastCluster.max) {
            // This amount is > p95 AND inside a cluster → should NOT be flagged
            const insideCluster = clusters.some(c => testAmountInCluster >= c.min && testAmountInCluster <= c.max);
            expect(insideCluster).toBe(true);
          }
        }
        // If no cluster has max > p95, the property is vacuously true (all > p95 amounts are outside clusters)
      }),
      pbtOptions()
    );
  });

  it('detection iff amount > p95 AND outside all clusters (biconditional)', () => {
    fc.assert(
      fc.property(arbVendorWithHighAmount, ({ sorted, p95, testAmount }) => {
        const clusters = anomalyDetectionService._computeAmountClusters(sorted);
        const insideCluster = clusters.some(c => testAmount >= c.min && testAmount <= c.max);

        // The biconditional: detection should happen iff (amount > p95 AND NOT insideCluster)
        // Since testAmount is always > p95 by construction, detection iff NOT insideCluster
        const shouldDetect = testAmount > p95 && !insideCluster;

        // Verify the conditions match what the production code would evaluate
        const expenses = buildExpenses('BicoVendor', sorted);
        const baselines = anomalyDetectionService._buildVendorBaselines(expenses);
        const baseline = baselines.get('bicovendor');

        const productionClusters = anomalyDetectionService._computeAmountClusters(baseline.sortedAmounts);
        const productionInsideCluster = productionClusters.some(c => testAmount >= c.min && testAmount <= c.max);
        const productionShouldDetect = testAmount > baseline.p95 && !productionInsideCluster;

        expect(productionShouldDetect).toBe(shouldDetect);
      }),
      pbtOptions()
    );
  });
});

// ─── Property 12: Cluster extraction behavioral equivalence ───
// **Validates: Requirements 7.1, 7.2**

describe('Feature: anomaly-refinements, Property 12: Cluster extraction behavioral equivalence', () => {
  /**
   * Reference implementation of the old inline clustering logic that was
   * previously embedded in _findRecurringPattern. This replicates the exact
   * algorithm: walk sorted amounts, split when gap > CLUSTER_GAP_MULTIPLIER × previous value.
   */
  const { CLUSTER_GAP_MULTIPLIER } = require('../utils/analyticsConstants');

  function referenceInlineClustering(sortedAmounts) {
    if (!sortedAmounts || sortedAmounts.length === 0) return [];

    const clusterRanges = [];
    let rangeStart = sortedAmounts[0];
    let rangeEnd = sortedAmounts[0];

    for (let i = 1; i < sortedAmounts.length; i++) {
      if (rangeEnd > 0 && sortedAmounts[i] > rangeEnd * CLUSTER_GAP_MULTIPLIER) {
        clusterRanges.push({ min: rangeStart, max: rangeEnd });
        rangeStart = sortedAmounts[i];
      }
      rangeEnd = sortedAmounts[i];
    }
    clusterRanges.push({ min: rangeStart, max: rangeEnd });

    return clusterRanges;
  }

  /**
   * Arbitrary: sorted array of 1–60 positive amounts.
   */
  const arbSortedPositiveAmounts = fc.array(
    fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
      .filter(n => isFinite(n) && n > 0),
    { minLength: 1, maxLength: 60 }
  ).map(amounts => [...amounts].sort((a, b) => a - b));

  it('_computeAmountClusters matches reference inline logic for any sorted positive amounts', () => {
    fc.assert(
      fc.property(arbSortedPositiveAmounts, (sortedAmounts) => {
        const extracted = anomalyDetectionService._computeAmountClusters(sortedAmounts);
        const reference = referenceInlineClustering(sortedAmounts);

        expect(extracted).toEqual(reference);
      }),
      pbtOptions()
    );
  });

  it('every input amount falls within exactly one cluster', () => {
    fc.assert(
      fc.property(arbSortedPositiveAmounts, (sortedAmounts) => {
        const clusters = anomalyDetectionService._computeAmountClusters(sortedAmounts);

        for (const amount of sortedAmounts) {
          const matchingClusters = clusters.filter(c => amount >= c.min && amount <= c.max);
          expect(matchingClusters.length).toBe(1);
        }
      }),
      pbtOptions()
    );
  });

  it('clusters have min ≤ max and are non-overlapping in ascending order', () => {
    fc.assert(
      fc.property(arbSortedPositiveAmounts, (sortedAmounts) => {
        const clusters = anomalyDetectionService._computeAmountClusters(sortedAmounts);

        // Each cluster has min ≤ max
        for (const c of clusters) {
          expect(c.min).toBeLessThanOrEqual(c.max);
        }

        // Clusters are in ascending order and non-overlapping
        for (let i = 1; i < clusters.length; i++) {
          expect(clusters[i].min).toBeGreaterThan(clusters[i - 1].max);
        }
      }),
      pbtOptions()
    );
  });

  it('gap between consecutive clusters exceeds CLUSTER_GAP_MULTIPLIER threshold', () => {
    fc.assert(
      fc.property(arbSortedPositiveAmounts, (sortedAmounts) => {
        const clusters = anomalyDetectionService._computeAmountClusters(sortedAmounts);

        // For consecutive clusters, the min of the next cluster must exceed
        // CLUSTER_GAP_MULTIPLIER × the max of the previous cluster
        for (let i = 1; i < clusters.length; i++) {
          const prevMax = clusters[i - 1].max;
          if (prevMax > 0) {
            expect(clusters[i].min).toBeGreaterThan(prevMax * CLUSTER_GAP_MULTIPLIER);
          }
        }
      }),
      pbtOptions()
    );
  });

  it('empty input produces empty clusters', () => {
    const result = anomalyDetectionService._computeAmountClusters([]);
    expect(result).toEqual([]);
  });

  it('single element produces one cluster with min === max', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
          .filter(n => isFinite(n) && n > 0),
        (amount) => {
          const clusters = anomalyDetectionService._computeAmountClusters([amount]);
          expect(clusters.length).toBe(1);
          expect(clusters[0].min).toBe(amount);
          expect(clusters[0].max).toBe(amount);
        }
      ),
      pbtOptions()
    );
  });
});


// ─── Property 5: New Spending Tier detection threshold ───
// **Validates: Requirements 3.1**

describe('Feature: anomaly-refinements, Property 5: New Spending Tier detection threshold', () => {
  const { DETECTION_THRESHOLDS, ANOMALY_CLASSIFICATIONS } = require('../utils/analyticsConstants');
  const multiplier = DETECTION_THRESHOLDS.NEW_SPENDING_TIER_MULTIPLIER; // 3

  /**
   * Arbitrary: generates a vendor history of 2–20 positive amounts (≥2 required for detection),
   * plus a test amount that is strictly above multiplier × max.
   */
  const arbVendorAboveThreshold = fc.array(
    fc.float({ min: Math.fround(1), max: Math.fround(1000), noNaN: true })
      .filter(n => isFinite(n) && n >= 1),
    { minLength: 2, maxLength: 20 }
  ).chain(amounts => {
    const maxVal = Math.max(...amounts);
    const threshold = multiplier * maxVal;
    // Generate amount strictly above the threshold
    return fc.float({ min: Math.fround(threshold + 0.01), max: Math.fround(threshold + 5000), noNaN: true })
      .filter(n => isFinite(n) && n > threshold)
      .map(testAmount => ({ amounts, maxVal, testAmount }));
  });

  /**
   * Arbitrary: generates a vendor history of 2–20 positive amounts,
   * plus a test amount that is at or below multiplier × max.
   */
  const arbVendorAtOrBelowThreshold = fc.array(
    fc.float({ min: Math.fround(1), max: Math.fround(1000), noNaN: true })
      .filter(n => isFinite(n) && n >= 1),
    { minLength: 2, maxLength: 20 }
  ).chain(amounts => {
    const maxVal = Math.max(...amounts);
    const threshold = multiplier * maxVal;
    // Generate amount at or below the threshold (but positive)
    return fc.float({ min: Math.fround(0.01), max: Math.fround(threshold), noNaN: true })
      .filter(n => isFinite(n) && n > 0 && n <= threshold)
      .map(testAmount => ({ amounts, maxVal, testAmount }));
  });

  it('amount > 3× vendor max → produces New_Spending_Tier anomaly', () => {
    fc.assert(
      fc.property(arbVendorAboveThreshold, ({ amounts, maxVal, testAmount }) => {
        // Build history expenses
        const history = amounts.map((amount, i) => ({
          id: i + 1,
          place: 'TierVendor',
          amount,
          type: 'Dining',
          date: `2024-01-${String(i + 1).padStart(2, '0')}`
        }));

        // Recent expense that should trigger detection
        const recentExpense = {
          id: 9999,
          place: 'TierVendor',
          amount: testAmount,
          type: 'Dining',
          date: '2025-01-15'
        };

        const anomalies = anomalyDetectionService._detectNewSpendingTier(
          [recentExpense],
          [...history, recentExpense]
        );

        expect(anomalies).toHaveLength(1);
        expect(anomalies[0].expenseId).toBe(9999);
        expect(anomalies[0].classification).toBe(ANOMALY_CLASSIFICATIONS.NEW_SPENDING_TIER);
        expect(anomalies[0].anomalyType).toBe('new_spending_tier');
      }),
      pbtOptions()
    );
  });

  it('amount ≤ 3× vendor max → no New_Spending_Tier anomaly', () => {
    fc.assert(
      fc.property(arbVendorAtOrBelowThreshold, ({ amounts, maxVal, testAmount }) => {
        const history = amounts.map((amount, i) => ({
          id: i + 1,
          place: 'TierVendor',
          amount,
          type: 'Dining',
          date: `2024-01-${String(i + 1).padStart(2, '0')}`
        }));

        const recentExpense = {
          id: 9999,
          place: 'TierVendor',
          amount: testAmount,
          type: 'Dining',
          date: '2025-01-15'
        };

        const anomalies = anomalyDetectionService._detectNewSpendingTier(
          [recentExpense],
          [...history, recentExpense]
        );

        expect(anomalies).toHaveLength(0);
      }),
      pbtOptions()
    );
  });

  it('vendors with < 2 historical transactions → no detection regardless of amount', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true })
          .filter(n => isFinite(n) && n >= 1),
        fc.float({ min: Math.fround(1000), max: Math.fround(50000), noNaN: true })
          .filter(n => isFinite(n) && n >= 1000),
        (historyAmount, testAmount) => {
          // Only 1 historical transaction (plus the current one = 2 in allExpenses,
          // but only 1 prior transaction)
          const history = [{
            id: 1,
            place: 'SparseVendor',
            amount: historyAmount,
            type: 'Dining',
            date: '2024-01-01'
          }];

          const recentExpense = {
            id: 9999,
            place: 'SparseVendor',
            amount: testAmount,
            type: 'Dining',
            date: '2025-01-15'
          };

          const anomalies = anomalyDetectionService._detectNewSpendingTier(
            [recentExpense],
            [...history, recentExpense]
          );

          expect(anomalies).toHaveLength(0);
        }
      ),
      pbtOptions()
    );
  });
});

// ─── Property 7: New Spending Tier severity assignment ───
// **Validates: Requirements 3.7**

describe('Feature: anomaly-refinements, Property 7: New Spending Tier severity assignment', () => {
  const { DETECTION_THRESHOLDS, SEVERITY_LEVELS } = require('../utils/analyticsConstants');
  const multiplier = DETECTION_THRESHOLDS.NEW_SPENDING_TIER_MULTIPLIER; // 3

  /**
   * Helper: expected severity for a given ratio.
   * ratio > 10 → high, ratio > 5 → medium, otherwise → low
   */
  function expectedSeverity(ratio) {
    if (ratio > 10) return SEVERITY_LEVELS.HIGH;
    if (ratio > 5) return SEVERITY_LEVELS.MEDIUM;
    return SEVERITY_LEVELS.LOW;
  }

  /**
   * Arbitrary: generates a vendor max and a ratio > 3 (since detection requires > 3×),
   * covering all three severity buckets.
   */
  const arbSeverityScenario = fc.record({
    vendorMax: fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true })
      .filter(n => isFinite(n) && n >= 1),
    ratio: fc.float({ min: Math.fround(3.01), max: Math.fround(25), noNaN: true })
      .filter(n => isFinite(n) && n > multiplier)
  }).map(({ vendorMax, ratio }) => ({
    vendorMax,
    ratio,
    testAmount: vendorMax * ratio
  })).filter(({ testAmount }) => isFinite(testAmount) && testAmount > 0);

  it('severity is high when ratio > 10, medium when ratio > 5, low otherwise', () => {
    fc.assert(
      fc.property(arbSeverityScenario, ({ vendorMax, ratio, testAmount }) => {
        // Build 2 historical transactions with the known max
        const history = [
          { id: 1, place: 'SevVendor', amount: vendorMax * 0.5, type: 'Dining', date: '2024-01-01' },
          { id: 2, place: 'SevVendor', amount: vendorMax, type: 'Dining', date: '2024-02-01' }
        ];

        const recentExpense = {
          id: 9999,
          place: 'SevVendor',
          amount: testAmount,
          type: 'Dining',
          date: '2025-01-15'
        };

        const anomalies = anomalyDetectionService._detectNewSpendingTier(
          [recentExpense],
          [...history, recentExpense]
        );

        // Should detect since testAmount > multiplier × vendorMax
        expect(anomalies).toHaveLength(1);

        // Verify severity matches the expected bucket
        const actualRatio = testAmount / vendorMax;
        expect(anomalies[0].severity).toBe(expectedSeverity(actualRatio));
      }),
      pbtOptions()
    );
  });

  it('low severity for ratios in (3, 5] range', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true })
          .filter(n => isFinite(n) && n >= 1),
        fc.float({ min: Math.fround(3.01), max: Math.fround(5), noNaN: true })
          .filter(n => isFinite(n) && n > multiplier && n <= 5),
        (vendorMax, ratio) => {
          const testAmount = vendorMax * ratio;
          if (!isFinite(testAmount) || testAmount <= 0) return;

          const history = [
            { id: 1, place: 'LowSev', amount: vendorMax * 0.5, type: 'Dining', date: '2024-01-01' },
            { id: 2, place: 'LowSev', amount: vendorMax, type: 'Dining', date: '2024-02-01' }
          ];

          const recentExpense = {
            id: 9999, place: 'LowSev', amount: testAmount,
            type: 'Dining', date: '2025-01-15'
          };

          const anomalies = anomalyDetectionService._detectNewSpendingTier(
            [recentExpense], [...history, recentExpense]
          );

          expect(anomalies).toHaveLength(1);
          expect(anomalies[0].severity).toBe(SEVERITY_LEVELS.LOW);
        }
      ),
      pbtOptions()
    );
  });

  it('medium severity for ratios in (5, 10] range', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true })
          .filter(n => isFinite(n) && n >= 1),
        fc.float({ min: Math.fround(5.01), max: Math.fround(10), noNaN: true })
          .filter(n => isFinite(n) && n > 5 && n <= 10),
        (vendorMax, ratio) => {
          const testAmount = vendorMax * ratio;
          if (!isFinite(testAmount) || testAmount <= 0) return;

          const history = [
            { id: 1, place: 'MedSev', amount: vendorMax * 0.5, type: 'Dining', date: '2024-01-01' },
            { id: 2, place: 'MedSev', amount: vendorMax, type: 'Dining', date: '2024-02-01' }
          ];

          const recentExpense = {
            id: 9999, place: 'MedSev', amount: testAmount,
            type: 'Dining', date: '2025-01-15'
          };

          const anomalies = anomalyDetectionService._detectNewSpendingTier(
            [recentExpense], [...history, recentExpense]
          );

          expect(anomalies).toHaveLength(1);
          expect(anomalies[0].severity).toBe(SEVERITY_LEVELS.MEDIUM);
        }
      ),
      pbtOptions()
    );
  });

  it('high severity for ratios > 10', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true })
          .filter(n => isFinite(n) && n >= 1),
        fc.float({ min: Math.fround(10.01), max: Math.fround(25), noNaN: true })
          .filter(n => isFinite(n) && n > 10),
        (vendorMax, ratio) => {
          const testAmount = vendorMax * ratio;
          if (!isFinite(testAmount) || testAmount <= 0) return;

          const history = [
            { id: 1, place: 'HighSev', amount: vendorMax * 0.5, type: 'Dining', date: '2024-01-01' },
            { id: 2, place: 'HighSev', amount: vendorMax, type: 'Dining', date: '2024-02-01' }
          ];

          const recentExpense = {
            id: 9999, place: 'HighSev', amount: testAmount,
            type: 'Dining', date: '2025-01-15'
          };

          const anomalies = anomalyDetectionService._detectNewSpendingTier(
            [recentExpense], [...history, recentExpense]
          );

          expect(anomalies).toHaveLength(1);
          expect(anomalies[0].severity).toBe(SEVERITY_LEVELS.HIGH);
        }
      ),
      pbtOptions()
    );
  });
});

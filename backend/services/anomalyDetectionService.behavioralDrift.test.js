/**
 * Unit tests for AnomalyDetectionService._detectBehavioralDrift
 *
 * Tests the behavioral drift detector which compares the recent 3-month average
 * to the preceding 3-month average per category, flagging when the recent avg
 * exceeds the preceding avg by more than DRIFT_THRESHOLD (25%) with 6+ months of data.
 */

const anomalyDetectionService = require('./anomalyDetectionService');
const { ANOMALY_CLASSIFICATIONS, SEVERITY_LEVELS, DETECTION_THRESHOLDS } = require('../utils/analyticsConstants');

// Helper: create an expense object
function makeExpense(id, date, amount, category, place) {
  return { id, date, amount, type: category, place: place || category };
}

/**
 * Generate monthly expenses for a category across consecutive months.
 * @param {string} category
 * @param {number[]} monthlyAmounts - Array of amounts, one per month
 * @param {number} startYear
 * @param {number} startMonth - 1-based
 * @returns {Array}
 */
function generateMonthlyExpenses(category, monthlyAmounts, startYear, startMonth) {
  const expenses = [];
  let id = 1;
  for (let i = 0; i < monthlyAmounts.length; i++) {
    const month = ((startMonth - 1 + i) % 12) + 1;
    const year = startYear + Math.floor((startMonth - 1 + i) / 12);
    const dateStr = year + '-' + month.toString().padStart(2, '0') + '-15';
    expenses.push(makeExpense(id++, dateStr, monthlyAmounts[i], category, 'Store'));
  }
  return expenses;
}

describe('AnomalyDetectionService - _detectBehavioralDrift', () => {
  test('returns empty array when no expenses exist', async () => {
    const result = await anomalyDetectionService._detectBehavioralDrift([]);
    expect(result).toEqual([]);
  });

  test('returns empty array when fewer than 6 months of data exist', async () => {
    // Only 5 months of data
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 100, 100], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);
    expect(result).toEqual([]);
  });

  test('returns empty array when exactly 6 months but no drift', async () => {
    // 6 months, all same amount — no drift
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 100, 100, 100], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);
    expect(result).toEqual([]);
  });

  test('detects drift when recent 3-month avg exceeds preceding 3-month avg by >25%', async () => {
    // Preceding 3 months: $100 avg, Recent 3 months: $150 avg (50% increase)
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 150, 150, 150], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Dining');
    expect(result[0].anomalyType).toBe('behavioral_drift');
    expect(result[0].classification).toBe(ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND);
    expect(result[0].amount).toBe(150);
    expect(result[0].categoryAverage).toBe(100);
  });

  test('does not flag when drift is within 25% threshold', async () => {
    // Preceding: $100 avg, Recent: $120 avg (20% increase, below 25%)
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 120, 120, 120], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);
    expect(result).toEqual([]);
  });

  test('does not flag when drift is exactly 25%', async () => {
    // Preceding: $100 avg, Recent: $125 avg (exactly 25%, not > 25%)
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 125, 125, 125], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);
    expect(result).toEqual([]);
  });

  test('does not flag when recent spending decreased', async () => {
    // Preceding: $100 avg, Recent: $80 avg (decrease)
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 80, 80, 80], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);
    expect(result).toEqual([]);
  });

  test('produces at most one drift alert per category', async () => {
    // 8 months of data with clear drift
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 100, 100, 200, 200, 200], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);

    const diningAlerts = result.filter(a => a.category === 'Dining');
    expect(diningAlerts.length).toBeLessThanOrEqual(1);
  });

  test('detects drift independently per category', async () => {
    // Dining: drift (100 → 150), Transport: no drift (100 → 100)
    const diningExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 150, 150, 150], 2025, 1);
    const transportExpenses = generateMonthlyExpenses('Transport', [100, 100, 100, 100, 100, 100], 2025, 1);
    // Fix IDs to be unique
    let id = 1000;
    transportExpenses.forEach(e => { e.id = id++; });

    const allExpenses = [...diningExpenses, ...transportExpenses];
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Dining');
  });

  test('detects drift in multiple categories simultaneously', async () => {
    // Both categories have drift
    const diningExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 200, 200, 200], 2025, 1);
    const transportExpenses = generateMonthlyExpenses('Transport', [50, 50, 50, 100, 100, 100], 2025, 1);
    let id = 1000;
    transportExpenses.forEach(e => { e.id = id++; });

    const allExpenses = [...diningExpenses, ...transportExpenses];
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);

    expect(result.length).toBe(2);
    const categories = result.map(a => a.category).sort();
    expect(categories).toEqual(['Dining', 'Transport']);
  });

  test('anomaly object has correct shape with _driftData', async () => {
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 200, 200, 200], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);

    expect(result.length).toBe(1);
    const anomaly = result[0];

    expect(anomaly).toMatchObject({
      expenseId: null,
      place: 'Dining',
      category: 'Dining',
      anomalyType: 'behavioral_drift',
      classification: ANOMALY_CLASSIFICATIONS.EMERGING_BEHAVIOR_TREND,
      dismissed: false,
      standardDeviations: 0
    });
    expect(typeof anomaly.id).toBe('number');
    expect(typeof anomaly.severity).toBe('string');
    expect(typeof anomaly.date).toBe('string');
    expect(anomaly.date).toMatch(/^\d{4}-\d{2}-01$/);

    // Verify _driftData structure
    expect(anomaly._driftData).toBeDefined();
    expect(anomaly._driftData.recentPeriodAvg).toBe(200);
    expect(anomaly._driftData.precedingPeriodAvg).toBe(100);
    expect(anomaly._driftData.percentageIncrease).toBe(100);
    expect(anomaly._driftData.recentPeriod).toHaveProperty('start');
    expect(anomaly._driftData.recentPeriod).toHaveProperty('end');
    expect(anomaly._driftData.precedingPeriod).toHaveProperty('start');
    expect(anomaly._driftData.precedingPeriod).toHaveProperty('end');
  });

  test('assigns low severity for moderate drift (25-50%)', async () => {
    // 30% drift
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 130, 130, 130], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].severity).toBe(SEVERITY_LEVELS.LOW);
  });

  test('assigns medium severity for large drift (50-100%)', async () => {
    // 75% drift
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 175, 175, 175], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].severity).toBe(SEVERITY_LEVELS.MEDIUM);
  });

  test('assigns high severity for extreme drift (100%+)', async () => {
    // 150% drift
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 250, 250, 250], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].severity).toBe(SEVERITY_LEVELS.HIGH);
  });

  test('handles multiple expenses per month correctly', async () => {
    // Build 6 months with 2 expenses each
    const allExpenses = [];
    let id = 1;
    for (let i = 0; i < 6; i++) {
      const month = i + 1;
      const dateStr = '2025-' + month.toString().padStart(2, '0') + '-15';
      const amount = i < 3 ? 50 : 100; // preceding: $50*2=$100/mo, recent: $100*2=$200/mo
      allExpenses.push(makeExpense(id++, dateStr, amount, 'Dining', 'Store A'));
      allExpenses.push(makeExpense(id++, dateStr, amount, 'Dining', 'Store B'));
    }

    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].amount).toBe(200); // recent avg = $200/mo
    expect(result[0].categoryAverage).toBe(100); // preceding avg = $100/mo
  });

  test('skips categories where preceding average is zero', async () => {
    // Preceding 3 months: $0, Recent 3 months: $100
    const allExpenses = generateMonthlyExpenses('Dining', [0, 0, 0, 100, 100, 100], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);
    expect(result).toEqual([]);
  });

  test('handles errors gracefully and returns empty array', async () => {
    const badExpenses = [{ date: null, amount: null, type: null }];
    const result = await anomalyDetectionService._detectBehavioralDrift(badExpenses);
    expect(Array.isArray(result)).toBe(true);
  });

  test('uses most recent 3 months with data for recent period', async () => {
    // 7 months of data — recent 3 should be months 5,6,7
    const allExpenses = generateMonthlyExpenses('Dining', [100, 100, 100, 100, 200, 200, 200], 2025, 1);
    const result = await anomalyDetectionService._detectBehavioralDrift(allExpenses);

    expect(result.length).toBe(1);
    // Recent period should be the last 3 months
    expect(result[0]._driftData.recentPeriod.start).toBe('2025-05');
    expect(result[0]._driftData.recentPeriod.end).toBe('2025-07');
    // Preceding period should be the 3 months before that
    expect(result[0]._driftData.precedingPeriod.start).toBe('2025-02');
    expect(result[0]._driftData.precedingPeriod.end).toBe('2025-04');
  });
});

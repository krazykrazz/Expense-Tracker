/**
 * Unit tests for AnomalyDetectionService._detectSeasonalDeviations
 *
 * Tests the seasonal deviation detector which compares current month spending
 * to the same month in the prior year per category, flagging deviations > 25%
 * when 12+ months of data exist.
 */

const anomalyDetectionService = require('./anomalyDetectionService');
const { ANOMALY_CLASSIFICATIONS, SEVERITY_LEVELS, DETECTION_THRESHOLDS } = require('../utils/analyticsConstants');

// Helper: generate expenses for a given month key and category
function makeExpense(id, date, amount, category, place) {
  return { id, date, amount, type: category, place: place || category };
}

// Helper: generate 12+ months of historical data for a category
function generateHistoricalExpenses(category, monthlyAmount, startYear, startMonth, numMonths) {
  const expenses = [];
  let id = 1;
  for (let i = 0; i < numMonths; i++) {
    const month = ((startMonth - 1 + i) % 12) + 1;
    const year = startYear + Math.floor((startMonth - 1 + i) / 12);
    const dateStr = year + '-' + month.toString().padStart(2, '0') + '-15';
    expenses.push(makeExpense(id++, dateStr, monthlyAmount, category, 'Store'));
  }
  return expenses;
}

describe('AnomalyDetectionService - _detectSeasonalDeviations', () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthKey = currentYear + '-' + currentMonth.toString().padStart(2, '0');
  const priorYearMonthKey = (currentYear - 1) + '-' + currentMonth.toString().padStart(2, '0');

  test('returns empty array when no expenses exist', async () => {
    const result = await anomalyDetectionService._detectSeasonalDeviations([], []);
    expect(result).toEqual([]);
  });

  test('returns empty array when fewer than 12 months of data exist', async () => {
    // Only 6 months of data
    const allExpenses = generateHistoricalExpenses('Dining', 100, currentYear, currentMonth - 5, 6);
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthKey + '-01');
    const result = await anomalyDetectionService._detectSeasonalDeviations(recentExpenses, allExpenses);
    expect(result).toEqual([]);
  });

  test('returns empty array when no current month expenses exist', async () => {
    // 14 months of data but none in current month
    const allExpenses = generateHistoricalExpenses('Dining', 100, currentYear - 1, currentMonth - 1, 13);
    // Filter out any that land in current month
    const filtered = allExpenses.filter(e => !e.date.startsWith(currentMonthKey));
    const result = await anomalyDetectionService._detectSeasonalDeviations([], filtered);
    expect(result).toEqual([]);
  });

  test('returns empty array when no same-month-prior-year data exists', async () => {
    // 12 months of data but skip the prior year same month
    const allExpenses = [];
    let id = 1;
    for (let i = 1; i <= 13; i++) {
      const month = ((currentMonth - 1 + i) % 12) + 1;
      const year = (currentYear - 1) + Math.floor((currentMonth - 1 + i) / 12);
      // Skip the prior year same month
      const monthKey = year + '-' + month.toString().padStart(2, '0');
      if (monthKey === priorYearMonthKey) continue;
      const dateStr = monthKey + '-15';
      allExpenses.push(makeExpense(id++, dateStr, 100, 'Dining', 'Store'));
    }
    // Add current month expense
    allExpenses.push(makeExpense(id++, currentMonthKey + '-15', 200, 'Dining', 'Store'));

    const recentExpenses = allExpenses.filter(e => e.date.startsWith(currentMonthKey));
    const result = await anomalyDetectionService._detectSeasonalDeviations(recentExpenses, allExpenses);
    expect(result).toEqual([]);
  });

  test('detects seasonal deviation when current month exceeds prior year same month by >25%', async () => {
    // Build 13 months of data: prior year same month = $100, current month = $150 (50% increase)
    const allExpenses = [];
    let id = 1;

    // Generate 12 months of historical data starting from prior year same month
    for (let i = 0; i < 12; i++) {
      const month = ((currentMonth - 1 + i) % 12) + 1;
      const year = (currentYear - 1) + Math.floor((currentMonth - 1 + i) / 12);
      const dateStr = year + '-' + month.toString().padStart(2, '0') + '-15';
      allExpenses.push(makeExpense(id++, dateStr, 100, 'Dining', 'Store'));
    }

    // Add current month with 50% increase
    allExpenses.push(makeExpense(id++, currentMonthKey + '-15', 150, 'Dining', 'Store'));

    const recentExpenses = allExpenses.filter(e => e.date.startsWith(currentMonthKey));
    const result = await anomalyDetectionService._detectSeasonalDeviations(recentExpenses, allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Dining');
    expect(result[0].anomalyType).toBe('seasonal_deviation');
    expect(result[0].classification).toBe(ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION);
    expect(result[0].amount).toBe(150);
    expect(result[0].categoryAverage).toBe(100);
  });

  test('does not flag when deviation is within 25% threshold', async () => {
    const allExpenses = [];
    let id = 1;

    // 12 months of historical data
    for (let i = 0; i < 12; i++) {
      const month = ((currentMonth - 1 + i) % 12) + 1;
      const year = (currentYear - 1) + Math.floor((currentMonth - 1 + i) / 12);
      const dateStr = year + '-' + month.toString().padStart(2, '0') + '-15';
      allExpenses.push(makeExpense(id++, dateStr, 100, 'Dining', 'Store'));
    }

    // Current month with only 20% increase (below 25% threshold)
    allExpenses.push(makeExpense(id++, currentMonthKey + '-15', 120, 'Dining', 'Store'));

    const recentExpenses = allExpenses.filter(e => e.date.startsWith(currentMonthKey));
    const result = await anomalyDetectionService._detectSeasonalDeviations(recentExpenses, allExpenses);
    expect(result).toEqual([]);
  });

  test('does not flag when current month spending decreased', async () => {
    const allExpenses = [];
    let id = 1;

    for (let i = 0; i < 12; i++) {
      const month = ((currentMonth - 1 + i) % 12) + 1;
      const year = (currentYear - 1) + Math.floor((currentMonth - 1 + i) / 12);
      const dateStr = year + '-' + month.toString().padStart(2, '0') + '-15';
      allExpenses.push(makeExpense(id++, dateStr, 100, 'Dining', 'Store'));
    }

    // Current month with decrease
    allExpenses.push(makeExpense(id++, currentMonthKey + '-15', 50, 'Dining', 'Store'));

    const recentExpenses = allExpenses.filter(e => e.date.startsWith(currentMonthKey));
    const result = await anomalyDetectionService._detectSeasonalDeviations(recentExpenses, allExpenses);
    expect(result).toEqual([]);
  });

  test('detects deviations independently per category', async () => {
    const allExpenses = [];
    let id = 1;

    // Two categories with 12 months of data each
    for (let i = 0; i < 12; i++) {
      const month = ((currentMonth - 1 + i) % 12) + 1;
      const year = (currentYear - 1) + Math.floor((currentMonth - 1 + i) / 12);
      const dateStr = year + '-' + month.toString().padStart(2, '0') + '-15';
      allExpenses.push(makeExpense(id++, dateStr, 100, 'Dining', 'Restaurant'));
      allExpenses.push(makeExpense(id++, dateStr, 200, 'Transport', 'Gas'));
    }

    // Current month: Dining spikes 60%, Transport stays flat
    allExpenses.push(makeExpense(id++, currentMonthKey + '-15', 160, 'Dining', 'Restaurant'));
    allExpenses.push(makeExpense(id++, currentMonthKey + '-15', 200, 'Transport', 'Gas'));

    const recentExpenses = allExpenses.filter(e => e.date.startsWith(currentMonthKey));
    const result = await anomalyDetectionService._detectSeasonalDeviations(recentExpenses, allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].category).toBe('Dining');
  });

  test('anomaly object has correct shape', async () => {
    const allExpenses = [];
    let id = 1;

    for (let i = 0; i < 12; i++) {
      const month = ((currentMonth - 1 + i) % 12) + 1;
      const year = (currentYear - 1) + Math.floor((currentMonth - 1 + i) / 12);
      const dateStr = year + '-' + month.toString().padStart(2, '0') + '-15';
      allExpenses.push(makeExpense(id++, dateStr, 100, 'Dining', 'Store'));
    }

    allExpenses.push(makeExpense(id++, currentMonthKey + '-15', 200, 'Dining', 'Store'));

    const recentExpenses = allExpenses.filter(e => e.date.startsWith(currentMonthKey));
    const result = await anomalyDetectionService._detectSeasonalDeviations(recentExpenses, allExpenses);

    expect(result.length).toBe(1);
    const anomaly = result[0];
    expect(anomaly).toMatchObject({
      expenseId: null,
      date: currentMonthKey + '-01',
      place: 'Dining',
      amount: 200,
      category: 'Dining',
      anomalyType: 'seasonal_deviation',
      classification: ANOMALY_CLASSIFICATIONS.SEASONAL_DEVIATION,
      dismissed: false,
      categoryAverage: 100,
      standardDeviations: 0
    });
    expect(typeof anomaly.id).toBe('number');
    expect(typeof anomaly.severity).toBe('string');
  });

  test('assigns low severity for moderate deviations (25-50%)', async () => {
    const allExpenses = [];
    let id = 1;

    for (let i = 0; i < 12; i++) {
      const month = ((currentMonth - 1 + i) % 12) + 1;
      const year = (currentYear - 1) + Math.floor((currentMonth - 1 + i) / 12);
      const dateStr = year + '-' + month.toString().padStart(2, '0') + '-15';
      allExpenses.push(makeExpense(id++, dateStr, 100, 'Dining', 'Store'));
    }

    // 40% increase → low severity
    allExpenses.push(makeExpense(id++, currentMonthKey + '-15', 140, 'Dining', 'Store'));

    const recentExpenses = allExpenses.filter(e => e.date.startsWith(currentMonthKey));
    const result = await anomalyDetectionService._detectSeasonalDeviations(recentExpenses, allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].severity).toBe(SEVERITY_LEVELS.LOW);
  });

  test('assigns medium severity for large deviations (50-100%)', async () => {
    const allExpenses = [];
    let id = 1;

    for (let i = 0; i < 12; i++) {
      const month = ((currentMonth - 1 + i) % 12) + 1;
      const year = (currentYear - 1) + Math.floor((currentMonth - 1 + i) / 12);
      const dateStr = year + '-' + month.toString().padStart(2, '0') + '-15';
      allExpenses.push(makeExpense(id++, dateStr, 100, 'Dining', 'Store'));
    }

    // 75% increase → medium severity
    allExpenses.push(makeExpense(id++, currentMonthKey + '-15', 175, 'Dining', 'Store'));

    const recentExpenses = allExpenses.filter(e => e.date.startsWith(currentMonthKey));
    const result = await anomalyDetectionService._detectSeasonalDeviations(recentExpenses, allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].severity).toBe(SEVERITY_LEVELS.MEDIUM);
  });

  test('assigns high severity for extreme deviations (100%+)', async () => {
    const allExpenses = [];
    let id = 1;

    for (let i = 0; i < 12; i++) {
      const month = ((currentMonth - 1 + i) % 12) + 1;
      const year = (currentYear - 1) + Math.floor((currentMonth - 1 + i) / 12);
      const dateStr = year + '-' + month.toString().padStart(2, '0') + '-15';
      allExpenses.push(makeExpense(id++, dateStr, 100, 'Dining', 'Store'));
    }

    // 150% increase → high severity
    allExpenses.push(makeExpense(id++, currentMonthKey + '-15', 250, 'Dining', 'Store'));

    const recentExpenses = allExpenses.filter(e => e.date.startsWith(currentMonthKey));
    const result = await anomalyDetectionService._detectSeasonalDeviations(recentExpenses, allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].severity).toBe(SEVERITY_LEVELS.HIGH);
  });

  test('sums multiple current month expenses per category', async () => {
    const allExpenses = [];
    let id = 1;

    for (let i = 0; i < 12; i++) {
      const month = ((currentMonth - 1 + i) % 12) + 1;
      const year = (currentYear - 1) + Math.floor((currentMonth - 1 + i) / 12);
      const dateStr = year + '-' + month.toString().padStart(2, '0') + '-15';
      allExpenses.push(makeExpense(id++, dateStr, 100, 'Dining', 'Store'));
    }

    // Two current month expenses totaling $200 (100% increase over prior year $100)
    allExpenses.push(makeExpense(id++, currentMonthKey + '-10', 120, 'Dining', 'Store A'));
    allExpenses.push(makeExpense(id++, currentMonthKey + '-20', 80, 'Dining', 'Store B'));

    const recentExpenses = allExpenses.filter(e => e.date.startsWith(currentMonthKey));
    const result = await anomalyDetectionService._detectSeasonalDeviations(recentExpenses, allExpenses);

    expect(result.length).toBe(1);
    expect(result[0].amount).toBe(200);
  });

  test('handles errors gracefully and returns empty array', async () => {
    // Pass invalid data that would cause an error
    const badExpenses = [{ date: null, amount: null, type: null }];
    const result = await anomalyDetectionService._detectSeasonalDeviations(badExpenses, badExpenses);
    expect(Array.isArray(result)).toBe(true);
  });
});

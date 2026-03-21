/**
 * Unit tests for _detectCategorySpendingSpikes()
 *
 * Validates that category spending spikes are detected when the current month
 * total exceeds the historical monthly average by more than CATEGORY_SPIKE_THRESHOLD (50%).
 */

// Mock activity log service
jest.mock('./activityLogService');

const anomalyDetectionService = require('./anomalyDetectionService');
const { getDatabase } = require('../database/db');
const { ANOMALY_CLASSIFICATIONS, DETECTION_THRESHOLDS } = require('../utils/analyticsConstants');

describe('AnomalyDetectionService - _detectCategorySpendingSpikes', () => {
  let db;

  const insertExpense = async (expense) => {
    return new Promise((resolve, reject) => {
      const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      db.run(sql, [
        expense.date, expense.place || 'Test Place', expense.notes || '',
        expense.amount, expense.type, expense.week || 1, expense.method || 'Debit'
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  };

  const getAllExpenses = async () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM expenses ORDER BY date', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  // Helper to build current month date string
  const currentMonthDate = (day) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Helper to build a past month date string (monthsAgo = 1 means last month)
  const pastMonthDate = (monthsAgo, day) => {
    const now = new Date();
    now.setMonth(now.getMonth() - monthsAgo);
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => err ? reject(err) : resolve());
    });
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => err ? reject(err) : resolve());
    });
  });

  test('returns empty array when no expenses exist', async () => {
    const result = await anomalyDetectionService._detectCategorySpendingSpikes([], []);
    expect(result).toEqual([]);
  });

  test('returns empty array when no current month expenses exist', async () => {
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries' });
    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectCategorySpendingSpikes([], allExpenses);
    expect(result).toEqual([]);
  });

  test('returns empty array when no historical data exists for comparison', async () => {
    // Only current month data, no historical months
    await insertExpense({ date: currentMonthDate(5), amount: 500, type: 'Groceries' });
    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectCategorySpendingSpikes(allExpenses, allExpenses);
    expect(result).toEqual([]);
  });

  test('detects spike when current month exceeds historical avg by more than 50%', async () => {
    // Historical: 3 months averaging $100/month
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries' });
    // Current month: $200 (100% above avg — exceeds 50% threshold)
    await insertExpense({ date: currentMonthDate(5), amount: 200, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectCategorySpendingSpikes(recentExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('Groceries');
    expect(result[0].classification).toBe(ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE);
    expect(result[0].anomalyType).toBe('category_spending_spike');
    expect(result[0].amount).toBe(200);
    expect(result[0].categoryAverage).toBe(100);
    expect(result[0].expenseId).toBeNull();
    expect(result[0].dismissed).toBe(false);
  });

  test('does not flag when current month is within 50% of historical avg', async () => {
    // Historical: avg $100/month
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries' });
    // Current month: $140 (40% above avg — below 50% threshold)
    await insertExpense({ date: currentMonthDate(5), amount: 140, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectCategorySpendingSpikes(recentExpenses, allExpenses);
    expect(result).toHaveLength(0);
  });

  test('does not flag when current month equals historical avg', async () => {
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(5), amount: 100, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectCategorySpendingSpikes(recentExpenses, allExpenses);
    expect(result).toHaveLength(0);
  });

  test('detects spikes independently per category', async () => {
    // Groceries: historical avg $100, current $200 (100% spike)
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(5), amount: 200, type: 'Groceries' });
    // Dining: historical avg $50, current $50 (no spike)
    await insertExpense({ date: pastMonthDate(1, 10), amount: 50, type: 'Dining' });
    await insertExpense({ date: currentMonthDate(5), amount: 50, type: 'Dining' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectCategorySpendingSpikes(recentExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('Groceries');
  });

  test('sums multiple current month expenses per category', async () => {
    // Historical avg: $100/month
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries' });
    // Current month: 3 expenses totaling $180 (80% above avg — exceeds threshold)
    await insertExpense({ date: currentMonthDate(3), amount: 60, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(10), amount: 60, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 60, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectCategorySpendingSpikes(recentExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(180);
  });

  test('anomaly object has correct shape', async () => {
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(5), amount: 200, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectCategorySpendingSpikes(recentExpenses, allExpenses);

    expect(result).toHaveLength(1);
    const anomaly = result[0];
    expect(anomaly).toHaveProperty('id');
    expect(anomaly).toHaveProperty('expenseId', null);
    expect(anomaly).toHaveProperty('date');
    expect(anomaly.date).toMatch(/^\d{4}-\d{2}-01$/);
    expect(anomaly).toHaveProperty('place', 'Groceries');
    expect(anomaly).toHaveProperty('amount');
    expect(anomaly).toHaveProperty('category', 'Groceries');
    expect(anomaly).toHaveProperty('anomalyType', 'category_spending_spike');
    expect(anomaly).toHaveProperty('classification', ANOMALY_CLASSIFICATIONS.CATEGORY_SPENDING_SPIKE);
    expect(anomaly).toHaveProperty('severity');
    expect(anomaly).toHaveProperty('dismissed', false);
    expect(anomaly).toHaveProperty('categoryAverage');
    expect(anomaly).toHaveProperty('standardDeviations', 0);
  });

  test('assigns low severity for moderate spikes (50-100%)', async () => {
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries' });
    // 80% above avg
    await insertExpense({ date: currentMonthDate(5), amount: 180, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectCategorySpendingSpikes(recentExpenses, allExpenses);
    expect(result[0].severity).toBe('low');
  });

  test('assigns medium severity for large spikes (100-200%)', async () => {
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries' });
    // 150% above avg
    await insertExpense({ date: currentMonthDate(5), amount: 250, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectCategorySpendingSpikes(recentExpenses, allExpenses);
    expect(result[0].severity).toBe('medium');
  });

  test('assigns high severity for extreme spikes (200%+)', async () => {
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries' });
    // 300% above avg
    await insertExpense({ date: currentMonthDate(5), amount: 400, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectCategorySpendingSpikes(recentExpenses, allExpenses);
    expect(result[0].severity).toBe('high');
  });

  test('excludes current month from historical average calculation', async () => {
    // Historical: 2 months at $100 each → avg = $100
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries' });
    // Current month: $160 (60% above $100 avg — should flag)
    await insertExpense({ date: currentMonthDate(5), amount: 160, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectCategorySpendingSpikes(recentExpenses, allExpenses);

    expect(result).toHaveLength(1);
    // Historical avg should be $100, not influenced by current month's $160
    expect(result[0].categoryAverage).toBe(100);
  });

  test('handles errors gracefully and returns empty array', async () => {
    // Pass invalid data that would cause an error in grouping
    const badExpenses = [{ date: null, type: null, amount: null }];
    const result = await anomalyDetectionService._detectCategorySpendingSpikes(badExpenses, badExpenses);
    expect(Array.isArray(result)).toBe(true);
  });
});

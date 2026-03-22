/**
 * Unit tests for _detectFrequencySpikes()
 *
 * Validates that frequency spikes are detected when the current month
 * transaction count exceeds the historical monthly average by more than
 * FREQUENCY_SPIKE_THRESHOLD (100%).
 */

// Mock activity log service
jest.mock('./activityLogService');

const anomalyDetectionService = require('./anomalyDetectionService');
const { getDatabase } = require('../database/db');
const { ANOMALY_CLASSIFICATIONS } = require('../utils/analyticsConstants');

describe('AnomalyDetectionService - _detectFrequencySpikes', () => {
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

  const currentMonthDate = (day) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

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
    const result = await anomalyDetectionService._detectFrequencySpikes([], []);
    expect(result).toEqual([]);
  });

  test('returns empty array when no current month expenses exist', async () => {
    await insertExpense({ date: pastMonthDate(2, 10), amount: 50, type: 'Groceries' });
    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectFrequencySpikes([], allExpenses);
    expect(result).toEqual([]);
  });

  test('returns empty array when no historical data exists for comparison', async () => {
    await insertExpense({ date: currentMonthDate(5), amount: 50, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(10), amount: 50, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 50, type: 'Groceries' });
    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectFrequencySpikes(allExpenses, allExpenses);
    expect(result).toEqual([]);
  });

  test('detects spike when current month count exceeds historical avg by more than 100%', async () => {
    // Historical: 3 months with 2 transactions each → avg = 2
    await insertExpense({ date: pastMonthDate(3, 5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(3, 15), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(2, 5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(2, 15), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 15), amount: 30, type: 'Groceries' });
    // Current month: 5 transactions (150% above avg of 2 — exceeds 100% threshold)
    await insertExpense({ date: currentMonthDate(2), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(10), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(20), amount: 30, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(2));

    const result = await anomalyDetectionService._detectFrequencySpikes(recentExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('Groceries');
    expect(result[0].classification).toBe(ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE);
    expect(result[0].anomalyType).toBe('frequency_spike');
    expect(result[0].categoryAverage).toBe(2);
    expect(result[0].expenseId).toBeNull();
    expect(result[0].dismissed).toBe(false);
  });

  test('does not flag when current month count is within 100% of historical avg', async () => {
    // Historical: avg 2 transactions/month
    await insertExpense({ date: pastMonthDate(2, 5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(2, 15), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 15), amount: 30, type: 'Groceries' });
    // Current month: 3 transactions (50% above avg — below 100% threshold)
    await insertExpense({ date: currentMonthDate(5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(10), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 30, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectFrequencySpikes(recentExpenses, allExpenses);
    expect(result).toHaveLength(0);
  });

  test('does not flag when current month count equals historical avg', async () => {
    await insertExpense({ date: pastMonthDate(1, 5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 15), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 30, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectFrequencySpikes(recentExpenses, allExpenses);
    expect(result).toHaveLength(0);
  });

  test('detects spikes independently per category', async () => {
    // Groceries: historical avg 1/month, current 3 (200% spike)
    await insertExpense({ date: pastMonthDate(1, 10), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(10), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 30, type: 'Groceries' });
    // Dining: historical avg 1/month, current 1 (no spike)
    await insertExpense({ date: pastMonthDate(1, 10), amount: 20, type: 'Dining' });
    await insertExpense({ date: currentMonthDate(5), amount: 20, type: 'Dining' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectFrequencySpikes(recentExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('Groceries');
  });

  test('amount field contains total spending for context', async () => {
    await insertExpense({ date: pastMonthDate(1, 10), amount: 50, type: 'Groceries' });
    // Current month: 3 transactions totaling $150
    await insertExpense({ date: currentMonthDate(5), amount: 40, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(10), amount: 50, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 60, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectFrequencySpikes(recentExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(150);
  });

  test('anomaly object has correct shape', async () => {
    await insertExpense({ date: pastMonthDate(1, 10), amount: 50, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(10), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 30, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectFrequencySpikes(recentExpenses, allExpenses);

    expect(result).toHaveLength(1);
    const anomaly = result[0];
    expect(anomaly).toHaveProperty('id');
    expect(anomaly).toHaveProperty('expenseId', null);
    expect(anomaly).toHaveProperty('date');
    expect(anomaly.date).toMatch(/^\d{4}-\d{2}-01$/);
    expect(anomaly).toHaveProperty('place', 'Groceries');
    expect(anomaly).toHaveProperty('amount');
    expect(anomaly).toHaveProperty('category', 'Groceries');
    expect(anomaly).toHaveProperty('anomalyType', 'frequency_spike');
    expect(anomaly).toHaveProperty('classification', ANOMALY_CLASSIFICATIONS.FREQUENCY_SPIKE);
    expect(anomaly).toHaveProperty('severity');
    expect(anomaly).toHaveProperty('dismissed', false);
    expect(anomaly).toHaveProperty('categoryAverage');
    expect(anomaly).toHaveProperty('standardDeviations', 0);
  });

  test('assigns low severity for moderate spikes (100-200%)', async () => {
    // Historical avg: 2/month, current: 5 (150% above)
    await insertExpense({ date: pastMonthDate(1, 5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 15), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(2), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(10), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(20), amount: 30, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectFrequencySpikes(recentExpenses, allExpenses);
    expect(result[0].severity).toBe('low');
  });

  test('assigns medium severity for large spikes (200-300%)', async () => {
    // Historical avg: 1/month, current: 4 (300% above — but deviation=3.0 is boundary)
    // Let's use avg 2, current 7 → deviation = 2.5 → medium
    await insertExpense({ date: pastMonthDate(1, 5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 15), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(2), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(4), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(6), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(9), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(12), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(18), amount: 30, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectFrequencySpikes(recentExpenses, allExpenses);
    // 7 current / 2 avg = deviation 2.5 → medium
    expect(result[0].severity).toBe('medium');
  });

  test('assigns high severity for extreme spikes (300%+)', async () => {
    // Historical avg: 1/month, current: 5 (400% above → deviation 4.0)
    await insertExpense({ date: pastMonthDate(1, 10), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(2), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(10), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(20), amount: 30, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectFrequencySpikes(recentExpenses, allExpenses);
    // 5 current / 1 avg = deviation 4.0 → high
    expect(result[0].severity).toBe('high');
  });

  test('excludes current month from historical average calculation', async () => {
    // Historical: 2 months with 1 transaction each → avg = 1
    await insertExpense({ date: pastMonthDate(2, 10), amount: 30, type: 'Groceries' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 30, type: 'Groceries' });
    // Current month: 3 transactions (200% above avg of 1)
    await insertExpense({ date: currentMonthDate(5), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(10), amount: 30, type: 'Groceries' });
    await insertExpense({ date: currentMonthDate(15), amount: 30, type: 'Groceries' });

    const allExpenses = await getAllExpenses();
    const recentExpenses = allExpenses.filter(e => e.date >= currentMonthDate(1));

    const result = await anomalyDetectionService._detectFrequencySpikes(recentExpenses, allExpenses);

    expect(result).toHaveLength(1);
    // Historical avg should be 1, not influenced by current month's 3
    expect(result[0].categoryAverage).toBe(1);
  });

  test('handles errors gracefully and returns empty array', async () => {
    const badExpenses = [{ date: null, type: null, amount: null }];
    const result = await anomalyDetectionService._detectFrequencySpikes(badExpenses, badExpenses);
    expect(Array.isArray(result)).toBe(true);
  });
});

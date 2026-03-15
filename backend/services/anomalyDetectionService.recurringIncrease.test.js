/**
 * Unit tests for _detectRecurringExpenseIncreases()
 *
 * Validates that recurring expense increases are detected when the most recent
 * amount at a merchant exceeds the average of the previous 2 occurrences by
 * more than RECURRING_INCREASE_THRESHOLD (20%).
 */

// Mock activity log service
jest.mock('./activityLogService');

const anomalyDetectionService = require('./anomalyDetectionService');
const { getDatabase } = require('../database/db');
const { ANOMALY_CLASSIFICATIONS, DETECTION_THRESHOLDS } = require('../utils/analyticsConstants');

describe('AnomalyDetectionService - _detectRecurringExpenseIncreases', () => {
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

  const pastMonthDate = (monthsAgo, day) => {
    const now = new Date();
    now.setMonth(now.getMonth() - monthsAgo);
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const currentMonthDate = (day) => {
    const now = new Date();
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
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases([], []);
    expect(result).toEqual([]);
  });

  test('returns empty array when merchant has fewer than 3 transactions', async () => {
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 110, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);
    expect(result).toEqual([]);
  });

  test('detects increase when most recent amount exceeds avg of previous 2 by >20%', async () => {
    // Previous 2: $100, $100 → avg = $100
    // Most recent: $130 → 30% increase (exceeds 20% threshold)
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 130, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].place).toBe('Costco');
    expect(result[0].classification).toBe(ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE);
    expect(result[0].anomalyType).toBe('recurring_expense_increase');
    expect(result[0].amount).toBe(130);
    expect(result[0].categoryAverage).toBe(100);
    expect(result[0].dismissed).toBe(false);
  });

  test('does not flag when increase is within 20% threshold', async () => {
    // Previous 2: $100, $100 → avg = $100
    // Most recent: $115 → 15% increase (below 20% threshold)
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 115, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);
    expect(result).toHaveLength(0);
  });

  test('does not flag when most recent amount equals avg of previous 2', async () => {
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);
    expect(result).toHaveLength(0);
  });

  test('does not flag when most recent amount is lower than avg', async () => {
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 80, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);
    expect(result).toHaveLength(0);
  });

  test('uses last 3 transactions sorted by date ascending', async () => {
    // Insert out of order — the method should sort by date
    await insertExpense({ date: pastMonthDate(1, 10), amount: 150, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(150);
    expect(result[0].categoryAverage).toBe(100);
  });

  test('only considers last 3 transactions when merchant has more', async () => {
    // 5 transactions: $50, $60, $100, $100, $130
    // Last 3: $100, $100, $130 → avg of prev 2 = $100, most recent = $130 (30% increase)
    await insertExpense({ date: pastMonthDate(5, 10), amount: 50, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(4, 10), amount: 60, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 130, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(130);
    expect(result[0].categoryAverage).toBe(100);
  });

  test('detects increases independently per merchant', async () => {
    // Costco: $100, $100, $130 → 30% increase (flagged)
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 130, type: 'Groceries', place: 'Costco' });
    // Walmart: $50, $50, $50 → no increase (not flagged)
    await insertExpense({ date: pastMonthDate(3, 10), amount: 50, type: 'Groceries', place: 'Walmart' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 50, type: 'Groceries', place: 'Walmart' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 50, type: 'Groceries', place: 'Walmart' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].place).toBe('Costco');
  });

  test('anomaly object has correct shape', async () => {
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 130, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    expect(result).toHaveLength(1);
    const anomaly = result[0];
    expect(anomaly).toHaveProperty('id');
    expect(anomaly).toHaveProperty('expenseId');
    expect(typeof anomaly.expenseId).toBe('number');
    expect(anomaly).toHaveProperty('date');
    expect(anomaly).toHaveProperty('place', 'Costco');
    expect(anomaly).toHaveProperty('amount', 130);
    expect(anomaly).toHaveProperty('category', 'Groceries');
    expect(anomaly).toHaveProperty('anomalyType', 'recurring_expense_increase');
    expect(anomaly).toHaveProperty('classification', ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE);
    expect(anomaly).toHaveProperty('severity');
    expect(anomaly).toHaveProperty('dismissed', false);
    expect(anomaly).toHaveProperty('categoryAverage');
    expect(anomaly).toHaveProperty('standardDeviations', 0);
  });

  test('assigns low severity for moderate increases (20-50%)', async () => {
    // 30% increase
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 130, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);
    expect(result[0].severity).toBe('low');
  });

  test('assigns medium severity for large increases (50-100%)', async () => {
    // 75% increase
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 175, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);
    expect(result[0].severity).toBe('medium');
  });

  test('assigns high severity for extreme increases (100%+)', async () => {
    // 150% increase
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 250, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);
    expect(result[0].severity).toBe('high');
  });

  test('skips expenses with empty place field', async () => {
    // Pass expenses directly (bypassing DB) to test empty-place filtering
    const expenses = [
      { id: 1, date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: '' },
      { id: 2, date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: '' },
      { id: 3, date: pastMonthDate(1, 10), amount: 200, type: 'Groceries', place: '' }
    ];
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(expenses, expenses);
    expect(result).toHaveLength(0);
  });

  test('handles errors gracefully and returns empty array', async () => {
    const badExpenses = [{ date: null, type: null, amount: null, place: null }];
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(badExpenses, badExpenses);
    expect(Array.isArray(result)).toBe(true);
  });

  test('expenseId references the most recent transaction', async () => {
    const id1 = await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    const id2 = await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    const id3 = await insertExpense({ date: pastMonthDate(1, 10), amount: 130, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].expenseId).toBe(id3);
  });
});

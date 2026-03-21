/**
 * Unit tests for _detectRecurringExpenseIncreases()
 *
 * Validates that recurring expense increases are detected using pattern-based
 * clustering. The method clusters transactions by amount similarity (20% tolerance),
 * finds the cluster containing the most recent transaction, and flags if the most
 * recent amount exceeds the cluster median by more than RECURRING_INCREASE_THRESHOLD (20%).
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

  test('detects increase when most recent amount exceeds cluster median by >20%', async () => {
    // Build a cluster of $100 transactions, then spike to $150 (50% increase)
    // The $150 is too far from $100 center (50% > 20% tolerance) so it forms its own cluster.
    // Instead, use a gradual increase: $100, $100, $100, $125 (within 20% of $100 center → same cluster)
    // Then the most recent at $125 vs median of prior ($100) = 25% increase → flagged
    await insertExpense({ date: pastMonthDate(4, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 125, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].place).toBe('Costco');
    expect(result[0].classification).toBe(ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE);
    expect(result[0].anomalyType).toBe('recurring_expense_increase');
    expect(result[0].amount).toBe(125);
    expect(result[0].categoryAverage).toBe(100);
    expect(result[0].dismissed).toBe(false);
  });

  test('does not flag when increase is within 20% threshold', async () => {
    // $100, $100, $100, $115 → $115 is within 20% of cluster center, 15% increase → not flagged
    await insertExpense({ date: pastMonthDate(4, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 115, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);
    expect(result).toHaveLength(0);
  });

  test('does not flag when most recent amount equals cluster median', async () => {
    await insertExpense({ date: pastMonthDate(4, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 100, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);
    expect(result).toHaveLength(0);
  });

  test('does not flag when most recent amount is lower than cluster median', async () => {
    await insertExpense({ date: pastMonthDate(4, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 80, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);
    expect(result).toHaveLength(0);
  });

  test('sorts transactions by date and detects increase correctly', async () => {
    // Insert out of order — the method should sort by date
    await insertExpense({ date: pastMonthDate(1, 10), amount: 120, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(4, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    // $120 is within 20% of $100 center, so it joins the cluster
    // Median of prior 3 ($100,$100,$100) = $100, deviation = 20% → at threshold, not flagged
    // (threshold is >20%, not >=20%)
    expect(result).toHaveLength(0);
  });

  test('uses pattern clustering to ignore unrelated transactions at same merchant', async () => {
    // WCSOPA-like scenario: monthly $500 charges + occasional small purchases
    // The $500 cluster should be evaluated independently
    await insertExpense({ date: pastMonthDate(6, 15), amount: 500, type: 'Services', place: 'WCSOPA' });
    await insertExpense({ date: pastMonthDate(5, 3), amount: 25, type: 'Services', place: 'WCSOPA' });
    await insertExpense({ date: pastMonthDate(5, 15), amount: 500, type: 'Services', place: 'WCSOPA' });
    await insertExpense({ date: pastMonthDate(4, 15), amount: 500, type: 'Services', place: 'WCSOPA' });
    await insertExpense({ date: pastMonthDate(3, 8), amount: 45, type: 'Services', place: 'WCSOPA' });
    await insertExpense({ date: pastMonthDate(3, 15), amount: 500, type: 'Services', place: 'WCSOPA' });
    await insertExpense({ date: pastMonthDate(2, 15), amount: 500, type: 'Services', place: 'WCSOPA' });
    await insertExpense({ date: pastMonthDate(1, 15), amount: 500, type: 'Services', place: 'WCSOPA' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    // Most recent ($500) matches the $500 cluster. Median of prior $500s = $500.
    // No increase → not flagged. The $25 and $45 one-offs don't pollute the baseline.
    expect(result).toHaveLength(0);
  });

  test('detects increase within a pattern cluster even with unrelated transactions', async () => {
    // Monthly $100 charges with one-off $20 purchases, then a spike to $125
    await insertExpense({ date: pastMonthDate(5, 15), amount: 100, type: 'Groceries', place: 'ShopX' });
    await insertExpense({ date: pastMonthDate(4, 5), amount: 20, type: 'Groceries', place: 'ShopX' });
    await insertExpense({ date: pastMonthDate(4, 15), amount: 100, type: 'Groceries', place: 'ShopX' });
    await insertExpense({ date: pastMonthDate(3, 15), amount: 100, type: 'Groceries', place: 'ShopX' });
    await insertExpense({ date: pastMonthDate(2, 5), amount: 20, type: 'Groceries', place: 'ShopX' });
    await insertExpense({ date: pastMonthDate(2, 15), amount: 100, type: 'Groceries', place: 'ShopX' });
    await insertExpense({ date: pastMonthDate(1, 15), amount: 125, type: 'Groceries', place: 'ShopX' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    // $125 is within 20% of $100 center → joins the $100 cluster
    // Median of prior cluster members ($100,$100,$100,$100) = $100
    // Deviation = 25% > 20% threshold → flagged
    expect(result).toHaveLength(1);
    expect(result[0].place).toBe('ShopX');
    expect(result[0].amount).toBe(125);
    expect(result[0].categoryAverage).toBe(100);
  });

  test('does not flag when cluster has fewer than 3 members', async () => {
    // Only 2 transactions in the matching cluster (even though merchant has 3+ total)
    await insertExpense({ date: pastMonthDate(3, 10), amount: 20, type: 'Groceries', place: 'Store' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Store' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 105, type: 'Groceries', place: 'Store' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    // $100 and $105 cluster together (5% diff), but only 2 members → not enough
    expect(result).toHaveLength(0);
  });

  test('detects increases independently per merchant', async () => {
    // Costco: recurring $100 pattern with spike to $125 → flagged
    await insertExpense({ date: pastMonthDate(4, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 125, type: 'Groceries', place: 'Costco' });
    // Walmart: stable $50 pattern → not flagged
    await insertExpense({ date: pastMonthDate(4, 10), amount: 50, type: 'Groceries', place: 'Walmart' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 50, type: 'Groceries', place: 'Walmart' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 50, type: 'Groceries', place: 'Walmart' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 50, type: 'Groceries', place: 'Walmart' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].place).toBe('Costco');
  });

  test('anomaly object has correct shape', async () => {
    await insertExpense({ date: pastMonthDate(4, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 125, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    expect(result).toHaveLength(1);
    const anomaly = result[0];
    expect(anomaly).toHaveProperty('id');
    expect(anomaly).toHaveProperty('expenseId');
    expect(typeof anomaly.expenseId).toBe('number');
    expect(anomaly).toHaveProperty('date');
    expect(anomaly).toHaveProperty('place', 'Costco');
    expect(anomaly).toHaveProperty('amount', 125);
    expect(anomaly).toHaveProperty('category', 'Groceries');
    expect(anomaly).toHaveProperty('anomalyType', 'recurring_expense_increase');
    expect(anomaly).toHaveProperty('classification', ANOMALY_CLASSIFICATIONS.RECURRING_EXPENSE_INCREASE);
    expect(anomaly).toHaveProperty('severity');
    expect(anomaly).toHaveProperty('dismissed', false);
    expect(anomaly).toHaveProperty('categoryAverage');
    expect(anomaly).toHaveProperty('standardDeviations', 0);
  });

  test('assigns low severity for moderate increases (20-50%)', async () => {
    // 25% increase within cluster
    await insertExpense({ date: pastMonthDate(4, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 125, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('low');
  });

  test('assigns medium severity for large increases (50-100%)', async () => {
    // Many $100 transactions to anchor the cluster center, then a $155 spike
    // $155 vs center ~$104 → 49% diff, within 50% tolerance → joins cluster
    // Median of prior [100,100,100,100,100,100,105] = 100
    // Deviation = (155-100)/100 = 55% → medium severity
    const expenses = [
      { id: 1, date: pastMonthDate(8, 10), amount: 100, type: 'Groceries', place: 'Costco' },
      { id: 2, date: pastMonthDate(7, 10), amount: 100, type: 'Groceries', place: 'Costco' },
      { id: 3, date: pastMonthDate(6, 10), amount: 100, type: 'Groceries', place: 'Costco' },
      { id: 4, date: pastMonthDate(5, 10), amount: 100, type: 'Groceries', place: 'Costco' },
      { id: 5, date: pastMonthDate(4, 10), amount: 100, type: 'Groceries', place: 'Costco' },
      { id: 6, date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' },
      { id: 7, date: pastMonthDate(2, 10), amount: 105, type: 'Groceries', place: 'Costco' },
      { id: 8, date: pastMonthDate(1, 10), amount: 150, type: 'Groceries', place: 'Costco' }
    ];
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(expenses, expenses);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('medium');
  });

  test('assigns high severity for extreme increases (100%+)', async () => {
    // Gradual ramp where no consecutive gap exceeds 1.8×, so all land in one cluster
    // Sorted: [50,60,70,80,100,120,140,170,200] — all gaps under 1.8×
    // Median of prior [50,60,70,80,100,120,140,170] = 90
    // Deviation = (200-90)/90 = 122% → high severity
    const expenses = [
      { id: 1, date: pastMonthDate(9, 10), amount: 50, type: 'Groceries', place: 'Costco' },
      { id: 2, date: pastMonthDate(8, 10), amount: 60, type: 'Groceries', place: 'Costco' },
      { id: 3, date: pastMonthDate(7, 10), amount: 70, type: 'Groceries', place: 'Costco' },
      { id: 4, date: pastMonthDate(6, 10), amount: 80, type: 'Groceries', place: 'Costco' },
      { id: 5, date: pastMonthDate(5, 10), amount: 100, type: 'Groceries', place: 'Costco' },
      { id: 6, date: pastMonthDate(4, 10), amount: 120, type: 'Groceries', place: 'Costco' },
      { id: 7, date: pastMonthDate(3, 10), amount: 140, type: 'Groceries', place: 'Costco' },
      { id: 8, date: pastMonthDate(2, 10), amount: 170, type: 'Groceries', place: 'Costco' },
      { id: 9, date: pastMonthDate(1, 10), amount: 200, type: 'Groceries', place: 'Costco' }
    ];
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(expenses, expenses);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
  });

  test('severity calculation returns correct levels', () => {
    // Direct unit test of the severity thresholds
    expect(anomalyDetectionService._calculateRecurringIncreaseSeverity(0.25)).toBe('low');
    expect(anomalyDetectionService._calculateRecurringIncreaseSeverity(0.49)).toBe('low');
    expect(anomalyDetectionService._calculateRecurringIncreaseSeverity(0.50)).toBe('medium');
    expect(anomalyDetectionService._calculateRecurringIncreaseSeverity(0.75)).toBe('medium');
    expect(anomalyDetectionService._calculateRecurringIncreaseSeverity(1.0)).toBe('high');
    expect(anomalyDetectionService._calculateRecurringIncreaseSeverity(2.0)).toBe('high');
  });

  test('skips expenses with empty place field', async () => {
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
    const id1 = await insertExpense({ date: pastMonthDate(4, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    const id2 = await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    const id3 = await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    const id4 = await insertExpense({ date: pastMonthDate(1, 10), amount: 125, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases(allExpenses, allExpenses);

    expect(result).toHaveLength(1);
    expect(result[0].expenseId).toBe(id4);
  });

  test('only flags when most recent transaction is in recentExpenses lookback window', async () => {
    // 4 transactions, but the most recent is NOT in the recentExpenses set
    await insertExpense({ date: pastMonthDate(4, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(3, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(2, 10), amount: 100, type: 'Groceries', place: 'Costco' });
    await insertExpense({ date: pastMonthDate(1, 10), amount: 125, type: 'Groceries', place: 'Costco' });

    const allExpenses = await getAllExpenses();
    // Pass empty recentExpenses — the most recent won't be in the lookback window
    const result = await anomalyDetectionService._detectRecurringExpenseIncreases([], allExpenses);
    expect(result).toHaveLength(0);
  });
});

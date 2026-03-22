/**
 * Unit tests for calculateCategoryBaseline() — extended fields
 * 
 * Validates that monthlyAverages and transactionCounts are correctly
 * computed alongside the existing baseline fields.
 */

// Mock activity log service
jest.mock('./activityLogService');

const anomalyDetectionService = require('./anomalyDetectionService');
const { getDatabase } = require('../database/db');

describe('AnomalyDetectionService - calculateCategoryBaseline extended fields', () => {
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

  test('returns empty monthlyAverages and transactionCounts when no expenses exist', async () => {
    const baseline = await anomalyDetectionService.calculateCategoryBaseline('Groceries');

    expect(baseline.monthlyAverages).toEqual({});
    expect(baseline.transactionCounts).toEqual({});
    expect(baseline.hasValidBaseline).toBe(false);
  });

  test('returns empty monthlyAverages and transactionCounts when category has no expenses', async () => {
    await insertExpense({ date: '2024-03-15', amount: 50, type: 'Dining' });

    const baseline = await anomalyDetectionService.calculateCategoryBaseline('Groceries');

    expect(baseline.monthlyAverages).toEqual({});
    expect(baseline.transactionCounts).toEqual({});
  });

  test('computes monthlyAverages as total per month', async () => {
    await insertExpense({ date: '2024-01-10', amount: 100, type: 'Groceries' });
    await insertExpense({ date: '2024-01-20', amount: 50, type: 'Groceries' });
    await insertExpense({ date: '2024-02-15', amount: 75, type: 'Groceries' });

    const baseline = await anomalyDetectionService.calculateCategoryBaseline('Groceries');

    expect(baseline.monthlyAverages).toEqual({
      '2024-01': 150,
      '2024-02': 75
    });
  });

  test('computes transactionCounts as count per month', async () => {
    await insertExpense({ date: '2024-01-10', amount: 100, type: 'Groceries' });
    await insertExpense({ date: '2024-01-20', amount: 50, type: 'Groceries' });
    await insertExpense({ date: '2024-02-15', amount: 75, type: 'Groceries' });

    const baseline = await anomalyDetectionService.calculateCategoryBaseline('Groceries');

    expect(baseline.transactionCounts).toEqual({
      '2024-01': 2,
      '2024-02': 1
    });
  });

  test('preserves all existing baseline fields', async () => {
    await insertExpense({ date: '2024-01-10', amount: 100, type: 'Groceries' });
    await insertExpense({ date: '2024-02-15', amount: 200, type: 'Groceries' });
    await insertExpense({ date: '2024-03-20', amount: 150, type: 'Groceries' });

    const baseline = await anomalyDetectionService.calculateCategoryBaseline('Groceries');

    expect(baseline).toHaveProperty('category', 'Groceries');
    expect(baseline).toHaveProperty('mean');
    expect(baseline).toHaveProperty('stdDev');
    expect(baseline).toHaveProperty('transactionMean');
    expect(baseline).toHaveProperty('transactionStdDev');
    expect(baseline).toHaveProperty('count', 3);
    expect(baseline).toHaveProperty('monthsWithData', 3);
    expect(baseline).toHaveProperty('hasValidBaseline');
    expect(baseline).toHaveProperty('monthlyAverages');
    expect(baseline).toHaveProperty('transactionCounts');

    // mean/stdDev are now monthly-based (each month has 1 expense here)
    // Monthly totals: [100, 200, 150], mean = 150
    expect(baseline.mean).toBe(150);
    // transactionMean is per-transaction: (100+200+150)/3 = 150
    expect(baseline.transactionMean).toBe(150);
  });

  test('monthlyAverages values are rounded to 2 decimal places', async () => {
    await insertExpense({ date: '2024-01-10', amount: 33.33, type: 'Groceries' });
    await insertExpense({ date: '2024-01-20', amount: 33.33, type: 'Groceries' });
    await insertExpense({ date: '2024-01-25', amount: 33.34, type: 'Groceries' });

    const baseline = await anomalyDetectionService.calculateCategoryBaseline('Groceries');

    expect(baseline.monthlyAverages['2024-01']).toBe(100);
  });

  test('only includes expenses from the requested category', async () => {
    await insertExpense({ date: '2024-01-10', amount: 100, type: 'Groceries' });
    await insertExpense({ date: '2024-01-15', amount: 200, type: 'Dining' });
    await insertExpense({ date: '2024-01-20', amount: 50, type: 'Groceries' });

    const baseline = await anomalyDetectionService.calculateCategoryBaseline('Groceries');

    expect(baseline.monthlyAverages).toEqual({ '2024-01': 150 });
    expect(baseline.transactionCounts).toEqual({ '2024-01': 2 });
  });
});

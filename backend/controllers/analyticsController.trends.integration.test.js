/**
 * Trends API Integration Tests
 *
 * Tests the full controller → service → repository stack with a real SQLite
 * test database for the GET /api/analytics/trends/:year/:month endpoint.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 13.4
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const express = require('express');
const request = require('supertest');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

let db;
let app;

function createTestApp() {
  const testApp = express();
  testApp.use(express.json());
  const analyticsRoutes = require('../routes/analyticsRoutes');
  testApp.use('/api/analytics', analyticsRoutes);
  return testApp;
}

beforeAll(async () => {
  db = await createIsolatedTestDb();

  // Override the database module to use our isolated db
  const dbModule = require('../database/db');
  dbModule.getDatabase = () => Promise.resolve(db);

  app = createTestApp();
});

afterAll(() => {
  cleanupIsolatedTestDb(db);
});

// ─── Helpers ───

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function insertExpense({ date, place, type, amount, method = 'Cash', week = 1 }) {
  await runSql(
    `INSERT INTO expenses (date, place, type, amount, method, week) VALUES (?, ?, ?, ?, ?, ?)`,
    [date, place, type, amount, method, week]
  );
}

async function clearData() {
  await runSql('DELETE FROM expenses');
}

/**
 * Seed expenses across multiple months to trigger data sufficiency.
 * Inserts 3+ months of data (the minimum for pattern analysis).
 * Uses months prior to the target month so they count as "completed".
 */
async function seedMultiMonthExpenses(targetYear, targetMonth) {
  const months = [];
  let y = targetYear;
  let m = targetMonth;
  // Go back 6 months from the target (not including target)
  for (let i = 0; i < 6; i++) {
    m--;
    if (m < 1) { m = 12; y--; }
    months.push({ year: y, month: m });
  }

  for (const { year, month } of months) {
    const monthStr = String(month).padStart(2, '0');
    // Insert several expenses per month with the same merchant to create recurring patterns
    await insertExpense({ date: `${year}-${monthStr}-05`, place: 'Netflix', type: 'Entertainment', amount: 15.99 });
    await insertExpense({ date: `${year}-${monthStr}-10`, place: 'Costco', type: 'Groceries', amount: 150.00 });
    await insertExpense({ date: `${year}-${monthStr}-15`, place: 'Shell', type: 'Gas', amount: 60.00 });
    await insertExpense({ date: `${year}-${monthStr}-20`, place: 'Amazon', type: 'Shopping', amount: 45.00 });
  }
}

// ─── Tests ───

describe('GET /api/analytics/trends/:year/:month', () => {
  beforeEach(async () => {
    await clearData();
  });

  describe('valid response shape', () => {
    test('should return all expected top-level fields', async () => {
      // Insert at least one expense so the endpoint has something to work with
      await insertExpense({ date: '2025-03-10', place: 'Store', type: 'Groceries', amount: 100 });

      const res = await request(app)
        .get('/api/analytics/trends/2025/3')
        .expect(200);

      expect(res.body).toHaveProperty('prediction');
      expect(res.body).toHaveProperty('monthlyHistory');
      expect(res.body).toHaveProperty('recurringPatterns');
      expect(res.body).toHaveProperty('dataSufficiency');
      expect(res.body).toHaveProperty('dataQuality');
    });

    test('should return dataSufficiency as an object with boolean flags', async () => {
      await insertExpense({ date: '2025-03-10', place: 'Store', type: 'Groceries', amount: 100 });

      const res = await request(app)
        .get('/api/analytics/trends/2025/3')
        .expect(200);

      const ds = res.body.dataSufficiency;
      expect(ds).toHaveProperty('prediction');
      expect(ds).toHaveProperty('monthlyHistory');
      expect(ds).toHaveProperty('recurringPatterns');
      expect(typeof ds.prediction).toBe('boolean');
      expect(typeof ds.monthlyHistory).toBe('boolean');
      expect(typeof ds.recurringPatterns).toBe('boolean');
    });

    test('should return dataQuality with score and monthsOfData', async () => {
      await insertExpense({ date: '2025-03-10', place: 'Store', type: 'Groceries', amount: 100 });

      const res = await request(app)
        .get('/api/analytics/trends/2025/3')
        .expect(200);

      expect(res.body.dataQuality).toHaveProperty('score');
      expect(res.body.dataQuality).toHaveProperty('monthsOfData');
      expect(typeof res.body.dataQuality.score).toBe('number');
      expect(typeof res.body.dataQuality.monthsOfData).toBe('number');
    });
  });

  describe('data sufficiency flags and null sub-sections', () => {
    test('should return null sub-sections when insufficient data', async () => {
      // Only one month of data — not enough for patterns
      await insertExpense({ date: '2025-06-10', place: 'Store', type: 'Groceries', amount: 100 });

      const res = await request(app)
        .get('/api/analytics/trends/2025/6')
        .expect(200);

      // With only 1 month, recurringPatterns should be insufficient
      if (!res.body.dataSufficiency.recurringPatterns) {
        expect(res.body.recurringPatterns).toBeNull();
      }
    });

    test('should return non-null sub-sections when data is sufficient', async () => {
      // Seed 6 months of data before the target month
      await seedMultiMonthExpenses(2025, 6);
      // Also add data in the target month for prediction
      await insertExpense({ date: '2025-06-10', place: 'Costco', type: 'Groceries', amount: 150 });

      const res = await request(app)
        .get('/api/analytics/trends/2025/6')
        .expect(200);

      // With 6 months of history, monthlyHistory should be sufficient
      expect(res.body.dataSufficiency.monthlyHistory).toBe(true);
      expect(res.body.monthlyHistory).not.toBeNull();
      expect(Array.isArray(res.body.monthlyHistory)).toBe(true);
      expect(res.body.monthlyHistory.length).toBeGreaterThan(0);
    });

    test('consistency: if dataSufficiency flag is false, corresponding field is null', async () => {
      await insertExpense({ date: '2025-06-10', place: 'Store', type: 'Groceries', amount: 50 });

      const res = await request(app)
        .get('/api/analytics/trends/2025/6')
        .expect(200);

      const { dataSufficiency } = res.body;
      const sections = ['prediction', 'monthlyHistory', 'recurringPatterns'];

      for (const section of sections) {
        if (dataSufficiency[section] === false) {
          expect(res.body[section]).toBeNull();
        }
        if (dataSufficiency[section] === true) {
          expect(res.body[section]).not.toBeNull();
        }
      }
    });
  });

  describe('data quality score', () => {
    test('should return score 0 and monthsOfData 0 when no expenses exist', async () => {
      const res = await request(app)
        .get('/api/analytics/trends/2025/6')
        .expect(200);

      expect(res.body.dataQuality.score).toBe(0);
      expect(res.body.dataQuality.monthsOfData).toBe(0);
    });

    test('should exclude current month from monthsOfData count', async () => {
      // Insert data only in the target month (June 2025)
      await insertExpense({ date: '2025-06-10', place: 'Store', type: 'Groceries', amount: 100 });

      const res = await request(app)
        .get('/api/analytics/trends/2025/6')
        .expect(200);

      // The target month is treated as "current" and excluded
      expect(res.body.dataQuality.monthsOfData).toBe(0);
    });

    test('should count completed months in monthsOfData', async () => {
      // Insert data in 3 months before the target
      await insertExpense({ date: '2025-03-10', place: 'Store', type: 'Groceries', amount: 100 });
      await insertExpense({ date: '2025-04-10', place: 'Store', type: 'Groceries', amount: 100 });
      await insertExpense({ date: '2025-05-10', place: 'Store', type: 'Groceries', amount: 100 });

      const res = await request(app)
        .get('/api/analytics/trends/2025/6')
        .expect(200);

      expect(res.body.dataQuality.monthsOfData).toBe(3);
    });

    test('should return score between 0 and 100', async () => {
      await seedMultiMonthExpenses(2025, 6);

      const res = await request(app)
        .get('/api/analytics/trends/2025/6')
        .expect(200);

      expect(res.body.dataQuality.score).toBeGreaterThanOrEqual(0);
      expect(res.body.dataQuality.score).toBeLessThanOrEqual(100);
    });
  });

  describe('monthly history shape', () => {
    test('should return history entries with year, month, total fields', async () => {
      await seedMultiMonthExpenses(2025, 6);

      const res = await request(app)
        .get('/api/analytics/trends/2025/6')
        .expect(200);

      expect(res.body.monthlyHistory).not.toBeNull();
      for (const entry of res.body.monthlyHistory) {
        expect(entry).toHaveProperty('year');
        expect(entry).toHaveProperty('month');
        expect(entry).toHaveProperty('total');
        expect(typeof entry.year).toBe('number');
        expect(typeof entry.month).toBe('number');
        expect(typeof entry.total).toBe('number');
      }
    });

    test('should return history sorted chronologically', async () => {
      await seedMultiMonthExpenses(2025, 6);

      const res = await request(app)
        .get('/api/analytics/trends/2025/6')
        .expect(200);

      const history = res.body.monthlyHistory;
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1].year * 12 + history[i - 1].month;
        const curr = history[i].year * 12 + history[i].month;
        expect(curr).toBeGreaterThan(prev);
      }
    });
  });

  describe('empty data', () => {
    test('should handle a month with no expenses gracefully', async () => {
      const res = await request(app)
        .get('/api/analytics/trends/2025/6')
        .expect(200);

      // All sub-sections should be null or empty
      expect(res.body.dataSufficiency.monthlyHistory).toBe(false);
      expect(res.body.monthlyHistory).toBeNull();
      expect(res.body.dataSufficiency.recurringPatterns).toBe(false);
      expect(res.body.recurringPatterns).toBeNull();
      expect(res.body.dataQuality.score).toBe(0);
      expect(res.body.dataQuality.monthsOfData).toBe(0);
    });
  });

  describe('invalid parameters', () => {
    test('should return 400 for non-numeric year', async () => {
      const res = await request(app)
        .get('/api/analytics/trends/abc/6')
        .expect(400);

      expect(res.body.error).toMatch(/invalid year/i);
    });

    test('should return 400 for year below 2000', async () => {
      const res = await request(app)
        .get('/api/analytics/trends/1999/6')
        .expect(400);

      expect(res.body.error).toMatch(/invalid year/i);
    });

    test('should return 400 for year above 2100', async () => {
      const res = await request(app)
        .get('/api/analytics/trends/2101/6')
        .expect(400);

      expect(res.body.error).toMatch(/invalid year/i);
    });

    test('should return 400 for month 0', async () => {
      const res = await request(app)
        .get('/api/analytics/trends/2025/0')
        .expect(400);

      expect(res.body.error).toMatch(/invalid month/i);
    });

    test('should return 400 for month 13', async () => {
      const res = await request(app)
        .get('/api/analytics/trends/2025/13')
        .expect(400);

      expect(res.body.error).toMatch(/invalid month/i);
    });

    test('should return 400 for non-numeric month', async () => {
      const res = await request(app)
        .get('/api/analytics/trends/2025/abc')
        .expect(400);

      expect(res.body.error).toMatch(/invalid month/i);
    });
  });
});

/**
 * Monthly Summary API Integration Tests
 *
 * Tests the full controller → service → repository stack with a real SQLite
 * test database for the GET /api/analytics/monthly-summary/:year/:month endpoint.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 13.4
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

async function insertBudget({ year, month, category, limit }) {
  await runSql(
    `INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)`,
    [year, month, category, limit]
  );
}

async function clearData() {
  await runSql('DELETE FROM expenses');
  await runSql('DELETE FROM budgets');
}

// ─── Tests ───

describe('GET /api/analytics/monthly-summary/:year/:month', () => {
  beforeEach(async () => {
    await clearData();
  });

  describe('valid response shape', () => {
    test('should return all expected fields with correct types', async () => {
      await insertExpense({ date: '2025-03-10', place: 'Costco', type: 'Groceries', amount: 100 });

      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/3')
        .expect(200);

      expect(res.body).toHaveProperty('totalSpending');
      expect(res.body).toHaveProperty('topCategories');
      expect(res.body).toHaveProperty('topMerchants');
      expect(res.body).toHaveProperty('monthOverMonth');
      expect(res.body).toHaveProperty('budgetSummary');
      expect(typeof res.body.totalSpending).toBe('number');
      expect(Array.isArray(res.body.topCategories)).toBe(true);
      expect(Array.isArray(res.body.topMerchants)).toBe(true);
    });
  });

  describe('top-5 ranking', () => {
    test('should return top 5 categories sorted by total descending', async () => {
      const categories = [
        { type: 'Groceries', amount: 500 },
        { type: 'Gas', amount: 400 },
        { type: 'Dining Out', amount: 300 },
        { type: 'Entertainment', amount: 200 },
        { type: 'Utilities', amount: 100 },
        { type: 'Other', amount: 50 },
      ];
      for (const c of categories) {
        await insertExpense({ date: '2025-06-15', place: 'Store', type: c.type, amount: c.amount });
      }

      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/6')
        .expect(200);

      expect(res.body.topCategories).toHaveLength(5);
      expect(res.body.topCategories[0].category).toBe('Groceries');
      expect(res.body.topCategories[0].total).toBe(500);
      expect(res.body.topCategories[4].category).toBe('Utilities');
      // 'Other' (50) should be excluded from top 5
      const names = res.body.topCategories.map(c => c.category);
      expect(names).not.toContain('Other');
    });

    test('should return top 5 merchants sorted by total descending', async () => {
      const merchants = [
        { place: 'Costco', amount: 600 },
        { place: 'Walmart', amount: 500 },
        { place: 'Amazon', amount: 400 },
        { place: 'Loblaws', amount: 300 },
        { place: 'Metro', amount: 200 },
        { place: 'Shoppers', amount: 100 },
      ];
      for (const m of merchants) {
        await insertExpense({ date: '2025-06-15', place: m.place, type: 'Groceries', amount: m.amount });
      }

      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/6')
        .expect(200);

      expect(res.body.topMerchants).toHaveLength(5);
      expect(res.body.topMerchants[0].merchant).toBe('Costco');
      expect(res.body.topMerchants[0].total).toBe(600);
      expect(res.body.topMerchants[4].merchant).toBe('Metro');
      const names = res.body.topMerchants.map(m => m.merchant);
      expect(names).not.toContain('Shoppers');
    });

    test('should aggregate multiple expenses per category', async () => {
      await insertExpense({ date: '2025-06-01', place: 'Store A', type: 'Groceries', amount: 100 });
      await insertExpense({ date: '2025-06-15', place: 'Store B', type: 'Groceries', amount: 200 });
      await insertExpense({ date: '2025-06-20', place: 'Gas Station', type: 'Gas', amount: 50 });

      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/6')
        .expect(200);

      expect(res.body.topCategories[0].category).toBe('Groceries');
      expect(res.body.topCategories[0].total).toBe(300);
      expect(res.body.totalSpending).toBe(350);
    });
  });

  describe('month-over-month comparison', () => {
    test('should return comparison when previous month has data', async () => {
      // Previous month (May)
      await insertExpense({ date: '2025-05-10', place: 'Store', type: 'Groceries', amount: 200 });
      // Current month (June)
      await insertExpense({ date: '2025-06-10', place: 'Store', type: 'Groceries', amount: 300 });

      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/6')
        .expect(200);

      expect(res.body.monthOverMonth).not.toBeNull();
      expect(res.body.monthOverMonth.previousTotal).toBe(200);
      expect(res.body.monthOverMonth.difference).toBe(100);
      expect(res.body.monthOverMonth.percentageChange).toBe(50);
    });

    test('should return null when previous month has no data', async () => {
      await insertExpense({ date: '2025-06-10', place: 'Store', type: 'Groceries', amount: 300 });

      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/6')
        .expect(200);

      expect(res.body.monthOverMonth).toBeNull();
    });

    test('should wrap around to December of previous year for January', async () => {
      // December 2024
      await insertExpense({ date: '2024-12-15', place: 'Store', type: 'Groceries', amount: 400 });
      // January 2025
      await insertExpense({ date: '2025-01-15', place: 'Store', type: 'Groceries', amount: 500 });

      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/1')
        .expect(200);

      expect(res.body.monthOverMonth).not.toBeNull();
      expect(res.body.monthOverMonth.previousTotal).toBe(400);
      expect(res.body.monthOverMonth.difference).toBe(100);
      expect(res.body.monthOverMonth.percentageChange).toBe(25);
    });
  });

  describe('budget summary', () => {
    test('should return budget summary when budgets exist', async () => {
      await insertBudget({ year: 2025, month: 6, category: 'Groceries', limit: 500 });
      await insertBudget({ year: 2025, month: 6, category: 'Gas', limit: 200 });
      await insertExpense({ date: '2025-06-10', place: 'Store', type: 'Groceries', amount: 300 });
      await insertExpense({ date: '2025-06-15', place: 'Gas Station', type: 'Gas', amount: 100 });

      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/6')
        .expect(200);

      expect(res.body.budgetSummary).not.toBeNull();
      expect(res.body.budgetSummary.totalBudgeted).toBe(700);
      expect(res.body.budgetSummary.totalSpent).toBe(400);
      expect(res.body.budgetSummary.utilizationPercentage).toBeCloseTo(57.1, 1);
    });

    test('should return null when no budgets exist', async () => {
      await insertExpense({ date: '2025-06-10', place: 'Store', type: 'Groceries', amount: 300 });

      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/6')
        .expect(200);

      expect(res.body.budgetSummary).toBeNull();
    });

    test('should only count spending in budgeted categories', async () => {
      await insertBudget({ year: 2025, month: 6, category: 'Groceries', limit: 500 });
      await insertExpense({ date: '2025-06-10', place: 'Store', type: 'Groceries', amount: 200 });
      // This expense is in a non-budgeted category — should not count toward budget utilization
      await insertExpense({ date: '2025-06-15', place: 'Cinema', type: 'Entertainment', amount: 100 });

      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/6')
        .expect(200);

      expect(res.body.budgetSummary.totalBudgeted).toBe(500);
      expect(res.body.budgetSummary.totalSpent).toBe(200);
      expect(res.body.budgetSummary.utilizationPercentage).toBe(40);
    });
  });

  describe('empty month', () => {
    test('should return zero totals and empty arrays for a month with no data', async () => {
      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/6')
        .expect(200);

      expect(res.body.totalSpending).toBe(0);
      expect(res.body.topCategories).toEqual([]);
      expect(res.body.topMerchants).toEqual([]);
      expect(res.body.monthOverMonth).toBeNull();
      expect(res.body.budgetSummary).toBeNull();
    });
  });

  describe('invalid parameters', () => {
    test('should return 400 for non-numeric year', async () => {
      const res = await request(app)
        .get('/api/analytics/monthly-summary/abc/6')
        .expect(400);

      expect(res.body.error).toMatch(/invalid year/i);
    });

    test('should return 400 for year below 2000', async () => {
      const res = await request(app)
        .get('/api/analytics/monthly-summary/1999/6')
        .expect(400);

      expect(res.body.error).toMatch(/invalid year/i);
    });

    test('should return 400 for year above 2100', async () => {
      const res = await request(app)
        .get('/api/analytics/monthly-summary/2101/6')
        .expect(400);

      expect(res.body.error).toMatch(/invalid year/i);
    });

    test('should return 400 for month 0', async () => {
      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/0')
        .expect(400);

      expect(res.body.error).toMatch(/invalid month/i);
    });

    test('should return 400 for month 13', async () => {
      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/13')
        .expect(400);

      expect(res.body.error).toMatch(/invalid month/i);
    });

    test('should return 400 for non-numeric month', async () => {
      const res = await request(app)
        .get('/api/analytics/monthly-summary/2025/abc')
        .expect(400);

      expect(res.body.error).toMatch(/invalid month/i);
    });
  });
});

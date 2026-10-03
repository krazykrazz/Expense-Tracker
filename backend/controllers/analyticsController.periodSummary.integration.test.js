/**
 * Period Summary API Integration Tests
 *
 * GET /api/analytics/period-summary?start=YYYY-MM&end=YYYY-MM
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const express = require('express');
const request = require('supertest');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

let db;
let app;

beforeAll(async () => {
  db = await createIsolatedTestDb();
  const dbModule = require('../database/db');
  dbModule.getDatabase = () => Promise.resolve(db);

  app = express();
  app.use(express.json());
  app.use('/api/analytics', require('../routes/analyticsRoutes'));
});

afterAll(() => {
  cleanupIsolatedTestDb(db);
});

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

const insertExpense = (date, type, amount) =>
  runSql(
    'INSERT INTO expenses (date, place, type, amount, method, week) VALUES (?, ?, ?, ?, ?, ?)',
    [date, 'Store', type, amount, 'Cash', 1]
  );

const insertFixed = (year, month, category, amount) =>
  runSql(
    'INSERT INTO fixed_expenses (year, month, name, amount, category) VALUES (?, ?, ?, ?, ?)',
    [year, month, `${category} bill`, amount, category]
  );

const insertIncome = (year, month, category, amount) =>
  runSql(
    'INSERT INTO income_sources (year, month, name, amount, category) VALUES (?, ?, ?, ?, ?)',
    [year, month, `${category} source`, amount, category]
  );

describe('GET /api/analytics/period-summary', () => {
  beforeEach(async () => {
    await runSql('DELETE FROM expenses');
    await runSql('DELETE FROM fixed_expenses');
    await runSql('DELETE FROM income_sources');
  });

  test('combines variable + fixed spending and income across a year boundary', async () => {
    await insertExpense('2025-11-30', 'Groceries', 100.1);
    await insertExpense('2025-12-15', 'Groceries', 50.2);
    await insertExpense('2026-01-31', 'Dining Out', 25);
    await insertFixed(2025, 12, 'Housing', 1000);
    await insertFixed(2026, 1, 'Housing', 1000);
    await insertIncome(2025, 12, 'Salary', 3000);
    await insertIncome(2026, 1, 'Salary', 3000);
    await insertIncome(2026, 1, 'Other', 200);

    // Outside the range
    await insertExpense('2025-10-31', 'Groceries', 999);
    await insertExpense('2026-02-01', 'Groceries', 999);
    await insertFixed(2026, 2, 'Housing', 999);
    await insertIncome(2025, 10, 'Salary', 999);

    const res = await request(app)
      .get('/api/analytics/period-summary?start=2025-11&end=2026-01')
      .expect(200);

    const { range, totals, expensesByCategory, incomeByCategory } = res.body;

    expect(range).toEqual({ startYear: 2025, startMonth: 11, endYear: 2026, endMonth: 1, monthCount: 3 });
    expect(totals.variableExpenses).toBe(175.3);
    expect(totals.fixedExpenses).toBe(2000);
    expect(totals.expenses).toBe(2175.3);
    expect(totals.income).toBe(6200);
    expect(totals.net).toBe(4024.7);
    expect(totals.transactionCount).toBe(3);
    expect(totals.averageMonthlyExpenses).toBe(725.1);
    expect(totals.savingsRate).toBe(64.9);

    expect(expensesByCategory.map(c => c.category)).toEqual(['Housing', 'Groceries', 'Dining Out']);
    expect(expensesByCategory[0]).toMatchObject({ total: 2000, fixed: 2000, variable: 0, transactionCount: 0 });
    expect(expensesByCategory[1]).toMatchObject({ total: 150.3, variable: 150.3, transactionCount: 2 });

    expect(incomeByCategory).toEqual([
      { category: 'Salary', total: 6000, percentOfIncome: 96.8 },
      { category: 'Other', total: 200, percentOfIncome: 3.2 },
    ]);
  });

  test('returns zeroed totals and null savings rate for an empty range', async () => {
    const res = await request(app)
      .get('/api/analytics/period-summary?start=2024-03&end=2024-03')
      .expect(200);

    expect(res.body.totals).toMatchObject({ income: 0, expenses: 0, net: 0, savingsRate: null, transactionCount: 0 });
    expect(res.body.expensesByCategory).toEqual([]);
    expect(res.body.incomeByCategory).toEqual([]);
  });

  test.each([
    ['missing params', ''],
    ['bad format', '?start=2025-1&end=2025-02'],
    ['month out of range', '?start=2025-13&end=2026-01'],
    ['year out of range', '?start=1999-01&end=2000-01'],
    ['start after end', '?start=2025-06&end=2025-05'],
    ['span over 120 months', '?start=2000-01&end=2010-01'],
  ])('rejects %s with 400', async (_label, query) => {
    const res = await request(app).get(`/api/analytics/period-summary${query}`).expect(400);
    expect(res.body.error).toBeDefined();
  });
});

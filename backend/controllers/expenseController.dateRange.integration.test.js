/**
 * GET /api/expenses date-range filtering (startDate/endDate, inclusive)
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
  app.use('/api', require('../routes/expenseRoutes'));
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

const insertExpense = (date, place) =>
  runSql(
    'INSERT INTO expenses (date, place, type, amount, method, week) VALUES (?, ?, ?, ?, ?, ?)',
    [date, place, 'Groceries', 10, 'Cash', 1]
  );

const places = (res) => res.body.map(e => e.place);

describe('GET /api/expenses with startDate/endDate', () => {
  beforeEach(async () => {
    await runSql('DELETE FROM expenses');
    await insertExpense('2026-09-13', 'before');
    await insertExpense('2026-09-14', 'start');
    await insertExpense('2026-09-30', 'middle');
    await insertExpense('2026-10-03', 'end');
    await insertExpense('2026-10-04', 'after');
  });

  test('includes both bounds', async () => {
    const res = await request(app).get('/api/expenses?startDate=2026-09-14&endDate=2026-10-03').expect(200);
    expect(places(res)).toEqual(['start', 'middle', 'end']);
  });

  test('supports an open-ended start or end', async () => {
    const from = await request(app).get('/api/expenses?startDate=2026-10-03').expect(200);
    expect(places(from)).toEqual(['end', 'after']);

    const until = await request(app).get('/api/expenses?endDate=2026-09-13').expect(200);
    expect(places(until)).toEqual(['before']);
  });

  test('intersects with a year filter', async () => {
    const res = await request(app).get('/api/expenses?year=2026&startDate=2026-09-30').expect(200);
    expect(places(res)).toEqual(['middle', 'end', 'after']);
  });

  test.each([
    ['malformed start', '?startDate=2026-9-14'],
    ['impossible date', '?endDate=2026-02-30'],
    ['start after end', '?startDate=2026-10-04&endDate=2026-10-03'],
  ])('rejects %s with 400', async (_label, query) => {
    const res = await request(app).get(`/api/expenses${query}`).expect(400);
    expect(res.body.error).toBeDefined();
  });
});

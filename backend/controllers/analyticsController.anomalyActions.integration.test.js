/**
 * Anomaly Actions & Suppression Rules API Integration Tests
 *
 * Tests the full controller → service → repository stack with a real SQLite
 * test database for anomaly dismiss, mark-as-expected, and suppression rule
 * CRUD endpoints.
 *
 * Requirements: 8.5, 8.6, 8.7, 8.10, 8.11, 8.12, 8.16, 8.17, 13.4
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

function querySql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function insertExpense({ date, place, type, amount, method = 'Cash', week = 1 }) {
  const result = await runSql(
    `INSERT INTO expenses (date, place, type, amount, method, week) VALUES (?, ?, ?, ?, ?, ?)`,
    [date, place, type, amount, method, week]
  );
  return result.lastID;
}

async function clearData() {
  await runSql('DELETE FROM expenses');
  await runSql('DELETE FROM dismissed_anomalies');
  await runSql('DELETE FROM anomaly_suppression_rules');
  // Reset the service's in-memory cache so each test starts fresh
  const anomalyService = require('../services/anomalyDetectionService');
  anomalyService._dismissedExpenseIdsCache = null;
}

// ─── Tests ───

describe('Anomaly Actions & Suppression Rules API', () => {
  beforeEach(async () => {
    await clearData();
  });

  // ── Dismiss ──

  describe('POST /api/analytics/anomalies/:expenseId/dismiss', () => {
    test('should dismiss an anomaly with anomalyType', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'Costco', type: 'Groceries', amount: 500
      });

      const res = await request(app)
        .post(`/api/analytics/anomalies/${expenseId}/dismiss`)
        .send({ anomalyType: 'amount' })
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify persisted in dismissed_anomalies
      const rows = await querySql(
        'SELECT * FROM dismissed_anomalies WHERE expense_id = ?', [expenseId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].anomaly_type).toBe('amount');
      expect(rows[0].action).toBe('dismiss');
    });

    test('should return 400 for invalid expenseId without anomalyType', async () => {
      const res = await request(app)
        .post('/api/analytics/anomalies/abc/dismiss')
        .send({})
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    test('should succeed for invalid expenseId with anomalyType (category-level dismiss)', async () => {
      await request(app)
        .post('/api/analytics/anomalies/null/dismiss')
        .send({ anomalyType: 'category_spending_spike' })
        .expect(200);
    });

    test('should return 400 for negative expenseId without anomalyType', async () => {
      const res = await request(app)
        .post('/api/analytics/anomalies/-1/dismiss')
        .send({})
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });

  // ── Mark as Expected ──

  describe('POST /api/analytics/anomalies/:expenseId/mark-expected', () => {
    test('should create merchant_amount rule for amount anomaly type', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'Costco', type: 'Groceries', amount: 100
      });

      const res = await request(app)
        .post(`/api/analytics/anomalies/${expenseId}/mark-expected`)
        .send({
          anomalyType: 'amount',
          expenseDetails: { merchant: 'Costco', amount: 100, category: 'Groceries', date: '2025-06-10' }
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.suppressionRuleId).toBeDefined();

      // Verify suppression rule was created with ±20% range
      const rules = await querySql('SELECT * FROM anomaly_suppression_rules');
      expect(rules).toHaveLength(1);
      expect(rules[0].rule_type).toBe('merchant_amount');
      expect(rules[0].merchant_name).toBe('Costco');
      expect(rules[0].amount_min).toBeCloseTo(80, 0);   // 100 * 0.8
      expect(rules[0].amount_max).toBeCloseTo(120, 0);   // 100 * 1.2
    });

    test('should create merchant_category rule for new_merchant anomaly type', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'NewShop', type: 'Electronics', amount: 250
      });

      const res = await request(app)
        .post(`/api/analytics/anomalies/${expenseId}/mark-expected`)
        .send({
          anomalyType: 'new_merchant',
          expenseDetails: { merchant: 'NewShop', amount: 250, category: 'Electronics', date: '2025-06-10' }
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const rules = await querySql('SELECT * FROM anomaly_suppression_rules');
      expect(rules).toHaveLength(1);
      expect(rules[0].rule_type).toBe('merchant_category');
      expect(rules[0].merchant_name).toBe('NewShop');
      expect(rules[0].category).toBe('Electronics');
    });

    test('should create specific_date rule for daily_total anomaly type', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'Various', type: 'Groceries', amount: 500
      });

      const res = await request(app)
        .post(`/api/analytics/anomalies/${expenseId}/mark-expected`)
        .send({
          anomalyType: 'daily_total',
          expenseDetails: { merchant: 'Various', amount: 500, category: 'Groceries', date: '2025-06-10' }
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const rules = await querySql('SELECT * FROM anomaly_suppression_rules');
      expect(rules).toHaveLength(1);
      expect(rules[0].rule_type).toBe('specific_date');
      expect(rules[0].specific_date).toBe('2025-06-10');
    });

    test('should return 400 when anomalyType is missing', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'Store', type: 'Groceries', amount: 50
      });

      const res = await request(app)
        .post(`/api/analytics/anomalies/${expenseId}/mark-expected`)
        .send({ expenseDetails: { merchant: 'Store', amount: 50 } })
        .expect(400);

      expect(res.body.error).toMatch(/anomalyType/i);
    });

    test('should return 400 for invalid expenseId without anomalyType', async () => {
      const res = await request(app)
        .post('/api/analytics/anomalies/abc/mark-expected')
        .send({ expenseDetails: {} })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    test('should succeed for null expenseId with anomalyType (category-level mark-expected)', async () => {
      await request(app)
        .post('/api/analytics/anomalies/null/mark-expected')
        .send({ anomalyType: 'category_spending_spike', expenseDetails: { category: 'Groceries' } })
        .expect(200);
    });

    test('should record dismissal with mark_as_expected action', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'Costco', type: 'Groceries', amount: 100
      });

      await request(app)
        .post(`/api/analytics/anomalies/${expenseId}/mark-expected`)
        .send({
          anomalyType: 'amount',
          expenseDetails: { merchant: 'Costco', amount: 100 }
        })
        .expect(200);

      const rows = await querySql(
        'SELECT * FROM dismissed_anomalies WHERE expense_id = ?', [expenseId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe('mark_as_expected');
      expect(rows[0].anomaly_type).toBe('amount');
    });
  });

  // ── GET Suppression Rules ──

  describe('GET /api/analytics/anomaly-suppression-rules', () => {
    test('should return all created suppression rules', async () => {
      const expenseId1 = await insertExpense({
        date: '2025-06-10', place: 'Costco', type: 'Groceries', amount: 100
      });
      const expenseId2 = await insertExpense({
        date: '2025-06-11', place: 'NewShop', type: 'Electronics', amount: 250
      });

      // Create two rules via mark-expected
      await request(app)
        .post(`/api/analytics/anomalies/${expenseId1}/mark-expected`)
        .send({
          anomalyType: 'amount',
          expenseDetails: { merchant: 'Costco', amount: 100 }
        })
        .expect(200);

      await request(app)
        .post(`/api/analytics/anomalies/${expenseId2}/mark-expected`)
        .send({
          anomalyType: 'new_merchant',
          expenseDetails: { merchant: 'NewShop', category: 'Electronics' }
        })
        .expect(200);

      const res = await request(app)
        .get('/api/analytics/anomaly-suppression-rules')
        .expect(200);

      expect(res.body.rules).toHaveLength(2);
      const ruleTypes = res.body.rules.map(r => r.rule_type);
      expect(ruleTypes).toContain('merchant_amount');
      expect(ruleTypes).toContain('merchant_category');
    });

    test('should return empty array when no rules exist', async () => {
      const res = await request(app)
        .get('/api/analytics/anomaly-suppression-rules')
        .expect(200);

      expect(res.body.rules).toEqual([]);
    });
  });

  // ── DELETE Suppression Rule ──

  describe('DELETE /api/analytics/anomaly-suppression-rules/:id', () => {
    test('should delete an existing suppression rule', async () => {
      const expenseId = await insertExpense({
        date: '2025-06-10', place: 'Costco', type: 'Groceries', amount: 100
      });

      const markRes = await request(app)
        .post(`/api/analytics/anomalies/${expenseId}/mark-expected`)
        .send({
          anomalyType: 'amount',
          expenseDetails: { merchant: 'Costco', amount: 100 }
        })
        .expect(200);

      const ruleId = markRes.body.suppressionRuleId;

      const deleteRes = await request(app)
        .delete(`/api/analytics/anomaly-suppression-rules/${ruleId}`)
        .expect(200);

      expect(deleteRes.body.success).toBe(true);

      // Verify rule is gone
      const rules = await querySql('SELECT * FROM anomaly_suppression_rules');
      expect(rules).toHaveLength(0);
    });

    test('should return 404 for non-existent rule', async () => {
      const res = await request(app)
        .delete('/api/analytics/anomaly-suppression-rules/99999')
        .expect(404);

      expect(res.body.error).toMatch(/not found/i);
    });

    test('should return 400 for invalid rule ID', async () => {
      const res = await request(app)
        .delete('/api/analytics/anomaly-suppression-rules/abc')
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });
});

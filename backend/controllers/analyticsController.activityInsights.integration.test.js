/**
 * Activity Insights API Integration Tests
 *
 * Tests the full controller → service → repository stack with a real SQLite
 * test database for the GET /api/analytics/activity-insights/:year/:month endpoint.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 13.4
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

async function insertActivityLog({ eventType, entityType, entityId, userAction, metadata, timestamp }) {
  await runSql(
    `INSERT INTO activity_logs (event_type, entity_type, entity_id, user_action, metadata, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [eventType, entityType, entityId || 1, userAction || 'Test action', metadata || null, timestamp]
  );
}

async function clearData() {
  await runSql('DELETE FROM activity_logs');
}

// ─── Tests ───

describe('GET /api/analytics/activity-insights/:year/:month', () => {
  beforeEach(async () => {
    await clearData();
  });

  describe('valid response shape', () => {
    test('should return all expected fields with correct types', async () => {
      await insertActivityLog({
        eventType: 'expense_created',
        entityType: 'expense',
        timestamp: '2025-06-10T10:00:00.000Z',
      });

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      expect(res.body).toHaveProperty('entryVelocity');
      expect(res.body).toHaveProperty('entityBreakdown');
      expect(res.body).toHaveProperty('recentChanges');
      expect(res.body).toHaveProperty('dayOfWeekPatterns');
      expect(typeof res.body.entryVelocity.currentMonth).toBe('number');
      expect(typeof res.body.entryVelocity.previousMonth).toBe('number');
      expect(typeof res.body.entryVelocity.difference).toBe('number');
      expect(Array.isArray(res.body.entityBreakdown)).toBe(true);
      expect(Array.isArray(res.body.recentChanges)).toBe(true);
      expect(Array.isArray(res.body.dayOfWeekPatterns)).toBe(true);
    });
  });

  describe('entry velocity', () => {
    test('should count current month and previous month entries correctly', async () => {
      // Current month (June 2025): 5 entries
      for (let i = 0; i < 5; i++) {
        await insertActivityLog({
          eventType: 'expense_created',
          entityType: 'expense',
          timestamp: `2025-06-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
        });
      }
      // Previous month (May 2025): 3 entries
      for (let i = 0; i < 3; i++) {
        await insertActivityLog({
          eventType: 'expense_created',
          entityType: 'expense',
          timestamp: `2025-05-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
        });
      }

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      expect(res.body.entryVelocity.currentMonth).toBe(5);
      expect(res.body.entryVelocity.previousMonth).toBe(3);
      expect(res.body.entryVelocity.difference).toBe(2);
    });

    test('should wrap around to December of previous year for January', async () => {
      // January 2025: 4 entries
      for (let i = 0; i < 4; i++) {
        await insertActivityLog({
          eventType: 'expense_created',
          entityType: 'expense',
          timestamp: `2025-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
        });
      }
      // December 2024: 6 entries
      for (let i = 0; i < 6; i++) {
        await insertActivityLog({
          eventType: 'expense_created',
          entityType: 'expense',
          timestamp: `2024-12-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
        });
      }

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/1')
        .expect(200);

      expect(res.body.entryVelocity.currentMonth).toBe(4);
      expect(res.body.entryVelocity.previousMonth).toBe(6);
      expect(res.body.entryVelocity.difference).toBe(-2);
    });

    test('should return zero for previous month when no data exists', async () => {
      await insertActivityLog({
        eventType: 'expense_created',
        entityType: 'expense',
        timestamp: '2025-06-10T10:00:00.000Z',
      });

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      expect(res.body.entryVelocity.currentMonth).toBe(1);
      expect(res.body.entryVelocity.previousMonth).toBe(0);
      expect(res.body.entryVelocity.difference).toBe(1);
    });
  });

  describe('entity breakdown', () => {
    test('should group by entity type sorted by count descending', async () => {
      // 4 expense entries
      for (let i = 0; i < 4; i++) {
        await insertActivityLog({
          eventType: 'expense_created',
          entityType: 'expense',
          timestamp: `2025-06-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
        });
      }
      // 2 budget entries
      for (let i = 0; i < 2; i++) {
        await insertActivityLog({
          eventType: 'budget_created',
          entityType: 'budget',
          timestamp: `2025-06-${String(i + 10).padStart(2, '0')}T10:00:00.000Z`,
        });
      }
      // 1 loan entry
      await insertActivityLog({
        eventType: 'loan_created',
        entityType: 'loan',
        timestamp: '2025-06-15T10:00:00.000Z',
      });

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      expect(res.body.entityBreakdown).toHaveLength(3);
      expect(res.body.entityBreakdown[0]).toEqual({ entityType: 'expense', count: 4 });
      expect(res.body.entityBreakdown[1]).toEqual({ entityType: 'budget', count: 2 });
      expect(res.body.entityBreakdown[2]).toEqual({ entityType: 'loan', count: 1 });
    });

    test('should only include entries from the requested month', async () => {
      await insertActivityLog({
        eventType: 'expense_created',
        entityType: 'expense',
        timestamp: '2025-06-10T10:00:00.000Z',
      });
      // Different month — should not appear
      await insertActivityLog({
        eventType: 'budget_created',
        entityType: 'budget',
        timestamp: '2025-05-10T10:00:00.000Z',
      });

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      expect(res.body.entityBreakdown).toHaveLength(1);
      expect(res.body.entityBreakdown[0].entityType).toBe('expense');
    });
  });

  describe('recent changes limit', () => {
    test('should return at most 10 entries ordered by timestamp descending', async () => {
      // Insert 15 entries
      for (let i = 1; i <= 15; i++) {
        await insertActivityLog({
          eventType: 'expense_created',
          entityType: 'expense',
          userAction: `Action ${i}`,
          metadata: JSON.stringify({ index: i }),
          timestamp: `2025-06-${String(i).padStart(2, '0')}T10:00:00.000Z`,
        });
      }

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      expect(res.body.recentChanges).toHaveLength(10);
      // Most recent first (June 15 before June 14, etc.)
      expect(res.body.recentChanges[0].timestamp).toBe('2025-06-15T10:00:00.000Z');
      expect(res.body.recentChanges[9].timestamp).toBe('2025-06-06T10:00:00.000Z');
    });

    test('should parse metadata as JSON objects', async () => {
      await insertActivityLog({
        eventType: 'expense_created',
        entityType: 'expense',
        userAction: 'Added expense: Groceries - $45.67',
        metadata: JSON.stringify({ amount: 45.67, category: 'Groceries' }),
        timestamp: '2025-06-10T10:00:00.000Z',
      });

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      expect(res.body.recentChanges).toHaveLength(1);
      const change = res.body.recentChanges[0];
      expect(change.entityType).toBe('expense');
      expect(change.userAction).toBe('Added expense: Groceries - $45.67');
      expect(typeof change.metadata).toBe('object');
      expect(change.metadata.amount).toBe(45.67);
      expect(change.metadata.category).toBe('Groceries');
    });

    test('should return null metadata when metadata column is null', async () => {
      await insertActivityLog({
        eventType: 'expense_created',
        entityType: 'expense',
        metadata: null,
        timestamp: '2025-06-10T10:00:00.000Z',
      });

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      expect(res.body.recentChanges[0].metadata).toBeNull();
    });

    test('should return fewer than 10 when fewer entries exist', async () => {
      for (let i = 1; i <= 3; i++) {
        await insertActivityLog({
          eventType: 'expense_created',
          entityType: 'expense',
          timestamp: `2025-06-${String(i).padStart(2, '0')}T10:00:00.000Z`,
        });
      }

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      expect(res.body.recentChanges).toHaveLength(3);
    });
  });

  describe('day-of-week patterns', () => {
    test('should group entries by day of week with correct counts', async () => {
      // 2025-06-02 is a Monday, 2025-06-03 is a Tuesday
      await insertActivityLog({
        eventType: 'expense_created',
        entityType: 'expense',
        timestamp: '2025-06-02T10:00:00.000Z', // Monday
      });
      await insertActivityLog({
        eventType: 'expense_created',
        entityType: 'expense',
        timestamp: '2025-06-09T10:00:00.000Z', // Monday
      });
      await insertActivityLog({
        eventType: 'expense_created',
        entityType: 'expense',
        timestamp: '2025-06-03T10:00:00.000Z', // Tuesday
      });

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      const patterns = res.body.dayOfWeekPatterns;
      expect(patterns).toHaveLength(2);
      // Sorted by count descending: Monday (2) before Tuesday (1)
      expect(patterns[0]).toEqual({ day: 'Monday', count: 2 });
      expect(patterns[1]).toEqual({ day: 'Tuesday', count: 1 });
    });

    test('should only include days that have activity', async () => {
      // Only Wednesday entries
      await insertActivityLog({
        eventType: 'expense_created',
        entityType: 'expense',
        timestamp: '2025-06-04T10:00:00.000Z', // Wednesday
      });

      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      expect(res.body.dayOfWeekPatterns).toHaveLength(1);
      expect(res.body.dayOfWeekPatterns[0].day).toBe('Wednesday');
      expect(res.body.dayOfWeekPatterns[0].count).toBe(1);
    });
  });

  describe('empty data', () => {
    test('should return zero velocity and empty arrays for a month with no data', async () => {
      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/6')
        .expect(200);

      expect(res.body.entryVelocity.currentMonth).toBe(0);
      expect(res.body.entryVelocity.previousMonth).toBe(0);
      expect(res.body.entryVelocity.difference).toBe(0);
      expect(res.body.entityBreakdown).toEqual([]);
      expect(res.body.recentChanges).toEqual([]);
      expect(res.body.dayOfWeekPatterns).toEqual([]);
    });
  });

  describe('invalid parameters', () => {
    test('should return 400 for non-numeric year', async () => {
      const res = await request(app)
        .get('/api/analytics/activity-insights/abc/6')
        .expect(400);

      expect(res.body.error).toMatch(/invalid year/i);
    });

    test('should return 400 for year below 2000', async () => {
      const res = await request(app)
        .get('/api/analytics/activity-insights/1999/6')
        .expect(400);

      expect(res.body.error).toMatch(/invalid year/i);
    });

    test('should return 400 for year above 2100', async () => {
      const res = await request(app)
        .get('/api/analytics/activity-insights/2101/6')
        .expect(400);

      expect(res.body.error).toMatch(/invalid year/i);
    });

    test('should return 400 for month 0', async () => {
      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/0')
        .expect(400);

      expect(res.body.error).toMatch(/invalid month/i);
    });

    test('should return 400 for month 13', async () => {
      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/13')
        .expect(400);

      expect(res.body.error).toMatch(/invalid month/i);
    });

    test('should return 400 for non-numeric month', async () => {
      const res = await request(app)
        .get('/api/analytics/activity-insights/2025/abc')
        .expect(400);

      expect(res.body.error).toMatch(/invalid month/i);
    });
  });
});

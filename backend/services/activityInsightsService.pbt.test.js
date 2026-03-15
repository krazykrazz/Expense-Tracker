/**
 * @invariant Activity Insights Aggregation Properties
 *
 * Property 9: Entry velocity counting
 * Property 10: Entity type breakdown grouping
 * Property 11: Recent changes limited to 10 most recent
 * Property 12: Day-of-week activity pattern grouping
 *
 * Feature: analytics-hub-revamp
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 7.3, 7.4, 7.5, 7.6
 */

const fc = require('fast-check');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { dbPbtOptions } = require('../test/pbtArbitraries');

jest.mock('../database/db');
const { getDatabase } = require('../database/db');

const activityInsightsService = require('./activityInsightsService');

let isolatedDb;

beforeAll(async () => {
  isolatedDb = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(isolatedDb);
});

afterAll(() => {
  cleanupIsolatedTestDb(isolatedDb);
});

// ─── DB Helpers ───

function insertActivityLog(db, { event_type, entity_type, entity_id, user_action, metadata, timestamp }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO activity_logs (event_type, entity_type, entity_id, user_action, metadata, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [event_type, entity_type, entity_id || null, user_action, metadata || null, timestamp],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function clearTable(db, table) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM ${table}`, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function cleanup(db) {
  await clearTable(db, 'activity_logs');
}

// ─── Generators ───

const ENTITY_TYPES = ['expense', 'budget', 'loan', 'investment', 'income', 'fixed_expense', 'payment_method'];
const EVENT_TYPES = ['created', 'updated', 'deleted'];

const arbActivityLog = fc.record({
  entity_type: fc.constantFrom(...ENTITY_TYPES),
  event_type: fc.constantFrom(...EVENT_TYPES),
  entity_id: fc.integer({ min: 1, max: 9999 }),
  user_action: fc.constantFrom(
    'Added expense: Groceries - $45.67',
    'Updated budget: Entertainment',
    'Deleted loan: Car Loan',
    'Added investment: TFSA',
    'Updated income: Salary'
  ),
  metadata: fc.constantFrom(
    '{"amount":45.67}',
    '{"category":"Entertainment"}',
    '{"name":"Car Loan"}',
    null
  ),
});

const arbActivityLogSet = fc.array(arbActivityLog, { minLength: 1, maxLength: 25 });

// ─── Day-of-week helper ───

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Tests ───

describe('ActivityInsightsService — PBT', () => {
  const YEAR = 2091;
  const MONTH = 6;

  afterEach(async () => {
    await cleanup(isolatedDb);
  });

  /**
   * Property 9: Entry velocity counting
   * currentMonth count equals entries in that month, previousMonth equals entries
   * in preceding month, difference = current - previous.
   *
   * **Validates: Requirements 6.1, 7.3**
   */
  describe('Property 9: Entry velocity counting', () => {
    it('currentMonth and previousMonth counts match inserted logs, difference = current - previous', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbActivityLogSet,
          arbActivityLogSet,
          async (prevLogs, currLogs) => {
            await cleanup(isolatedDb);

            // Insert previous month logs (month 5)
            for (const log of prevLogs) {
              await insertActivityLog(isolatedDb, {
                ...log,
                timestamp: `${YEAR}-05-15T10:00:00.000Z`,
              });
            }

            // Insert current month logs (month 6)
            for (const log of currLogs) {
              await insertActivityLog(isolatedDb, {
                ...log,
                timestamp: `${YEAR}-06-15T10:00:00.000Z`,
              });
            }

            const result = await activityInsightsService.getActivityInsights(YEAR, MONTH);
            const { entryVelocity } = result;

            expect(entryVelocity.currentMonth).toBe(currLogs.length);
            expect(entryVelocity.previousMonth).toBe(prevLogs.length);
            expect(entryVelocity.difference).toBe(currLogs.length - prevLogs.length);
          }
        ),
        dbPbtOptions()
      );
    });

    it('previousMonth is 0 when no logs exist in the preceding month', async () => {
      await fc.assert(
        fc.asyncProperty(arbActivityLogSet, async (currLogs) => {
          await cleanup(isolatedDb);

          for (const log of currLogs) {
            await insertActivityLog(isolatedDb, {
              ...log,
              timestamp: `${YEAR}-06-15T10:00:00.000Z`,
            });
          }

          const result = await activityInsightsService.getActivityInsights(YEAR, MONTH);
          expect(result.entryVelocity.previousMonth).toBe(0);
          expect(result.entryVelocity.difference).toBe(currLogs.length);
        }),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 10: Entity type breakdown grouping
   * One entry per distinct entity_type, count equals number of logs with that type,
   * sorted by count desc.
   *
   * **Validates: Requirements 6.2, 7.4**
   */
  describe('Property 10: Entity type breakdown grouping', () => {
    it('one entry per distinct entity_type, counts match, sorted desc', async () => {
      await fc.assert(
        fc.asyncProperty(arbActivityLogSet, async (logs) => {
          await cleanup(isolatedDb);

          for (const log of logs) {
            await insertActivityLog(isolatedDb, {
              ...log,
              timestamp: `${YEAR}-06-15T10:00:00.000Z`,
            });
          }

          const result = await activityInsightsService.getActivityInsights(YEAR, MONTH);
          const { entityBreakdown } = result;

          // Compute expected counts per entity_type
          const expectedCounts = {};
          for (const log of logs) {
            expectedCounts[log.entity_type] = (expectedCounts[log.entity_type] || 0) + 1;
          }

          // One entry per distinct entity_type
          const distinctTypes = Object.keys(expectedCounts);
          expect(entityBreakdown.length).toBe(distinctTypes.length);

          // Each count matches
          for (const entry of entityBreakdown) {
            expect(entry.count).toBe(expectedCounts[entry.entityType]);
          }

          // Sorted by count descending
          for (let i = 0; i < entityBreakdown.length - 1; i++) {
            expect(entityBreakdown[i].count).toBeGreaterThanOrEqual(entityBreakdown[i + 1].count);
          }
        }),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 11: Recent changes limited to 10 most recent
   * At most 10 entries, ordered by timestamp desc, metadata is parsed JSON.
   *
   * **Validates: Requirements 6.3, 7.5**
   */
  describe('Property 11: Recent changes limited to 10 most recent', () => {
    it('at most 10 entries, ordered by timestamp desc, metadata is parsed', async () => {
      await fc.assert(
        fc.asyncProperty(arbActivityLogSet, async (logs) => {
          await cleanup(isolatedDb);

          // Insert logs with distinct timestamps so ordering is deterministic
          for (let i = 0; i < logs.length; i++) {
            const day = String(Math.min(i + 1, 28)).padStart(2, '0');
            const hour = String(i % 24).padStart(2, '0');
            await insertActivityLog(isolatedDb, {
              ...logs[i],
              timestamp: `${YEAR}-06-${day}T${hour}:00:00.000Z`,
            });
          }

          const result = await activityInsightsService.getActivityInsights(YEAR, MONTH);
          const { recentChanges } = result;

          // At most 10
          expect(recentChanges.length).toBeLessThanOrEqual(10);
          expect(recentChanges.length).toBe(Math.min(logs.length, 10));

          // Ordered by timestamp descending
          for (let i = 0; i < recentChanges.length - 1; i++) {
            expect(recentChanges[i].timestamp >= recentChanges[i + 1].timestamp).toBe(true);
          }

          // Metadata is parsed (object or null, never a raw string)
          for (const entry of recentChanges) {
            if (entry.metadata !== null) {
              expect(typeof entry.metadata).toBe('object');
              expect(typeof entry.metadata).not.toBe('string');
            }
          }
        }),
        dbPbtOptions()
      );
    });
  });

  /**
   * Property 12: Day-of-week activity pattern grouping
   * Entries for each day with activity, count equals number of logs on that day of week.
   *
   * **Validates: Requirements 6.4, 7.6**
   */
  describe('Property 12: Day-of-week activity pattern grouping', () => {
    it('entries for each active day, counts match logs on that day of week', async () => {
      // Generate logs with specific day indices so we can verify day-of-week mapping
      const arbDayIndex = fc.integer({ min: 1, max: 28 });
      const arbLogWithDay = fc.record({
        log: arbActivityLog,
        day: arbDayIndex,
      });
      const arbLogsWithDays = fc.array(arbLogWithDay, { minLength: 1, maxLength: 20 });

      await fc.assert(
        fc.asyncProperty(arbLogsWithDays, async (entries) => {
          await cleanup(isolatedDb);

          // Track expected day-of-week counts
          const expectedDowCounts = {};

          for (const { log, day } of entries) {
            const dayStr = String(day).padStart(2, '0');
            const ts = `${YEAR}-06-${dayStr}T12:00:00.000Z`;
            await insertActivityLog(isolatedDb, {
              ...log,
              timestamp: ts,
            });

            // Compute the day of week for this date
            const dateObj = new Date(`${YEAR}-06-${dayStr}T12:00:00.000Z`);
            const dowIndex = dateObj.getUTCDay();
            const dayName = DAY_NAMES[dowIndex];
            expectedDowCounts[dayName] = (expectedDowCounts[dayName] || 0) + 1;
          }

          const result = await activityInsightsService.getActivityInsights(YEAR, MONTH);
          const { dayOfWeekPatterns } = result;

          // One entry per day that has activity
          const activeDays = Object.keys(expectedDowCounts);
          expect(dayOfWeekPatterns.length).toBe(activeDays.length);

          // Each day's count matches
          for (const pattern of dayOfWeekPatterns) {
            expect(expectedDowCounts[pattern.day]).toBeDefined();
            expect(pattern.count).toBe(expectedDowCounts[pattern.day]);
          }

          // Sorted by count descending
          for (let i = 0; i < dayOfWeekPatterns.length - 1; i++) {
            expect(dayOfWeekPatterns[i].count).toBeGreaterThanOrEqual(dayOfWeekPatterns[i + 1].count);
          }
        }),
        dbPbtOptions()
      );
    });
  });
});

// Feature: activity-log, Property 2: Automatic Timestamp Assignment
const fc = require('fast-check');
const activityLogService = require('./activityLogService');
const { getDatabase } = require('../database/db');
const { safeString, dbPbtOptions } = require('../test/pbtArbitraries');

describe('Property 2: Automatic Timestamp Assignment', () => {
  let db;

  beforeEach(async () => {
    db = await getDatabase();
    // Clean up any existing test data
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM activity_logs', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    // Clean up test data
    if (db) {
      await new Promise((resolve) => {
        db.run('DELETE FROM activity_logs', () => resolve());
      });
    }
  });

  it('should automatically assign a timestamp within a few seconds of current time for any valid event', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // event_type
        safeString({ minLength: 1, maxLength: 50 }), // entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // user_action
        fc.option(fc.record({
          key1: safeString({ maxLength: 50 }),
          key2: fc.integer({ min: 1, max: 1000 })
        }), { nil: null }), // metadata
        async (eventType, entityType, entityId, userAction, metadata) => {
          // Record time before logging
          const beforeTime = new Date();

          // Log event without explicit timestamp
          await activityLogService.logEvent(eventType, entityType, entityId, userAction, metadata);

          // Record time after logging
          const afterTime = new Date();

          // Retrieve the logged event
          const result = await activityLogService.getRecentEvents(1, 0);

          // Verify event was logged
          expect(result.events).toHaveLength(1);
          const event = result.events[0];

          // Verify timestamp was automatically assigned
          expect(event.timestamp).toBeDefined();
          expect(typeof event.timestamp).toBe('string');

          // Parse the timestamp
          const eventTime = new Date(event.timestamp);

          // Verify timestamp is valid
          expect(eventTime.toString()).not.toBe('Invalid Date');

          // Verify timestamp is within a reasonable range (within 5 seconds)
          const timeDiffBefore = eventTime.getTime() - beforeTime.getTime();
          const timeDiffAfter = afterTime.getTime() - eventTime.getTime();

          expect(timeDiffBefore).toBeGreaterThanOrEqual(-1000); // Allow 1 second clock skew
          expect(timeDiffAfter).toBeGreaterThanOrEqual(-1000); // Allow 1 second clock skew
          expect(Math.abs(timeDiffBefore)).toBeLessThan(5000); // Within 5 seconds
          expect(Math.abs(timeDiffAfter)).toBeLessThan(5000); // Within 5 seconds
        }
      ),
      dbPbtOptions()
    );
  });

  it('should assign timestamps in chronological order for sequential events', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            eventType: safeString({ minLength: 1, maxLength: 50 }),
            entityType: safeString({ minLength: 1, maxLength: 50 }),
            entityId: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
            userAction: safeString({ minLength: 1, maxLength: 200 })
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (events) => {
          // Log events sequentially
          for (const event of events) {
            await activityLogService.logEvent(
              event.eventType,
              event.entityType,
              event.entityId,
              event.userAction,
              null
            );
            // Small delay to ensure timestamps are different
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          // Retrieve all events
          const result = await activityLogService.getRecentEvents(events.length, 0);

          // Verify all events were logged
          expect(result.events.length).toBe(events.length);

          // Verify timestamps are in descending order (newest first)
          for (let i = 0; i < result.events.length - 1; i++) {
            const currentTime = new Date(result.events[i].timestamp);
            const nextTime = new Date(result.events[i + 1].timestamp);

            expect(currentTime.getTime()).toBeGreaterThanOrEqual(nextTime.getTime());
          }
        }
      ),
      dbPbtOptions({ numRuns: 10 }) // Fewer runs due to sequential nature
    );
  });
});

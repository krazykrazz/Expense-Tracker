// Feature: activity-log, Property 16: Logging Failure Resilience
const fc = require('fast-check');
const activityLogService = require('./activityLogService');
const activityLogRepository = require('../repositories/activityLogRepository');
const { getDatabase } = require('../database/db');
const { safeString, pbtOptions } = require('../test/pbtArbitraries');

describe('Property 16: Logging Failure Resilience', () => {
  let db;
  let originalInsert;

  beforeEach(async () => {
    db = await getDatabase();
    // Clean up any existing test data
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM activity_logs', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Store original insert function
    originalInsert = activityLogRepository.insert;
  });

  afterEach(async () => {
    // Restore original insert function
    activityLogRepository.insert = originalInsert;

    // Clean up test data
    if (db) {
      await new Promise((resolve) => {
        db.run('DELETE FROM activity_logs', () => resolve());
      });
    }
  });

  it('should not throw errors when repository insert fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // event_type
        safeString({ minLength: 1, maxLength: 50 }), // entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // user_action
        async (eventType, entityType, entityId, userAction) => {
          // Mock repository to throw an error
          activityLogRepository.insert = jest.fn().mockRejectedValue(new Error('Database error'));

          // This should not throw an error (silent failure)
          await expect(
            activityLogService.logEvent(eventType, entityType, entityId, userAction, null)
          ).resolves.not.toThrow();

          // Verify insert was attempted
          expect(activityLogRepository.insert).toHaveBeenCalled();
        }
      ),
      pbtOptions()
    );
  });

  it('should continue normal operation after logging failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // event_type for success
        safeString({ minLength: 1, maxLength: 50 }), // entity_type for success
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // user_action for success
        safeString({ minLength: 1, maxLength: 50 }), // event_type for failure
        safeString({ minLength: 1, maxLength: 50 }), // entity_type for failure
        safeString({ minLength: 1, maxLength: 200 }), // user_action for failure
        async (successEventType, successEntityType, entityId, successUserAction, failEventType, failEntityType, failUserAction) => {
          // Clean database before this iteration
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM activity_logs', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // First, try to log an event that will fail
          activityLogRepository.insert = jest.fn().mockRejectedValue(new Error('Database error'));
          await expect(
            activityLogService.logEvent(failEventType, failEntityType, entityId, failUserAction, null)
          ).resolves.not.toThrow();

          // Restore original insert
          activityLogRepository.insert = originalInsert;

          // Now log a successful event - should work normally
          await expect(
            activityLogService.logEvent(successEventType, successEntityType, entityId, successUserAction, null)
          ).resolves.not.toThrow();

          // Verify only the successful event was logged
          const result = await activityLogService.getRecentEvents(100, 0);
          expect(result.events.length).toBe(1);
          expect(result.events[0].event_type).toBe(successEventType);
        }
      ),
      pbtOptions()
    );
  });

  it('should not throw errors when database connection fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // event_type
        safeString({ minLength: 1, maxLength: 50 }), // entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // user_action
        async (eventType, entityType, entityId, userAction) => {
          // Mock repository to simulate connection failure
          activityLogRepository.insert = jest.fn().mockRejectedValue(
            new Error('SQLITE_CANTOPEN: unable to open database file')
          );

          // This should not throw an error
          await expect(
            activityLogService.logEvent(eventType, entityType, entityId, userAction, null)
          ).resolves.not.toThrow();
        }
      ),
      pbtOptions()
    );
  });

  it('should not throw errors when JSON serialization fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // event_type
        safeString({ minLength: 1, maxLength: 50 }), // entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // user_action
        async (eventType, entityType, entityId, userAction) => {
          // Create a circular reference that will fail JSON.stringify
          const circularMetadata = { a: 1 };
          circularMetadata.self = circularMetadata;

          // This should not throw an error (silent failure)
          await expect(
            activityLogService.logEvent(eventType, entityType, entityId, userAction, circularMetadata)
          ).resolves.not.toThrow();

          // Verify no event was logged due to serialization failure
          const result = await activityLogService.getRecentEvents(10, 0);
          expect(result.events).toHaveLength(0);
        }
      ),
      pbtOptions()
    );
  });

  it('should allow main application flow to continue when logging fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // event_type
        safeString({ minLength: 1, maxLength: 50 }), // entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // user_action
        async (eventType, entityType, entityId, userAction) => {
          // Mock repository to fail
          activityLogRepository.insert = jest.fn().mockRejectedValue(new Error('Database error'));

          // Simulate main application flow
          let mainFlowCompleted = false;

          try {
            // Log event (should not throw)
            await activityLogService.logEvent(eventType, entityType, entityId, userAction, null);

            // Main application logic continues
            mainFlowCompleted = true;
          } catch (error) {
            // Should never reach here
            mainFlowCompleted = false;
          }

          // Verify main flow completed successfully
          expect(mainFlowCompleted).toBe(true);
        }
      ),
      pbtOptions()
    );
  });

  it('should handle concurrent logging failures gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            eventType: safeString({ minLength: 1, maxLength: 50 }),
            entityType: safeString({ minLength: 1, maxLength: 50 }),
            entityId: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }),
            userAction: safeString({ minLength: 1, maxLength: 200 })
          }),
          { minLength: 3, maxLength: 5 }
        ),
        async (events) => {
          // Mock repository to fail for all events
          activityLogRepository.insert = jest.fn().mockRejectedValue(new Error('Database error'));

          // Log all events concurrently
          const promises = events.map(event =>
            activityLogService.logEvent(
              event.eventType,
              event.entityType,
              event.entityId,
              event.userAction,
              null
            )
          );

          // All promises should resolve without throwing
          await expect(Promise.all(promises)).resolves.not.toThrow();

          // Restore original insert
          activityLogRepository.insert = originalInsert;

          // Verify no events were logged
          const result = await activityLogService.getRecentEvents(100, 0);
          expect(result.events).toHaveLength(0);
        }
      ),
      pbtOptions({ numRuns: 10 }) // Fewer runs due to concurrency
    );
  });
});

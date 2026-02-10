// Feature: activity-log, Property 3: Required Field Validation
const fc = require('fast-check');
const activityLogService = require('./activityLogService');
const { getDatabase } = require('../database/db');
const { safeString, pbtOptions } = require('../test/pbtArbitraries');

describe('Property 3: Required Field Validation', () => {
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

  it('should fail validation when event_type is missing or empty', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(null, undefined, '', '   '), // invalid event_type
        safeString({ minLength: 1, maxLength: 50 }), // valid entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // valid user_action
        async (eventType, entityType, entityId, userAction) => {
          // Attempt to log event with invalid event_type
          await activityLogService.logEvent(eventType, entityType, entityId, userAction, null);

          // Verify no event was inserted
          const result = await activityLogService.getRecentEvents(10, 0);
          expect(result.events).toHaveLength(0);
        }
      ),
      pbtOptions()
    );
  });

  it('should fail validation when entity_type is missing or empty', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // valid event_type
        fc.constantFrom(null, undefined, '', '   '), // invalid entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // valid user_action
        async (eventType, entityType, entityId, userAction) => {
          // Attempt to log event with invalid entity_type
          await activityLogService.logEvent(eventType, entityType, entityId, userAction, null);

          // Verify no event was inserted
          const result = await activityLogService.getRecentEvents(10, 0);
          expect(result.events).toHaveLength(0);
        }
      ),
      pbtOptions()
    );
  });

  it('should fail validation when user_action is missing or empty', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // valid event_type
        safeString({ minLength: 1, maxLength: 50 }), // valid entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        fc.constantFrom(null, undefined, '', '   '), // invalid user_action
        async (eventType, entityType, entityId, userAction) => {
          // Attempt to log event with invalid user_action
          await activityLogService.logEvent(eventType, entityType, entityId, userAction, null);

          // Verify no event was inserted
          const result = await activityLogService.getRecentEvents(10, 0);
          expect(result.events).toHaveLength(0);
        }
      ),
      pbtOptions()
    );
  });

  it('should succeed when all required fields are valid non-empty strings', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // valid event_type
        safeString({ minLength: 1, maxLength: 50 }), // valid entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // valid user_action
        async (eventType, entityType, entityId, userAction) => {
          // Log event with all valid fields
          await activityLogService.logEvent(eventType, entityType, entityId, userAction, null);

          // Verify event was inserted
          const result = await activityLogService.getRecentEvents(10, 0);
          expect(result.events.length).toBeGreaterThan(0);

          const event = result.events[0];
          expect(event.event_type).toBe(eventType);
          expect(event.entity_type).toBe(entityType);
          expect(event.entity_id).toBe(entityId);
          expect(event.user_action).toBe(userAction);
        }
      ),
      pbtOptions()
    );
  });

  it('should allow entity_id to be null for system events', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // valid event_type
        safeString({ minLength: 1, maxLength: 50 }), // valid entity_type
        safeString({ minLength: 1, maxLength: 200 }), // valid user_action
        async (eventType, entityType, userAction) => {
          // Log event with null entity_id
          await activityLogService.logEvent(eventType, entityType, null, userAction, null);

          // Verify event was inserted with null entity_id
          const result = await activityLogService.getRecentEvents(10, 0);
          expect(result.events.length).toBeGreaterThan(0);

          const event = result.events[0];
          expect(event.event_type).toBe(eventType);
          expect(event.entity_type).toBe(entityType);
          expect(event.entity_id).toBeNull();
          expect(event.user_action).toBe(userAction);
        }
      ),
      pbtOptions()
    );
  });

  it('should not throw errors when validation fails (silent failure)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(null, undefined, '', '   '), // invalid event_type
        fc.constantFrom(null, undefined, '', '   '), // invalid entity_type
        fc.constantFrom(null, undefined, '', '   '), // invalid user_action
        async (eventType, entityType, userAction) => {
          // This should not throw an error
          await expect(
            activityLogService.logEvent(eventType, entityType, null, userAction, null)
          ).resolves.not.toThrow();

          // Verify no event was inserted
          const result = await activityLogService.getRecentEvents(10, 0);
          expect(result.events).toHaveLength(0);
        }
      ),
      pbtOptions()
    );
  });
});

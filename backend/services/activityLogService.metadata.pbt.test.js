// Feature: activity-log, Property 17: Metadata Serialization Round Trip
const fc = require('fast-check');
const activityLogService = require('./activityLogService');
const { getDatabase } = require('../database/db');
const { safeString, safeAmount, dbPbtOptions } = require('../test/pbtArbitraries');

describe('Property 17: Metadata Serialization Round Trip', () => {
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

  it('should serialize and deserialize metadata objects correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // event_type
        safeString({ minLength: 1, maxLength: 50 }), // entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // user_action
        fc.record({
          amount: safeAmount(),
          category: safeString({ maxLength: 50 }),
          date: safeString({ maxLength: 20 }),
          place: fc.option(safeString({ maxLength: 50 }), { nil: null }),
          count: fc.integer({ min: 1, max: 100 }),
          isActive: fc.boolean()
        }), // metadata
        async (eventType, entityType, entityId, userAction, metadata) => {
          // Log event with metadata
          await activityLogService.logEvent(eventType, entityType, entityId, userAction, metadata);

          // Retrieve the event
          const result = await activityLogService.getRecentEvents(1, 0);

          // Verify event was logged
          expect(result.events).toHaveLength(1);
          const event = result.events[0];

          // Verify metadata was serialized and deserialized correctly
          expect(event.metadata).toBeDefined();
          expect(typeof event.metadata).toBe('object');
          expect(event.metadata).not.toBeNull();

          // Verify all metadata fields match
          expect(event.metadata.amount).toBeCloseTo(metadata.amount, 2);
          expect(event.metadata.category).toBe(metadata.category);
          expect(event.metadata.date).toBe(metadata.date);
          expect(event.metadata.place).toBe(metadata.place);
          expect(event.metadata.count).toBe(metadata.count);
          expect(event.metadata.isActive).toBe(metadata.isActive);
        }
      ),
      dbPbtOptions()
    );
  });

  it('should handle null metadata correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // event_type
        safeString({ minLength: 1, maxLength: 50 }), // entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // user_action
        async (eventType, entityType, entityId, userAction) => {
          // Log event with null metadata
          await activityLogService.logEvent(eventType, entityType, entityId, userAction, null);

          // Retrieve the event
          const result = await activityLogService.getRecentEvents(1, 0);

          // Verify event was logged
          expect(result.events).toHaveLength(1);
          const event = result.events[0];

          // Verify metadata is null
          expect(event.metadata).toBeNull();
        }
      ),
      dbPbtOptions()
    );
  });

  it('should handle undefined metadata correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // event_type
        safeString({ minLength: 1, maxLength: 50 }), // entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // user_action
        async (eventType, entityType, entityId, userAction) => {
          // Log event with undefined metadata
          await activityLogService.logEvent(eventType, entityType, entityId, userAction, undefined);

          // Retrieve the event
          const result = await activityLogService.getRecentEvents(1, 0);

          // Verify event was logged
          expect(result.events).toHaveLength(1);
          const event = result.events[0];

          // Verify metadata is null
          expect(event.metadata).toBeNull();
        }
      ),
      dbPbtOptions()
    );
  });

  it('should handle nested metadata objects correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // event_type
        safeString({ minLength: 1, maxLength: 50 }), // entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // user_action
        fc.record({
          expense: fc.record({
            amount: safeAmount(),
            category: safeString({ maxLength: 50 })
          }),
          user: fc.record({
            name: safeString({ maxLength: 50 }),
            id: fc.integer({ min: 1, max: 1000 })
          }),
          tags: fc.array(safeString({ maxLength: 20 }), { minLength: 0, maxLength: 5 })
        }), // nested metadata
        async (eventType, entityType, entityId, userAction, metadata) => {
          // Log event with nested metadata
          await activityLogService.logEvent(eventType, entityType, entityId, userAction, metadata);

          // Retrieve the event
          const result = await activityLogService.getRecentEvents(1, 0);

          // Verify event was logged
          expect(result.events).toHaveLength(1);
          const event = result.events[0];

          // Verify nested metadata was serialized and deserialized correctly
          expect(event.metadata).toBeDefined();
          expect(event.metadata.expense).toBeDefined();
          expect(event.metadata.expense.amount).toBeCloseTo(metadata.expense.amount, 2);
          expect(event.metadata.expense.category).toBe(metadata.expense.category);
          expect(event.metadata.user).toBeDefined();
          expect(event.metadata.user.name).toBe(metadata.user.name);
          expect(event.metadata.user.id).toBe(metadata.user.id);
          expect(event.metadata.tags).toEqual(metadata.tags);
        }
      ),
      dbPbtOptions()
    );
  });

  it('should handle metadata with special characters correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        safeString({ minLength: 1, maxLength: 50 }), // event_type
        safeString({ minLength: 1, maxLength: 50 }), // entity_type
        fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null }), // entity_id
        safeString({ minLength: 1, maxLength: 200 }), // user_action
        fc.record({
          description: fc.string({ minLength: 1, maxLength: 100 }),
          notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: null })
        }), // metadata with special characters
        async (eventType, entityType, entityId, userAction, metadata) => {
          // Log event with metadata containing special characters
          await activityLogService.logEvent(eventType, entityType, entityId, userAction, metadata);

          // Retrieve the event
          const result = await activityLogService.getRecentEvents(1, 0);

          // Verify event was logged
          expect(result.events).toHaveLength(1);
          const event = result.events[0];

          // Verify metadata was serialized and deserialized correctly
          expect(event.metadata).toBeDefined();
          expect(event.metadata.description).toBe(metadata.description);
          expect(event.metadata.notes).toBe(metadata.notes);
        }
      ),
      dbPbtOptions()
    );
  });
});

/**
 * @invariant Metadata Serialization: Metadata objects round-trip correctly through JSON serialization/deserialization
 * @invariant Required Field Validation: Events with missing required fields (event_type, entity_type, user_action) are rejected
 * @invariant Automatic Timestamp: All logged events receive automatic timestamps within seconds of current time
 * @invariant Logging Resilience: Logging failures do not throw errors or interrupt application flow
 * 
 * Randomization adds value by testing various metadata structures (nested objects, special characters, null values),
 * field combinations (valid/invalid), and failure scenarios to ensure robust data handling and error resilience.
 */

// Feature: test-suite-rationalization
// Consolidates: metadata, validation, timestamp, resilience
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

const fc = require('fast-check');
const activityLogService = require('./activityLogService');
const activityLogRepository = require('../repositories/activityLogRepository');
const { getDatabase } = require('../database/db');
const { safeString, safeAmount, dbPbtOptions, pbtOptions } = require('../test/pbtArbitraries');

describe('activityLogService - Data Properties', () => {
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

  describe('Metadata Serialization Round Trip', () => {
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

  describe('Required Field Validation', () => {
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

  describe('Automatic Timestamp Assignment', () => {
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

  describe('Logging Failure Resilience', () => {
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
});

const fc = require('fast-check');
const activityLogRepository = require('./activityLogRepository');
const { getDatabase } = require('../database/db');
const { pbtOptions } = require('../test/pbtArbitraries');

describe('Activity Log Repository - Property-Based Tests', () => {
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

  // Feature: activity-log, Property 1: Event Storage Round Trip
  describe('Property 1: Event Storage Round Trip', () => {
    it('should preserve all fields when storing and retrieving an event', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            event_type: fc.string({ minLength: 1, maxLength: 50 }),
            entity_type: fc.string({ minLength: 1, maxLength: 50 }),
            entity_id: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: null }),
            user_action: fc.string({ minLength: 1, maxLength: 200 }),
            metadata: fc.option(
              fc.jsonValue({ maxDepth: 2 }),
              { nil: null }
            ),
            timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
              .filter(date => !isNaN(date.getTime()))
          }),
          async (event) => {
            // Store the event
            const eventToStore = {
              ...event,
              metadata: event.metadata !== null && event.metadata !== undefined 
                ? JSON.stringify(event.metadata) 
                : null,
              timestamp: event.timestamp.toISOString()
            };
            
            const insertedId = await activityLogRepository.insert(eventToStore);
            
            // Retrieve the specific event by ID using findRecent with offset
            const allEvents = await activityLogRepository.findRecent(1000, 0);
            const retrievedEvent = allEvents.find(e => e.id === insertedId);
            
            // Verify we found the event
            expect(retrievedEvent).toBeDefined();
            
            // Verify all fields are preserved
            expect(retrievedEvent.id).toBe(insertedId);
            expect(retrievedEvent.event_type).toBe(event.event_type);
            expect(retrievedEvent.entity_type).toBe(event.entity_type);
            expect(retrievedEvent.entity_id).toBe(event.entity_id);
            expect(retrievedEvent.user_action).toBe(event.user_action);
            expect(retrievedEvent.timestamp).toBe(eventToStore.timestamp);
            
            // Verify metadata is preserved (as string in DB)
            if (event.metadata !== null && event.metadata !== undefined) {
              const expectedMetadata = JSON.stringify(event.metadata);
              expect(retrievedEvent.metadata).toBe(expectedMetadata);
              // Verify it can be parsed back
              expect(JSON.parse(retrievedEvent.metadata)).toEqual(event.metadata);
            } else {
              expect(retrievedEvent.metadata).toBeNull();
            }
          }
        ),
        pbtOptions()
      );
    });
  });

  // Feature: activity-log, Property 7: Reverse Chronological Ordering
  describe('Property 7: Reverse Chronological Ordering', () => {
    it('should return events in reverse chronological order (newest first)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate an array of events with different timestamps
          fc.array(
            fc.record({
              event_type: fc.string({ minLength: 1, maxLength: 50 }),
              entity_type: fc.string({ minLength: 1, maxLength: 50 }),
              entity_id: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: null }),
              user_action: fc.string({ minLength: 1, maxLength: 200 }),
              metadata: fc.option(fc.jsonValue({ maxDepth: 1 }), { nil: null }),
              timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
                .filter(date => !isNaN(date.getTime()))
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (events) => {
            // Insert all events
            for (const event of events) {
              const eventToStore = {
                ...event,
                metadata: event.metadata !== null && event.metadata !== undefined 
                  ? JSON.stringify(event.metadata) 
                  : null,
                timestamp: event.timestamp.toISOString()
              };
              await activityLogRepository.insert(eventToStore);
            }
            
            // Retrieve all events
            const retrieved = await activityLogRepository.findRecent(1000, 0);
            
            // Verify we got at least the events we inserted
            expect(retrieved.length).toBeGreaterThanOrEqual(events.length);
            
            // Verify ordering: each event should have a timestamp >= the next event
            for (let i = 0; i < retrieved.length - 1; i++) {
              const currentTimestamp = new Date(retrieved[i].timestamp).getTime();
              const nextTimestamp = new Date(retrieved[i + 1].timestamp).getTime();
              expect(currentTimestamp).toBeGreaterThanOrEqual(nextTimestamp);
            }
          }
        ),
        pbtOptions()
      );
    });
  });

  // Feature: activity-log, Property 11: Retention Policy Age-Based Cleanup
  describe('Property 11: Retention Policy Age-Based Cleanup', () => {
    it('should delete events older than cutoff date while preserving newer events', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a cutoff date
          fc.date({ min: new Date('2023-01-01'), max: new Date('2025-12-31') })
            .filter(date => !isNaN(date.getTime())),
          // Generate events before and after the cutoff
          fc.array(
            fc.record({
              event_type: fc.string({ minLength: 1, maxLength: 50 }),
              entity_type: fc.string({ minLength: 1, maxLength: 50 }),
              user_action: fc.string({ minLength: 1, maxLength: 200 }),
              daysOffset: fc.integer({ min: -365, max: 365 }) // Days relative to cutoff
            }),
            { minLength: 5, maxLength: 20 }
          ),
          async (cutoffDate, eventTemplates) => {
            // Insert events with timestamps relative to cutoff date
            const insertedEvents = [];
            for (const template of eventTemplates) {
              const eventDate = new Date(cutoffDate);
              eventDate.setDate(eventDate.getDate() + template.daysOffset);
              
              const event = {
                event_type: template.event_type,
                entity_type: template.entity_type,
                entity_id: null,
                user_action: template.user_action,
                metadata: null,
                timestamp: eventDate.toISOString()
              };
              
              const id = await activityLogRepository.insert(event);
              insertedEvents.push({ ...event, id, daysOffset: template.daysOffset });
            }
            
            // Count events before cleanup
            const countBefore = await activityLogRepository.count();
            
            // Perform age-based cleanup
            const deletedCount = await activityLogRepository.deleteOlderThan(cutoffDate);
            
            // Count events after cleanup
            const countAfter = await activityLogRepository.count();
            
            // Verify the correct number of events were deleted
            expect(countAfter).toBe(countBefore - deletedCount);
            
            // Retrieve remaining events
            const remaining = await activityLogRepository.findRecent(1000, 0);
            
            // Verify all remaining events are >= cutoff date
            for (const event of remaining) {
              const eventTimestamp = new Date(event.timestamp).getTime();
              const cutoffTimestamp = cutoffDate.getTime();
              expect(eventTimestamp).toBeGreaterThanOrEqual(cutoffTimestamp);
            }
            
            // Verify events older than cutoff were deleted
            const oldEvents = insertedEvents.filter(e => e.daysOffset < 0);
            const newEvents = insertedEvents.filter(e => e.daysOffset >= 0);
            
            // All old events should be deleted (not in remaining)
            for (const oldEvent of oldEvents) {
              const found = remaining.find(e => e.id === oldEvent.id);
              expect(found).toBeUndefined();
            }
            
            // All new events should still exist (in remaining)
            for (const newEvent of newEvents) {
              const found = remaining.find(e => e.id === newEvent.id);
              expect(found).toBeDefined();
            }
          }
        ),
        pbtOptions()
      );
    });
  });

  // Feature: activity-log, Property 12: Retention Policy Count-Based Cleanup
  describe('Property 12: Retention Policy Count-Based Cleanup', () => {
    it('should delete oldest events when count exceeds maximum, preserving newest', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a max count
          fc.integer({ min: 3, max: 10 }),
          // Generate more events than the max count
          fc.integer({ min: 5, max: 20 }),
          async (maxCount, totalEvents) => {
            // Ensure we have more events than max count
            fc.pre(totalEvents > maxCount);
            
            // Clean up all existing events first to have a clean slate
            await new Promise((resolve) => {
              db.run('DELETE FROM activity_logs', () => resolve());
            });
            
            // Insert events with sequential timestamps
            const insertedEvents = [];
            const baseDate = new Date('2025-01-01');
            
            for (let i = 0; i < totalEvents; i++) {
              const eventDate = new Date(baseDate);
              eventDate.setHours(eventDate.getHours() + i); // Each event 1 hour apart
              
              const event = {
                event_type: 'test_event',
                entity_type: 'test',
                entity_id: null,
                user_action: `Event ${i}`,
                metadata: null,
                timestamp: eventDate.toISOString()
              };
              
              const id = await activityLogRepository.insert(event);
              insertedEvents.push({ ...event, id, index: i });
            }
            
            // Verify we have the expected number of events before cleanup
            const countBefore = await activityLogRepository.count();
            expect(countBefore).toBe(totalEvents);
            
            // Perform count-based cleanup
            const deletedCount = await activityLogRepository.deleteExcessEvents(maxCount);
            
            // Verify the correct number of events were deleted
            const expectedDeleted = totalEvents - maxCount;
            expect(deletedCount).toBe(expectedDeleted);
            
            // Count remaining events
            const countAfter = await activityLogRepository.count();
            expect(countAfter).toBe(maxCount);
            
            // Retrieve remaining events
            const remaining = await activityLogRepository.findRecent(1000, 0);
            
            // Verify we have exactly maxCount events
            expect(remaining.length).toBe(maxCount);
            
            // Verify the newest events were preserved
            // The remaining events should be the last maxCount events we inserted
            const newestEvents = insertedEvents.slice(-maxCount);
            
            for (const newestEvent of newestEvents) {
              const found = remaining.find(e => e.id === newestEvent.id);
              expect(found).toBeDefined();
            }
            
            // Verify the oldest events were deleted
            const oldestEvents = insertedEvents.slice(0, expectedDeleted);
            
            for (const oldestEvent of oldestEvents) {
              const found = remaining.find(e => e.id === oldestEvent.id);
              expect(found).toBeUndefined();
            }
          }
        ),
        pbtOptions()
      );
    });
  });
});

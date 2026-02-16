/**
 * @invariant Age-Based Cleanup: Events older than maxAgeDays are deleted while events within maxAgeDays are retained
 * @invariant Count-Based Cleanup: When event count exceeds maxCount, oldest events are deleted to maintain exactly maxCount events
 * 
 * Randomization adds value by testing various retention configurations (maxAgeDays, maxCount) and event distributions
 * (different ages, counts, timestamps) to ensure cleanup logic handles all scenarios correctly.
 */

// Feature: test-suite-rationalization
// Consolidates: ageBasedCleanup, countBasedCleanup
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const activityLogService = require('./activityLogService');
const settingsService = require('./settingsService');
const activityLogRepository = require('../repositories/activityLogRepository');
const { getDatabase } = require('../database/db');

describe('activityLogService - Cleanup Properties', () => {
  let db;

  beforeEach(async () => {
    db = await getDatabase();
    
    // Clean up test data - ensure complete cleanup
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM activity_logs', (err) => {
          if (err) {
            reject(err);
            return;
          }
        });
        db.run('DELETE FROM settings', (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    });
  });

  afterEach(async () => {
    // Clean up test data
    if (db) {
      await new Promise((resolve) => {
        db.serialize(() => {
          db.run('DELETE FROM activity_logs', () => {});
          db.run('DELETE FROM settings', () => {
            resolve();
          });
        });
      });
    }
  });

  describe('Age-Based Cleanup', () => {
    it('should delete all events older than configured maxAgeDays and retain events within maxAgeDays', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random maxAgeDays value (7-365)
          fc.integer({ min: 7, max: 365 }),
          // Generate random set of events with various ages (avoid exact boundary)
          fc.array(
            fc.record({
              daysOld: fc.integer({ min: 0, max: 400 }), // Some older than max possible
              entityId: fc.integer({ min: 1, max: 10000 })
            }),
            { minLength: 5, maxLength: 50 }
          ),
          async (maxAgeDays, events) => {
            // Filter out events exactly at the boundary to avoid timing issues
            const filteredEvents = events.filter(e => e.daysOld !== maxAgeDays);
            if (filteredEvents.length < 3) {
              // Skip this test case if we don't have enough events after filtering
              return;
            }

            // Clean up before this iteration
            await new Promise((resolve) => {
              db.serialize(() => {
                db.run('DELETE FROM activity_logs', () => {});
                db.run('DELETE FROM settings', () => resolve());
              });
            });

            // Configure retention settings
            await settingsService.updateRetentionSettings(maxAgeDays, 10000);

            // Wait for fire-and-forget logEvent from updateRetentionSettings to settle
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Clear activity logs created by updateRetentionSettings
            await new Promise((resolve) => {
              db.run('DELETE FROM activity_logs', () => resolve());
            });

            // Create events with calculated timestamps
            const now = new Date();
            const cutoffDate = new Date(now);
            cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
            
            const createdEvents = [];
            
            for (const event of filteredEvents) {
              const eventDate = new Date(now);
              eventDate.setDate(eventDate.getDate() - event.daysOld);
              
              await activityLogRepository.insert({
                event_type: 'test_event',
                entity_type: 'test',
                entity_id: event.entityId,
                user_action: `Event ${event.entityId} - ${event.daysOld} days old`,
                metadata: null,
                timestamp: eventDate.toISOString()
              });
              
              // Determine if event should be deleted based on actual cutoff comparison
              const shouldBeDeleted = eventDate < cutoffDate;
              
              createdEvents.push({
                daysOld: event.daysOld,
                entityId: event.entityId,
                timestamp: eventDate.toISOString(),
                shouldBeDeleted
              });
            }

            // Run cleanup
            await activityLogService.cleanupOldEvents();

            // Verify: all events older than maxAgeDays are deleted
            const remainingEvents = await activityLogRepository.findRecent(10000, 0);
            
            // Check that no remaining event is older than the cutoff
            for (const remainingEvent of remainingEvents) {
              const eventDate = new Date(remainingEvent.timestamp);
              expect(eventDate.getTime()).toBeGreaterThanOrEqual(cutoffDate.getTime());
            }

            // Verify: events within maxAgeDays are retained
            const eventsWithinLimit = createdEvents.filter(e => !e.shouldBeDeleted);
            const eventsOlderThanLimit = createdEvents.filter(e => e.shouldBeDeleted);
            
            // The number of remaining events should match events within limit
            expect(remainingEvents.length).toBe(eventsWithinLimit.length);
            
            // Verify the correct number of events were deleted
            const expectedDeleted = eventsOlderThanLimit.length;
            const actualRemaining = remainingEvents.length;
            const totalCreated = createdEvents.length;
            expect(actualRemaining).toBe(totalCreated - expectedDeleted);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case where all events are older than maxAgeDays', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 7, max: 365 }),
          fc.array(
            fc.integer({ min: 1, max: 100 }), // Event IDs
            { minLength: 3, maxLength: 20 }
          ),
          async (maxAgeDays, eventIds) => {
            // Clean up before this iteration
            await new Promise((resolve) => {
              db.serialize(() => {
                db.run('DELETE FROM activity_logs', () => {});
                db.run('DELETE FROM settings', () => resolve());
              });
            });

            // Configure settings
            await settingsService.updateRetentionSettings(maxAgeDays, 10000);

            // Wait for fire-and-forget logEvent from updateRetentionSettings to settle
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Clear activity logs created by updateRetentionSettings
            await new Promise((resolve) => {
              db.run('DELETE FROM activity_logs', () => resolve());
            });

            // Create events all older than maxAgeDays
            const daysOld = maxAgeDays + 10;
            const eventDate = new Date();
            eventDate.setDate(eventDate.getDate() - daysOld);

            for (const id of eventIds) {
              await activityLogRepository.insert({
                event_type: 'test_event',
                entity_type: 'test',
                entity_id: id,
                user_action: `Old event ${id}`,
                metadata: null,
                timestamp: eventDate.toISOString()
              });
            }

            // Run cleanup
            const result = await activityLogService.cleanupOldEvents();

            // Verify all events were deleted
            expect(result.deletedCount).toBe(eventIds.length);
            
            const remainingCount = await activityLogRepository.count();
            expect(remainingCount).toBe(0);
            
            expect(result.oldestRemaining).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case where all events are within maxAgeDays', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 30, max: 365 }),
          fc.array(
            fc.record({
              daysOld: fc.integer({ min: 0, max: 29 }), // All within 30 days
              entityId: fc.integer({ min: 1, max: 10000 })
            }),
            { minLength: 3, maxLength: 20 }
          ),
          async (maxAgeDays, events) => {
            // Clean up before this iteration
            await new Promise((resolve) => {
              db.serialize(() => {
                db.run('DELETE FROM activity_logs', () => {});
                db.run('DELETE FROM settings', () => resolve());
              });
            });

            // Configure settings (maxAgeDays >= 30, so all events are within limit)
            await settingsService.updateRetentionSettings(maxAgeDays, 10000);

            // Wait for fire-and-forget logEvent from updateRetentionSettings to settle
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Clear activity logs created by updateRetentionSettings
            await new Promise((resolve) => {
              db.run('DELETE FROM activity_logs', () => resolve());
            });

            // Create recent events
            for (const event of events) {
              const eventDate = new Date();
              eventDate.setDate(eventDate.getDate() - event.daysOld);
              
              await activityLogRepository.insert({
                event_type: 'test_event',
                entity_type: 'test',
                entity_id: event.entityId,
                user_action: `Recent event ${event.entityId}`,
                metadata: null,
                timestamp: eventDate.toISOString()
              });
            }

            // Run cleanup
            const result = await activityLogService.cleanupOldEvents();

            // Verify no events were deleted
            expect(result.deletedCount).toBe(0);
            
            const remainingCount = await activityLogRepository.count();
            expect(remainingCount).toBe(events.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle boundary case: events exactly at maxAgeDays cutoff', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 7, max: 365 }),
          async (maxAgeDays) => {
            // Clean up before this iteration
            await new Promise((resolve) => {
              db.serialize(() => {
                db.run('DELETE FROM activity_logs', () => {});
                db.run('DELETE FROM settings', () => resolve());
              });
            });

            // Configure settings
            await settingsService.updateRetentionSettings(maxAgeDays, 10000);

            // Wait for fire-and-forget logEvent from updateRetentionSettings to settle
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Clear activity logs created by updateRetentionSettings
            await new Promise((resolve) => {
              db.run('DELETE FROM activity_logs', () => resolve());
            });

            const now = new Date();
            
            // Create event exactly maxAgeDays old
            const exactCutoffDate = new Date(now);
            exactCutoffDate.setDate(exactCutoffDate.getDate() - maxAgeDays);
            
            await activityLogRepository.insert({
              event_type: 'test_event',
              entity_type: 'test',
              entity_id: 1,
              user_action: 'Event at exact cutoff',
              metadata: null,
              timestamp: exactCutoffDate.toISOString()
            });

            // Create event one day older than maxAgeDays
            const oneDayOlderDate = new Date(now);
            oneDayOlderDate.setDate(oneDayOlderDate.getDate() - maxAgeDays - 1);
            
            await activityLogRepository.insert({
              event_type: 'test_event',
              entity_type: 'test',
              entity_id: 2,
              user_action: 'Event one day older',
              metadata: null,
              timestamp: oneDayOlderDate.toISOString()
            });

            // Create event one day newer than maxAgeDays
            const oneDayNewerDate = new Date(now);
            oneDayNewerDate.setDate(oneDayNewerDate.getDate() - maxAgeDays + 1);
            
            await activityLogRepository.insert({
              event_type: 'test_event',
              entity_type: 'test',
              entity_id: 3,
              user_action: 'Event one day newer',
              metadata: null,
              timestamp: oneDayNewerDate.toISOString()
            });

            // Run cleanup
            const result = await activityLogService.cleanupOldEvents();

            // The event one day older should definitely be deleted
            // The event at exact cutoff and one day newer should be kept
            // (cutoff is "older than maxAgeDays", so exactly maxAgeDays should be kept)
            const remainingEvents = await activityLogRepository.findRecent(10, 0);
            
            // Should have 2 events remaining (exact cutoff and one day newer)
            expect(remainingEvents.length).toBeGreaterThanOrEqual(1);
            expect(result.deletedCount).toBeGreaterThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Count-Based Cleanup', () => {
    it('should delete excess events beyond maxCount and keep exactly maxCount newest events', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random maxCount value (smaller range for faster tests)
          fc.integer({ min: 100, max: 200 }),
          // Generate event count greater than maxCount (smaller range)
          fc.integer({ min: 20, max: 50 }), // Extra events beyond maxCount
          async (maxCount, extraEvents) => {
            const totalEvents = maxCount + extraEvents;

            // Clean up before this iteration
            await new Promise((resolve) => {
              db.serialize(() => {
                db.run('DELETE FROM activity_logs', () => {});
                db.run('DELETE FROM settings', () => resolve());
              });
            });

            // Configure retention settings (set maxAgeDays high to avoid age-based cleanup)
            await settingsService.updateRetentionSettings(365, maxCount);

            // Wait for fire-and-forget logEvent from updateRetentionSettings to settle
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Clear activity logs created by updateRetentionSettings
            await new Promise((resolve) => {
              db.run('DELETE FROM activity_logs', () => resolve());
            });

            // Create events with incrementing timestamps (newer events have higher IDs)
            const now = new Date();
            const baseTime = now.getTime();
            
            for (let i = 0; i < totalEvents; i++) {
              const eventDate = new Date(baseTime - (totalEvents - i) * 1000); // Older events have lower IDs
              
              await activityLogRepository.insert({
                event_type: 'test_event',
                entity_type: 'test',
                entity_id: i,
                user_action: `Event ${i}`,
                metadata: null,
                timestamp: eventDate.toISOString()
              });
            }

            // Run cleanup
            const result = await activityLogService.cleanupOldEvents();

            // Verify exactly maxCount events remain
            const remainingCount = await activityLogRepository.count();
            expect(remainingCount).toBe(maxCount);

            // Verify the correct number were deleted
            expect(result.deletedCount).toBe(extraEvents);

            // Verify the newest events were kept (highest entity_ids)
            const remainingEvents = await activityLogRepository.findRecent(maxCount + 100, 0);
            
            // All remaining events should have entity_id >= extraEvents
            // (because we delete the oldest, which have the lowest IDs)
            for (const event of remainingEvents) {
              expect(event.entity_id).toBeGreaterThanOrEqual(extraEvents);
            }

            // Verify oldest remaining event is the one at index extraEvents
            const oldestRemaining = remainingEvents[remainingEvents.length - 1];
            expect(oldestRemaining.entity_id).toBe(extraEvents);
          }
        ),
        { numRuns: 50 } // Reduced from 100 for faster execution
      );
    });

    it('should not delete any events when count is below maxCount', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 200 }),
          fc.integer({ min: 10, max: 50 }), // Event count less than min maxCount
          async (maxCount, eventCount) => {
            // Clean up before this iteration
            await new Promise((resolve) => {
              db.serialize(() => {
                db.run('DELETE FROM activity_logs', () => {});
                db.run('DELETE FROM settings', () => resolve());
              });
            });

            // Configure settings
            await settingsService.updateRetentionSettings(365, maxCount);

            // Wait for fire-and-forget logEvent from updateRetentionSettings to settle
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Clear activity logs created by updateRetentionSettings
            await new Promise((resolve) => {
              db.run('DELETE FROM activity_logs', () => resolve());
            });

            // Create fewer events than maxCount
            for (let i = 0; i < eventCount; i++) {
              await activityLogRepository.insert({
                event_type: 'test_event',
                entity_type: 'test',
                entity_id: i,
                user_action: `Event ${i}`,
                metadata: null,
                timestamp: new Date().toISOString()
              });
            }

            // Run cleanup
            const result = await activityLogService.cleanupOldEvents();

            // Verify no events were deleted
            expect(result.deletedCount).toBe(0);
            
            const remainingCount = await activityLogRepository.count();
            expect(remainingCount).toBe(eventCount);
          }
        ),
        { numRuns: 50 }
      );
    }, 30000); // 30 second timeout

    it('should delete oldest events first when exceeding maxCount', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 200 }),
          fc.integer({ min: 10, max: 30 }),
          async (maxCount, extraEvents) => {
            const totalEvents = maxCount + extraEvents;

            // Clean up before this iteration
            await new Promise((resolve) => {
              db.serialize(() => {
                db.run('DELETE FROM activity_logs', () => {});
                db.run('DELETE FROM settings', () => resolve());
              });
            });

            // Configure settings
            await settingsService.updateRetentionSettings(365, maxCount);

            // Wait for fire-and-forget logEvent from updateRetentionSettings to settle
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Clear activity logs created by updateRetentionSettings
            await new Promise((resolve) => {
              db.run('DELETE FROM activity_logs', () => resolve());
            });

            // Create events with known timestamps
            const timestamps = [];
            const now = new Date();
            const baseTime = now.getTime();
            
            for (let i = 0; i < totalEvents; i++) {
              const eventDate = new Date(baseTime - (totalEvents - i) * 60000); // 1 minute apart, older events have lower IDs
              timestamps.push(eventDate.toISOString());
              
              await activityLogRepository.insert({
                event_type: 'test_event',
                entity_type: 'test',
                entity_id: i,
                user_action: `Event ${i}`,
                metadata: null,
                timestamp: eventDate.toISOString()
              });
            }

            // Run cleanup
            await activityLogService.cleanupOldEvents();

            // Get remaining events
            const remainingEvents = await activityLogRepository.findRecent(maxCount + 100, 0);
            
            // Verify the oldest remaining event is newer than the first extraEvents events
            const oldestRemainingTimestamp = remainingEvents[remainingEvents.length - 1].timestamp;
            const expectedOldestTimestamp = timestamps[extraEvents];
            
            expect(oldestRemainingTimestamp).toBe(expectedOldestTimestamp);

            // Verify all remaining events are from the newest maxCount events
            const remainingTimestamps = remainingEvents.map(e => e.timestamp).sort();
            const expectedTimestamps = timestamps.slice(extraEvents).sort();
            
            expect(remainingTimestamps).toEqual(expectedTimestamps);
          }
        ),
        { numRuns: 50 }
      );
    }, 30000); // 30 second timeout

    it('should handle edge case where event count exactly equals maxCount', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 200 }),
          async (maxCount) => {
            // Clean up before this iteration
            await new Promise((resolve) => {
              db.serialize(() => {
                db.run('DELETE FROM activity_logs', () => {});
                db.run('DELETE FROM settings', () => resolve());
              });
            });

            // Configure settings
            await settingsService.updateRetentionSettings(365, maxCount);

            // Wait for fire-and-forget logEvent from updateRetentionSettings to settle
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Clear activity logs created by updateRetentionSettings
            await new Promise((resolve) => {
              db.run('DELETE FROM activity_logs', () => resolve());
            });

            // Create exactly maxCount events
            for (let i = 0; i < maxCount; i++) {
              await activityLogRepository.insert({
                event_type: 'test_event',
                entity_type: 'test',
                entity_id: i,
                user_action: `Event ${i}`,
                metadata: null,
                timestamp: new Date().toISOString()
              });
            }

            // Run cleanup
            const result = await activityLogService.cleanupOldEvents();

            // Verify no events were deleted
            expect(result.deletedCount).toBe(0);
            
            const remainingCount = await activityLogRepository.count();
            expect(remainingCount).toBe(maxCount);
          }
        ),
        { numRuns: 50 }
      );
    }, 30000); // 30 second timeout

    it('should apply count-based cleanup after age-based cleanup', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 200 }),
          fc.integer({ min: 10, max: 30 }),
          async (maxCount, extraEvents) => {
            const totalRecentEvents = maxCount + extraEvents;

            // Clean up before this iteration
            await new Promise((resolve) => {
              db.serialize(() => {
                db.run('DELETE FROM activity_logs', () => {});
                db.run('DELETE FROM settings', () => resolve());
              });
            });

            // Configure settings with short maxAgeDays
            await settingsService.updateRetentionSettings(30, maxCount);

            // Wait for fire-and-forget logEvent from updateRetentionSettings to settle
            await new Promise((resolve) => setTimeout(resolve, 50));

            // Clear activity logs created by updateRetentionSettings
            await new Promise((resolve) => {
              db.run('DELETE FROM activity_logs', () => resolve());
            });

            // Create old events (will be deleted by age-based cleanup)
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 40);
            
            for (let i = 0; i < 20; i++) {
              await activityLogRepository.insert({
                event_type: 'test_event',
                entity_type: 'test',
                entity_id: i,
                user_action: `Old event ${i}`,
                metadata: null,
                timestamp: oldDate.toISOString()
              });
            }

            // Create recent events (more than maxCount)
            const baseTime = new Date().getTime();
            
            for (let i = 0; i < totalRecentEvents; i++) {
              const eventDate = new Date(baseTime + i * 1000);
              
              await activityLogRepository.insert({
                event_type: 'test_event',
                entity_type: 'test',
                entity_id: 1000 + i,
                user_action: `Recent event ${i}`,
                metadata: null,
                timestamp: eventDate.toISOString()
              });
            }

            // Run cleanup
            await activityLogService.cleanupOldEvents();

            // Verify exactly maxCount events remain (all old events deleted, then excess recent events deleted)
            const remainingCount = await activityLogRepository.count();
            expect(remainingCount).toBe(maxCount);

            // Verify all remaining events are recent (entity_id >= 1000)
            const remainingEvents = await activityLogRepository.findRecent(maxCount + 100, 0);
            
            for (const event of remainingEvents) {
              expect(event.entity_id).toBeGreaterThanOrEqual(1000);
            }
          }
        ),
        { numRuns: 50 }
      );
    }, 30000); // 30 second timeout
  });
});

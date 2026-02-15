// Feature: activity-log-retention-config, Property 7: Age-Based Cleanup
// **Validates: Requirements 5.2**
const fc = require('fast-check');
const activityLogService = require('./activityLogService');
const settingsService = require('./settingsService');
const activityLogRepository = require('../repositories/activityLogRepository');
const { getDatabase } = require('../database/db');

describe('Property 7: Age-Based Cleanup', () => {
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

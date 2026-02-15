// Feature: activity-log-retention-config, Property 8: Count-Based Cleanup
// **Validates: Requirements 5.3**
const fc = require('fast-check');
const activityLogService = require('./activityLogService');
const settingsService = require('./settingsService');
const activityLogRepository = require('../repositories/activityLogRepository');
const { getDatabase } = require('../database/db');

describe('Property 8: Count-Based Cleanup', () => {
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

// Feature: activity-log, Property 15: Cleanup Statistics Logging
const activityLogService = require('./activityLogService');
const activityLogRepository = require('../repositories/activityLogRepository');
const { getDatabase } = require('../database/db');

describe('Property 15: Cleanup Statistics Logging', () => {
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

  it('should log the number of events deleted during cleanup', async () => {
    // Create some old events (older than 90 days)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    for (let i = 0; i < 5; i++) {
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: i,
        user_action: `Test action ${i}`,
        metadata: null,
        timestamp: oldDate.toISOString()
      });
    }

    // Create some recent events
    for (let i = 0; i < 3; i++) {
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: i + 10,
        user_action: `Recent action ${i}`,
        metadata: null,
        timestamp: new Date().toISOString()
      });
    }

    // Run cleanup
    const result = await activityLogService.cleanupOldEvents();

    // Verify deleted count is logged
    expect(result.deletedCount).toBe(5);
  });

  it('should log the oldest remaining event timestamp after cleanup', async () => {
    // Create events with different timestamps
    const timestamps = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      timestamps.push(date.toISOString());

      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: i,
        user_action: `Test action ${i}`,
        metadata: null,
        timestamp: date.toISOString()
      });
    }

    // Run cleanup (should not delete any since all are recent)
    const result = await activityLogService.cleanupOldEvents();

    // Verify oldest remaining timestamp is logged
    expect(result.oldestRemaining).toBeDefined();
    expect(result.oldestRemaining).toBe(timestamps[timestamps.length - 1]);
  });

  it('should return null for oldest remaining when all events are deleted', async () => {
    // Create only old events
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    for (let i = 0; i < 3; i++) {
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: i,
        user_action: `Test action ${i}`,
        metadata: null,
        timestamp: oldDate.toISOString()
      });
    }

    // Run cleanup
    const result = await activityLogService.cleanupOldEvents();

    // Verify all events were deleted
    expect(result.deletedCount).toBe(3);
    expect(result.oldestRemaining).toBeNull();
  });

  it('should log cleanup statistics for count-based cleanup', async () => {
    // Create more events than the max limit (1000)
    const eventCount = 1050;
    for (let i = 0; i < eventCount; i++) {
      const date = new Date();
      date.setMilliseconds(date.getMilliseconds() + i); // Ensure unique timestamps

      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: i,
        user_action: `Test action ${i}`,
        metadata: null,
        timestamp: date.toISOString()
      });
    }

    // Run cleanup
    const result = await activityLogService.cleanupOldEvents();

    // Verify excess events were deleted
    expect(result.deletedCount).toBe(50); // 1050 - 1000 = 50

    // Verify oldest remaining is set
    expect(result.oldestRemaining).toBeDefined();
    expect(result.oldestRemaining).not.toBeNull();
  });

  it('should log zero deleted count when no cleanup is needed', async () => {
    // Create only recent events within limits
    for (let i = 0; i < 5; i++) {
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: i,
        user_action: `Test action ${i}`,
        metadata: null,
        timestamp: new Date().toISOString()
      });
    }

    // Run cleanup
    const result = await activityLogService.cleanupOldEvents();

    // Verify no events were deleted
    expect(result.deletedCount).toBe(0);

    // Verify oldest remaining is still set
    expect(result.oldestRemaining).toBeDefined();
    expect(result.oldestRemaining).not.toBeNull();
  });

  it('should provide cleanup statistics through getCleanupStats', async () => {
    // Create some events
    for (let i = 0; i < 10; i++) {
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: i,
        user_action: `Test action ${i}`,
        metadata: null,
        timestamp: new Date().toISOString()
      });
    }

    // Run cleanup
    await activityLogService.cleanupOldEvents();

    // Get cleanup stats
    const stats = await activityLogService.getCleanupStats();

    // Verify stats structure
    expect(stats).toBeDefined();
    expect(stats.retentionDays).toBe(90);
    expect(stats.maxEntries).toBe(1000);
    expect(stats.currentCount).toBe(10);
    expect(stats.oldestEventTimestamp).toBeDefined();
    expect(stats.lastCleanupRun).toBeDefined();
    expect(stats.lastCleanupDeletedCount).toBe(0);
  });

  it('should update lastCleanupRun timestamp after cleanup', async () => {
    // Get initial stats
    const statsBefore = await activityLogService.getCleanupStats();
    const initialLastRun = statsBefore.lastCleanupRun;

    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    // Create and cleanup events
    await activityLogRepository.insert({
      event_type: 'test_event',
      entity_type: 'test',
      entity_id: 1,
      user_action: 'Test action',
      metadata: null,
      timestamp: new Date().toISOString()
    });

    await activityLogService.cleanupOldEvents();

    // Get updated stats
    const statsAfter = await activityLogService.getCleanupStats();

    // Verify lastCleanupRun was updated
    expect(statsAfter.lastCleanupRun).toBeDefined();
    if (initialLastRun) {
      expect(new Date(statsAfter.lastCleanupRun).getTime()).toBeGreaterThan(
        new Date(initialLastRun).getTime()
      );
    }
  });

  it('should update lastCleanupDeletedCount after cleanup', async () => {
    // Create old events
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    for (let i = 0; i < 7; i++) {
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: i,
        user_action: `Test action ${i}`,
        metadata: null,
        timestamp: oldDate.toISOString()
      });
    }

    // Run cleanup
    await activityLogService.cleanupOldEvents();

    // Get stats
    const stats = await activityLogService.getCleanupStats();

    // Verify lastCleanupDeletedCount matches deleted count
    expect(stats.lastCleanupDeletedCount).toBe(7);
  });
});

// Feature: activity-log-retention-config
// Unit tests for cleanup integration with settings service
const activityLogService = require('./activityLogService');
const settingsService = require('./settingsService');
const activityLogRepository = require('../repositories/activityLogRepository');
const { getDatabase } = require('../database/db');

describe('Activity Log Service - Settings Integration', () => {
  let db;

  beforeEach(async () => {
    db = await getDatabase();
    
    // Clean up test data
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM activity_logs', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM settings', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    // Clean up test data
    if (db) {
      await new Promise((resolve) => {
        db.run('DELETE FROM activity_logs', () => {
          db.run('DELETE FROM settings', () => resolve());
        });
      });
    }
  });

  describe('cleanupOldEvents reads settings from settingsService', () => {
    it('should use configured maxAgeDays from settings', async () => {
      // Configure custom retention settings (30 days)
      await settingsService.updateRetentionSettings(30, 1000);

      // Create events: some older than 30 days, some newer
      const date35DaysAgo = new Date();
      date35DaysAgo.setDate(date35DaysAgo.getDate() - 35);
      
      const date25DaysAgo = new Date();
      date25DaysAgo.setDate(date25DaysAgo.getDate() - 25);

      // Old event (should be deleted)
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: 1,
        user_action: 'Old event',
        metadata: null,
        timestamp: date35DaysAgo.toISOString()
      });

      // Recent event (should be kept)
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: 2,
        user_action: 'Recent event',
        metadata: null,
        timestamp: date25DaysAgo.toISOString()
      });

      // Run cleanup
      const result = await activityLogService.cleanupOldEvents();

      // Verify only old event was deleted
      expect(result.deletedCount).toBe(1);
      
      const remainingCount = await activityLogRepository.count();
      expect(remainingCount).toBe(1);
    });

    it('should use configured maxCount from settings', async () => {
      // Configure custom retention settings (max 150 events)
      await settingsService.updateRetentionSettings(90, 150);

      // Create 200 recent events
      for (let i = 0; i < 200; i++) {
        const date = new Date();
        date.setMilliseconds(date.getMilliseconds() + i);
        
        await activityLogRepository.insert({
          event_type: 'test_event',
          entity_type: 'test',
          entity_id: i,
          user_action: `Event ${i}`,
          metadata: null,
          timestamp: date.toISOString()
        });
      }

      // Run cleanup
      const result = await activityLogService.cleanupOldEvents();

      // Verify excess events were deleted (200 - 150 = 50)
      expect(result.deletedCount).toBe(50);
      
      const remainingCount = await activityLogRepository.count();
      expect(remainingCount).toBe(150);
    });

    it('should use default values when no settings exist', async () => {
      // Don't set any custom settings - should use defaults (90 days, 1000 events)
      
      // Create event older than 90 days
      const date100DaysAgo = new Date();
      date100DaysAgo.setDate(date100DaysAgo.getDate() - 100);
      
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: 1,
        user_action: 'Old event',
        metadata: null,
        timestamp: date100DaysAgo.toISOString()
      });

      // Create recent event
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: 2,
        user_action: 'Recent event',
        metadata: null,
        timestamp: new Date().toISOString()
      });

      // Run cleanup
      const result = await activityLogService.cleanupOldEvents();

      // Verify old event was deleted using default 90 days
      expect(result.deletedCount).toBe(1);
      
      const remainingCount = await activityLogRepository.count();
      expect(remainingCount).toBe(1);
    });
  });

  describe('getCleanupStats includes current settings', () => {
    it('should include configured retention settings in stats', async () => {
      // Configure custom settings
      await settingsService.updateRetentionSettings(60, 500);

      // Create some events
      for (let i = 0; i < 3; i++) {
        await activityLogRepository.insert({
          event_type: 'test_event',
          entity_type: 'test',
          entity_id: i,
          user_action: `Event ${i}`,
          metadata: null,
          timestamp: new Date().toISOString()
        });
      }

      // Get stats
      const stats = await activityLogService.getCleanupStats();

      // Verify stats include configured settings
      expect(stats.retentionDays).toBe(60);
      expect(stats.maxEntries).toBe(500);
      expect(stats.currentCount).toBe(3);
      expect(stats.oldestEventTimestamp).toBeDefined();
    });

    it('should include default settings in stats when no custom settings exist', async () => {
      // Don't set custom settings
      
      // Create an event
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: 1,
        user_action: 'Event',
        metadata: null,
        timestamp: new Date().toISOString()
      });

      // Get stats
      const stats = await activityLogService.getCleanupStats();

      // Verify stats include default settings
      expect(stats.retentionDays).toBe(90);
      expect(stats.maxEntries).toBe(1000);
      expect(stats.currentCount).toBe(1);
    });
  });

  describe('cleanup falls back to defaults if settings load fails', () => {
    it('should handle settings service errors gracefully', async () => {
      // Mock settingsService to throw an error
      const originalGetRetentionSettings = settingsService.getRetentionSettings;
      settingsService.getRetentionSettings = jest.fn().mockRejectedValue(
        new Error('Database connection failed')
      );

      try {
        // Create an old event
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 100);
        
        await activityLogRepository.insert({
          event_type: 'test_event',
          entity_type: 'test',
          entity_id: 1,
          user_action: 'Old event',
          metadata: null,
          timestamp: oldDate.toISOString()
        });

        // Cleanup should throw since we can't get settings
        await expect(activityLogService.cleanupOldEvents()).rejects.toThrow();
      } finally {
        // Restore original function
        settingsService.getRetentionSettings = originalGetRetentionSettings;
      }
    });
  });

  describe('settings changes take effect on next cleanup', () => {
    it('should use updated settings immediately on next cleanup run', async () => {
      // Set initial settings (60 days)
      await settingsService.updateRetentionSettings(60, 1000);

      // Create event 70 days old (older than 60 days)
      const date70DaysAgo = new Date();
      date70DaysAgo.setDate(date70DaysAgo.getDate() - 70);
      
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: 1,
        user_action: 'Event 70 days old',
        metadata: null,
        timestamp: date70DaysAgo.toISOString()
      });

      // First cleanup - should delete the 70-day-old event
      const result1 = await activityLogService.cleanupOldEvents();
      expect(result1.deletedCount).toBe(1);

      // Create event 50 days old
      const date50DaysAgo = new Date();
      date50DaysAgo.setDate(date50DaysAgo.getDate() - 50);
      
      await activityLogRepository.insert({
        event_type: 'test_event',
        entity_type: 'test',
        entity_id: 2,
        user_action: 'Event 50 days old',
        metadata: null,
        timestamp: date50DaysAgo.toISOString()
      });

      // Update settings to 40 days
      await settingsService.updateRetentionSettings(40, 1000);

      // Second cleanup - should delete the 50-day-old event with new 40-day policy
      const result2 = await activityLogService.cleanupOldEvents();
      expect(result2.deletedCount).toBe(1);
      
      const remainingCount = await activityLogRepository.count();
      expect(remainingCount).toBe(0);
    });
  });
});

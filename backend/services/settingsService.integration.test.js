/**
 * Integration Tests for Activity Log Retention Settings
 * 
 * Tests the complete flow from settings persistence through cleanup job execution.
 * Validates end-to-end functionality including:
 * - Settings fetch → modify → save → verify persistence
 * - Settings update triggers stats refresh
 * - Error handling for network/database failures
 * - Default values when settings don't exist
 * - Cleanup job uses updated settings
 * 
 * Feature: activity-log-retention-config
 * _Requirements: 1.2, 1.3, 1.5, 5.5, 6.3_
 */

const settingsService = require('./settingsService');
const activityLogService = require('./activityLogService');
const settingsRepository = require('../repositories/settingsRepository');
const activityLogRepository = require('../repositories/activityLogRepository');
const { getDatabase } = require('../database/db');

describe('Settings Service - Integration Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up settings table
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM settings WHERE key LIKE "activity_log_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Clean up activity logs
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM activity_logs', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Requirement 1.2: Load retention policy settings from database on startup
   * Requirement 1.3: Use default values if no settings exist
   * Requirement 1.5: Persist changes to database immediately
   * _Requirements: 1.2, 1.3, 1.5_
   */
  describe('Full Settings Flow: Fetch → Modify → Save → Verify Persistence', () => {
    test('should use default values when no settings exist', async () => {
      // Fetch settings (should return defaults)
      const settings = await settingsService.getRetentionSettings();

      expect(settings).toEqual({
        maxAgeDays: 90,
        maxCount: 1000
      });
    });

    test('should persist settings and retrieve them correctly', async () => {
      // Update settings
      const newSettings = { maxAgeDays: 60, maxCount: 500 };
      const updated = await settingsService.updateRetentionSettings(
        newSettings.maxAgeDays,
        newSettings.maxCount
      );

      expect(updated).toEqual(newSettings);

      // Fetch settings again to verify persistence
      const retrieved = await settingsService.getRetentionSettings();

      expect(retrieved).toEqual(newSettings);
    });

    test('should handle multiple updates correctly', async () => {
      // First update
      await settingsService.updateRetentionSettings(30, 200);
      let retrieved = await settingsService.getRetentionSettings();
      expect(retrieved).toEqual({ maxAgeDays: 30, maxCount: 200 });

      // Second update
      await settingsService.updateRetentionSettings(180, 5000);
      retrieved = await settingsService.getRetentionSettings();
      expect(retrieved).toEqual({ maxAgeDays: 180, maxCount: 5000 });

      // Third update
      await settingsService.updateRetentionSettings(365, 10000);
      retrieved = await settingsService.getRetentionSettings();
      expect(retrieved).toEqual({ maxAgeDays: 365, maxCount: 10000 });
    });

    test('should persist settings across service calls', async () => {
      // Update settings
      await settingsService.updateRetentionSettings(45, 750);

      // Simulate application restart by fetching settings again
      const settings1 = await settingsService.getRetentionSettings();
      const settings2 = await settingsService.getRetentionSettings();
      const settings3 = await settingsService.getRetentionSettings();

      // All calls should return the same persisted values
      expect(settings1).toEqual({ maxAgeDays: 45, maxCount: 750 });
      expect(settings2).toEqual({ maxAgeDays: 45, maxCount: 750 });
      expect(settings3).toEqual({ maxAgeDays: 45, maxCount: 750 });
    });
  });

  /**
   * Requirement 5.5: Settings update takes effect on next cleanup run
   * Requirement 6.3: Cleanup job uses updated settings
   * _Requirements: 5.5, 6.3_
   */
  describe('Settings Update Triggers Stats Refresh', () => {
    test('should reflect updated settings in cleanup stats', async () => {
      // Get initial stats (should use defaults)
      let stats = await activityLogService.getCleanupStats();
      expect(stats.retentionDays).toBe(90);
      expect(stats.maxEntries).toBe(1000);

      // Update settings
      await settingsService.updateRetentionSettings(120, 2000);

      // Get stats again - should reflect new settings
      stats = await activityLogService.getCleanupStats();
      expect(stats.retentionDays).toBe(120);
      expect(stats.maxEntries).toBe(2000);
    });

    test('should use updated settings in cleanup job', async () => {
      // Create test events with various ages
      const now = new Date();
      const events = [];

      // Events from 100 days ago (should be deleted with 60-day policy)
      for (let i = 0; i < 5; i++) {
        const oldDate = new Date(now);
        oldDate.setDate(oldDate.getDate() - 100);
        events.push({
          event_type: 'test_old',
          entity_type: 'test',
          entity_id: i,
          user_action: `Old event ${i}`,
          metadata: null,
          timestamp: oldDate.toISOString()
        });
      }

      // Events from 30 days ago (should be kept with 60-day policy)
      for (let i = 0; i < 5; i++) {
        const recentDate = new Date(now);
        recentDate.setDate(recentDate.getDate() - 30);
        events.push({
          event_type: 'test_recent',
          entity_type: 'test',
          entity_id: i + 100,
          user_action: `Recent event ${i}`,
          metadata: null,
          timestamp: recentDate.toISOString()
        });
      }

      // Insert all events
      for (const event of events) {
        await activityLogRepository.insert(event);
      }

      // Verify we have 10 events
      let count = await activityLogRepository.count();
      expect(count).toBe(10);

      // Update settings to 60-day retention
      await settingsService.updateRetentionSettings(60, 1000);

      // Run cleanup - should delete events older than 60 days
      const result = await activityLogService.cleanupOldEvents();

      // Verify old events were deleted
      expect(result.deletedCount).toBe(5);

      // Verify remaining count
      count = await activityLogRepository.count();
      expect(count).toBe(5);

      // Verify only recent events remain
      const remaining = await activityLogRepository.findRecent(10, 0);
      expect(remaining.every(e => e.event_type === 'test_recent')).toBe(true);
    });

    test('should use count-based cleanup with updated settings', async () => {
      // Update settings to low max count
      await settingsService.updateRetentionSettings(365, 100);

      // Create 150 recent events (all within retention period)
      const now = new Date();
      for (let i = 0; i < 150; i++) {
        await activityLogRepository.insert({
          event_type: 'test_event',
          entity_type: 'test',
          entity_id: i,
          user_action: `Event ${i}`,
          metadata: null,
          timestamp: now.toISOString()
        });
      }

      // Verify we have 150 events
      let count = await activityLogRepository.count();
      expect(count).toBe(150);

      // Run cleanup - should keep only 100 newest events
      const result = await activityLogService.cleanupOldEvents();

      // Verify excess events were deleted
      expect(result.deletedCount).toBe(50);

      // Verify remaining count matches maxCount setting
      count = await activityLogRepository.count();
      expect(count).toBe(100);
    });
  });

  /**
   * Error handling for database failures
   * _Requirements: 1.2, 1.3_
   */
  describe('Error Handling for Database Failures', () => {
    test('should return defaults when settings table is corrupted', async () => {
      // Insert invalid data into settings table
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO settings (key, value) VALUES (?, ?)',
          ['activity_log_max_age_days', 'invalid_number'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Should return defaults when parsing fails
      const settings = await settingsService.getRetentionSettings();
      expect(settings).toEqual({
        maxAgeDays: 90,
        maxCount: 1000
      });
    });

    test('should handle partial settings gracefully', async () => {
      // Insert only maxAgeDays setting
      await settingsRepository.setSetting('activity_log_max_age_days', '120');

      // Should use default for missing maxCount
      const settings = await settingsService.getRetentionSettings();
      expect(settings.maxAgeDays).toBe(120);
      expect(settings.maxCount).toBe(1000); // default
    });

    test('should reject invalid settings during update', async () => {
      // Test invalid maxAgeDays
      await expect(
        settingsService.updateRetentionSettings(5, 500)
      ).rejects.toThrow('maxAgeDays must be between 7 and 365');

      await expect(
        settingsService.updateRetentionSettings(400, 500)
      ).rejects.toThrow('maxAgeDays must be between 7 and 365');

      // Test invalid maxCount
      await expect(
        settingsService.updateRetentionSettings(30, 50)
      ).rejects.toThrow('maxCount must be between 100 and 10000');

      await expect(
        settingsService.updateRetentionSettings(30, 15000)
      ).rejects.toThrow('maxCount must be between 100 and 10000');

      // Verify no settings were persisted
      const settings = await settingsService.getRetentionSettings();
      expect(settings).toEqual({
        maxAgeDays: 90,
        maxCount: 1000
      });
    });
  });

  /**
   * Default values are used when settings don't exist
   * _Requirements: 1.3, 6.2_
   */
  describe('Default Values When Settings Don\'t Exist', () => {
    test('should use defaults for cleanup when no settings exist', async () => {
      // Verify no settings exist
      const settings = await settingsService.getRetentionSettings();
      expect(settings).toEqual({
        maxAgeDays: 90,
        maxCount: 1000
      });

      // Create events older than 90 days (default)
      const now = new Date();
      const oldDate = new Date(now);
      oldDate.setDate(oldDate.getDate() - 100);

      await activityLogRepository.insert({
        event_type: 'test_old',
        entity_type: 'test',
        entity_id: 1,
        user_action: 'Old event',
        metadata: null,
        timestamp: oldDate.toISOString()
      });

      // Create recent event
      await activityLogRepository.insert({
        event_type: 'test_recent',
        entity_type: 'test',
        entity_id: 2,
        user_action: 'Recent event',
        metadata: null,
        timestamp: now.toISOString()
      });

      // Run cleanup with defaults
      const result = await activityLogService.cleanupOldEvents();

      // Old event should be deleted
      expect(result.deletedCount).toBe(1);

      // Only recent event should remain
      const count = await activityLogRepository.count();
      expect(count).toBe(1);
    });

    test('should show default values in cleanup stats', async () => {
      // Get stats without any settings configured
      const stats = await activityLogService.getCleanupStats();

      expect(stats.retentionDays).toBe(90);
      expect(stats.maxEntries).toBe(1000);
      expect(stats.currentCount).toBe(0);
      expect(stats.oldestEventTimestamp).toBeNull();
    });
  });

  /**
   * Cleanup job uses updated settings on next run
   * _Requirements: 5.5, 6.3_
   */
  describe('Cleanup Job Uses Updated Settings on Next Run', () => {
    test('should apply new retention policy immediately on next cleanup', async () => {
      // Create events with various ages
      const now = new Date();
      
      // Event from 50 days ago
      const date50 = new Date(now);
      date50.setDate(date50.getDate() - 50);
      await activityLogRepository.insert({
        event_type: 'test_50',
        entity_type: 'test',
        entity_id: 1,
        user_action: '50 days old',
        metadata: null,
        timestamp: date50.toISOString()
      });

      // Event from 20 days ago
      const date20 = new Date(now);
      date20.setDate(date20.getDate() - 20);
      await activityLogRepository.insert({
        event_type: 'test_20',
        entity_type: 'test',
        entity_id: 2,
        user_action: '20 days old',
        metadata: null,
        timestamp: date20.toISOString()
      });

      // First cleanup with default 90-day policy - nothing should be deleted
      let result = await activityLogService.cleanupOldEvents();
      expect(result.deletedCount).toBe(0);

      let count = await activityLogRepository.count();
      expect(count).toBe(2);

      // Update settings to 30-day retention
      await settingsService.updateRetentionSettings(30, 1000);

      // Second cleanup with new 30-day policy - 50-day-old event should be deleted
      result = await activityLogService.cleanupOldEvents();
      expect(result.deletedCount).toBe(1);

      count = await activityLogRepository.count();
      expect(count).toBe(1);

      // Verify only the 20-day-old event remains
      const remaining = await activityLogRepository.findRecent(10, 0);
      expect(remaining[0].event_type).toBe('test_20');
    });

    test('should handle multiple cleanup runs with different settings', async () => {
      // Create 200 events
      const now = new Date();
      for (let i = 0; i < 200; i++) {
        await activityLogRepository.insert({
          event_type: 'test_event',
          entity_type: 'test',
          entity_id: i,
          user_action: `Event ${i}`,
          metadata: null,
          timestamp: now.toISOString()
        });
      }

      // First cleanup with maxCount=150
      await settingsService.updateRetentionSettings(365, 150);
      let result = await activityLogService.cleanupOldEvents();
      expect(result.deletedCount).toBe(50);

      let count = await activityLogRepository.count();
      expect(count).toBe(150);

      // Add 50 more events
      for (let i = 200; i < 250; i++) {
        await activityLogRepository.insert({
          event_type: 'test_event',
          entity_type: 'test',
          entity_id: i,
          user_action: `Event ${i}`,
          metadata: null,
          timestamp: now.toISOString()
        });
      }

      count = await activityLogRepository.count();
      expect(count).toBe(200);

      // Second cleanup with maxCount=120
      await settingsService.updateRetentionSettings(365, 120);
      result = await activityLogService.cleanupOldEvents();
      expect(result.deletedCount).toBe(80);

      count = await activityLogRepository.count();
      expect(count).toBe(120);
    });
  });

  /**
   * Combined age and count-based cleanup
   * _Requirements: 5.2, 5.3, 5.5_
   */
  describe('Combined Age and Count-Based Cleanup', () => {
    test('should apply both age and count limits in single cleanup run', async () => {
      const now = new Date();

      // Create 5 old events (100 days ago)
      const oldDate = new Date(now);
      oldDate.setDate(oldDate.getDate() - 100);
      for (let i = 0; i < 5; i++) {
        await activityLogRepository.insert({
          event_type: 'test_old',
          entity_type: 'test',
          entity_id: i,
          user_action: `Old event ${i}`,
          metadata: null,
          timestamp: oldDate.toISOString()
        });
      }

      // Create 150 recent events (10 days ago)
      const recentDate = new Date(now);
      recentDate.setDate(recentDate.getDate() - 10);
      for (let i = 0; i < 150; i++) {
        await activityLogRepository.insert({
          event_type: 'test_recent',
          entity_type: 'test',
          entity_id: i + 100,
          user_action: `Recent event ${i}`,
          metadata: null,
          timestamp: recentDate.toISOString()
        });
      }

      // Total: 155 events
      let count = await activityLogRepository.count();
      expect(count).toBe(155);

      // Set retention to 60 days and max 100 events
      await settingsService.updateRetentionSettings(60, 100);

      // Run cleanup
      const result = await activityLogService.cleanupOldEvents();

      // Should delete: 5 old events + 50 excess recent events = 55 total
      expect(result.deletedCount).toBe(55);

      // Should keep: 100 most recent events
      count = await activityLogRepository.count();
      expect(count).toBe(100);

      // Verify all remaining events are recent
      const remaining = await activityLogRepository.findRecent(150, 0);
      expect(remaining.every(e => e.event_type === 'test_recent')).toBe(true);
    });
  });
});

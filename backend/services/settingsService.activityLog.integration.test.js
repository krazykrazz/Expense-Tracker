const { getDatabase } = require('../database/db');
const settingsService = require('./settingsService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const { runSql, clearActivityLogs, findEventWithMetadata, waitForLogging } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Settings Service Activity Logging
 * 
 * Feature: activity-log-coverage, Property 15: Settings update logging
 * 
 * Validates: Requirements 13.1
 */

const EVENT_TYPE = 'settings_updated';

describe('Settings Service Activity Logging - Integration Tests', () => {
  let db;

  async function resetTestState() {
    await runSql(db, 'DELETE FROM settings WHERE key LIKE "activity_log_%"');
    await clearActivityLogs(db, 'event_type', EVENT_TYPE);
  }

  beforeAll(async () => { db = await getDatabase(); });
  beforeEach(() => resetTestState());
  afterEach(() => resetTestState());

  describe('updateRetentionSettings Event Logging', () => {
    it('should log settings_updated event when updating from defaults', async () => {
      await settingsService.updateRetentionSettings(60, 500);
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, EVENT_TYPE);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('settings');
      expect(event.entity_id).toBeNull();
      expect(event.user_action).toContain('Updated retention settings');
      expect(event.user_action).toContain('maxAgeDays');
      expect(event.user_action).toContain('maxCount');

      expect(metadata.oldSettings).toEqual({ maxAgeDays: 90, maxCount: 1000 });
      expect(metadata.newSettings).toEqual({ maxAgeDays: 60, maxCount: 500 });
    });

    it('should log settings_updated event with correct old values after prior update', async () => {
      await settingsService.updateRetentionSettings(30, 200);
      await waitForLogging();

      await clearActivityLogs(db, 'event_type', EVENT_TYPE);

      await settingsService.updateRetentionSettings(180, 5000);
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, EVENT_TYPE);

      expect(event).toBeDefined();
      expect(metadata.oldSettings).toEqual({ maxAgeDays: 30, maxCount: 200 });
      expect(metadata.newSettings).toEqual({ maxAgeDays: 180, maxCount: 5000 });
    });

    it('should log settings_updated even when values do not change', async () => {
      await settingsService.updateRetentionSettings(60, 500);
      await waitForLogging();

      await clearActivityLogs(db, 'event_type', EVENT_TYPE);

      await settingsService.updateRetentionSettings(60, 500);
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, EVENT_TYPE);

      expect(event).toBeDefined();
      expect(metadata.oldSettings).toEqual({ maxAgeDays: 60, maxCount: 500 });
      expect(metadata.newSettings).toEqual({ maxAgeDays: 60, maxCount: 500 });
    });

    it('should include human-readable user_action with old and new values', async () => {
      await settingsService.updateRetentionSettings(120, 3000);
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event } = findEventWithMetadata(events, EVENT_TYPE);

      expect(event).toBeDefined();
      expect(event.user_action).toContain('90');
      expect(event.user_action).toContain('120');
      expect(event.user_action).toContain('1000');
      expect(event.user_action).toContain('3000');
    });
  });

  describe('Property 15: Settings update logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 15: Settings update logging
     * Validates: Requirements 13.1
     */
    it('should log settings_updated for any valid retention settings update', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            maxAgeDays: fc.integer({ min: 7, max: 365 }),
            maxCount: fc.integer({ min: 100, max: 10000 })
          }),
          async (newSettings) => {
            await clearActivityLogs(db, 'event_type', EVENT_TYPE);

            const oldSettings = await settingsService.getRetentionSettings();

            await settingsService.updateRetentionSettings(newSettings.maxAgeDays, newSettings.maxCount);
            await waitForLogging();

            const events = await activityLogRepository.findRecent(10, 0);
            const settingsEvents = events.filter(e => e.event_type === EVENT_TYPE);

            expect(settingsEvents.length).toBe(1);

            const event = settingsEvents[0];
            expect(event.entity_type).toBe('settings');
            expect(event.entity_id).toBeNull();
            expect(event.user_action).toBeTruthy();

            const metadata = JSON.parse(event.metadata);
            expect(metadata.oldSettings).toEqual({
              maxAgeDays: oldSettings.maxAgeDays,
              maxCount: oldSettings.maxCount
            });
            expect(metadata.newSettings).toEqual({
              maxAgeDays: newSettings.maxAgeDays,
              maxCount: newSettings.maxCount
            });
          }
        ),
        { numRuns: process.env.FAST_PBT === 'true' ? 5 : 20 }
      );
    });
  });
});

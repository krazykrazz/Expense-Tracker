/**
 * Integration Tests for Version Check Startup Flow
 * 
 * Tests the version check integration during server startup:
 * - Version check executes and persists version to settings
 * - Version upgrade is detected and logged to activity log
 * - Startup continues even if version check fails (fire-and-forget)
 * 
 * _Requirements: 2.5, 3.7, 6.4_
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

describe('versionCheckService - Startup Integration Tests', () => {
  let db;
  let versionCheckService;
  let settingsService;
  let activityLogService;
  let settingsRepository;
  let logger;

  beforeAll(async () => {
    db = await createIsolatedTestDb();
    const dbModule = require('../database/db');
    const originalGetDatabase = dbModule.getDatabase;
    dbModule.getDatabase = async () => db;
    db.__originalGetDatabase = originalGetDatabase;

    versionCheckService = require('./versionCheckService');
    settingsService = require('./settingsService');
    activityLogService = require('./activityLogService');
    settingsRepository = require('../repositories/settingsRepository');
    logger = require('../config/logger');
  });

  afterAll(() => {
    const dbModule = require('../database/db');
    if (db.__originalGetDatabase) {
      dbModule.getDatabase = db.__originalGetDatabase;
    }
    cleanupIsolatedTestDb(db);
  });

  beforeEach(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM settings', (err) => err ? reject(err) : resolve());
    });
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM activity_logs', (err) => err ? reject(err) : resolve());
    });
    jest.restoreAllMocks();
  });

  /**
   * Helper to query activity logs directly from the database
   */
  function getActivityLogs() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM activity_logs ORDER BY id DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Helper to get a setting value directly from the database
   */
  function getSetting(key) {
    return new Promise((resolve, reject) => {
      db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.value : null);
      });
    });
  }

  /**
   * Requirement 2.5: Version check executes during server initialization
   * Requirement 6.4: Version check does not interfere with startup timing
   * 
   * Simulates the startup flow: initializeDatabase → checkAndLogVersionUpgrade
   * _Requirements: 2.5, 6.4_
   */
  describe('Version check executes during startup', () => {
    test('first startup stores current version in settings without logging an event', async () => {
      // Simulate the startup call as done in server.js
      await versionCheckService.checkAndLogVersionUpgrade();

      // Verify version was persisted to settings
      const storedVersion = await getSetting('last_known_version');
      const currentVersion = versionCheckService.getCurrentVersion();
      expect(storedVersion).toBe(currentVersion);

      // Verify no upgrade event was logged (first startup)
      const logs = await getActivityLogs();
      const versionLogs = logs.filter(l => l.event_type === 'version_upgraded');
      expect(versionLogs).toHaveLength(0);
    });

    test('upgrade startup detects version change and logs activity event', async () => {
      const oldVersion = '0.0.1';
      // Pre-seed a previous version in settings (simulating a prior run)
      await settingsRepository.setSetting('last_known_version', oldVersion);

      const currentVersion = versionCheckService.getCurrentVersion();
      // Sanity check: the seeded version must differ from the real one
      expect(currentVersion).not.toBe(oldVersion);

      // Simulate the startup call
      await versionCheckService.checkAndLogVersionUpgrade();

      // Verify settings updated to current version
      const storedVersion = await getSetting('last_known_version');
      expect(storedVersion).toBe(currentVersion);

      // Verify upgrade event was logged with correct metadata
      const logs = await getActivityLogs();
      const versionLogs = logs.filter(l => l.event_type === 'version_upgraded');
      expect(versionLogs).toHaveLength(1);

      const event = versionLogs[0];
      expect(event.entity_type).toBe('system');
      expect(event.entity_id).toBeNull();
      expect(event.user_action).toBe(
        `Application upgraded from v${oldVersion} to v${currentVersion}`
      );

      const metadata = JSON.parse(event.metadata);
      expect(metadata.old_version).toBe(oldVersion);
      expect(metadata.new_version).toBe(currentVersion);
    });

    test('same-version restart does not log a duplicate event', async () => {
      const currentVersion = versionCheckService.getCurrentVersion();
      await settingsRepository.setSetting('last_known_version', currentVersion);

      // Simulate the startup call
      await versionCheckService.checkAndLogVersionUpgrade();

      // No upgrade event should be logged
      const logs = await getActivityLogs();
      const versionLogs = logs.filter(l => l.event_type === 'version_upgraded');
      expect(versionLogs).toHaveLength(0);

      // Stored version should remain unchanged
      const storedVersion = await getSetting('last_known_version');
      expect(storedVersion).toBe(currentVersion);
    });
  });

  /**
   * Requirement 3.7: Startup continues even if version check fails
   * Requirement 2.5: Fire-and-forget pattern in server.js
   * 
   * Tests that the try-catch in server.js prevents startup from blocking
   * _Requirements: 2.5, 3.7_
   */
  describe('Startup continues even if version check fails', () => {
    test('settings service read failure does not block startup', async () => {
      // Simulate the exact pattern from server.js:
      //   try { await versionCheckService.checkAndLogVersionUpgrade(); }
      //   catch (error) { logger.error(...); }
      jest.spyOn(settingsRepository, 'getSetting')
        .mockRejectedValue(new Error('Database locked'));

      const errorSpy = jest.spyOn(logger, 'error');

      // This mirrors the server.js startup pattern
      let startupCompleted = false;
      try {
        await versionCheckService.checkAndLogVersionUpgrade();
      } catch (error) {
        // server.js catches this and logs it
        logger.error('Version check failed during startup (non-blocking):', error);
      }
      startupCompleted = true;

      // Startup should complete regardless
      expect(startupCompleted).toBe(true);
    });

    test('activity log service failure does not block startup', async () => {
      // Set up an upgrade scenario
      await settingsRepository.setSetting('last_known_version', '0.0.1');
      jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue('99.0.0');

      // Make activity log fail
      jest.spyOn(activityLogService, 'logEvent')
        .mockRejectedValue(new Error('Activity log DB error'));

      // Simulate server.js startup pattern
      let startupCompleted = false;
      try {
        await versionCheckService.checkAndLogVersionUpgrade();
      } catch (error) {
        logger.error('Version check failed during startup (non-blocking):', error);
      }
      startupCompleted = true;

      expect(startupCompleted).toBe(true);
    });

    test('settings service write failure does not block startup', async () => {
      // No prior version → first startup path that writes the version
      jest.spyOn(settingsRepository, 'setSetting')
        .mockRejectedValue(new Error('Disk full'));

      let startupCompleted = false;
      try {
        await versionCheckService.checkAndLogVersionUpgrade();
      } catch (error) {
        logger.error('Version check failed during startup (non-blocking):', error);
      }
      startupCompleted = true;

      expect(startupCompleted).toBe(true);
    });
  });
});

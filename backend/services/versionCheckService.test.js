/**
 * Unit Tests for versionCheckService
 * 
 * Tests error handling for malformed versions, settings failures,
 * and activity log failures.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

describe('versionCheckService - Unit Tests', () => {
  let db;
  let versionCheckService;
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
    jest.restoreAllMocks();
  });

  describe('getCurrentVersion', () => {
    it('should return the version from package.json', () => {
      const version = versionCheckService.getCurrentVersion();
      const packageJson = require('../package.json');
      expect(version).toBe(packageJson.version);
    });

    it('should return a string', () => {
      const version = versionCheckService.getCurrentVersion();
      expect(typeof version).toBe('string');
    });
  });

  describe('getLastKnownVersion', () => {
    it('should return null when no version is stored', async () => {
      const result = await versionCheckService.getLastKnownVersion();
      expect(result).toBeNull();
    });

    it('should return stored version', async () => {
      await versionCheckService.updateLastKnownVersion('1.2.3');
      const result = await versionCheckService.getLastKnownVersion();
      expect(result).toBe('1.2.3');
    });
  });

  describe('checkAndLogVersionUpgrade - error handling', () => {
    it('should handle malformed/empty version string gracefully', async () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue('');

      await expect(
        versionCheckService.checkAndLogVersionUpgrade()
      ).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing or invalid version')
      );
    });

    it('should handle null version string gracefully', async () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue(null);

      await expect(
        versionCheckService.checkAndLogVersionUpgrade()
      ).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should handle settings service read failure gracefully', async () => {
      const getSpy = jest.spyOn(settingsRepository, 'getSetting')
        .mockRejectedValue(new Error('DB connection lost'));

      await expect(
        versionCheckService.checkAndLogVersionUpgrade()
      ).resolves.toBeUndefined();

      getSpy.mockRestore();
    });

    it('should handle settings service write failure gracefully', async () => {
      const setSpy = jest.spyOn(settingsRepository, 'setSetting')
        .mockRejectedValue(new Error('DB write failed'));

      // First startup scenario - write will fail
      await expect(
        versionCheckService.checkAndLogVersionUpgrade()
      ).resolves.toBeUndefined();

      setSpy.mockRestore();
    });

    it('should handle activity log service failure gracefully', async () => {
      const logSpy = jest.spyOn(activityLogService, 'logEvent')
        .mockRejectedValue(new Error('Activity log DB error'));

      // Set up an upgrade scenario
      await versionCheckService.updateLastKnownVersion('0.0.1');
      jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue('99.99.99');

      await expect(
        versionCheckService.checkAndLogVersionUpgrade()
      ).resolves.toBeUndefined();

      logSpy.mockRestore();
    });

    it('should not log event on first startup', async () => {
      const logSpy = jest.spyOn(activityLogService, 'logEvent').mockResolvedValue();

      await versionCheckService.checkAndLogVersionUpgrade();

      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should not log event when version is unchanged', async () => {
      const logSpy = jest.spyOn(activityLogService, 'logEvent').mockResolvedValue();
      const currentVersion = versionCheckService.getCurrentVersion();

      await versionCheckService.updateLastKnownVersion(currentVersion);
      await versionCheckService.checkAndLogVersionUpgrade();

      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should log event when version changes', async () => {
      const logSpy = jest.spyOn(activityLogService, 'logEvent').mockResolvedValue();

      await versionCheckService.updateLastKnownVersion('0.0.1');
      jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue('2.0.0');

      await versionCheckService.checkAndLogVersionUpgrade();

      expect(logSpy).toHaveBeenCalledWith(
        'version_upgraded',
        'system',
        null,
        'Application upgraded from v0.0.1 to v2.0.0',
        { old_version: '0.0.1', new_version: '2.0.0' }
      );
    });

    it('should update stored version after logging upgrade', async () => {
      jest.spyOn(activityLogService, 'logEvent').mockResolvedValue();

      await versionCheckService.updateLastKnownVersion('0.0.1');
      jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue('3.0.0');

      await versionCheckService.checkAndLogVersionUpgrade();
      const stored = await versionCheckService.getLastKnownVersion();
      expect(stored).toBe('3.0.0');
    });
  });
});

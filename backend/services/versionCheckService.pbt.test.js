/**
 * Property-Based Tests for versionCheckService
 * 
 * Tests version persistence, first startup behavior, upgrade event metadata,
 * system classification, and fire-and-forget resilience.
 *
 * @invariant Version Persistence Round Trip: Storing and retrieving any semver version returns the same string. First Startup Initialization: No upgrade event is logged when no previous version exists. Same Version Idempotence: Restarting with the same version logs no event. Upgrade Event Completeness: Metadata contains old_version and new_version. System Classification: entity_type is "system" and entity_id is null. Fire-and-Forget Resilience: Errors in logging or settings do not throw.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

// Arbitrary: valid semver version string
const semverArb = fc.tuple(
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Arbitrary: two distinct semver versions
const distinctSemverPairArb = fc.tuple(semverArb, semverArb)
  .filter(([a, b]) => a !== b);

describe('versionCheckService - Property-Based Tests', () => {
  let db;
  let settingsRepository;
  let versionCheckService;

  beforeAll(async () => {
    db = await createIsolatedTestDb();
    // Override the database module to use our isolated db
    const dbModule = require('../database/db');
    const originalGetDatabase = dbModule.getDatabase;
    dbModule.getDatabase = async () => db;

    settingsRepository = require('../repositories/settingsRepository');
    versionCheckService = require('./versionCheckService');

    // Store original for cleanup
    db.__originalGetDatabase = originalGetDatabase;
  });

  afterAll(() => {
    const dbModule = require('../database/db');
    if (db.__originalGetDatabase) {
      dbModule.getDatabase = db.__originalGetDatabase;
    }
    cleanupIsolatedTestDb(db);
  });

  beforeEach(async () => {
    // Clear settings table before each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM settings', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Property 1: Version Persistence Round Trip
   * Validates: Requirements 1.1, 1.3
   * 
   * For any valid semantic version string, storing it as the last known version
   * and then retrieving it should return the same version string.
   */
  describe('Property 1: Version Persistence Round Trip', () => {
    it('should persist and retrieve any valid semver version string', async () => {
      await fc.assert(
        fc.asyncProperty(semverArb, async (version) => {
          await versionCheckService.updateLastKnownVersion(version);
          const retrieved = await versionCheckService.getLastKnownVersion();
          expect(retrieved).toBe(version);
        }),
        pbtOptions({ numRuns: 100 })
      );
    });

    it('should overwrite previous version on update', async () => {
      await fc.assert(
        fc.asyncProperty(semverArb, semverArb, async (v1, v2) => {
          await versionCheckService.updateLastKnownVersion(v1);
          await versionCheckService.updateLastKnownVersion(v2);
          const retrieved = await versionCheckService.getLastKnownVersion();
          expect(retrieved).toBe(v2);
        }),
        pbtOptions({ numRuns: 100 })
      );
    });
  });


  /**
   * Property 2: First Startup Initialization
   * Validates: Requirements 1.2, 2.4
   * 
   * For any application startup where no "last_known_version" exists in settings,
   * the version check should initialize the setting with the current version
   * and NOT log an upgrade event.
   */
  describe('Property 2: First Startup Initialization', () => {
    it('should store current version and not log event on first startup', async () => {
      const activityLogService = require('./activityLogService');
      const logSpy = jest.spyOn(activityLogService, 'logEvent').mockResolvedValue();

      await fc.assert(
        fc.asyncProperty(semverArb, async (version) => {
          // Clear settings and spy
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM settings', (err) => err ? reject(err) : resolve());
          });
          logSpy.mockClear();

          // Mock getCurrentVersion to return the generated version
          jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue(version);

          try {
            await versionCheckService.checkAndLogVersionUpgrade();

            // Should NOT have logged any event
            expect(logSpy).not.toHaveBeenCalled();

            // Should have stored the current version
            const stored = await versionCheckService.getLastKnownVersion();
            expect(stored).toBe(version);
          } finally {
            versionCheckService.getCurrentVersion.mockRestore();
          }
        }),
        pbtOptions({ numRuns: 100 })
      );

      logSpy.mockRestore();
    });
  });

  /**
   * Property 3: Same Version Idempotence
   * Validates: Requirements 2.2, 6.1, 6.3
   * 
   * For any application restart where the current version equals the stored version,
   * no upgrade event should be logged and the stored version should remain unchanged.
   */
  describe('Property 3: Same Version Idempotence', () => {
    it('should not log event and should preserve stored version when current equals stored', async () => {
      const activityLogService = require('./activityLogService');
      const logSpy = jest.spyOn(activityLogService, 'logEvent').mockResolvedValue();

      await fc.assert(
        fc.asyncProperty(semverArb, async (version) => {
          // Clear settings and spy
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM settings', (err) => err ? reject(err) : resolve());
          });
          logSpy.mockClear();

          // Store the version as last_known_version
          await versionCheckService.updateLastKnownVersion(version);

          // Mock getCurrentVersion to return the same version
          jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue(version);

          try {
            await versionCheckService.checkAndLogVersionUpgrade();

            // No upgrade event should be logged
            expect(logSpy).not.toHaveBeenCalled();

            // Stored version should remain unchanged
            const stored = await versionCheckService.getLastKnownVersion();
            expect(stored).toBe(version);
          } finally {
            versionCheckService.getCurrentVersion.mockRestore();
          }
        }),
        pbtOptions({ numRuns: 100 })
      );

      logSpy.mockRestore();
    });

    it('should be idempotent across multiple restarts with same version', async () => {
      const activityLogService = require('./activityLogService');
      const logSpy = jest.spyOn(activityLogService, 'logEvent').mockResolvedValue();

      await fc.assert(
        fc.asyncProperty(
          semverArb,
          fc.integer({ min: 2, max: 5 }),
          async (version, restartCount) => {
            // Clear settings and spy
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM settings', (err) => err ? reject(err) : resolve());
            });
            logSpy.mockClear();

            // Store the version as last_known_version
            await versionCheckService.updateLastKnownVersion(version);

            jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue(version);

            try {
              // Simulate multiple restarts
              for (let i = 0; i < restartCount; i++) {
                await versionCheckService.checkAndLogVersionUpgrade();
              }

              // No upgrade event should be logged across any restart
              expect(logSpy).not.toHaveBeenCalled();

              // Stored version should still be the same
              const stored = await versionCheckService.getLastKnownVersion();
              expect(stored).toBe(version);
            } finally {
              versionCheckService.getCurrentVersion.mockRestore();
            }
          }
        ),
        pbtOptions({ numRuns: 100 })
      );

      logSpy.mockRestore();
    });
  });

  /**
   * Property 4: Upgrade Event Metadata Completeness
   * Validates: Requirements 3.4, 3.5
   * 
   * For any version upgrade event logged to the activity log, the metadata must
   * contain both "old_version" and "new_version" fields with non-empty string values.
   */
  describe('Property 4: Upgrade Event Metadata Completeness', () => {
    it('should log event with complete metadata containing old and new versions', async () => {
      const activityLogService = require('./activityLogService');
      const logSpy = jest.spyOn(activityLogService, 'logEvent').mockResolvedValue();

      await fc.assert(
        fc.asyncProperty(distinctSemverPairArb, async ([oldVersion, newVersion]) => {
          // Clear settings and spy
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM settings', (err) => err ? reject(err) : resolve());
          });
          logSpy.mockClear();

          // Set old version in settings
          await versionCheckService.updateLastKnownVersion(oldVersion);

          // Mock getCurrentVersion to return new version
          jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue(newVersion);

          try {
            await versionCheckService.checkAndLogVersionUpgrade();

            expect(logSpy).toHaveBeenCalledTimes(1);
            const metadata = logSpy.mock.calls[0][4];
            expect(metadata).toBeDefined();
            expect(typeof metadata.old_version).toBe('string');
            expect(typeof metadata.new_version).toBe('string');
            expect(metadata.old_version.length).toBeGreaterThan(0);
            expect(metadata.new_version.length).toBeGreaterThan(0);
            expect(metadata.old_version).toBe(oldVersion);
            expect(metadata.new_version).toBe(newVersion);
          } finally {
            versionCheckService.getCurrentVersion.mockRestore();
          }
        }),
        pbtOptions({ numRuns: 100 })
      );

      logSpy.mockRestore();
    });
  });

  /**
   * Property 5: Upgrade Event System Classification
   * Validates: Requirements 3.2, 3.3
   * 
   * For any version upgrade event, the entity_type must be "system"
   * and entity_id must be null.
   */
  describe('Property 5: Upgrade Event System Classification', () => {
    it('should log event with entity_type "system" and entity_id null', async () => {
      const activityLogService = require('./activityLogService');
      const logSpy = jest.spyOn(activityLogService, 'logEvent').mockResolvedValue();

      await fc.assert(
        fc.asyncProperty(distinctSemverPairArb, async ([oldVersion, newVersion]) => {
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM settings', (err) => err ? reject(err) : resolve());
          });
          logSpy.mockClear();

          await versionCheckService.updateLastKnownVersion(oldVersion);

          jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue(newVersion);

          try {
            await versionCheckService.checkAndLogVersionUpgrade();

            expect(logSpy).toHaveBeenCalledTimes(1);
            const [eventType, entityType, entityId] = logSpy.mock.calls[0];
            expect(eventType).toBe('version_upgraded');
            expect(entityType).toBe('system');
            expect(entityId).toBeNull();
          } finally {
            versionCheckService.getCurrentVersion.mockRestore();
          }
        }),
        pbtOptions({ numRuns: 100 })
      );

      logSpy.mockRestore();
    });
  });

  /**
   * Property 6: Fire-and-Forget Resilience
   * Validates: Requirements 3.6, 3.7
   * 
   * For any version check execution, if the activity log service fails,
   * the application startup should continue without throwing errors.
   */
  describe('Property 6: Fire-and-Forget Resilience', () => {
    it('should not throw when activity log service fails', async () => {
      const activityLogService = require('./activityLogService');
      const logSpy = jest.spyOn(activityLogService, 'logEvent')
        .mockRejectedValue(new Error('Activity log failure'));

      await fc.assert(
        fc.asyncProperty(distinctSemverPairArb, async ([oldVersion, newVersion]) => {
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM settings', (err) => err ? reject(err) : resolve());
          });

          await versionCheckService.updateLastKnownVersion(oldVersion);

          jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue(newVersion);

          try {
            // Should NOT throw even though logEvent rejects
            await expect(
              versionCheckService.checkAndLogVersionUpgrade()
            ).resolves.toBeUndefined();
          } finally {
            versionCheckService.getCurrentVersion.mockRestore();
          }
        }),
        pbtOptions({ numRuns: 100 })
      );

      logSpy.mockRestore();
    });

    it('should not throw when settings service fails on read', async () => {
      const settingsRepo = require('../repositories/settingsRepository');
      const getSpy = jest.spyOn(settingsRepo, 'getSetting')
        .mockRejectedValue(new Error('Settings read failure'));

      await fc.assert(
        fc.asyncProperty(semverArb, async (version) => {
          jest.spyOn(versionCheckService, 'getCurrentVersion').mockReturnValue(version);

          try {
            await expect(
              versionCheckService.checkAndLogVersionUpgrade()
            ).resolves.toBeUndefined();
          } finally {
            versionCheckService.getCurrentVersion.mockRestore();
          }
        }),
        pbtOptions({ numRuns: 100 })
      );

      getSpy.mockRestore();
    });
  });
});

/**
 * @invariant Integer Storage Round-Trip: For any integer value stored in the settings table, retrieving it returns the same integer value (not a string or other type). Randomization covers diverse integer values to ensure type preservation across the storage layer.
 */

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const settingsService = require('./settingsService');
const { getDatabase } = require('../database/db');

/**
 * Property 9: Integer Storage and Retrieval
 * Feature: activity-log-retention-config, Property 9: Integer storage and retrieval
 * Validates: Requirements 1.4
 * 
 * For any integer value stored in the settings table, retrieving it should 
 * return the same integer value (not a string or other type).
 */
describe('settingsService - Property 9: Integer Storage and Retrieval', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
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

  it('should store and retrieve integers (not strings) (100 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 7, max: 365 }),
        fc.integer({ min: 100, max: 10000 }),
        async (maxAgeDays, maxCount) => {
          // Store settings
          await settingsService.updateRetentionSettings(maxAgeDays, maxCount);

          // Retrieve settings
          const retrieved = await settingsService.getRetentionSettings();

          // Assert values are integers, not strings
          expect(typeof retrieved.maxAgeDays).toBe('number');
          expect(typeof retrieved.maxCount).toBe('number');
          expect(Number.isInteger(retrieved.maxAgeDays)).toBe(true);
          expect(Number.isInteger(retrieved.maxCount)).toBe(true);

          // Assert values match exactly
          expect(retrieved.maxAgeDays).toBe(maxAgeDays);
          expect(retrieved.maxCount).toBe(maxCount);

          // Verify they are not strings
          expect(typeof retrieved.maxAgeDays).not.toBe('string');
          expect(typeof retrieved.maxCount).not.toBe('string');
        }
      ),
      dbPbtOptions({ numRuns: 100 })
    );
  });

  it('should handle integer parsing from database strings (100 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 7, max: 365 }),
        fc.integer({ min: 100, max: 10000 }),
        async (maxAgeDays, maxCount) => {
          // Manually insert as strings (simulating database storage) using UPSERT
          await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO settings (key, value) VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
              ['activity_log_max_age_days', maxAgeDays.toString()],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO settings (key, value) VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
              ['activity_log_max_count', maxCount.toString()],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          // Retrieve via service (should parse to integers)
          const retrieved = await settingsService.getRetentionSettings();

          // Assert parsed to integers
          expect(typeof retrieved.maxAgeDays).toBe('number');
          expect(typeof retrieved.maxCount).toBe('number');
          expect(Number.isInteger(retrieved.maxAgeDays)).toBe(true);
          expect(Number.isInteger(retrieved.maxCount)).toBe(true);

          // Assert values match
          expect(retrieved.maxAgeDays).toBe(maxAgeDays);
          expect(retrieved.maxCount).toBe(maxCount);
        }
      ),
      dbPbtOptions({ numRuns: 100 })
    );
  });

  it('should preserve integer precision across storage (50 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 7, max: 365 }),
        fc.integer({ min: 100, max: 10000 }),
        async (maxAgeDays, maxCount) => {
          // Store
          await settingsService.updateRetentionSettings(maxAgeDays, maxCount);

          // Retrieve multiple times
          const retrieved1 = await settingsService.getRetentionSettings();
          const retrieved2 = await settingsService.getRetentionSettings();
          const retrieved3 = await settingsService.getRetentionSettings();

          // All retrievals should return identical integers
          expect(retrieved1.maxAgeDays).toBe(maxAgeDays);
          expect(retrieved2.maxAgeDays).toBe(maxAgeDays);
          expect(retrieved3.maxAgeDays).toBe(maxAgeDays);
          expect(retrieved1.maxCount).toBe(maxCount);
          expect(retrieved2.maxCount).toBe(maxCount);
          expect(retrieved3.maxCount).toBe(maxCount);

          // All should be integers
          expect(Number.isInteger(retrieved1.maxAgeDays)).toBe(true);
          expect(Number.isInteger(retrieved2.maxAgeDays)).toBe(true);
          expect(Number.isInteger(retrieved3.maxAgeDays)).toBe(true);
          expect(Number.isInteger(retrieved1.maxCount)).toBe(true);
          expect(Number.isInteger(retrieved2.maxCount)).toBe(true);
          expect(Number.isInteger(retrieved3.maxCount)).toBe(true);
        }
      ),
      dbPbtOptions({ numRuns: 50 })
    );
  });

  it('should handle boundary values as integers (not floats)', async () => {
    const testCases = [
      { maxAgeDays: 7, maxCount: 100 },
      { maxAgeDays: 365, maxCount: 10000 },
      { maxAgeDays: 7, maxCount: 10000 },
      { maxAgeDays: 365, maxCount: 100 }
    ];

    for (const testCase of testCases) {
      // Clear before each test case
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM settings', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Store
      await settingsService.updateRetentionSettings(
        testCase.maxAgeDays,
        testCase.maxCount
      );

      // Retrieve
      const retrieved = await settingsService.getRetentionSettings();

      // Assert integers
      expect(Number.isInteger(retrieved.maxAgeDays)).toBe(true);
      expect(Number.isInteger(retrieved.maxCount)).toBe(true);
      expect(retrieved.maxAgeDays).toBe(testCase.maxAgeDays);
      expect(retrieved.maxCount).toBe(testCase.maxCount);

      // Verify not floats
      expect(retrieved.maxAgeDays % 1).toBe(0);
      expect(retrieved.maxCount % 1).toBe(0);
    }
  });

  it('should reject non-integer values during storage', async () => {
    // Test float values
    await expect(
      settingsService.updateRetentionSettings(90.5, 1000)
    ).rejects.toThrow('maxAgeDays must be an integer');

    await expect(
      settingsService.updateRetentionSettings(90, 1000.5)
    ).rejects.toThrow('maxCount must be an integer');

    // Test string values
    await expect(
      settingsService.updateRetentionSettings('90', 1000)
    ).rejects.toThrow('maxAgeDays must be a number');

    await expect(
      settingsService.updateRetentionSettings(90, '1000')
    ).rejects.toThrow('maxCount must be a number');
  });
});

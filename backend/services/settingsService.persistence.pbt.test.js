const fc = require('fast-check');
const settingsService = require('./settingsService');
const { getDatabase } = require('../database/db');

/**
 * Property 1: Settings Persistence Round-Trip
 * Feature: activity-log-retention-config, Property 1: Settings persistence round-trip
 * Validates: Requirements 1.5, 2.7
 * 
 * For any valid retention settings (maxAgeDays in 7-365, maxCount in 100-10000),
 * updating the settings and then retrieving them should return the same values.
 */
describe('settingsService - Property 1: Settings Persistence Round-Trip', () => {
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

  it('should persist and retrieve settings with exact values (100 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid maxAgeDays (7-365)
        fc.integer({ min: 7, max: 365 }),
        // Generate valid maxCount (100-10000)
        fc.integer({ min: 100, max: 10000 }),
        async (maxAgeDays, maxCount) => {
          // Update settings
          const updated = await settingsService.updateRetentionSettings(maxAgeDays, maxCount);

          // Verify update returns correct values
          expect(updated).toEqual({ maxAgeDays, maxCount });

          // Retrieve settings
          const retrieved = await settingsService.getRetentionSettings();

          // Assert retrieved values match updated values exactly
          expect(retrieved.maxAgeDays).toBe(maxAgeDays);
          expect(retrieved.maxCount).toBe(maxCount);
          expect(retrieved).toEqual({ maxAgeDays, maxCount });

          // Verify values are integers, not strings
          expect(typeof retrieved.maxAgeDays).toBe('number');
          expect(typeof retrieved.maxCount).toBe('number');
          expect(Number.isInteger(retrieved.maxAgeDays)).toBe(true);
          expect(Number.isInteger(retrieved.maxCount)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle multiple updates correctly (50 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate array of valid settings
        fc.array(
          fc.record({
            maxAgeDays: fc.integer({ min: 7, max: 365 }),
            maxCount: fc.integer({ min: 100, max: 10000 })
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (settingsArray) => {
          // Apply each setting in sequence
          for (const settings of settingsArray) {
            await settingsService.updateRetentionSettings(
              settings.maxAgeDays,
              settings.maxCount
            );
          }

          // Retrieve final settings
          const retrieved = await settingsService.getRetentionSettings();

          // Should match the last settings in the array
          const lastSettings = settingsArray[settingsArray.length - 1];
          expect(retrieved).toEqual({
            maxAgeDays: lastSettings.maxAgeDays,
            maxCount: lastSettings.maxCount
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should preserve boundary values correctly (100 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate boundary values or random values
        fc.oneof(
          fc.constantFrom(7, 365), // maxAgeDays boundaries
          fc.integer({ min: 7, max: 365 })
        ),
        fc.oneof(
          fc.constantFrom(100, 10000), // maxCount boundaries
          fc.integer({ min: 100, max: 10000 })
        ),
        async (maxAgeDays, maxCount) => {
          // Update with boundary or random values
          await settingsService.updateRetentionSettings(maxAgeDays, maxCount);

          // Retrieve settings
          const retrieved = await settingsService.getRetentionSettings();

          // Assert exact match
          expect(retrieved.maxAgeDays).toBe(maxAgeDays);
          expect(retrieved.maxCount).toBe(maxCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});

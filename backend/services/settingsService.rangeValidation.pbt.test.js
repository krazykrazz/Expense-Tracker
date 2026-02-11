const fc = require('fast-check');
const settingsService = require('./settingsService');

/**
 * Property 2: Range Validation for Max Age Days
 * Feature: activity-log-retention-config, Property 2: Range validation for max age days
 * Validates: Requirements 2.4, 7.1, 7.2
 * 
 * For any integer value, when updating maxAgeDays, values in the range [7, 365] 
 * should be accepted and values outside this range should be rejected with a 400 error.
 */
describe('settingsService - Property 2: Range Validation for Max Age Days', () => {
  it('should accept all values in valid range [7, 365] (100 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 7, max: 365 }),
        fc.integer({ min: 100, max: 10000 }), // Valid maxCount
        async (maxAgeDays, maxCount) => {
          // Should not throw for valid values
          expect(() => {
            settingsService.validateRetentionSettings(maxAgeDays, maxCount);
          }).not.toThrow();

          // Should also work with updateRetentionSettings
          const result = await settingsService.updateRetentionSettings(maxAgeDays, maxCount);
          expect(result.maxAgeDays).toBe(maxAgeDays);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject values below minimum (7) (50 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ max: 6 }), // Below minimum
        fc.integer({ min: 100, max: 10000 }), // Valid maxCount
        async (maxAgeDays, maxCount) => {
          // Should throw error
          await expect(
            settingsService.updateRetentionSettings(maxAgeDays, maxCount)
          ).rejects.toThrow('maxAgeDays must be between 7 and 365');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject values above maximum (365) (50 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 366 }), // Above maximum
        fc.integer({ min: 100, max: 10000 }), // Valid maxCount
        async (maxAgeDays, maxCount) => {
          // Should throw error
          await expect(
            settingsService.updateRetentionSettings(maxAgeDays, maxCount)
          ).rejects.toThrow('maxAgeDays must be between 7 and 365');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should accept boundary values (7 and 365)', async () => {
    // Test minimum boundary
    await expect(
      settingsService.updateRetentionSettings(7, 1000)
    ).resolves.toEqual({ maxAgeDays: 7, maxCount: 1000 });

    // Test maximum boundary
    await expect(
      settingsService.updateRetentionSettings(365, 1000)
    ).resolves.toEqual({ maxAgeDays: 365, maxCount: 1000 });
  });

  it('should reject values just outside boundaries', async () => {
    // Test below minimum
    await expect(
      settingsService.updateRetentionSettings(6, 1000)
    ).rejects.toThrow('maxAgeDays must be between 7 and 365');

    // Test above maximum
    await expect(
      settingsService.updateRetentionSettings(366, 1000)
    ).rejects.toThrow('maxAgeDays must be between 7 and 365');
  });
});

/**
 * Property 3: Range Validation for Max Count
 * Feature: activity-log-retention-config, Property 3: Range validation for max count
 * Validates: Requirements 2.5, 7.3, 7.4
 * 
 * For any integer value, when updating maxCount, values in the range [100, 10000] 
 * should be accepted and values outside this range should be rejected with a 400 error.
 */
describe('settingsService - Property 3: Range Validation for Max Count', () => {
  it('should accept all values in valid range [100, 10000] (100 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 7, max: 365 }), // Valid maxAgeDays
        fc.integer({ min: 100, max: 10000 }),
        async (maxAgeDays, maxCount) => {
          // Should not throw for valid values
          expect(() => {
            settingsService.validateRetentionSettings(maxAgeDays, maxCount);
          }).not.toThrow();

          // Should also work with updateRetentionSettings
          const result = await settingsService.updateRetentionSettings(maxAgeDays, maxCount);
          expect(result.maxCount).toBe(maxCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject values below minimum (100) (50 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 7, max: 365 }), // Valid maxAgeDays
        fc.integer({ max: 99 }), // Below minimum
        async (maxAgeDays, maxCount) => {
          // Should throw error
          await expect(
            settingsService.updateRetentionSettings(maxAgeDays, maxCount)
          ).rejects.toThrow('maxCount must be between 100 and 10000');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject values above maximum (10000) (50 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 7, max: 365 }), // Valid maxAgeDays
        fc.integer({ min: 10001 }), // Above maximum
        async (maxAgeDays, maxCount) => {
          // Should throw error
          await expect(
            settingsService.updateRetentionSettings(maxAgeDays, maxCount)
          ).rejects.toThrow('maxCount must be between 100 and 10000');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should accept boundary values (100 and 10000)', async () => {
    // Test minimum boundary
    await expect(
      settingsService.updateRetentionSettings(90, 100)
    ).resolves.toEqual({ maxAgeDays: 90, maxCount: 100 });

    // Test maximum boundary
    await expect(
      settingsService.updateRetentionSettings(90, 10000)
    ).resolves.toEqual({ maxAgeDays: 90, maxCount: 10000 });
  });

  it('should reject values just outside boundaries', async () => {
    // Test below minimum
    await expect(
      settingsService.updateRetentionSettings(90, 99)
    ).rejects.toThrow('maxCount must be between 100 and 10000');

    // Test above maximum
    await expect(
      settingsService.updateRetentionSettings(90, 10001)
    ).rejects.toThrow('maxCount must be between 100 and 10000');
  });
});

/**
 * Combined Range Validation Tests
 * Tests both parameters together with various combinations
 */
describe('settingsService - Combined Range Validation', () => {
  it('should validate both parameters independently (100 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer(), // Any integer for maxAgeDays
        fc.integer(), // Any integer for maxCount
        async (maxAgeDays, maxCount) => {
          const isMaxAgeDaysValid = maxAgeDays >= 7 && maxAgeDays <= 365;
          const isMaxCountValid = maxCount >= 100 && maxCount <= 10000;

          if (isMaxAgeDaysValid && isMaxCountValid) {
            // Both valid - should succeed
            await expect(
              settingsService.updateRetentionSettings(maxAgeDays, maxCount)
            ).resolves.toEqual({ maxAgeDays, maxCount });
          } else {
            // At least one invalid - should fail
            await expect(
              settingsService.updateRetentionSettings(maxAgeDays, maxCount)
            ).rejects.toThrow();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should provide specific error messages for each parameter (50 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer(),
        fc.integer(),
        async (maxAgeDays, maxCount) => {
          const isMaxAgeDaysValid = maxAgeDays >= 7 && maxAgeDays <= 365;
          const isMaxCountValid = maxCount >= 100 && maxCount <= 10000;

          if (!isMaxAgeDaysValid && isMaxCountValid) {
            // Only maxAgeDays invalid
            await expect(
              settingsService.updateRetentionSettings(maxAgeDays, maxCount)
            ).rejects.toThrow(/maxAgeDays/);
          } else if (isMaxAgeDaysValid && !isMaxCountValid) {
            // Only maxCount invalid
            await expect(
              settingsService.updateRetentionSettings(maxAgeDays, maxCount)
            ).rejects.toThrow(/maxCount/);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

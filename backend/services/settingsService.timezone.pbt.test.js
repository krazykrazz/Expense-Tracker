/**
 * @invariant Timezone Setting Round-Trip with Validation: For any string value,
 * setting it as the `business_timezone` SHALL succeed if and only if it is a valid
 * IANA timezone identifier (as determined by `Intl.DateTimeFormat`). For any valid
 * timezone that is successfully saved, reading it back SHALL return the same string.
 *
 * Feature: utc-timezone-cleanup, Property 8: Timezone setting round-trip with validation
 * Validates: Requirements 3.1, 3.3
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

jest.mock('../repositories/settingsRepository');
const settingsRepository = require('../repositories/settingsRepository');
const settingsService = require('./settingsService');

/**
 * Helper: check if a string is a valid IANA timezone using Intl.DateTimeFormat
 */
function isValidIANATimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const VALID_TIMEZONES = [
  'America/Toronto',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Tokyo',
  'Pacific/Auckland',
  'Etc/UTC',
  'America/New_York',
  'Europe/Paris',
];

const INVALID_TIMEZONES = [
  '',
  'not-a-timezone',
  'America',
  'UTC+5',
  '123',
  'America/Fake',
];

describe('settingsService - Property 8: Timezone setting round-trip with validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: getSetting returns null (no stored value)
    settingsRepository.getSetting.mockResolvedValue(null);
    settingsRepository.setSetting.mockResolvedValue();
  });

  describe('Validation gate: arbitrary strings', () => {
    it('should accept a timezone if and only if Intl.DateTimeFormat accepts it', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (tz) => {
            const shouldBeValid = isValidIANATimezone(tz);

            if (shouldBeValid) {
              // Valid timezone: updateBusinessTimezone should succeed
              settingsRepository.setSetting.mockResolvedValue();
              await expect(settingsService.updateBusinessTimezone(tz)).resolves.toBe(tz);
            } else {
              // Invalid timezone: updateBusinessTimezone should throw
              await expect(settingsService.updateBusinessTimezone(tz)).rejects.toThrow(
                'Invalid IANA timezone identifier'
              );
            }
          }
        ),
        pbtOptions()
      );
    });
  });

  describe('Round-trip: valid timezones are stored and retrieved unchanged', () => {
    it('should return the same timezone after save and read (sampled valid timezones)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...VALID_TIMEZONES),
          async (tz) => {
            // Simulate save then read
            settingsRepository.setSetting.mockResolvedValue();
            settingsRepository.getSetting.mockResolvedValue(tz);

            const saved = await settingsService.updateBusinessTimezone(tz);
            const retrieved = await settingsService.getBusinessTimezone();

            expect(saved).toBe(tz);
            expect(retrieved).toBe(tz);
          }
        ),
        pbtOptions()
      );
    });
  });

  describe('Rejection: known invalid timezone strings', () => {
    it('should reject all known invalid timezone strings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...INVALID_TIMEZONES),
          async (tz) => {
            await expect(settingsService.updateBusinessTimezone(tz)).rejects.toThrow(
              'Invalid IANA timezone identifier'
            );
            // setSetting should never be called for invalid timezones
            expect(settingsRepository.setSetting).not.toHaveBeenCalled();
          }
        ),
        pbtOptions()
      );
    });
  });

  describe('Default fallback', () => {
    it('should return America/Toronto when no timezone is stored', async () => {
      settingsRepository.getSetting.mockResolvedValue(null);
      const result = await settingsService.getBusinessTimezone();
      expect(result).toBe('America/Toronto');
    });
  });
});

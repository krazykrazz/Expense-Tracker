const settingsService = require('./settingsService');
const settingsRepository = require('../repositories/settingsRepository');

// Mock the repository
jest.mock('../repositories/settingsRepository');

describe('settingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRetentionSettings', () => {
    it('should return stored values when they exist', async () => {
      settingsRepository.getMultiple.mockResolvedValue({
        'activity_log_max_age_days': '60',
        'activity_log_max_count': '500'
      });

      const result = await settingsService.getRetentionSettings();

      expect(result).toEqual({
        maxAgeDays: 60,
        maxCount: 500
      });
      expect(settingsRepository.getMultiple).toHaveBeenCalledWith([
        'activity_log_max_age_days',
        'activity_log_max_count'
      ]);
    });

    it('should return defaults when no settings exist', async () => {
      settingsRepository.getMultiple.mockResolvedValue({});

      const result = await settingsService.getRetentionSettings();

      expect(result).toEqual({
        maxAgeDays: 90,
        maxCount: 1000
      });
    });

    it('should return defaults when only one setting exists', async () => {
      settingsRepository.getMultiple.mockResolvedValue({
        'activity_log_max_age_days': '60'
      });

      const result = await settingsService.getRetentionSettings();

      expect(result).toEqual({
        maxAgeDays: 60,
        maxCount: 1000
      });
    });

    it('should parse stored string values to integers', async () => {
      settingsRepository.getMultiple.mockResolvedValue({
        'activity_log_max_age_days': '180',
        'activity_log_max_count': '2000'
      });

      const result = await settingsService.getRetentionSettings();

      expect(typeof result.maxAgeDays).toBe('number');
      expect(typeof result.maxCount).toBe('number');
      expect(result.maxAgeDays).toBe(180);
      expect(result.maxCount).toBe(2000);
    });

    it('should return defaults when parsing fails', async () => {
      settingsRepository.getMultiple.mockResolvedValue({
        'activity_log_max_age_days': 'invalid',
        'activity_log_max_count': 'not-a-number'
      });

      const result = await settingsService.getRetentionSettings();

      expect(result).toEqual({
        maxAgeDays: 90,
        maxCount: 1000
      });
    });

    it('should return defaults when repository throws error', async () => {
      settingsRepository.getMultiple.mockRejectedValue(new Error('Database error'));

      const result = await settingsService.getRetentionSettings();

      expect(result).toEqual({
        maxAgeDays: 90,
        maxCount: 1000
      });
    });
  });

  describe('updateRetentionSettings', () => {
    it('should validate and persist valid values', async () => {
      settingsRepository.setSetting.mockResolvedValue();

      const result = await settingsService.updateRetentionSettings(120, 1500);

      expect(result).toEqual({
        maxAgeDays: 120,
        maxCount: 1500
      });
      expect(settingsRepository.setSetting).toHaveBeenCalledWith(
        'activity_log_max_age_days',
        '120'
      );
      expect(settingsRepository.setSetting).toHaveBeenCalledWith(
        'activity_log_max_count',
        '1500'
      );
    });

    it('should accept minimum valid values', async () => {
      settingsRepository.setSetting.mockResolvedValue();

      const result = await settingsService.updateRetentionSettings(7, 100);

      expect(result).toEqual({
        maxAgeDays: 7,
        maxCount: 100
      });
    });

    it('should accept maximum valid values', async () => {
      settingsRepository.setSetting.mockResolvedValue();

      const result = await settingsService.updateRetentionSettings(365, 10000);

      expect(result).toEqual({
        maxAgeDays: 365,
        maxCount: 10000
      });
    });

    it('should reject maxAgeDays below minimum', async () => {
      await expect(
        settingsService.updateRetentionSettings(6, 1000)
      ).rejects.toThrow('maxAgeDays must be between 7 and 365');

      expect(settingsRepository.setSetting).not.toHaveBeenCalled();
    });

    it('should reject maxAgeDays above maximum', async () => {
      await expect(
        settingsService.updateRetentionSettings(366, 1000)
      ).rejects.toThrow('maxAgeDays must be between 7 and 365');

      expect(settingsRepository.setSetting).not.toHaveBeenCalled();
    });

    it('should reject maxCount below minimum', async () => {
      await expect(
        settingsService.updateRetentionSettings(90, 99)
      ).rejects.toThrow('maxCount must be between 100 and 10000');

      expect(settingsRepository.setSetting).not.toHaveBeenCalled();
    });

    it('should reject maxCount above maximum', async () => {
      await expect(
        settingsService.updateRetentionSettings(90, 10001)
      ).rejects.toThrow('maxCount must be between 100 and 10000');

      expect(settingsRepository.setSetting).not.toHaveBeenCalled();
    });

    it('should reject non-integer maxAgeDays', async () => {
      await expect(
        settingsService.updateRetentionSettings(90.5, 1000)
      ).rejects.toThrow('maxAgeDays must be an integer');

      expect(settingsRepository.setSetting).not.toHaveBeenCalled();
    });

    it('should reject non-integer maxCount', async () => {
      await expect(
        settingsService.updateRetentionSettings(90, 1000.5)
      ).rejects.toThrow('maxCount must be an integer');

      expect(settingsRepository.setSetting).not.toHaveBeenCalled();
    });

    it('should reject non-numeric maxAgeDays', async () => {
      await expect(
        settingsService.updateRetentionSettings('90', 1000)
      ).rejects.toThrow('maxAgeDays must be a number');

      expect(settingsRepository.setSetting).not.toHaveBeenCalled();
    });

    it('should reject non-numeric maxCount', async () => {
      await expect(
        settingsService.updateRetentionSettings(90, '1000')
      ).rejects.toThrow('maxCount must be a number');

      expect(settingsRepository.setSetting).not.toHaveBeenCalled();
    });

    it('should reject missing maxAgeDays', async () => {
      await expect(
        settingsService.updateRetentionSettings(undefined, 1000)
      ).rejects.toThrow('maxAgeDays is required');

      expect(settingsRepository.setSetting).not.toHaveBeenCalled();
    });

    it('should reject missing maxCount', async () => {
      await expect(
        settingsService.updateRetentionSettings(90, null)
      ).rejects.toThrow('maxCount is required');

      expect(settingsRepository.setSetting).not.toHaveBeenCalled();
    });

    it('should provide descriptive error messages for validation failures', async () => {
      const testCases = [
        { maxAgeDays: 6, maxCount: 1000, expectedError: 'maxAgeDays must be between 7 and 365' },
        { maxAgeDays: 366, maxCount: 1000, expectedError: 'maxAgeDays must be between 7 and 365' },
        { maxAgeDays: 90, maxCount: 99, expectedError: 'maxCount must be between 100 and 10000' },
        { maxAgeDays: 90, maxCount: 10001, expectedError: 'maxCount must be between 100 and 10000' }
      ];

      for (const testCase of testCases) {
        await expect(
          settingsService.updateRetentionSettings(testCase.maxAgeDays, testCase.maxCount)
        ).rejects.toThrow(testCase.expectedError);
      }
    });

    it('should throw error when repository fails', async () => {
      settingsRepository.setSetting.mockRejectedValue(new Error('Database error'));

      await expect(
        settingsService.updateRetentionSettings(90, 1000)
      ).rejects.toThrow('Failed to update retention settings');
    });
  });

  describe('getLastKnownVersion', () => {
    it('should return null when no version is stored', async () => {
      settingsRepository.getSetting.mockResolvedValue(null);

      const result = await settingsService.getLastKnownVersion();

      expect(result).toBeNull();
      expect(settingsRepository.getSetting).toHaveBeenCalledWith('last_known_version');
    });

    it('should return stored version string', async () => {
      settingsRepository.getSetting.mockResolvedValue('5.10.0');

      const result = await settingsService.getLastKnownVersion();

      expect(result).toBe('5.10.0');
    });

    it('should return null when repository throws error', async () => {
      settingsRepository.getSetting.mockRejectedValue(new Error('Database error'));

      const result = await settingsService.getLastKnownVersion();

      expect(result).toBeNull();
    });

    it('should return null for empty string value', async () => {
      settingsRepository.getSetting.mockResolvedValue('');

      const result = await settingsService.getLastKnownVersion();

      expect(result).toBeNull();
    });
  });

  describe('setLastKnownVersion', () => {
    it('should persist version string via repository', async () => {
      settingsRepository.setSetting.mockResolvedValue();

      await settingsService.setLastKnownVersion('5.11.0');

      expect(settingsRepository.setSetting).toHaveBeenCalledWith('last_known_version', '5.11.0');
    });

    it('should propagate repository errors', async () => {
      settingsRepository.setSetting.mockRejectedValue(new Error('Database error'));

      await expect(settingsService.setLastKnownVersion('5.11.0')).rejects.toThrow('Database error');
    });
  });

  describe('validateRetentionSettings', () => {
    it('should not throw for valid settings', () => {
      expect(() => {
        settingsService.validateRetentionSettings(90, 1000);
      }).not.toThrow();
    });

    it('should throw for invalid maxAgeDays', () => {
      expect(() => {
        settingsService.validateRetentionSettings(5, 1000);
      }).toThrow('maxAgeDays must be between 7 and 365');
    });

    it('should throw for invalid maxCount', () => {
      expect(() => {
        settingsService.validateRetentionSettings(90, 50);
      }).toThrow('maxCount must be between 100 and 10000');
    });
  });
});

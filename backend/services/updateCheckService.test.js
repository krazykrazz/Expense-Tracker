/**
 * Unit Tests for updateCheckService
 * 
 * Tests getGitHubRepo, cache duration configuration, and clearCache behavior.
 */

describe('updateCheckService - Unit Tests', () => {
  let updateCheckService;

  beforeAll(() => {
    updateCheckService = require('./updateCheckService');
  });

  afterEach(() => {
    updateCheckService.clearCache();
    jest.restoreAllMocks();
    delete process.env.GITHUB_REPO;
    delete process.env.UPDATE_CHECK_INTERVAL_SECONDS;
  });

  describe('getGitHubRepo', () => {
    it('should return GITHUB_REPO env var when set', () => {
      process.env.GITHUB_REPO = 'myorg/myrepo';
      expect(updateCheckService.getGitHubRepo()).toBe('myorg/myrepo');
    });

    it('should return default fallback when GITHUB_REPO is not set', () => {
      delete process.env.GITHUB_REPO;
      expect(updateCheckService.getGitHubRepo()).toBe('krazykrazz/expense-tracker');
    });
  });

  describe('isNewerVersion', () => {
    it('should return true when latest major is greater', () => {
      expect(updateCheckService.isNewerVersion('1.0.0', '2.0.0')).toBe(true);
    });

    it('should return true when latest minor is greater', () => {
      expect(updateCheckService.isNewerVersion('1.0.0', '1.1.0')).toBe(true);
    });

    it('should return true when latest patch is greater', () => {
      expect(updateCheckService.isNewerVersion('1.0.0', '1.0.1')).toBe(true);
    });

    it('should return false when versions are equal', () => {
      expect(updateCheckService.isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    });

    it('should return false when current is newer', () => {
      expect(updateCheckService.isNewerVersion('2.0.0', '1.0.0')).toBe(false);
    });

    it('should handle higher minor with lower patch', () => {
      expect(updateCheckService.isNewerVersion('1.2.9', '1.3.0')).toBe(true);
    });

    it('should handle higher major overriding lower minor/patch', () => {
      expect(updateCheckService.isNewerVersion('1.99.99', '2.0.0')).toBe(true);
    });
  });

  describe('cache duration', () => {
    it('should use default cache duration of 86400 seconds when env var is not set', async () => {
      delete process.env.UPDATE_CHECK_INTERVAL_SECONDS;
      jest.spyOn(updateCheckService, 'fetchLatestRelease').mockResolvedValue('1.0.0');

      await updateCheckService.checkForUpdate();

      // Call again immediately - should use cache (not call fetch again)
      await updateCheckService.checkForUpdate();
      expect(updateCheckService.fetchLatestRelease).toHaveBeenCalledTimes(1);
    });

    it('should use configurable cache duration via UPDATE_CHECK_INTERVAL_SECONDS', async () => {
      process.env.UPDATE_CHECK_INTERVAL_SECONDS = '1';
      jest.spyOn(updateCheckService, 'fetchLatestRelease').mockResolvedValue('1.0.0');

      await updateCheckService.checkForUpdate();

      // Wait for cache to expire (1 second + buffer)
      await new Promise(resolve => setTimeout(resolve, 1100));

      await updateCheckService.checkForUpdate();
      expect(updateCheckService.fetchLatestRelease).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearCache', () => {
    it('should reset cache so next call triggers a fresh fetch', async () => {
      jest.spyOn(updateCheckService, 'fetchLatestRelease').mockResolvedValue('1.0.0');

      await updateCheckService.checkForUpdate();
      expect(updateCheckService.fetchLatestRelease).toHaveBeenCalledTimes(1);

      updateCheckService.clearCache();

      await updateCheckService.checkForUpdate();
      expect(updateCheckService.fetchLatestRelease).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkForUpdate', () => {
    it('should return correct structure when update is available', async () => {
      jest.spyOn(updateCheckService, 'fetchLatestRelease').mockResolvedValue('99.0.0');

      const result = await updateCheckService.checkForUpdate();

      expect(result).toEqual({
        updateAvailable: true,
        currentVersion: expect.any(String),
        latestVersion: '99.0.0',
        checkedAt: expect.any(String)
      });
      expect(result.error).toBeUndefined();
    });

    it('should return correct structure when no update available', async () => {
      jest.spyOn(updateCheckService, 'fetchLatestRelease').mockResolvedValue('0.0.1');

      const result = await updateCheckService.checkForUpdate();

      expect(result).toEqual({
        updateAvailable: false,
        currentVersion: expect.any(String),
        latestVersion: '0.0.1',
        checkedAt: expect.any(String)
      });
      expect(result.error).toBeUndefined();
    });

    it('should return error when fetch returns null', async () => {
      jest.spyOn(updateCheckService, 'fetchLatestRelease').mockResolvedValue(null);

      const result = await updateCheckService.checkForUpdate();

      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should return error when fetch throws', async () => {
      jest.spyOn(updateCheckService, 'fetchLatestRelease')
        .mockRejectedValue(new Error('Network failure'));

      const result = await updateCheckService.checkForUpdate();

      expect(result.updateAvailable).toBe(false);
      expect(result.error).toBe('Network failure');
    });
  });
});

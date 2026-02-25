/**
 * Property-Based Tests for updateCheckService
 * 
 * Tests version comparison correctness, graceful degradation on API errors,
 * cache behavior within TTL, and cache expiry.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// Arbitrary: valid semver version string
const semverArb = fc.tuple(
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// Arbitrary: two semver versions as tuples for comparison
const semverTupleArb = fc.tuple(
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 })
);

describe('updateCheckService - Property-Based Tests', () => {
  let updateCheckService;

  beforeAll(() => {
    updateCheckService = require('./updateCheckService');
  });

  afterEach(() => {
    updateCheckService.clearCache();
    jest.restoreAllMocks();
  });

  /**
   * Property 9: Version Comparison Correctness
   * Validates: Requirements 8.2, 8.3, 8.4
   * 
   * For any two valid semantic version strings (current and latest),
   * the isNewerVersion function should return true if and only if the latest
   * version is strictly greater than the current version when compared
   * component-by-component (major, then minor, then patch).
   */
  describe('Property 9: Version Comparison Correctness', () => {
    it('should return true iff latest > current (component-by-component)', () => {
      fc.assert(
        fc.property(semverTupleArb, semverTupleArb, (currentTuple, latestTuple) => {
          const [cMaj, cMin, cPat] = currentTuple;
          const [lMaj, lMin, lPat] = latestTuple;
          const current = `${cMaj}.${cMin}.${cPat}`;
          const latest = `${lMaj}.${lMin}.${lPat}`;

          const result = updateCheckService.isNewerVersion(current, latest);

          // Compute expected: latest is strictly greater
          let expected;
          if (lMaj !== cMaj) {
            expected = lMaj > cMaj;
          } else if (lMin !== cMin) {
            expected = lMin > cMin;
          } else {
            expected = lPat > cPat;
          }

          expect(result).toBe(expected);
        }),
        pbtOptions({ numRuns: 100 })
      );
    });

    it('should return false when versions are equal', () => {
      fc.assert(
        fc.property(semverArb, (version) => {
          expect(updateCheckService.isNewerVersion(version, version)).toBe(false);
        }),
        pbtOptions({ numRuns: 100 })
      );
    });

    it('should be asymmetric: isNewerVersion(a,b) and isNewerVersion(b,a) cannot both be true', () => {
      fc.assert(
        fc.property(semverArb, semverArb, (a, b) => {
          const ab = updateCheckService.isNewerVersion(a, b);
          const ba = updateCheckService.isNewerVersion(b, a);
          // At most one can be true
          expect(ab && ba).toBe(false);
        }),
        pbtOptions({ numRuns: 100 })
      );
    });
  });

  /**
   * Property 10: Graceful Degradation on GitHub API Error
   * Validates: Requirements 8.6
   * 
   * For any error condition when fetching from the GitHub Releases API
   * (network timeout, HTTP error, malformed response), the check-update
   * should return updateAvailable: false with an error indicator,
   * and should not throw or fail the request.
   */
  describe('Property 10: Graceful Degradation on GitHub API Error', () => {
    it('should return updateAvailable: false for any fetch error', async () => {
      const errorTypes = fc.oneof(
        fc.constant(new Error('Network error')),
        fc.constant(new TypeError('fetch failed')),
        fc.constant((() => { const e = new Error('Aborted'); e.name = 'AbortError'; return e; })()),
        fc.constant(new Error('ECONNREFUSED')),
        fc.constant(new Error('ETIMEDOUT'))
      );

      await fc.assert(
        fc.asyncProperty(errorTypes, async (error) => {
          updateCheckService.clearCache();
          jest.spyOn(updateCheckService, 'fetchLatestRelease').mockRejectedValue(error);

          const result = await updateCheckService.checkForUpdate();

          expect(result.updateAvailable).toBe(false);
          expect(result.currentVersion).toBeDefined();
          expect(result.checkedAt).toBeDefined();
          expect(result.error).toBeDefined();

          updateCheckService.fetchLatestRelease.mockRestore();
        }),
        pbtOptions({ numRuns: 100 })
      );
    });

    it('should return updateAvailable: false when fetchLatestRelease returns null', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          updateCheckService.clearCache();
          jest.spyOn(updateCheckService, 'fetchLatestRelease').mockResolvedValue(null);

          const result = await updateCheckService.checkForUpdate();

          expect(result.updateAvailable).toBe(false);
          expect(result.error).toBeDefined();

          updateCheckService.fetchLatestRelease.mockRestore();
        }),
        pbtOptions({ numRuns: 100 })
      );
    });
  });

  /**
   * Property 11: Cache Prevents Redundant Fetches Within TTL
   * Validates: Requirements 9.1, 9.4
   * 
   * For any sequence of check-update calls made within the configured cache TTL,
   * only the first call should trigger a GitHub API request; all subsequent calls
   * should return the cached result.
   */
  describe('Property 11: Cache Prevents Redundant Fetches Within TTL', () => {
    it('should call fetchLatestRelease only once for multiple calls within TTL', async () => {
      const callCountArb = fc.integer({ min: 2, max: 10 });

      await fc.assert(
        fc.asyncProperty(callCountArb, semverArb, async (callCount, latestVersion) => {
          updateCheckService.clearCache();
          const fetchSpy = jest.spyOn(updateCheckService, 'fetchLatestRelease')
            .mockResolvedValue(latestVersion);

          // Make multiple calls
          const results = [];
          for (let i = 0; i < callCount; i++) {
            results.push(await updateCheckService.checkForUpdate());
          }

          // fetchLatestRelease should only be called once
          expect(fetchSpy).toHaveBeenCalledTimes(1);

          // All results should be identical
          for (let i = 1; i < results.length; i++) {
            expect(results[i]).toEqual(results[0]);
          }

          fetchSpy.mockRestore();
        }),
        pbtOptions({ numRuns: 100 })
      );
    });
  });

  /**
   * Property 12: Cache Expiry Triggers Fresh Fetch
   * Validates: Requirements 9.5
   * 
   * For any cache duration, a check-update call made after the cache TTL has
   * elapsed should trigger a new GitHub API request rather than returning
   * the stale cached result.
   */
  describe('Property 12: Cache Expiry Triggers Fresh Fetch', () => {
    it('should fetch again after cache expires', async () => {
      await fc.assert(
        fc.asyncProperty(semverArb, semverArb, async (v1, v2) => {
          updateCheckService.clearCache();

          // Set a very short cache TTL
          const originalEnv = process.env.UPDATE_CHECK_INTERVAL_SECONDS;
          process.env.UPDATE_CHECK_INTERVAL_SECONDS = '0';

          const fetchSpy = jest.spyOn(updateCheckService, 'fetchLatestRelease')
            .mockResolvedValueOnce(v1)
            .mockResolvedValueOnce(v2);

          try {
            // First call
            await updateCheckService.checkForUpdate();

            // Wait a tiny bit to ensure cache expires (TTL = 0 seconds)
            await new Promise(resolve => setTimeout(resolve, 5));

            // Second call should trigger a fresh fetch
            await updateCheckService.checkForUpdate();

            expect(fetchSpy).toHaveBeenCalledTimes(2);
          } finally {
            if (originalEnv !== undefined) {
              process.env.UPDATE_CHECK_INTERVAL_SECONDS = originalEnv;
            } else {
              delete process.env.UPDATE_CHECK_INTERVAL_SECONDS;
            }
            fetchSpy.mockRestore();
          }
        }),
        pbtOptions({ numRuns: 100 })
      );
    });
  });
});

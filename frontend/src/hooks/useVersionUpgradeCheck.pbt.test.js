/**
 * @invariant Frontend Acknowledgment Persistence: Closing the upgrade modal persists the version in localStorage and prevents re-display on subsequent loads. First-Time User Behavior: No modal is shown when no last_seen_version exists in localStorage regardless of current version.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import fc from 'fast-check';
import useVersionUpgradeCheck from './useVersionUpgradeCheck';

/**
 * Property-Based Tests for useVersionUpgradeCheck hook
 * Tests Properties 7 and 8 from the design document.
 */

// Mock the logger to suppress output in tests
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const LAST_SEEN_VERSION_KEY = 'last_seen_version';

/** Generate a valid semver string */
const semver = () =>
  fc.tuple(
    fc.integer({ min: 0, max: 99 }),
    fc.integer({ min: 0, max: 99 }),
    fc.integer({ min: 0, max: 99 })
  ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/** Generate two distinct semver strings */
const distinctSemverPair = () =>
  fc.tuple(semver(), semver()).filter(([a, b]) => a !== b);

function mockFetchVersion(version) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ version })
  });
}

describe('useVersionUpgradeCheck - Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  /**
   * Property 7: Frontend Acknowledgment Persistence
   *
   * For any version string stored in localStorage as "last_seen_version",
   * retrieving it should return the same version string, and the upgrade
   * modal should not display for that version on subsequent page loads.
   *
   * **Validates: Requirements 7.5, 7.6**
   */
  describe('Property 7: Frontend Acknowledgment Persistence', () => {
    it('closing the modal persists the version and prevents re-display', async () => {
      await fc.assert(
        fc.asyncProperty(distinctSemverPair(), async ([oldVersion, currentVersion]) => {
          localStorage.clear();
          vi.clearAllMocks();

          // Setup: user had seen oldVersion, now currentVersion is live
          localStorage.setItem(LAST_SEEN_VERSION_KEY, oldVersion);
          mockFetchVersion(currentVersion);

          const changelog = [{ version: currentVersion, date: 'Test', added: ['Test item'], changed: [], fixed: [], removed: [] }];

          // First render: modal should show (version differs)
          const { result, unmount } = renderHook(() =>
            useVersionUpgradeCheck({ changelogEntries: changelog })
          );

          await waitFor(() => {
            expect(result.current.showModal).toBe(true);
          });

          // Close the modal
          act(() => {
            result.current.handleClose();
          });

          // Verify localStorage was updated
          expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(currentVersion);
          expect(result.current.showModal).toBe(false);

          unmount();

          // Second render: modal should NOT show (version acknowledged)
          mockFetchVersion(currentVersion);
          const { result: result2, unmount: unmount2 } = renderHook(() =>
            useVersionUpgradeCheck({ changelogEntries: changelog })
          );

          await waitFor(() => {
            expect(global.fetch).toHaveBeenCalled();
          });

          expect(result2.current.showModal).toBe(false);
          unmount2();
        }),
        { numRuns: 30 }
      );
    });

    it('localStorage round-trips the version string exactly', async () => {
      await fc.assert(
        fc.asyncProperty(semver(), async (version) => {
          localStorage.clear();
          vi.clearAllMocks();

          localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
          const retrieved = localStorage.getItem(LAST_SEEN_VERSION_KEY);
          expect(retrieved).toBe(version);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 8: First-Time User Behavior
   *
   * For any user with no "last_seen_version" in localStorage, the upgrade
   * modal should NOT display regardless of the current application version.
   *
   * **Validates: Requirements 7.8**
   */
  describe('Property 8: First-Time User Behavior', () => {
    it('never shows modal when no last_seen_version exists', async () => {
      await fc.assert(
        fc.asyncProperty(semver(), async (currentVersion) => {
          localStorage.clear();
          vi.clearAllMocks();

          mockFetchVersion(currentVersion);

          const changelog = [{ version: currentVersion, date: 'Test', added: ['Feature'], changed: [], fixed: [], removed: [] }];

          const { result, unmount } = renderHook(() =>
            useVersionUpgradeCheck({ changelogEntries: changelog })
          );

          await waitFor(() => {
            expect(global.fetch).toHaveBeenCalled();
          });

          // Modal should never show for first-time users
          expect(result.current.showModal).toBe(false);

          // But the version should be stored for future visits
          expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(currentVersion);

          unmount();
        }),
        { numRuns: 50 }
      );
    });
  });
});

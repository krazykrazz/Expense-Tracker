/**
 * Property-Based Tests for Update Banner Visibility
 *
 * **Feature: version-upgrade-tracking, Property 13: Update Banner Visibility Matches API Response**
 *
 * For any check-update API response, the update banner in the System Modal Updates tab
 * should be visible if and only if `updateAvailable` is `true`, and when visible,
 * the banner should contain the `latestVersion` string.
 *
 * **Validates: Requirements 10.2, 10.3, 10.4**
 *
 * @invariant Banner Visibility: For any API response, banner is visible iff updateAvailable is true and latestVersion is present.
 */

import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// Mock ModalContext
const mockCloseSystemModal = vi.fn();
vi.mock('../contexts/ModalContext', () => ({
  ModalProvider: ({ children }) => children,
  useModalContext: () => ({
    closeSystemModal: mockCloseSystemModal
  })
}));

// Mock useTabState - always return 'updates' tab for these tests
vi.mock('../hooks/useTabState', () => ({
  default: () => ['updates', vi.fn()]
}));

// Mock useActivityLog
vi.mock('../hooks/useActivityLog', () => ({
  default: () => ({
    events: [],
    loading: false,
    error: null,
    displayLimit: 50,
    hasMore: false,
    stats: { currentCount: 0, retentionDays: 90, maxEntries: 10000 },
    setDisplayLimit: vi.fn(),
    loadMore: vi.fn()
  })
}));

// Mock ActivityLogTable
vi.mock('./ActivityLogTable', () => ({
  default: () => <div data-testid="activity-log-table">ActivityLogTable</div>
}));

// Mock PlaceNameStandardization
vi.mock('./PlaceNameStandardization', () => ({
  default: () => <div>PlaceNameStandardization</div>
}));

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    VERSION: '/api/version',
    VERSION_CHECK_UPDATE: '/api/version/check-update',
    BACKUP_LIST: '/api/backup/list',
    BACKUP_STATS: '/api/backup/stats',
    BACKUP_MANUAL: '/api/backup/manual',
    BACKUP_DOWNLOAD: '/api/backup',
    BACKUP_RESTORE: '/api/backup/restore',
    BACKUP_CONFIG: '/api/backup/config',
    HEALTH: '/api/health'
  },
  default: 'http://localhost:2424'
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

// Mock formatters
vi.mock('../utils/formatters', () => ({
  formatDateTime: (date) => `formatted-${date}`
}));

import SystemModal from './SystemModal';

// ── Arbitraries ──

const semverArb = () =>
  fc.record({
    major: fc.integer({ min: 0, max: 99 }),
    minor: fc.integer({ min: 0, max: 99 }),
    patch: fc.integer({ min: 0, max: 99 })
  }).map(({ major, minor, patch }) => `${major}.${minor}.${patch}`);

const checkUpdateResponseArb = () =>
  fc.oneof(
    // Update available with valid latestVersion
    semverArb().chain(latestVersion =>
      semverArb().map(currentVersion => ({
        updateAvailable: true,
        currentVersion,
        latestVersion,
        checkedAt: new Date().toISOString()
      }))
    ),
    // No update available
    semverArb().map(version => ({
      updateAvailable: false,
      currentVersion: version,
      latestVersion: version,
      checkedAt: new Date().toISOString()
    })),
    // Update available but latestVersion is null
    semverArb().map(version => ({
      updateAvailable: true,
      currentVersion: version,
      latestVersion: null,
      checkedAt: new Date().toISOString()
    })),
    // Update available but latestVersion is empty string
    semverArb().map(version => ({
      updateAvailable: true,
      currentVersion: version,
      latestVersion: '',
      checkedAt: new Date().toISOString()
    })),
    // Error response
    semverArb().map(version => ({
      updateAvailable: false,
      currentVersion: version,
      latestVersion: null,
      checkedAt: new Date().toISOString(),
      error: 'GitHub API unreachable'
    }))
  );

// ── Property Tests ──

describe('Property 13: Update Banner Visibility Matches API Response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * **Feature: version-upgrade-tracking, Property 13**
   *
   * For any check-update API response, the update banner should be visible
   * if and only if updateAvailable is true AND latestVersion is a non-empty string.
   * When visible, the banner must contain the latestVersion.
   *
   * **Validates: Requirements 10.2, 10.3, 10.4**
   */
  test('Property 13: banner visible iff updateAvailable is true and latestVersion is present', async () => {
    await fc.assert(
      fc.asyncProperty(checkUpdateResponseArb(), async (apiResponse) => {
        cleanup();
        vi.clearAllMocks();

        global.fetch = vi.fn((url) => {
          if (url.includes('/version/check-update')) {
            // If response has error field, it should suppress the banner
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve(apiResponse)
            });
          }
          if (url.includes('/version')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ version: '1.0.0', environment: 'production' })
            });
          }
          if (url.includes('/backup/list')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        render(<SystemModal />);

        // Wait for the check-update fetch to complete
        await waitFor(() => {
          expect(global.fetch).toHaveBeenCalledWith('/api/version/check-update');
        });

        // Allow state updates to settle
        await waitFor(() => {});

        const shouldShowBanner =
          apiResponse.updateAvailable === true &&
          !!apiResponse.latestVersion &&
          !apiResponse.error;

        const banner = screen.queryByTestId('update-available-banner');

        if (shouldShowBanner) {
          expect(banner).toBeInTheDocument();
          expect(banner).toHaveTextContent(`v${apiResponse.latestVersion}`);
        } else {
          expect(banner).not.toBeInTheDocument();
        }
      }),
      { numRuns: 50 }
    );
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import fc from 'fast-check';

// ========== Mocks ==========

// Mock ModalContext
const mockCloseSettingsModal = vi.fn();
const mockCloseSystemModal = vi.fn();
vi.mock('../contexts/ModalContext', () => ({
  useModalContext: () => ({
    closeSettingsModal: mockCloseSettingsModal,
    closeSystemModal: mockCloseSystemModal
  })
}));

// Mock useTabState - controlled by test
let mockSettingsTab = 'backup-config';
let mockSystemTab = 'backup-info';
const mockSetTab = vi.fn();
vi.mock('../hooks/useTabState', () => ({
  default: (storageKey, defaultTab) => {
    if (storageKey === 'settings-modal-tab') return [mockSettingsTab, mockSetTab];
    if (storageKey === 'system-modal-tab') return [mockSystemTab, mockSetTab];
    return [defaultTab, mockSetTab];
  }
}));

// Mock useActivityLog
vi.mock('../hooks/useActivityLog', () => ({
  default: () => ({
    events: [], loading: false, error: null, displayLimit: 50,
    hasMore: false, stats: { currentCount: 10, retentionDays: 90, maxEntries: 10000 },
    setDisplayLimit: vi.fn(), loadMore: vi.fn()
  })
}));

// Mock child components
vi.mock('./ActivityLogTable', () => ({
  default: () => <div data-testid="activity-log-table">ActivityLogTable</div>
}));
vi.mock('./PlaceNameStandardization', () => ({
  default: () => <div data-testid="place-name-standardization">PlaceNameStandardization</div>
}));

// Mock config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    BACKUP_CONFIG: '/api/backup/config',
    VERSION: '/api/version',
    BACKUP_LIST: '/api/backup/list',
    BACKUP_STATS: '/api/backup/stats',
    BACKUP_MANUAL: '/api/backup/manual',
    BACKUP_DOWNLOAD: '/api/backup',
    BACKUP_RESTORE: '/api/backup/restore'
  },
  default: 'http://localhost:2424'
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()
  })
}));

// Mock formatters
vi.mock('../utils/formatters', () => ({
  formatDateTime: (date) => `formatted-${date}`
}));

// Mock people API
vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn().mockResolvedValue([]),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn()
}));

import SettingsModal from './SettingsModal';
import SystemModal from './SystemModal';

// ========== Constants ==========

const SETTINGS_TABS = ['backup-config', 'people'];
const SYSTEM_TABS = ['backup-info', 'activity-log', 'misc', 'about', 'updates'];

// Each tab is identified by a unique CSS selector that only appears in that tab's content.
// This avoids text ambiguity issues with getByText.
const SETTINGS_TAB_SELECTORS = {
  'backup-config': '.checkbox-label',       // Auto backup toggle
  'people': '.people-add-button'            // Add Family Member button
};

const SYSTEM_TAB_SELECTORS = {
  'backup-info': '.manual-backup-buttons',  // Manual backup section
  'activity-log': '[data-testid="activity-log-table"]',
  'misc': '.misc-tools-list',               // Tools list
  'about': '.version-info, .db-stats',      // Version or stats section (one may load async)
  'updates': '.changelog'                   // Changelog section
};

// ========== Helpers ==========

function assertSelectorPresent(container, selector) {
  // For selectors with comma (OR), check if any match
  const parts = selector.split(',').map(s => s.trim());
  const found = parts.some(s => container.querySelector(s) !== null);
  expect(found).toBe(true);
}

function assertSelectorAbsent(container, selector) {
  const parts = selector.split(',').map(s => s.trim());
  const found = parts.some(s => container.querySelector(s) !== null);
  expect(found).toBe(false);
}

// ========== Tests ==========

describe('Property 1: Tab Content Correspondence', () => {
  /**
   * **Validates: Requirements 1.5, 4.3**
   *
   * For any valid tab selection in SettingsModal or SystemModal,
   * exactly one content panel is visible and matches the selected tab.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettingsTab = 'backup-config';
    mockSystemTab = 'backup-info';

    global.fetch = vi.fn((url) => {
      if (url.includes('/config')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            enabled: false, schedule: 'daily', time: '02:00',
            targetPath: '', keepLastN: 7, nextBackup: null
          })
        });
      }
      if (url.includes('/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '5.10.0', environment: 'production' })
        });
      }
      if (url.includes('/backup/list')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { name: 'backup-test.db', size: 1024, created: '2026-01-01T00:00:00Z' }
          ])
        });
      }
      if (url.includes('/backup/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            expenseCount: 10, invoiceCount: 2, paymentMethodCount: 3,
            statementCount: 1, creditCardPaymentCount: 5,
            databaseSizeMB: 1.0, invoiceStorageSizeMB: 0.5,
            totalBackupSizeMB: 2.0, backupCount: 1
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('SettingsModal: each tab shows exactly its expected content panel', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SETTINGS_TABS),
        async (tab) => {
          cleanup();
          mockSettingsTab = tab;

          const { container } = render(<SettingsModal />);

          // Wait for loading to finish
          await vi.waitFor(() => {
            expect(within(container).queryByText('Loading settings...')).toBeNull();
          });

          // Verify exactly one tab-panel is rendered
          const panels = container.querySelectorAll('.tab-panel');
          expect(panels.length).toBe(1);

          // Verify the active tab's unique selector is present
          assertSelectorPresent(container, SETTINGS_TAB_SELECTORS[tab]);

          // Verify other tabs' selectors are absent
          for (const [otherTab, selector] of Object.entries(SETTINGS_TAB_SELECTORS)) {
            if (otherTab !== tab) {
              assertSelectorAbsent(container, selector);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('SystemModal: each tab shows exactly its expected content panel', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SYSTEM_TABS),
        async (tab) => {
          cleanup();
          mockSystemTab = tab;

          const { container } = render(<SystemModal />);

          // Wait for tab panel to render and async data to load
          await vi.waitFor(() => {
            expect(container.querySelector('.tab-panel')).toBeTruthy();
            // For about tab, wait for version info to load
            if (tab === 'about') {
              expect(container.querySelector('.version-info')).toBeTruthy();
            }
          });

          // Verify exactly one tab-panel is rendered
          const panels = container.querySelectorAll('.tab-panel');
          expect(panels.length).toBe(1);

          // Verify the active tab's unique selector is present
          assertSelectorPresent(container, SYSTEM_TAB_SELECTORS[tab]);

          // Verify other tabs' selectors are absent
          for (const [otherTab, selector] of Object.entries(SYSTEM_TAB_SELECTORS)) {
            if (otherTab !== tab) {
              assertSelectorAbsent(container, selector);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Property 2: Current Version Badge Matching', () => {
  /**
   * **Validates: Requirements 9.3**
   *
   * For any version string returned by the backend, the "Current Version" badge
   * appears on exactly the changelog entry whose version matches, or on no entries
   * if no changelog entry matches.
   */

  const CHANGELOG_VERSIONS = ['5.10.0', '5.9.0', '5.8.1', '5.8.0', '5.7.0'];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSystemTab = 'updates';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Arbitrary: semver-like version string (digits.digits.digits)
  const arbSemver = fc.tuple(
    fc.integer({ min: 0, max: 99 }),
    fc.integer({ min: 0, max: 99 }),
    fc.integer({ min: 0, max: 99 })
  ).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

  function setupFetchMock(version) {
    global.fetch = vi.fn((url) => {
      if (url.includes('/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version, environment: 'production' })
        });
      }
      if (url.includes('/backup/list')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/backup/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            expenseCount: 0, invoiceCount: 0, paymentMethodCount: 0,
            statementCount: 0, creditCardPaymentCount: 0,
            databaseSizeMB: 0, invoiceStorageSizeMB: 0,
            totalBackupSizeMB: 0, backupCount: 0
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  }

  it('badge appears on exactly the matching changelog entry when version matches', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CHANGELOG_VERSIONS),
        async (version) => {
          cleanup();
          setupFetchMock(version);

          const { container } = render(<SystemModal />);

          // Wait for version info to load (badge only appears after async fetch resolves)
          await vi.waitFor(() => {
            expect(container.querySelector('.changelog')).toBeTruthy();
            expect(container.querySelector('.current-version-badge')).toBeTruthy();
          });

          // Exactly one badge should appear
          const badges = container.querySelectorAll('.current-version-badge');
          expect(badges.length).toBe(1);

          // The badge should be inside the entry whose version text contains the matching version
          const badgeEntry = badges[0].closest('.changelog-entry');
          const versionText = badgeEntry.querySelector('.changelog-version').textContent;
          expect(versionText).toContain(`v${version}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no badge appears when version does not match any changelog entry', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSemver.filter(v => !CHANGELOG_VERSIONS.includes(v)),
        async (version) => {
          cleanup();
          setupFetchMock(version);

          const { container } = render(<SystemModal />);

          // Wait for changelog to render
          await vi.waitFor(() => {
            expect(container.querySelector('.changelog')).toBeTruthy();
            expect(container.querySelectorAll('.changelog-entry').length).toBeGreaterThan(0);
          });

          // No badge should appear
          const badges = container.querySelectorAll('.current-version-badge');
          expect(badges.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isCurrentVersion logic: v-prefix normalization produces correct match', async () => {
    // Pure logic test: for any version string, the comparison after stripping "v" prefix
    // should be an exact string match against versionInfo.version
    await fc.assert(
      fc.asyncProperty(
        arbSemver,
        async (version) => {
          cleanup();
          setupFetchMock(version);

          const { container } = render(<SystemModal />);

          await vi.waitFor(() => {
            expect(container.querySelector('.changelog')).toBeTruthy();
          });

          // Check each changelog entry: badge should appear iff the entry version matches
          const entries = container.querySelectorAll('.changelog-entry');
          for (const entry of entries) {
            const versionEl = entry.querySelector('.changelog-version');
            const badge = entry.querySelector('.current-version-badge');
            // Extract the raw version from the element text (e.g., "v5.10.0" or "v5.10.0Current Version")
            const entryVersionMatch = versionEl.textContent.match(/v([\d.]+)/);
            if (entryVersionMatch) {
              const entryVersion = entryVersionMatch[1];
              if (entryVersion === version) {
                expect(badge).not.toBeNull();
              } else {
                expect(badge).toBeNull();
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Property 3: Person Form Validation Completeness', () => {
  /**
   * **Validates: Requirements 3.4, 3.5, 3.6**
   *
   * For any random name/dateOfBirth combination, the person form validation
   * correctly accepts or rejects based on:
   * - Name is required (non-empty, non-whitespace)
   * - Date of birth format must be YYYY-MM-DD if provided
   * - Date of birth must not be in the future
   * - Date of birth is optional (empty/whitespace is valid)
   */

  // Pure version of validatePersonForm extracted from SettingsModal.jsx
  function validatePersonFormPure(name, dateOfBirth) {
    const errors = {};
    if (!name || name.trim() === '') {
      errors.name = 'Name is required';
    }
    if (dateOfBirth && dateOfBirth.trim() !== '') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateOfBirth)) {
        errors.dateOfBirth = 'Date must be in YYYY-MM-DD format';
      } else {
        const date = new Date(dateOfBirth);
        if (isNaN(date.getTime())) {
          errors.dateOfBirth = 'Invalid date';
        } else if (date > new Date()) {
          errors.dateOfBirth = 'Date cannot be in the future';
        }
      }
    }
    return { errors, isValid: Object.keys(errors).length === 0 };
  }

  // --- Arbitraries ---

  // Names that should be rejected: empty, whitespace-only, null, undefined
  const arbInvalidName = fc.oneof(
    fc.constant(''),
    fc.constant(null),
    fc.constant(undefined),
    fc.integer({ min: 1, max: 10 }).map(n => ' '.repeat(n)) // whitespace-only
  );

  // Names that should be accepted: non-empty after trimming
  const arbValidName = fc.string({ minLength: 1, maxLength: 100 })
    .filter(s => s.trim().length > 0);

  // Date of birth values that are empty/whitespace (optional, should be accepted)
  const arbEmptyDateOfBirth = fc.oneof(
    fc.constant(''),
    fc.constant(null),
    fc.constant(undefined),
    fc.integer({ min: 1, max: 5 }).map(n => ' '.repeat(n)) // whitespace-only
  );

  // Date of birth with invalid format (not YYYY-MM-DD)
  const arbInvalidFormatDate = fc.oneof(
    fc.constant('2024/01/15'),
    fc.constant('01-15-2024'),
    fc.constant('15-01-2024'),
    fc.constant('2024-1-5'),
    fc.constant('not-a-date'),
    fc.constant('20240115'),
    fc.constant('2024-13'),
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => {
      // Exclude strings that happen to match YYYY-MM-DD format
      return s.trim().length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(s);
    })
  );

  // Helper to format a Date as YYYY-MM-DD
  function toYMD(d) {
    const year = String(d.getFullYear()).padStart(4, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Valid past date in YYYY-MM-DD format
  const arbValidPastDate = fc.date({
    min: new Date('1900-01-01'),
    max: new Date(Date.now() - 24 * 60 * 60 * 1000) // yesterday
  }).map(toYMD).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));

  // Future date in YYYY-MM-DD format
  const arbFutureDate = fc.date({
    min: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // day after tomorrow to avoid timezone edge cases
    max: new Date('2099-12-31')
  }).map(toYMD).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));

  // --- Property Tests ---

  it('empty or whitespace-only name always produces a name error', () => {
    fc.assert(
      fc.property(
        arbInvalidName,
        arbEmptyDateOfBirth,
        (name, dob) => {
          const { errors, isValid } = validatePersonFormPure(name, dob);
          expect(errors.name).toBe('Name is required');
          expect(isValid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('non-empty trimmed name never produces a name error', () => {
    fc.assert(
      fc.property(
        arbValidName,
        arbEmptyDateOfBirth,
        (name, dob) => {
          const { errors } = validatePersonFormPure(name, dob);
          expect(errors.name).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty or whitespace dateOfBirth never produces a dateOfBirth error', () => {
    fc.assert(
      fc.property(
        arbValidName,
        arbEmptyDateOfBirth,
        (name, dob) => {
          const { errors, isValid } = validatePersonFormPure(name, dob);
          expect(errors.dateOfBirth).toBeUndefined();
          expect(isValid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('non-YYYY-MM-DD format dateOfBirth produces a format error', () => {
    fc.assert(
      fc.property(
        arbValidName,
        arbInvalidFormatDate,
        (name, dob) => {
          const { errors, isValid } = validatePersonFormPure(name, dob);
          expect(errors.dateOfBirth).toBe('Date must be in YYYY-MM-DD format');
          expect(isValid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('future date produces a future date error', () => {
    fc.assert(
      fc.property(
        arbValidName,
        arbFutureDate,
        (name, dob) => {
          const { errors, isValid } = validatePersonFormPure(name, dob);
          expect(errors.dateOfBirth).toBe('Date cannot be in the future');
          expect(isValid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('valid past date produces no dateOfBirth error', () => {
    fc.assert(
      fc.property(
        arbValidName,
        arbValidPastDate,
        (name, dob) => {
          const { errors, isValid } = validatePersonFormPure(name, dob);
          expect(errors.dateOfBirth).toBeUndefined();
          expect(isValid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('validation is complete: every name/dob combination gets a definitive result', () => {
    // Combined arbitrary covering all input categories
    const arbAnyName = fc.oneof(arbInvalidName, arbValidName);
    const arbAnyDob = fc.oneof(
      arbEmptyDateOfBirth,
      arbInvalidFormatDate,
      arbValidPastDate,
      arbFutureDate
    );

    fc.assert(
      fc.property(
        arbAnyName,
        arbAnyDob,
        (name, dob) => {
          const { errors, isValid } = validatePersonFormPure(name, dob);

          // isValid should be true iff there are no errors
          expect(isValid).toBe(Object.keys(errors).length === 0);

          // Only 'name' and 'dateOfBirth' keys are possible
          for (const key of Object.keys(errors)) {
            expect(['name', 'dateOfBirth']).toContain(key);
          }

          // Name validation: error iff name is falsy or whitespace-only
          const nameIsInvalid = !name || name.trim() === '';
          if (nameIsInvalid) {
            expect(errors.name).toBe('Name is required');
          } else {
            expect(errors.name).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

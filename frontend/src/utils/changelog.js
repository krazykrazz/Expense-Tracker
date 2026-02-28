/**
 * Centralized changelog module.
 * Single source of truth for in-app changelog entries used by
 * VersionUpgradeModal, SystemModal, and BackupSettings.
 *
 * Each entry follows the Keep a Changelog format with categorized items:
 * Added, Changed, Fixed, Removed.
 *
 * Entries are ordered newest-first (descending by version).
 */

const changelogEntries = [
  {
    version: '1.2.4',
    date: 'February 28, 2026',
    added: [],
    changed: ['Anchor-based balance calculation fix for loans and financial overview'],
    fixed: [],
    removed: [],
  },
  {
    version: '1.2.3',
    date: 'February 28, 2026',
    added: [],
    changed: ['Fix: use calculated balance as source of truth, fix PBT test cleanup'],
    fixed: [],
    removed: [],
  },
  {
    version: '1.2.2',
    date: 'February 27, 2026',
    added: [],
    changed: ['CI pipeline hardening, health check fixes, script cleanup'],
    fixed: [],
    removed: [],
  },
  {
    version: '1.2.1',
    date: 'February 27, 2026',
    added: [],
    changed: ['Fix version upgrade modal stale bundle deferral'],
    fixed: [],
    removed: [],
  },
  {
    version: '1.2.0',
    date: 'February 27, 2026',
    added: [
      'Auth infrastructure: password gate, session tokens, authFetch for all frontend API calls',
      'User menu with logout button in header',
      'Fetch infrastructure consolidation with centralized retry logic and tab ID tracking',
      'Raw fetch enforcement script to prevent regression',
    ],
    changed: [],
    fixed: [
      'Backup restore auth cache staleness causing lockout after restoring pre-auth backups',
      'Backup WAL replay bug: flush WAL before restore file copy',
      'Billing cycle scheduler and activity log cleanup log noise reduced',
      'Auth mode transition race conditions',
      'Duplicate activity log entries when enabling password',
      'Graceful handling for deleted expense invoices',
    ],
    removed: [],
  },
  {
    version: '1.1.1',
    date: 'February 26, 2026',
    fixed: [
      'Fix backup SQLITE_MISUSE error caused by closing singleton database after WAL checkpoint',
      'Fix posted date PBT race condition in ExpenseForm credit card selection',
    ],
    added: [],
    changed: [],
    removed: [],
  },
  {
    version: '1.1.0',
    date: 'February 25, 2026',
    added: [
      'Container update detection with refresh banner',
      'Version upgrade tracking with changelog modal',
      'Remote update availability checking via GitHub Releases API',
    ],
    fixed: [
      'UX consistency fixes for button hierarchy and form inputs',
    ],
    changed: [],
    removed: [],
  },
  {
    version: '1.0.0',
    date: 'February 23, 2026',
    changed: [
      'Consolidated ~50 incremental database migrations into single declarative schema module',
      'Rebased application version from 5.17.5 to 1.0.0',
    ],
    removed: [
      'Removed backward-compatibility fallback patterns in billing cycle repository',
    ],
    fixed: [],
    added: [
      'Updated all product documentation to reflect consolidated schema',
    ],
  },
];

/**
 * Look up a changelog entry by version string.
 * @param {string} version - Version string (e.g. "1.0.0")
 * @returns {Object|null} The matching entry or null
 */
function getChangelogEntry(version) {
  if (!version) return null;
  const normalized = version.replace(/^v/, '');
  return changelogEntries.find(e => e.version === normalized) || null;
}

export { changelogEntries, getChangelogEntry };

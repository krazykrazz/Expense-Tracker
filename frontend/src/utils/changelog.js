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

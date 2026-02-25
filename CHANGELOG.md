# Changelog

> For release history prior to 1.0.0 (formerly v1.0.0–v5.17.5), see [CHANGELOG.pre-1.0.md](CHANGELOG.pre-1.0.md).

## [Unreleased]

## [1.1.0] - 2026-02-25

### Added
- Container update detection: open browser tabs automatically detect backend restarts/updates and display an update banner prompting users to refresh
- `startupId` field in `/api/version` response — unique per server process, enables restart detection without version bumps
- `UpdateBanner` component with refresh and dismiss controls, keyboard accessible with ARIA role="alert"
- `useContainerUpdateCheck` hook with debounce, dedup, and banner-visible suppression for resilient reconnect handling
- `onReconnect` callback prop on `useDataSync` hook — fires on SSE reconnections (not initial connect)
- Version upgrade tracking: automatic detection and activity logging of version changes on server startup
- `version_upgraded` activity log event type with `{old_version, new_version}` metadata
- Version upgrade changelog modal — appears on first page load after an upgrade, shows categorized changes
- `useVersionUpgradeCheck` hook for frontend upgrade detection via localStorage comparison
- Remote update availability checking via GitHub Releases API (`GET /api/version/check-update`)
- In-memory cache for update checks (24h TTL, configurable via `UPDATE_CHECK_INTERVAL_SECONDS`)
- Update availability banner in System Modal Updates tab
- Persistent header update indicator dot next to System button
- Centralized `changelog.js` module replacing duplicated changelog entries in SystemModal and BackupSettings

## [1.0.0] - 2026-02-23

### Changed
- Consolidated ~50 incremental database migrations into single declarative schema module
- Rebased application version from 5.17.5 to 1.0.0
- Removed ~1744 auto-migration backup files
- Removed backward-compatibility fallback patterns in billing cycle repository
- Updated all product documentation to reflect consolidated schema

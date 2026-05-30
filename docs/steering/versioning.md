---
inclusion: fileMatch
fileMatchPattern: '**/package.json,CHANGELOG.md,frontend/src/App.jsx,**/BackupSettings.jsx,**/SystemModal.jsx,**/changelog.js'
---

# Versioning Rules

## Version Locations (ALL must be updated together)

1. `frontend/package.json` — "version" field
2. `backend/package.json` — "version" field
3. `frontend/src/App.jsx` — Footer version display
4. `frontend/src/components/system/BackupSettings.jsx` — In-app changelog (Settings modal)
5. `frontend/src/components/system/SystemModal.jsx` — In-app changelog (System Information → Updates tab)
6. `CHANGELOG.md` — New version entry at top
7. `frontend/src/utils/changelog.js` — Structured changelog entries for VersionUpgradeModal

## Version Format

Semantic versioning: `MAJOR.MINOR.PATCH` (e.g., `5.10.1`)

- MAJOR: Breaking changes or major rewrites
- MINOR: New features
- PATCH: Bug fixes, test fixes, documentation

## Changelog Format

Each entry in `CHANGELOG.md` follows:

```markdown
## [5.10.1] - 2025-01-27
### Added
- New feature description
### Fixed
- Bug fix description
### Changed
- Change description
```

## In-App Changelogs

There are three in-app changelogs that must all be updated:

1. `BackupSettings.jsx` — The changelog entries in the Settings modal
2. `SystemModal.jsx` — The hardcoded changelog entries in the `renderUpdatesTab()` function (System Information → Updates tab)
3. `frontend/src/utils/changelog.js` — Structured changelog entries (with Added/Changed/Fixed/Removed categories) used by the VersionUpgradeModal popup on version upgrade

All three show recent versions to users. Missing one will cause the changelog to appear incomplete in that view. The `changelog.js` entries are what power the inline changelog details in the version upgrade popup — without a matching entry, users only see "See changelog for details."

## SHA-Based Container Strategy

Docker images are tagged with the git commit SHA, not the version number. The version is baked into the image at build time. This ensures:
- Exact traceability from running container to source code
- Same binary artifact moves staging → production
- No version tag conflicts

See `git-commits.md` for the full deployment workflow.

# Versioning Rules

## Version Locations (ALL must be updated together)

1. `frontend/package.json` — "version" field
2. `backend/package.json` — "version" field
3. `frontend/src/App.jsx` — Footer version display
4. `frontend/src/components/BackupSettings.jsx` — In-app changelog
5. `CHANGELOG.md` — New version entry at top

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

## BackupSettings Changelog

The in-app changelog in `BackupSettings.jsx` shows recent versions to users. Update the `changelogEntries` array with the new version.

## SHA-Based Container Strategy

Docker images are tagged with the git commit SHA, not the version number. The version is baked into the image at build time. This ensures:
- Exact traceability from running container to source code
- Same binary artifact moves staging → production
- No version tag conflicts

See `git-commits.md` for the full deployment workflow.

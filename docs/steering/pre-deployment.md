---
inclusion: manual
---

# Pre-Deployment Checklist

Use this checklist before running `deploy-to-production.ps1` or manually creating a release branch. The deployment script automates most of these steps, but verify them when doing manual releases or troubleshooting failures.

## 1. Tests Must Pass

All five required CI checks must be green before merging any PR to `main`:

- `Backend Unit Tests` — `cd backend && npm run test:unit:ci`
- `Backend PBT Shard 1/3`, `2/3`, `3/3` — `cd backend && npx jest --bail --testPathPatterns=pbt`
- `Frontend Tests` — `cd frontend && npx vitest --run`

Run locally before pushing to catch issues early. PBT tests can be run with reduced iterations during development: `$env:FAST_PBT="true"`.

## 2. Frontend Build

The frontend must build cleanly with the new version baked in:

```bash
cd frontend && npm run build
```

The deploy script does this automatically. A failed build blocks deployment.

## 3. Version Bump (All 7 Locations)

Every release must update version in all 7 locations simultaneously (see `versioning.md` for details):

1. `frontend/package.json`
2. `backend/package.json`
3. `frontend/src/App.jsx` (footer display)
4. `frontend/src/components/system/BackupSettings.jsx` (in-app changelog)
5. `frontend/src/components/system/SystemModal.jsx` (System Information → Updates tab)
6. `CHANGELOG.md`
7. `frontend/src/utils/changelog.js` (structured changelog entries for VersionUpgradeModal)

Missing any location causes version mismatch between UI, API, and container metadata.

## 4. CHANGELOG.md Entry

Add a new entry at the top following the format:

```markdown
## [X.Y.Z] - YYYY-MM-DD
### Added / Fixed / Changed
- Description
```

## 5. Database Migration Compatibility

Migrations run automatically on container startup. They must be backward-compatible, idempotent, and append-only. See `#database-migrations` steering for detailed rules and templates.

## 6. API Endpoint Registration

New backend routes must have a corresponding entry in `frontend/src/config.js` (`API_ENDPOINTS` object). The frontend uses this centralized config for all API calls — hardcoded URLs will break in Docker deployments where the base URL may differ.

## 7. No Hardcoded URLs

Verify no `localhost`, `127.0.0.1`, or hardcoded port references exist in production code paths. The frontend derives its API base from `VITE_API_BASE_URL` (defaults to empty string for same-origin). The backend listens on port 2424.

## 8. Docker Considerations

- The production container mounts `./config:/config` for persistent data (SQLite DB, backups, invoices)
- Environment variables: `NODE_ENV=production`, `LOG_LEVEL=info`, `TZ=Etc/UTC`
- Health check endpoint: `GET /api/health` — must remain functional
- CI builds the Docker image and pushes to GHCR on merge to `main`; never build locally for production (use `build-and-push.ps1` to pull CI-built images)

## 9. Branch and PR Workflow

- Version bumps go on a `release/vX.Y.Z` branch, never on feature branches
- `main` has branch protection — direct pushes are blocked
- Merge strategy: merge commits only (no squash, no rebase)
- The `deploy-to-production.ps1` script handles the full release branch → PR → merge → tag → promote flow

## Deployment Command

```powershell
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Bug fixes"
.\scripts\deploy-to-production.ps1 -BumpType MINOR -Description "New feature"
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Test" -DryRun
```

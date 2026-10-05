---
description: "Use when releasing, bumping versions, editing changelogs, or promoting/deploying images to staging or production."
applyTo: "**/package.json,CHANGELOG.md,**/changelog.js,**/BackupSettings.jsx,**/SystemModal.jsx,.github/workflows/release.yml"
---
# Versioning and Release

Full process: `docs/deployment/DEPLOYMENT_WORKFLOW.md`.

## Rules

- Never bump versions on `feature/*` or `hotfix/*` branches (blocked by `scripts/git-hooks/pre-commit` and flagged by `version-check.yml`). Versions change only on `release/vX.Y.Z` branches created by the Release workflow.
- The root `package.json` has no version. The six version locations, all updated together by the workflow:
  1. `frontend/package.json`
  2. `backend/package.json` (source of `/api/version` and the `vX.Y.Z` image tag)
  3. `frontend/src/components/system/BackupSettings.jsx` (in-app changelog)
  4. `frontend/src/components/system/SystemModal.jsx` (Updates tab changelog)
  5. `CHANGELOG.md` (new `## [X.Y.Z] - YYYY-MM-DD` + `### description` under `# Changelog`)
  6. `frontend/src/utils/changelog.js` (`changelogEntries`, used by the upgrade modal)
- Semver: MAJOR breaking, MINOR features, PATCH fixes.

## Commands

```powershell
gh workflow run release.yml -f bump_type=MINOR -f description="Short summary" -f auto_merge=true
# after main CI's "Build and Push to GHCR" succeeds for the merge commit, from an up-to-date main checkout:
.\scripts\build-and-push.ps1 -Environment staging
.\scripts\build-and-push.ps1 -Environment latest -SkipDeploy   # production runs from its own compose file
```

- A failed release run leaves `origin/release/vX.Y.Z`; delete it before re-running.
- `build-and-push.ps1` uses the SHA of the current checkout — run it from `main` at a commit CI has built (docs-only commits have no image).
- Before releasing: required checks green, `cd frontend; npm run build` clean, migrations idempotent and backward-compatible (rolling back the image does not undo them).

# Complete Deployment Workflow

This document describes the end-to-end workflow for building, releasing, and deploying the Expense Tracker using the pull-and-promote container model. It is the canonical maintainer reference for CI image builds, image tags, `build-and-push.ps1`, the Release workflow, staging/production promotion, version-bump guardrails, and rollback.

## Overview

The deployment workflow ensures:
- Feature branches never contain version bumps
- Version bumps happen only on `release/vX.Y.Z` branches, merged to `main` via PR
- CI is the single source of truth for Docker image builds
- The same image (identified by git SHA) moves staging → production by retagging, never rebuilding
- Full traceability: the SHA tag maps to a git commit, and `GIT_COMMIT`, `IMAGE_TAG` and `BUILD_DATE` are baked into the image (reported by `GET /api/version` and `GET /api/health`)

## How Images Are Built (CI)

The `Build and Push to GHCR` job (`build-and-push-ghcr`) in `.github/workflows/ci.yml`:

- Runs only on a push to `main` (or `workflow_dispatch` on `main`), after `Backend Tests Status` and `Frontend Tests Status` succeed. **Pull requests never build or push images.** Runs triggered by `dependabot[bot]` skip it.
- Builds the root `Dockerfile` (linux/amd64) with build args `IMAGE_TAG` and `GIT_COMMIT` (both the short SHA) and `BUILD_DATE`.
- Scans the image with Trivy; any CRITICAL finding fails the job before anything is pushed.
- Pushes two tags: `:<short-sha>` and `:v<version>` (version read from `backend/package.json`).
- Creates the GitHub Release `v<version>` (which also creates the git tag) if it does not exist yet, attaching a version-pinned `docker-compose-v<version>.yml`; if the release already exists, it re-uploads that asset.

The follow-on `Deployment Health Check` job pulls the SHA image, runs it in a throwaway container on the CI runner and checks `/api/health` and `/`. It does not touch any real staging or production host.

> CI ignores pushes that only change `docs/**` or root-level `*.md` files (`paths-ignore`). A docs-only commit on `main` therefore has **no** image — see [SHA image not found](#sha-image-not-found).

`.github/workflows/ghcr-cleanup.yml` runs weekly (Sunday 00:00 UTC): it deletes untagged image versions, then keeps only the 20 most recent versions, never deleting `vX.Y.Z`, `latest` or `staging`. Older SHA-only images are eventually deleted.

## Image Tags

All images live at `ghcr.io/krazykrazz/expense-tracker`.

| Tag | Pushed by | Meaning |
|-----|-----------|---------|
| `<short-sha>` (e.g. `789bf08`) | CI | Image built from exactly that commit. Never re-pushed, but subject to GHCR cleanup |
| `vX.Y.Z` | CI | Pushed on **every** `main` build while `backend/package.json` is at X.Y.Z, so it points at the latest `main` build of that version, not necessarily the release merge commit |
| `staging` | `build-and-push.ps1 -Environment staging` | The SHA last promoted to staging |
| `latest` | `build-and-push.ps1 -Environment latest` | The SHA last promoted to production. CI never pushes `latest` |

## Environments

| Environment | `-Environment` | Compose service / container | Image | Host port | Data directory |
|-------------|----------------|-----------------------------|-------|-----------|----------------|
| Production | `latest` | `expense-tracker` | `:latest` | 2424 | `./config` |
| Staging | `staging` | `expense-tracker-test` (compose profile `staging`) | `:staging` | 2627 | `./staging-data` |
| Feature preview | n/a | `expense-tracker-preview` | local `expense-tracker:preview-<branch>` | 3001 | `./preview-data` |

Compose files:

- `docker-compose.yml`: reference compose file for production (`expense-tracker`) and staging (`expense-tracker-test`). Default target of `build-and-push.ps1`.
- `docker-compose.preview.yml`: local feature preview — see [Feature Preview Deployment](FEATURE_PREVIEW_DEPLOYMENT.md).
- `docker-compose.ghcr.yml`: minimal example for running a GHCR image without the rest of the repo. CI attaches a version-pinned copy to each GitHub Release.

## Complete Workflow

### Phase 1: Feature Development

1. **Create feature branch**:
   ```powershell
   git checkout -b feature/my-feature
   # or: .\scripts\create-feature-branch.ps1 -FeatureName my-feature   (also pushes the branch)
   ```

2. **Implement feature** (no version changes). Optionally test it in a container with [Feature Preview Deployment](FEATURE_PREVIEW_DEPLOYMENT.md).

3. **Commit feature work**:
   ```powershell
   git add -A
   git commit -m "feat: implement my-feature"
   ```

### Phase 2: Pull Request

4. **Create Pull Request**:
   ```powershell
   .\scripts\promote-feature.ps1 -FeatureName my-feature
   ```
   The script merges the latest `main` into the feature branch, runs frontend and backend `npm run test:parallel` locally (skip with `-SkipTests`), pushes the branch and opens the PR with `gh`. Add `-CreateIssue` to open a linked tracking issue.

   For a quick fix already committed on local `main`, `.\scripts\create-pr-from-main.ps1 -Title "Fix: description"` creates a `hotfix/<timestamp>` branch from those unpushed commits, pushes it and opens the PR (also supports `-CreateIssue`; local `main` is only reset to `origin/main` with `-ResetMainToOrigin`). Hotfix branches follow the same no-version-bump rule.

5. **Wait for CI to pass**. The required checks are `Backend Tests Status` and `Frontend Tests Status`, and the branch must be up to date with `main`.

6. **Merge with a merge commit** (the only method the `main` ruleset allows):
   ```powershell
   gh pr merge <number> --merge --delete-branch
   ```

### Phase 3: Stage the Merged Code

7. **Wait for CI on `main`** to finish `Build and Push to GHCR` for the merge commit:
   ```powershell
   gh run list --branch main --workflow CI --limit 3
   ```

8. **Switch to main and pull** (the script derives the SHA from your checkout):
   ```powershell
   git checkout main
   git pull origin main
   ```

9. **Pull and promote to staging**:
   ```powershell
   .\scripts\build-and-push.ps1 -Environment staging
   ```

10. **Test in staging** at http://localhost:2627 — see [Staging Environment](../development/STAGING_ENVIRONMENT.md).

### Phase 4: Release (Version Bump)

`main` is protected by a ruleset: no direct pushes, PRs required, merge commits only, required status checks, and **verified (signed) commits**. Version bumps are therefore made by the Release workflow (`.github/workflows/release.yml`, "Create Release PR"):

```powershell
gh workflow run release.yml -f bump_type=MINOR -f description="Short release summary" -f auto_merge=true
```

`bump_type` is `PATCH`, `MINOR` or `MAJOR`. The workflow:

1. Computes the new version from `backend/package.json` and pushes `release/vX.Y.Z` at `main`'s tip
2. Updates the version locations listed in [release.instructions.md](../../.github/instructions/release.instructions.md): both `package.json` files, `CHANGELOG.md`, `frontend/src/utils/changelog.js`, `BackupSettings.jsx` and `SystemModal.jsx`. Each changelog entry contains only `description`.
3. Runs a frontend build as a sanity check (`frontend/dist` is gitignored; the shipped bundle is built inside the Docker image)
4. Commits through the GitHub API (`gh api graphql` → `createCommitOnBranch`), so the commit is signed by GitHub and shows as Verified
5. Opens the PR `Release vX.Y.Z: <description>`
6. With `auto_merge=true`, enables auto-merge using the `RELEASE_PAT` secret. A PAT is required: a merge performed under `GITHUB_TOKEN` would not trigger the `main` CI run, so no image would be built.

When the release PR merges, the `main` CI run builds `:<sha>` and `:vX.Y.Z` and creates the GitHub Release and git tag `vX.Y.Z`. No manual tagging is needed.

Notes:
- Immediately after the PR is opened, `gh pr checks <number>` may report no checks because CI has not started yet; poll `gh pr view <number> --json state` instead.
- A failed release run leaves `origin/release/vX.Y.Z` behind (the branch is pushed before the commit step). Delete it before re-running, otherwise the next run's branch push fails:
  ```powershell
  git push origin --delete release/vX.Y.Z
  ```

### Phase 5: Promote to Production

11. **Wait for CI on `main`** to finish `Build and Push to GHCR` for the release merge commit.

12. **Switch to main and pull**:
    ```powershell
    git checkout main
    git pull origin main
    ```

13. **Promote to production** (same image, just retagged):
    ```powershell
    .\scripts\build-and-push.ps1 -Environment latest
    ```
    If production does not run from this repo's `docker-compose.yml` (different host or compose file), add `-SkipDeploy` to only push the `:latest` tag, then redeploy where production runs (`docker compose pull` + `docker compose up -d`).

14. **Verify production**:
    ```powershell
    docker exec expense-tracker sh -c 'echo $GIT_COMMIT $BUILD_DATE'
    curl http://localhost:2424/api/version
    ```

### Phase 6: Cleanup

15. **Delete the local feature branch** (the remote branch is deleted by `gh pr merge --delete-branch`; the repository does not auto-delete merged branches):
    ```powershell
    git branch -d feature/my-feature
    ```

## build-and-push.ps1 Reference

`scripts/build-and-push.ps1` is a pull-and-promote script. It derives the SHA (`git rev-parse --short HEAD`) and version (`backend/package.json`) from the **current checkout**, so run it from `main` at a commit CI has built.

Default behaviour:
1. Authenticates to GHCR with `gh auth token` (if `gh` is installed; otherwise assumes `docker login ghcr.io` was done)
2. Pulls `ghcr.io/krazykrazz/expense-tracker:<sha>`
3. With `-Environment`: tags that image as `:staging` or `:latest` and pushes the tag
4. Unless `-SkipDeploy`: runs `docker-compose -f <ComposeFile> pull <service>` and `docker-compose -f <ComposeFile> up -d <service>` (`staging` → `expense-tracker-test`, `latest` → `expense-tracker`)

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-Environment` | `staging` or `latest`. Omit to only pull the SHA image | None |
| `-Registry` | Registry/owner prefix | `ghcr.io/krazykrazz` |
| `-LocalBuild` | Build the image locally instead of pulling it, then push `:<sha>` to GHCR. Escape hatch for testing Dockerfile changes — it overwrites any CI image for that SHA | Off |
| `-MultiPlatform` | With `-LocalBuild`: build linux/amd64 + linux/arm64 with buildx and push directly | Off |
| `-SkipDeploy` | Push the environment tag but do not touch any container | Off |
| `-ComposeFile` | Compose file used for deploy | `docker-compose.yml` |

## Version-Bump Guardrails

### Pre-commit hook

Install once after cloning:

```powershell
.\scripts\install-git-hooks.ps1
```

This copies `scripts/git-hooks/pre-commit` to `.git/hooks/pre-commit`. On `feature/*` and `hotfix/*` branches it blocks a commit when the staged diff adds a version string to `frontend/package.json`, `backend/package.json`, `frontend/src/components/system/BackupSettings.jsx`, `frontend/src/components/system/SystemModal.jsx` or `frontend/src/utils/changelog.js`. It does not check `CHANGELOG.md`. Bypass with `git commit --no-verify` (not recommended). If the hook does not run, check `Test-Path .git/hooks/pre-commit` and re-run the installer (on Linux/macOS it also needs to be executable).

### Version Consistency Check workflow

`.github/workflows/version-check.yml` runs on PRs to `main` that touch those files or `CHANGELOG.md`:

- **Non-`release/*` branches** — `Guard Against PR Version Bumps` fails if any added line in those files contains a version string (`"version":`, `vN.N.N`, or `version: 'N.N.N'`). Legitimate edits that mention a version can trip it.
- **`release/*` branches** — `Validate Version Consistency` checks that both `package.json` versions and the first `changelog.js` entry match, and that `CHANGELOG.md`, `BackupSettings.jsx` and `SystemModal.jsx` mention the version.

Neither job is a required status check, so a failure is visible on the PR but does not by itself block the merge.

## Quick Reference

```powershell
# Feature → PR → merge
.\scripts\promote-feature.ps1 -FeatureName my-feature
gh pr merge <number> --merge --delete-branch

# Stage merged main (after CI's "Build and Push to GHCR" succeeds)
git checkout main; git pull origin main
.\scripts\build-and-push.ps1 -Environment staging

# Release
gh workflow run release.yml -f bump_type=PATCH -f description="Bug fixes" -f auto_merge=true

# Promote the release (after CI's "Build and Push to GHCR" succeeds for the release merge)
git checkout main; git pull origin main
.\scripts\build-and-push.ps1 -Environment latest            # add -SkipDeploy if production runs elsewhere

# Verify
curl http://localhost:2424/api/health
docker image ls ghcr.io/krazykrazz/expense-tracker
```

## Common Mistakes to Avoid

### ❌ Building Docker Images Locally

**Wrong:**
```powershell
docker build -t expense-tracker .  # Local build diverges from CI
```

**Right:**
```powershell
.\scripts\build-and-push.ps1 -Environment staging  # Pulls CI-built image
```

CI is the single source of truth. Use `-LocalBuild` only for testing Dockerfile changes, and remember it pushes the result to GHCR under the commit's SHA.

### ❌ Version Bump on Feature Branch

Version bumps go on a dedicated `release/vX.Y.Z` branch created by the Release workflow, never on feature or hotfix branches.

### ❌ Promoting from the Wrong Checkout

`build-and-push.ps1` uses the SHA of your current `HEAD`. Running it on a feature branch, before CI has finished, or on a docs-only commit fails with `Failed to pull SHA image`.

## Rollback Procedure

1. **Find the previous working image** from `git log --oneline main`, the GitHub Releases page, or `docker image ls ghcr.io/krazykrazz/expense-tracker`.

2. **Pull and retag**:
   ```powershell
   docker pull ghcr.io/krazykrazz/expense-tracker:def5678
   docker tag ghcr.io/krazykrazz/expense-tracker:def5678 ghcr.io/krazykrazz/expense-tracker:latest
   docker push ghcr.io/krazykrazz/expense-tracker:latest
   ```
   SHA-only images older than the 20 most recent versions may have been removed by GHCR cleanup; `vX.Y.Z` tags are always kept (but see [Image Tags](#image-tags) for what they point at).

3. **Restart production container**:
   ```powershell
   docker compose -f docker-compose.yml up -d expense-tracker
   ```

Rolling back the image does not undo database migrations that the newer version already applied. If the older version cannot run against the migrated schema, restore a backup taken before the upgrade (see [Restore Backup Guide](../guides/RESTORE_BACKUP_GUIDE.md)).

## Troubleshooting

### SHA image not found

`Failed to pull SHA image` from `build-and-push.ps1` means GHCR has no image for your `HEAD`:

- CI has not finished (or failed) for that commit — check `gh run list --branch main --workflow CI --limit 5`
- `HEAD` is not a `main` commit (feature branch, unpushed commit)
- `HEAD` is a docs-only commit, which CI skips. Check out the most recent commit that CI built (`git checkout <sha>`) and run the script from there
- The image was removed by GHCR cleanup

### Registry authentication

```powershell
gh auth status
gh auth token | docker login ghcr.io -u krazykrazz --password-stdin
```

### Container won't start

```powershell
docker logs expense-tracker
docker logs expense-tracker-test
```

### Which image is running

```powershell
docker inspect expense-tracker --format '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
docker exec expense-tracker sh -c 'echo $GIT_COMMIT $BUILD_DATE'
```

## Container Resource Limits

> Decision recorded 2026-09-14 (spec R29). All figures measured against a real 21,507-expense
> production dataset, not estimated.

### The limits

Both services in `docker-compose.yml` set:

```yaml
environment:
  - NODE_OPTIONS=--max-old-space-size=384
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '1.0'
```

### Why 512 MiB

| Measurement | Value |
|---|---|
| Steady state, full production data | ~88 MiB |
| One unbounded `expenseRepository.findAll()` (21,507 rows) | +18.5 MB RSS, 291 ms |
| 10 consecutive unbounded loads | peak 100.5 MB |

512 MiB leaves roughly 5× headroom over the worst path currently in the codebase. Verified:
the container runs healthy under the enforced limit at ~5% utilisation.

### Why `--max-old-space-size` is mandatory alongside it

**V8 sizes its heap from host RAM, not from the cgroup limit.** Without the flag, the
container measured a `heap_size_limit` of **2096 MB** against a 512 MiB cgroup — meaning V8
would let the heap grow roughly 4× past the point where the kernel OOM-kills the process,
and would never feel enough pressure to collect first. The result is an exit 137 that
presents as an unexplained restart.

With the flag, `heap_size_limit` reports **387 MB**, comfortably inside the limit. The 384
figure is ~75% of 512, leaving room for native allocations (sqlite3, buffers, stacks) that
live outside the V8 heap.

**If you change the memory limit, change this flag with it.** A limit without a matching heap
cap is worse than no limit at all.

### `deploy.resources.limits` does apply under `docker compose up`

This was verified empirically on Compose v5.1.4 / Engine 29.5.3 — a probe container using
`deploy.resources.limits` and one using `mem_limit` both produced
`HostConfig.Memory=536870912`. The `deploy:` key is **not** Swarm-only here, so no rewrite to
`mem_limit` is needed.

### Production uses a different compose file

Production is deployed from a personal compose file, **not** the repo's `docker-compose.yml`.
The repo file is the reference and governs staging. Limits set here therefore do **not**
reach production automatically — the same three settings (`memory`, `cpus`, `NODE_OPTIONS`)
must be mirrored into the production compose file by hand.

To confirm what production is actually running:

```powershell
docker inspect expense-tracker --format 'Memory={{.HostConfig.Memory}} NanoCpus={{.HostConfig.NanoCpus}}'
docker exec expense-tracker sh -c "tr '\0' '\n' < /proc/1/environ | grep NODE_OPTIONS"
```

`Memory=0` means no limit is in effect regardless of what any compose file declares.

## Graceful Shutdown and Hardening

The backend handles `SIGTERM`/`SIGINT` (`backend/utils/gracefulShutdown.js`): it stops the schedulers, closes SSE streams, lets in-flight HTTP requests finish, then closes the database (checkpointing the SQLite WAL) and exits, forcing exit after 10 seconds. Both services in `docker-compose.yml` set `stop_grace_period: 15s` so Docker does not `SIGKILL` the process mid-checkpoint (Docker's default is 10s). Mirror this in any other compose file used for production.

Both services also set `security_opt: [no-new-privileges:true]` and `cap_drop: [ALL]`; the image runs as the non-root `node` user (UID 1000).

## See Also

- [Feature Preview Deployment](FEATURE_PREVIEW_DEPLOYMENT.md) - Local container testing of feature branches
- [Staging Environment](../development/STAGING_ENVIRONMENT.md) - Staging data setup and migration testing
- [Docker Deployment Guide](../guides/DOCKER_DEPLOYMENT.md) - Running the published image
- [Release Instructions](../../.github/instructions/release.instructions.md) - Version locations and release rules
- [Feature Branch Workflow](../development/FEATURE_BRANCH_WORKFLOW.md) - Branching and merge rules

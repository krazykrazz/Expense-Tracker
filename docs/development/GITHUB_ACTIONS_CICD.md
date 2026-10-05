# GitHub Actions CI/CD

**Last Updated**: 2026-10-04  
**Status**: Active

This document describes the GitHub Actions workflows used by the Expense Tracker application and how to troubleshoot them.

## Overview

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| CI | `ci.yml` | Push / PR to `main`, `workflow_dispatch` | Tests, security audit, lockfile check; on `main` also Docker build, Trivy scan, GHCR push and deployment health check |
| Version Consistency Check | `version-check.yml` | PRs to `main` that touch version files | Blocks version bumps outside `release/*` branches; validates version consistency on `release/*` PRs |
| Create Release PR | `release.yml` | `workflow_dispatch` | Bumps the version, updates changelogs, opens a `release/vX.Y.Z` PR |
| GHCR Cleanup | `ghcr-cleanup.yml` | Weekly (Sunday 00:00 UTC), `workflow_dispatch` | Deletes untagged and old GHCR image versions |

Dependabot (`.github/dependabot.yml`) opens dependency PRs, which go through the same CI workflow.

The repository restricts which actions can run. Allowed: GitHub-owned actions (`actions/*`), `docker/setup-buildx-action`, `docker/login-action`, `docker/build-push-action`, `aquasecurity/trivy-action`, `aquasecurity/setup-trivy`, and `dorny/paths-filter@v3` / `@v4`. Any other third-party action must be added to the repository's Actions allowlist first.

### CI Jobs at a Glance

| Check name | Job key | Runs when | Purpose |
|------------|---------|-----------|---------|
| Detect Changed Paths | `path-filter` | Every run | Decides which test jobs run |
| Lockfile Integrity | `lockfile-integrity` | Every run | `npm ci` in root, `backend/` and `frontend/` |
| Security Audit | `security-audit` | Every run | `npm audit --audit-level=high` for backend and frontend |
| Backend Unit Tests | `backend-unit-tests` | Backend or shared changes | Jest (non-PBT), test-naming check, runtime budget |
| Backend PBT Shard 1/3, 2/3, 3/3 | `backend-pbt-shards` | Backend or shared changes | Jest PBT in 3 shards; shard 1 also runs backup suites and PBT guardrails |
| Backend PBT Tests | `backend-pbt-tests` | Backend or shared changes | Aggregates the shard results |
| Backend Tests Status | `backend-tests-status` | Every run | **Required check** — passes if backend tests passed or were legitimately skipped |
| Frontend Tests | `frontend-tests` | Frontend or shared changes | Vitest, test-naming and raw-fetch checks, runtime budget |
| Frontend Tests Status | `frontend-tests-status` | Every run | **Required check** — passes if frontend tests passed or were legitimately skipped |
| Test Health Report | `test-health-report` | Every run | Writes test-file counts by category to the workflow summary |
| Build and Push to GHCR | `build-and-push-ghcr` | Push / `workflow_dispatch` on `main` only | Build, Trivy scan, push to GHCR, GitHub release |
| Deployment Health Check | `deployment-health-check` | After `build-and-push-ghcr` | Boots the image, health-checks it, rollback check, deployment record |

### PR-Based CI Integration

**CI runs automatically on all Pull Requests to main.** A repository ruleset on `main` enforces:

- Pull requests required — direct pushes are blocked (no approving reviews required)
- Required status checks `Backend Tests Status` and `Frontend Tests Status`, with the branch up to date with `main`
- Signed (verified) commits
- Merge commits only — squash and rebase are disabled
- No force pushes or branch deletion

> **Note**: The individual test jobs (`Backend Unit Tests`, `Backend PBT Shard 1/3`, etc.) are not required status checks. The aggregator jobs handle branch protection, allowing tests to be skipped when irrelevant files change while still satisfying branch protection requirements. `Security Audit`, `Lockfile Integrity` and `Test Health Report` are not required either — a failure there is visible on the PR but does not block the merge button.

When you create a PR (using `promote-feature.ps1` or `create-pr-from-main.ps1`):
1. GitHub Actions triggers the CI workflow
2. The path filter decides which test jobs run; the selected jobs run in parallel
3. Results appear as status checks on the PR
4. You can merge once the required checks pass

## Security Scanning

The CI pipeline includes automated security scanning to catch vulnerabilities before they reach production.

### Dependency Vulnerability Scanning

A `security-audit` job runs `npm audit --audit-level=high` on both backend and frontend dependencies during every CI run, including Dependabot PRs. It runs in parallel with the test jobs.

- Each audit step uses `continue-on-error`; a final step fails the job if either audit found `high` or `critical` vulnerabilities
- `low` and `moderate` findings don't fail the job
- Results are reported in the GitHub Actions workflow summary
- It is not a required status check, and `build-and-push-ghcr` does not depend on it — a failing audit blocks neither merging nor the image push

### Docker Image Scanning (Trivy)

The `build-and-push-ghcr` job scans every Docker image with Trivy before pushing to GHCR. Trivy runs as a container (`aquasec/trivy:0.57.1` via `docker run`), not through `aquasecurity/trivy-action`. The image is built and loaded locally, scanned, then pushed only if the gate passes.

**Build → Scan → Push Flow:**

1. **Build + Load** — `docker/build-push-action@v7` with `load: true`, `push: false` builds the image once into the local Docker daemon (tagged with the short SHA and `v<version>`), using the GitHub Actions build cache
2. **Scan** — a single Trivy run with `--format json --exit-code 0`, severities `CRITICAL,HIGH,MEDIUM,LOW`, vuln types `os,library`. The vulnerability DB is fetched from `ghcr.io/aquasecurity/trivy-db:2` with `mirror.gcr.io/aquasec/trivy-db:2` as fallback — up to 3 attempts across both, with 15s/30s backoff
3. **Gate** — `jq` counts findings per severity in `trivy-results.json`; the job fails if there is **any CRITICAL** finding. HIGH, MEDIUM and LOW findings are reported but don't block
4. **Table Report** — `trivy convert` writes `trivy-results.txt` from the JSON
5. **Artifact Upload** — `actions/upload-artifact@v7` uploads `trivy-scan-<sha>` (`trivy-results.txt` + `trivy-results.json`) with 30-day retention (`if: always()`)
6. **Workflow Summary** — vulnerability counts by severity; if no report exists, the summary states the image was not assessed
7. **Push** — `docker push` pushes the already-built SHA and version tags (no rebuild); only reached if the gate passed

Because the scan itself always exits 0, a scanner failure can't masquerade as a finding: if all attempts fail, the job errors with "scanner infrastructure failure, NOT a vulnerability finding" and the image is not pushed.

**Behavior by result:**

| Result | Job | Push | Artifact |
|--------|-----|------|----------|
| One or more CRITICAL | ❌ Fails | Blocked | ✅ Uploaded |
| HIGH / MEDIUM / LOW only | ✅ Passes | Proceeds | ✅ Uploaded |
| No vulnerabilities | ✅ Passes | Proceeds | ✅ Uploaded |
| Trivy could not run (3 attempts × 2 DB sources) | ❌ Fails | Blocked | No report |

### Dependabot

Automated dependency update PRs are configured in `.github/dependabot.yml`:

| Ecosystem | Directory | Schedule | PR Limit | Labels | Commit prefix |
|-----------|-----------|----------|----------|--------|---------------|
| npm | `/backend` | Weekly (Monday) | 5 | `dependencies`, `backend` | `deps(backend):` |
| npm | `/frontend` | Weekly (Monday) | 5 | `dependencies`, `frontend` | `deps(frontend):` |
| npm | `/` | Weekly (Monday) | 3 | `dependencies` | `deps(root):` |
| github-actions | `/` | Monthly | 5 (default) | `ci`, `dependencies` | `ci:` |

- npm minor and patch updates are grouped (`minor-and-patch`) per directory; major updates arrive as separate PRs
- Frontend: `vitest` and `@vitest/*` are grouped (including majors) because `@vitest/ui` pins an exact `vitest` peer — separate PRs would both fail to install
- Root: major updates of `eslint` and `@eslint/js` are ignored until `eslint-plugin-react` and `eslint-plugin-jsx-a11y` support ESLint 10

Dependabot PRs run the full CI workflow like any other PR. The GHCR build and deployment jobs never run for them (they only run on `main`, and also exclude `dependabot[bot]` explicitly).

### Security Policy

The repository includes a `SECURITY.md` file that describes how to report vulnerabilities, the scope of security considerations, and supported versions.

## Deployment Health Checks & Rollback

After `build-and-push-ghcr` pushes the image on `main`, the `deployment-health-check` job verifies the image boots. Everything runs inside the CI runner — the job does not deploy to any real environment and does not move GHCR tags.

### Health Check Flow

1. Records the "previous deployment" SHA from the `org.opencontainers.image.revision` label of the current `:latest` image in GHCR (`:latest` is set by the local promotion script, not by CI)
2. Pulls the new SHA-tagged image and starts it with an empty temporary `/config` directory mounted, `NODE_ENV=production`, `LOG_LEVEL=info`, port 2424
3. Runs HTTP health checks against backend (`/api/health`) and frontend (`/`). There is no fixed initial wait — the retries with exponential backoff cover startup
4. Collects container logs if either check failed

The health check script is `scripts/health-check.sh <endpoint_url> [max_retries] [retry_delay] [timeout]`:

| Parameter | Script default | CI value | Description |
|-----------|----------------|----------|-------------|
| `endpoint_url` | (required) | `http://localhost:2424/api/health`, `http://localhost:2424/` | URL to check |
| `max_retries` | 10 | `health_check_retries` input (default 10) | Number of attempts |
| `retry_delay` | 5s | 3s | Initial delay (doubles each retry) |
| `timeout` | 30s | `health_check_timeout` input (default 30) | HTTP request timeout |

### Automatic Rollback

If either health check fails:

1. If no previous SHA was found (no `:latest` image, or it has the same SHA), rollback is skipped and the job fails
2. Otherwise `scripts/rollback.sh` pulls the previous SHA image and starts it in the runner
3. Health checks run against the rolled-back container (5 attempts, 3s initial delay, 30s timeout)
4. The job fails in every case (the new image is broken); the summary states whether the rollback image passed or manual intervention is required

All rollback actions are logged with timestamps in the workflow summary.

### Deployment State Tracking

Every run generates a metadata record uploaded as the `deployment-<sha>` artifact (30-day retention):

```json
{
  "sha": "abc1234",
  "timestamp": "2026-10-04T14:30:00Z",
  "environment": "production",
  "version": "1.11.0",
  "status": "success",
  "healthChecks": {
    "backend": "passed",
    "frontend": "passed"
  }
}
```

`status` is `success`, `rolled_back` (adds a `rollbackInfo` object) or `failed`.

Docker images also include OCI labels for traceability (`org.opencontainers.image.version`, `org.opencontainers.image.revision`, etc.). The `deployment-<sha>` artifacts are kept for 30 days and can be downloaded from the workflow run.

## Workflow Configuration

The CI workflow supports `workflow_dispatch` with configurable inputs:

| Input | Default | Description |
|-------|---------|-------------|
| `health_check_timeout` | `30` | HTTP timeout in seconds |
| `health_check_retries` | `10` | Number of retry attempts |

These can be set when manually triggering the workflow from the Actions tab. They only affect the deployment health check, which only runs when the workflow is dispatched on `main`.

## CI Workflow

### Location

`.github/workflows/ci.yml`

### Triggers

| Event | Branches | Description |
|-------|----------|-------------|
| `push` | `main` | Runs on every push to main (direct or merged PR) |
| `pull_request` | `main` | Runs when PRs are opened/updated against main |
| `workflow_dispatch` | any (manual) | Manual run; build/deploy jobs only run when dispatched on `main` |

> **Note**: Feature branches do **not** trigger CI via direct pushes. CI runs on feature branches through the `pull_request` event when a PR is opened against `main`. This matches the branch protection model where all changes go through PRs.

Both `push` and `pull_request` triggers use `paths-ignore` to skip CI for documentation-only changes (`docs/**`, `*.md`, `CHANGELOG.md`).

Runs are grouped by workflow and ref with `cancel-in-progress: true`, so a new push to a PR branch cancels the previous run for that branch.

### Jobs

The CI workflow runs multiple parallel job groups:

#### Path Filter

```yaml
path-filter:
  name: Detect Changed Paths
  runs-on: ubuntu-latest
```

- Evaluates which files changed using `dorny/paths-filter@v4`
- Sets outputs for backend, frontend, and shared infrastructure changes
- Generates workflow summary showing which tests will run
- Detects "empty" changes (nothing matched any filter) and ensures all tests run in that case

**Path Patterns:**
- **Backend**: `backend/**`
- **Frontend**: `frontend/**`
- **Shared**: `scripts/**`, `Dockerfile`, `docker-compose*.yml`, `.github/workflows/**`, `.dockerignore`, `package.json`, `package-lock.json`

**Filtering Logic:**
- Frontend-only changes → Skip backend tests
- Backend-only changes → Skip frontend tests
- Shared infrastructure changes → Run all tests
- Mixed changes → Run all tests
- No matching changes (e.g. only `eslint.config.js` or `.github/dependabot.yml`) → Run all tests (fail-safe)
- Path filter job failed → Run all tests (fail-safe)

#### Lockfile Integrity

```yaml
lockfile-integrity:
  name: Lockfile Integrity
  runs-on: ubuntu-latest
```

- Runs `npm ci --ignore-scripts --no-audit --no-fund` in the root, `backend/` and `frontend/`
- Catches committed lockfiles that `npm ci` rejects (e.g. cross-platform optional dependencies such as `@emnapi/*` pruned when npm ran on Windows) before they break the release workflow's `npm ci` build
- Not gated by the path filter

#### Security Audit

```yaml
security-audit:
  name: Security Audit
  runs-on: ubuntu-latest
```

- Runs `npm audit --audit-level=high` on backend and frontend
- Reports results in workflow summary
- Fails only on high/critical vulnerabilities
- Runs in parallel with test jobs; not a required check

#### Backend Unit Tests

```yaml
backend-unit-tests:
  runs-on: ubuntu-latest
  needs: path-filter
  working-directory: backend
```

- **Node.js**: Version 22, npm cache, `npm install`
- **Checks**: `npx jest --config ../scripts/jest.config.js` (unit tests for the CI enforcement scripts in `scripts/__tests__/`)
- **Test Command**: `npx cross-env NODE_ENV=test CI=true jest --bail --testPathIgnorePatterns=pbt --testPathIgnorePatterns="backup.*(integration|pbt)"` (backup suites run in PBT shard 1)
- **Runtime budget**: `check-test-budget.js backend-unit-tests` (see [Runtime Budgets](#runtime-budgets))
- **Conditional Execution**: Runs only if backend or shared files changed (or no filter matched, or path-filter failed)

#### Backend PBT Tests (Sharded)

```yaml
backend-pbt-shards:
  name: Backend PBT Shard ${{ matrix.shard }}
  runs-on: ubuntu-latest
  needs: path-filter
  strategy:
    fail-fast: true
    matrix:
      shard: ['1/3', '2/3', '3/3']
```

- **Node.js**: Version 22, npm cache, `npm install`
- **Test Command**: `npx cross-env NODE_ENV=test CI=true FAST_CHECK_NUM_RUNS=15 jest --bail --testPathPatterns=pbt --testPathIgnorePatterns="backup" --shard=N/3`
- **Shard 1 only**: `npm run test:backup:ci` (backup integration and PBT suites, `--runInBand`), then `node ../scripts/validate-pbt-guardrails.js`
- **Runtime budget**: `check-test-budget.js backend-pbt-shard` per shard; shard 1's elapsed time includes the backup suites and guardrail check
- **Summary Job**: `Backend PBT Tests` fails unless all shards succeeded
- **Conditional Execution**: Same as Backend Unit Tests

#### Backend Tests Status

```yaml
backend-tests-status:
  runs-on: ubuntu-latest
  needs: [path-filter, backend-unit-tests, backend-pbt-tests]
  if: always()
```

- **Purpose**: Status aggregator job for branch protection compatibility
- **Behavior**: 
  - If tests ran: Verifies they passed
  - If tests skipped: Reports success
- **Branch Protection**: This job is the required status check (not the individual test jobs)

#### Frontend Tests

```yaml
frontend-tests:
  runs-on: ubuntu-latest
  needs: path-filter
  working-directory: frontend
```

- **Node.js**: Version 22, npm cache, `npm install`
- **Checks**: `node ../scripts/validate-no-raw-fetch.js`
- **Test Command**: `npx vitest --run --exclude '**/App.performance.test.jsx'`
- **CI settings** (`vitest.config.js` with `CI=true`): 2 forks, `retry: 2`, `bail: 1`, verbose reporter
- **Runtime budget**: `check-test-budget.js frontend-tests`
- **Conditional Execution**: Runs only if frontend or shared files changed (or no filter matched, or path-filter failed)

#### Frontend Tests Status

```yaml
frontend-tests-status:
  runs-on: ubuntu-latest
  needs: [path-filter, frontend-tests]
  if: always()
```

- **Purpose**: Status aggregator job for branch protection compatibility
- **Behavior**: 
  - If tests ran: Verifies they passed
  - If tests skipped: Reports success
- **Branch Protection**: This job is the required status check (not the individual test job)

#### Test Health Report

```yaml
test-health-report:
  runs-on: ubuntu-latest
  needs: [backend-unit-tests, backend-pbt-tests, frontend-tests]
  if: always()
```

- Runs `node scripts/report-test-health.js >> $GITHUB_STEP_SUMMARY`
- Counts test files by category (unit, integration, PBT, transition `*.test.*`) — informational only

### Runtime Budgets

Each test job records its start time and finishes with a `Check runtime budget` step (`if: always()`) that runs `scripts/check-test-budget.js <job-name> <elapsed-seconds>` against `test-budget.json`:

| Budget key | Used by | `maxSeconds` |
|------------|---------|--------------|
| `backend-unit-tests` | Backend Unit Tests | 180 |
| `backend-pbt-shard` | Each Backend PBT Shard | 210 |
| `frontend-tests` | Frontend Tests | 480 |

- Exceeding the budget fails the job **even if every test passed**
- Budgets are ~2x the observed median so only a material slowdown trips them (see the comments in `test-budget.json`)
- Override: `[skip-budget]` in the commit message. The script reads `github.event.head_commit.message`, which only exists on `push` events — the override has no effect on `pull_request` runs

### Performance Test Exclusion

The frontend tests exclude `App.performance.test.jsx` because:
- It asserts on wall-clock timings (`performance.now()`), which are unreliable on shared CI runners
- It's designed for local performance profiling

To run performance tests locally:
```bash
cd frontend
npx vitest run App.performance.test.jsx
```

### Parallel Execution

The test jobs (backend unit, three PBT shards, frontend) run simultaneously for fast feedback:
- **Backend**: Jest runs test files across parallel workers. Each worker uses its own SQLite database (`test-expenses-worker-{JEST_WORKER_ID}.db`) inside the isolated `backend/.test-config/` tree that `jest.globalSetup.js` recreates at the start of every run
- **Backend PBT**: split across 3 shards with `--shard`, each with parallel workers
- **Frontend**: Vitest `forks` pool, capped at 2 forks in CI

## Checking CI Status on PRs

When you create a PR, CI status is displayed directly on the PR page.

### Status Indicators

| Icon | Status | Meaning |
|------|--------|---------|
| 🟡 | Pending | CI is running |
| ✅ | Passed | All checks passed - safe to merge |
| ❌ | Failed | One or more checks failed - fix before merging |

### Viewing CI Results

#### From the PR Page

1. Scroll to the bottom of the PR conversation
2. Look for the "Checks" section
3. Click "Details" next to any check to see logs

#### From the Actions Tab

1. Go to your repository on GitHub
2. Click **Actions** in the top navigation
3. Find the workflow run for your PR
4. Click to see detailed logs

### Understanding Check Results

Each PR shows these checks:
- **Detect Changed Paths** — Path filter
- **Lockfile Integrity** — `npm ci` in root, backend and frontend
- **Security Audit** — npm audit on backend and frontend dependencies
- **Backend Unit Tests** — Jest unit tests from `backend/` (skipped when no backend/shared changes)
- **Backend PBT Shard 1/3, 2/3, 3/3** — PBT test shards (run in parallel)
- **Backend PBT Tests** — Summary check that passes when all shards pass
- **Backend Tests Status** — Required aggregator
- **Frontend Tests** — Vitest tests from `frontend/` (skipped when no frontend/shared changes)
- **Frontend Tests Status** — Required aggregator
- **Test Health Report** — Test-file counts (informational)
- **Build and Push to GHCR**, **Deployment Health Check** — shown as skipped on PRs

PRs touching version files also show the **Version Consistency Check** workflow (`Guard Against PR Version Bumps`, or `Validate Version Consistency` on `release/*` branches).

On push to main, these additional jobs run:
- **Build and Push to GHCR** — Builds, scans and pushes the Docker image to GHCR
- **Deployment Health Check** — Verifies the image boots, runs the rollback check on failure

Branch protection requires only `Backend Tests Status` and `Frontend Tests Status` to pass (with the branch up to date). GitHub blocks the merge button until both pass.

## Merging PRs After CI Passes

Once CI passes, you can merge the PR.

### Method 1: GitHub CLI

```bash
# Merge and delete the branch
gh pr merge --merge --delete-branch

# Or specify the PR number/branch
gh pr merge 123 --merge --delete-branch
gh pr merge feature/your-feature --merge --delete-branch
```

### Method 2: GitHub Web UI

1. Go to the PR page
2. Click the green "Merge pull request" button
3. Confirm the merge
4. Optionally delete the branch

### After Merging

Update your local main branch:

```bash
git checkout main
git pull origin main
```

### Merge Options

| Option | Command | Status |
|--------|---------|--------|
| Merge commit | `--merge` | ✅ Available (only option) |

Merge commits only — squash and rebase are disabled via GitHub repository ruleset. This preserves signed commits and branch topology.

For PRs: `gh pr merge <number> --merge --delete-branch`

## Docker Build & Push (GHCR)

### Location

Integrated into `.github/workflows/ci.yml` as the `build-and-push-ghcr` job.

### Triggers

| Event | Branches | Description |
|-------|----------|-------------|
| `push` | `main` | Runs after tests pass when code is merged to main |
| `workflow_dispatch` | `main` | Manual run on main |

The job requires `Backend Tests Status` and `Frontend Tests Status` to succeed and never runs for `dependabot[bot]` or on `pull_request` events. It does not wait for `Security Audit` or `Lockfile Integrity`.

### What It Does

1. Checks out the repository
2. Sets up Docker Buildx
3. Authenticates to GHCR
4. Builds the Docker image once and loads it into the local Docker daemon (tagged `<short-sha>` and `v<version>` from `backend/package.json`)
5. Runs the Trivy scan and gate — fails on any CRITICAL finding (see [Docker Image Scanning](#docker-image-scanning-trivy))
6. Uploads the scan artifact and writes the workflow summary
7. Pushes the already-built SHA and version tags to `ghcr.io/krazykrazz/expense-tracker` (no rebuild)
8. Generates `docker-compose-v<version>.yml` from `docker-compose.ghcr.yml` and creates GitHub release `v<version>` with it attached (or uploads the asset if the release already exists)

### GHCR Integration

**The CI workflow builds and pushes images to GHCR on merge to main.** The `build-and-push-ghcr` job in `ci.yml` handles this automatically:

- Builds the Docker image after the required test checks pass
- Pushes to `ghcr.io/krazykrazz/expense-tracker` with `<short-sha>` and `v<version>` tags. CI does **not** push `latest` or `staging` — those are set by the local promotion script
- Creates GitHub releases with docker-compose files attached
- Includes OCI image labels for deployment traceability

#### Deployment Health Check

```yaml
deployment-health-check:
  runs-on: ubuntu-latest
  needs: [build-and-push-ghcr]
  if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && github.actor != 'dependabot[bot]'
```

- Pulls the newly built image and starts a container in the runner
- Runs health checks on backend and frontend endpoints
- On failure: runs the previous `:latest` image and health-checks it (see [Automatic Rollback](#automatic-rollback))
- Generates deployment metadata artifact (30-day retention)
- Reports results in workflow summary

### Local Deployment

For local staging/production deployment, use the pull-and-promote script which pulls CI-built images from GHCR:

```powershell
# Pull CI-built image and promote to staging
.\scripts\build-and-push.ps1 -Environment staging

# Promote to production
.\scripts\build-and-push.ps1 -Environment latest
```

CI is the single source of truth for image builds. The local script pulls the CI-built SHA image from GHCR and retags it for the target environment.

### Registry Architecture

GHCR is the single registry. CI pushes SHA and version tags on merge to main. The local script promotes images to `staging` and `latest` tags by pulling and retagging.

## Release Workflow

`.github/workflows/release.yml` ("Create Release PR") is run manually from **Actions → Create Release PR → Run workflow** with:

| Input | Values | Description |
|-------|--------|-------------|
| `bump_type` | `PATCH` / `MINOR` / `MAJOR` | Semver bump applied to `backend/package.json`'s version |
| `description` | text | Changelog headline and PR title suffix |
| `auto_merge` | boolean (default `true`) | Enable auto-merge once required checks pass |

It:
1. Creates `release/vX.Y.Z` from `main` and pushes it
2. Bumps `backend/package.json` and `frontend/package.json`, and inserts a new entry into `CHANGELOG.md`, `frontend/src/utils/changelog.js`, `frontend/src/components/system/BackupSettings.jsx` and `frontend/src/components/system/SystemModal.jsx`
3. Builds the frontend (`npm ci && npm run build`)
4. Commits through the GitHub API (`gh api graphql` → `createCommitOnBranch`) so the commit is signed by GitHub and shows as **Verified**, as the ruleset requires. A plain `git push` from CI would be unsigned; a third-party commit action would be blocked by the Actions allowlist
5. Opens the PR with `gh pr create`
6. If `auto_merge` is set, enables auto-merge (merge commit, delete branch) using the `RELEASE_PAT` secret. A merge performed with `GITHUB_TOKEN` would not trigger the `push` CI run on `main`, so the GHCR image would never be built

After the merge, CI builds and pushes the image; promote it locally with `.\scripts\build-and-push.ps1 -Environment staging` and then `-Environment latest`. See [Deployment Workflow](../deployment/DEPLOYMENT_WORKFLOW.md).

## Version Consistency Check

`.github/workflows/version-check.yml` runs on PRs to `main` that touch `frontend/package.json`, `backend/package.json`, `BackupSettings.jsx`, `SystemModal.jsx`, `frontend/src/utils/changelog.js` or `CHANGELOG.md`:

- **Non-`release/*` branches** — `Guard Against PR Version Bumps` fails if the diff adds a version string to any of those files except `CHANGELOG.md`. Version bumps belong in the Release workflow
- **`release/*` branches** — `Validate Version Consistency` checks that `backend/package.json`, `frontend/package.json` and `changelog.js` agree, and that `CHANGELOG.md`, `BackupSettings.jsx` and `SystemModal.jsx` contain the version

The same rule is enforced locally by the pre-commit hook (`scripts/git-hooks/pre-commit`, installed with `.\scripts\install-git-hooks.ps1`), which blocks staged version changes on `feature/*` and `hotfix/*` branches.

## GHCR Cleanup

`.github/workflows/ghcr-cleanup.yml` runs every Sunday at 00:00 UTC (and on demand):

1. **Delete Untagged Images** — removes all untagged `expense-tracker` versions
2. **Delete Old Tagged Images** — keeps the 20 most recent versions; tags matching `vX.Y.Z`, `latest` and `staging` are never deleted. Older SHA-only tags are removed

## Viewing Workflow Results

### GitHub Actions Tab

1. Go to your repository on GitHub
2. Click **Actions** in the top navigation
3. Select a workflow from the left sidebar
4. Click on a specific run to see details

### Workflow Run Details

Each run shows:
- **Summary**: Overall status, path-filter table, security audit, test health, Trivy and deployment summaries
- **Jobs**: Individual job status (see [CI Jobs at a Glance](#ci-jobs-at-a-glance))
- **Logs**: Detailed output from each step
- **Artifacts**: `trivy-scan-<sha>` and `deployment-<sha>` (main only, 30-day retention)

### Pull Request Checks

When you open a PR:
1. CI workflow runs automatically
2. Status appears in the PR's "Checks" section
3. Click "Details" to view logs
4. Merge is blocked until the required checks pass (branch protection is active)

## Troubleshooting

### Test and Pipeline Issues

#### Path Filtering Not Working as Expected

**Symptoms:**
- Tests run when they should be skipped
- Tests skip when they should run

**Debug steps:**
1. Check the workflow summary for path filter results
2. Verify file patterns match your changes
3. Look for shared infrastructure files in your PR
4. Check whether any changed file matched a filter at all

**Path filter fail-safe behavior:**
- If path-filter job fails → All tests run
- If no changed file matches any filter → All tests run
- If shared files changed → All tests run

#### Tests Skipped But Branch Protection Blocks Merge

**This should not happen** with the status aggregator jobs. If it does:
1. Check that branch protection requires `Backend Tests Status` and `Frontend Tests Status` (not the individual test jobs)
2. Verify the aggregator jobs ran and reported success
3. Check workflow logs for the aggregator job output

#### Required Checks Pending on a Docs-Only PR

CI is skipped entirely by `paths-ignore` when a PR only changes `docs/**`, root `*.md` files or `CHANGELOG.md`. GitHub leaves required checks from a workflow skipped by path filtering in a pending state, so `Backend Tests Status` and `Frontend Tests Status` are never reported for such a PR.

#### Runtime Budget Exceeded

`Check runtime budget` fails with `❌ Budget exceeded! Xs > Ys` even though every test passed.

1. Compare the elapsed time with the budget in `test-budget.json` (see [Runtime Budgets](#runtime-budgets))
2. If it was a slow runner, re-run the failed jobs
3. If the suite really got slower, find the regression or raise the budget in `test-budget.json` with a justification in its `description`
4. `[skip-budget]` in the commit message only works for `push` runs on `main`, not for PR runs

#### Lockfile Integrity Fails

`npm ci` rejected a committed `package-lock.json`. Reproduce with `npm ci --ignore-scripts` in the failing directory (`.`, `backend` or `frontend`). A typical cause is a lockfile regenerated on Windows that pruned cross-platform optional dependencies (e.g. `@emnapi/*`).

#### Frontend Tests Fail With All Tests Passing

Vitest fails the run when it reports **Unhandled Errors** (e.g. a rejected promise nobody awaited, or a timer/callback firing after the test environment was torn down), even if every test passed. Find the "Unhandled Errors" block in the log and fix the source. See [CI Test Reliability](./CI_TEST_RELIABILITY.md).

#### Tests Pass Locally But Fail in CI

**Possible causes:**
- Missing dependencies in `package.json`
- Environment-specific code paths
- Timing-sensitive tests
- File path case sensitivity (Linux is case-sensitive)
- CI-only settings: `CI=true` enables retries, longer timeouts and the fixed PBT seed `12345`; PBT shards use `FAST_CHECK_NUM_RUNS=15`

**Solutions:**
- Run `npm ci` locally to match CI environment
- Check for hardcoded paths
- Add appropriate test timeouts
- Use consistent file naming
- Reproduce PBT failures with the CI seed (see [CI Test Reliability](./CI_TEST_RELIABILITY.md))

#### CI Workflow Not Triggering

**Check:**
- For direct pushes: only `main` triggers CI
- For feature branches: CI triggers via `pull_request` when a PR is opened against `main`
- Workflow file is in `.github/workflows/`
- YAML syntax is valid
- GitHub Actions is enabled for the repository
- Changes are not exclusively in `paths-ignore` paths (`docs/**`, root `*.md`, `CHANGELOG.md`)
- A newer push to the same branch cancels the older run (`cancel-in-progress`)

#### Slow CI Runs

**Optimizations already in place:**
- npm dependency caching
- Parallel job execution and 3-way PBT sharding
- Path-based test filtering
- Docker BuildKit cache (`type=gha`)
- Performance test exclusion

**Additional options:**
- Cache build artifacts
- Use larger runners (GitHub paid feature)

#### Docker Build Fails

**Common causes:**
- Dockerfile syntax errors
- Missing files in build context
- Invalid base image reference

**Debug steps:**
1. Check the build logs in Actions tab
2. Try building locally: `docker build -t test .`
3. Verify all required files are committed

### Security Scanning Issues

#### npm audit reports high/critical vulnerabilities

1. Check the workflow summary for the audit report (lists affected packages and severities)
2. Run locally to see details:
   ```bash
   cd backend && npm audit
   cd frontend && npm audit
   ```
3. Fix with `npm audit fix` if safe, or update the specific package

If `npm audit` itself fails (registry or network error), the audit step is marked failed and the job fails the same way; check the step log to tell the two apart.

#### Trivy reports CRITICAL vulnerabilities

1. Download the `trivy-scan-<sha>` artifact from the workflow run
2. Review which packages/layers are affected
3. Common fixes:
   - Update the base image in `Dockerfile` (e.g., newer Node.js image)
   - Update OS-level packages in the Dockerfile
   - Update application dependencies
4. Push the fix; the image is rebuilt and rescanned

#### Trivy could not run

The job fails with "Trivy could not complete the scan after 3 attempts against 2 DB mirrors" — a scanner infrastructure problem (usually the vulnerability DB download), not a finding. The image was not pushed. Re-run the failed job.

#### Dependabot PRs failing CI

Dependabot PRs run the full CI workflow. If they fail:
1. Check if the dependency update introduced breaking changes
2. Review the PR diff for major version bumps
3. Close the PR and manually update with testing if needed

### Health Check Issues

#### Health check fails after the GHCR push

1. Check the workflow summary for which endpoint failed (backend `/api/health` or frontend `/`)
2. Expand the "Collect container logs on failure" step for container output
3. Common causes:
   - Application crash on startup (check container logs for errors)
   - Database initialization failure
   - Missing environment variables

Differences from a local run: CI runs on `ubuntu-latest`, uses `NODE_ENV=production` and `LOG_LEVEL=info`, and mounts an empty temporary `/config`, so the container starts with no existing database.

#### Health check timeout

1. CI uses up to `health_check_retries` attempts (default 10) with a 3s initial delay that doubles each retry, and a `health_check_timeout` (default 30s) per request
2. Both can be raised via `workflow_dispatch` inputs when running the workflow manually on `main`
3. Check whether the application has slow startup (database migrations, etc.)

#### Understanding health check retry output

```
Health check attempt 1/10 for http://localhost:2424/api/health
✗ Health check failed: http://localhost:2424/api/health returned 000
  Waiting 3s before retry (exponential backoff)...
Health check attempt 2/10 for http://localhost:2424/api/health
✗ Health check failed: http://localhost:2424/api/health returned 503
  Waiting 6s before retry (exponential backoff)...
```

- `000` = no response (connection refused or timed out — container not ready)
- `503` = service unavailable (app starting up)
- `500` = server error (check container logs)

#### Rollback outcomes

Check the "Rollback Results" section of the workflow summary:
- **SKIPPED (no previous deployment available)** — no `:latest` image in GHCR, or it has the same SHA. Fix the application issue and push again
- **SUCCESSFUL** — the previous image boots; only the new image is broken. The job still fails
- **FAILED / Manual intervention required** — the previous image failed too. Check the container logs, identify what changed, fix and push

The `deployment-<sha>` artifact records `status: rolled_back` with `rollbackInfo`, or `failed`.

### Viewing Detailed Logs

1. Go to the failed workflow run
2. Click on the failed job
3. Expand the failed step
4. Look for error messages in red

### Re-running Failed Workflows

1. Go to the failed workflow run
2. Click "Re-run all jobs" or "Re-run failed jobs"
3. Useful for transient failures (network issues, slow runners, Trivy DB outages)

## Configuration Reference

### Environment Variables

| Variable | Job | Value | Purpose |
|----------|-----|-------|---------|
| `NODE_ENV` | Backend test jobs | `test` | Set by `cross-env` in the Jest command |
| `CI` | All | `true` | Set by GitHub (also passed explicitly to Jest); enables CI test settings |
| `GITHUB_ACTIONS` | All | `true` | Set by GitHub; treated like `CI=true` by test configs |
| `FAST_CHECK_NUM_RUNS` | Backend PBT shards | `15` | fast-check iterations per property |
| `COMMIT_MESSAGE` | Budget steps | head commit message (push only) | `[skip-budget]` override |

### Caching

npm dependencies are cached in the test and audit jobs using:
```yaml
cache: 'npm'
cache-dependency-path: backend/package-lock.json  # or frontend/
```

Cache is invalidated when `package-lock.json` changes. Lockfile Integrity runs without a cache. Docker layers use the GitHub Actions cache (`cache-from/cache-to: type=gha`).

### Timeouts

Default GitHub Actions timeout: 6 hours per job (no job overrides it)

Individual test timeouts:
- Jest (backend, `jest.setup.js`): 30s locally, 45s in CI
- Vitest (frontend, `vitest.config.js`): 30s locally, 45s in CI; hooks 20s / 30s

## Best Practices

### For Feature Development

1. Push early and often to get CI feedback
2. Fix CI failures before requesting review
3. Don't merge with failing checks

### For Test Writing

1. Keep tests fast and deterministic
2. Avoid timing-dependent assertions
3. Use appropriate mocking for external services
4. Don't rely on specific file system state

### For Workflow Maintenance

1. Pin action versions to a major tag (e.g., `@v7` not `@latest`)
2. Only use actions on the repository allowlist (see [Overview](#overview))
3. Use caching to speed up builds
4. Keep workflows simple and focused
5. Document any non-obvious configurations

## Related Documentation

- [CI Test Reliability](./CI_TEST_RELIABILITY.md) - CI test settings, PBT helpers, parallel execution
- [CI Enforcement Scripts](../../.github/instructions/ci-scripts.instructions.md) - Guardrail scripts run by CI
- [Feature Branch Workflow](./FEATURE_BRANCH_WORKFLOW.md) - Branch strategy and promotion process
- [Deployment Workflow](../deployment/DEPLOYMENT_WORKFLOW.md) - Release and promotion process
- [Release Instructions](../../.github/instructions/release.instructions.md) - Steps before releasing
- [Docker Deployment Guide](../guides/DOCKER_DEPLOYMENT.md) - Docker setup and usage

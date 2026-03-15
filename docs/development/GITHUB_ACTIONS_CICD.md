# GitHub Actions CI/CD

**Last Updated**: February 12, 2026  
**Status**: Active

This document provides detailed documentation for the GitHub Actions CI/CD workflows used in the Expense Tracker application.

## Overview

The project uses a single GitHub Actions workflow:

1. **CI Workflow** (`ci.yml`) - Automated testing on pushes and pull requests, plus Docker image builds and pushes to GHCR on merge to main

### PR-Based CI Integration

**CI runs automatically on all Pull Requests to main.** This is the primary way to verify code before it reaches the main branch. Branch protection on `main` enforces that all three status checks must pass before merging.

**Required Status Checks:**
- `Backend Tests Status` — Aggregator for backend unit and PBT tests
- `Frontend Tests Status` — Aggregator for frontend tests

> **Note**: The individual test jobs (`Backend Unit Tests`, `Backend PBT Shard 1/3`, etc.) are not required status checks. The aggregator jobs handle branch protection, allowing tests to be skipped when irrelevant files change while still satisfying branch protection requirements.

When you create a PR (using `promote-feature.ps1` or `create-pr-from-main.ps1`):
1. GitHub Actions triggers the CI workflow
2. Both backend and frontend tests run in parallel
3. Results appear as status checks on the PR
4. You can merge once all checks pass

## Security Scanning

The CI pipeline includes automated security scanning to catch vulnerabilities before they reach production.

### Dependency Vulnerability Scanning

A `security-audit` job runs `npm audit` on both backend and frontend dependencies during every CI run. It runs in parallel with test jobs and does not block them.

- Fails the check only on `high` or `critical` severity vulnerabilities
- `low` and `moderate` findings are logged as warnings but don't fail the build
- Results are reported in the GitHub Actions workflow summary
- Skipped for Dependabot PRs (`github.actor != 'dependabot[bot]'`)

### Docker Image Scanning (Trivy)

The `build-and-push-ghcr` job scans every Docker image for vulnerabilities using [Trivy](https://github.com/aquasecurity/trivy-action) before pushing to GHCR. The build uses a two-step approach: build and load the image locally, scan it, then push only if the scan passes.

**Build → Scan → Push Flow:**

1. **Build + Load** — `docker/build-push-action@v5` with `load: true`, `push: false` builds the image once and loads it into the local Docker daemon (tagged with both SHA and version)
2. **Trivy Gate Scan** — Trivy with `exit-code 1` fails the job on `CRITICAL` or `HIGH` severity findings, blocking the push
3. **Full Report** — A second Trivy run with `exit-code 0` and all severities generates a complete report regardless of the gate scan result (`if: always()`)
4. **Artifact Upload** — `actions/upload-artifact@v4` uploads `trivy-results.txt` with 30-day retention (`if: always()`)
5. **Workflow Summary** — Writes vulnerability counts by severity (CRITICAL, HIGH, MEDIUM, LOW) to `$GITHUB_STEP_SUMMARY`
6. **Push** — `docker push` pushes the already-built local image to GHCR (no rebuild needed, only runs if the gate scan passes)

**Scan Configuration:**

| Parameter | Value | Description |
|-----------|-------|-------------|
| `image-ref` | SHA-tagged image from metadata step | The locally loaded image to scan |
| `format` | `table` | Human-readable output |
| `exit-code` | `1` (gate) / `0` (full report) | Gate scan fails on findings; full report always succeeds |
| `severity` | `CRITICAL,HIGH` (gate) / `CRITICAL,HIGH,MEDIUM,LOW` (full) | Gate blocks on critical/high; full report captures all |
| `vuln-type` | `os,library` | Scans both OS packages and application dependencies |

**Behavior by severity:**

| Severity | Gate Scan | Push | Artifact |
|----------|-----------|------|----------|
| CRITICAL or HIGH | ❌ Fails | Blocked | ✅ Uploaded |
| MEDIUM or LOW only | ✅ Passes | Proceeds | ✅ Uploaded |
| No vulnerabilities | ✅ Passes | Proceeds | ✅ Uploaded |

### Dependabot

Automated dependency update PRs are configured in `.github/dependabot.yml`:

| Ecosystem | Directory | Schedule | PR Limit | Labels |
|-----------|-----------|----------|----------|--------|
| npm | `/backend` | Weekly (Monday) | 5 | `dependencies`, `backend` |
| npm | `/frontend` | Weekly (Monday) | 5 | `dependencies`, `frontend` |
| npm | `/` | Weekly (Monday) | 3 | `dependencies` |
| github-actions | `/` | Monthly | 5 | `ci`, `dependencies` |

Minor and patch updates are grouped to reduce PR noise. Dependabot PRs go through the same CI checks as regular PRs.

### Security Policy

The repository includes a `SECURITY.md` file that describes how to report vulnerabilities, the scope of security considerations, and supported versions.

## Deployment Health Checks & Rollback

After a Docker image is built and pushed to GHCR on merge to main, the `deployment-health-check` job verifies the image works correctly.

### Health Check Flow

1. Pulls the newly built Docker image
2. Starts a container in the CI environment
3. Waits for initialization (30s, aligned with Dockerfile HEALTHCHECK start-period)
4. Runs HTTP health checks against backend (`/api/health`) and frontend (`/`)
5. Uses configurable retries with exponential backoff

The health check script is at `scripts/health-check.sh`. Parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `endpoint_url` | (required) | URL to check |
| `max_retries` | 10 | Number of retry attempts |
| `retry_delay` | 5s | Initial delay (doubles each retry) |
| `timeout` | 30s | HTTP request timeout |

### Automatic Rollback

If health checks fail, the workflow automatically attempts to roll back:

1. Stores the previous deployment SHA before deploying
2. On failure, pulls and deploys the previous image (`scripts/rollback.sh`)
3. Runs health checks on the rolled-back deployment
4. If rollback health checks also fail, the workflow fails with an error requiring manual intervention

All rollback actions are logged with timestamps in the workflow summary.

### Deployment State Tracking

Every deployment generates a metadata record stored as a GitHub Actions artifact (30-day retention):

```json
{
  "sha": "abc1234",
  "timestamp": "2026-02-12T14:30:00Z",
  "environment": "production",
  "version": "5.12.0",
  "status": "success",
  "healthChecks": {
    "backend": "passed",
    "frontend": "passed"
  }
}
```

Docker images also include OCI labels for traceability (`org.opencontainers.image.version`, `org.opencontainers.image.revision`, etc.).

To query deployment history, use `scripts/deployment-history.sh`:

```bash
# Get last 5 successful deployments
./scripts/deployment-history.sh owner/repo 5
```

Requires `gh` CLI and `jq`.

## Workflow Configuration

The CI workflow supports `workflow_dispatch` with configurable inputs:

| Input | Default | Description |
|-------|---------|-------------|
| `health_check_timeout` | `30` | HTTP timeout in seconds |
| `health_check_retries` | `10` | Number of retry attempts |

These can be set when manually triggering the workflow from the Actions tab.

## CI Workflow

### Location

`.github/workflows/ci.yml`

### Triggers

| Event | Branches | Description |
|-------|----------|-------------|
| `push` | `main` | Runs on every push to main (direct or merged PR) |
| `pull_request` | `main` | Runs when PRs are opened/updated against main |

> **Note**: Feature branches do **not** trigger CI via direct pushes. CI runs on feature branches through the `pull_request` event when a PR is opened against `main`. This matches the branch protection model where all changes go through PRs.

Both `push` and `pull_request` triggers use `paths-ignore` to skip CI for documentation-only changes (`docs/**`, `*.md`, `.kiro/steering/**`, `CHANGELOG.md`).

### Jobs

The CI workflow runs multiple parallel job groups:

#### Path Filter

```yaml
path-filter:
  runs-on: ubuntu-latest
  if: github.actor != 'dependabot[bot]'
```

- Evaluates which files changed in the PR using `dorny/paths-filter@v3`
- Sets outputs for backend, frontend, and shared infrastructure changes
- Generates workflow summary showing which tests will run
- Detects empty PRs and ensures all tests run in that case

**Path Patterns:**
- **Backend**: `backend/**`
- **Frontend**: `frontend/**`
- **Shared**: `scripts/**`, `Dockerfile`, `docker-compose*.yml`, `.github/workflows/**`, `.dockerignore`, `package.json`, `package-lock.json`

**Filtering Logic:**
- Frontend-only changes → Skip backend tests
- Backend-only changes → Skip frontend tests
- Shared infrastructure changes → Run all tests
- Mixed changes → Run all tests
- Empty PR → Run all tests (fail-safe)

#### Security Audit

```yaml
security-audit:
  runs-on: ubuntu-latest
  if: github.actor != 'dependabot[bot]'
```

- Runs `npm audit --audit-level=high` on backend and frontend
- Reports results in workflow summary
- Fails only on high/critical vulnerabilities
- Runs in parallel with test jobs (non-blocking)

#### Backend Unit Tests

```yaml
backend-unit-tests:
  runs-on: ubuntu-latest
  needs: path-filter
  working-directory: backend
```

- **Runtime**: Ubuntu latest
- **Node.js**: Version 20
- **Package Manager**: npm with caching
- **Test Command**: `npm run test:unit:ci` (Jest, parallel workers with per-worker database isolation)
- **Conditional Execution**: Runs only if backend or shared files changed (or on empty PR or path-filter failure)

#### Backend PBT Tests (Sharded)

```yaml
backend-pbt-shards:
  runs-on: ubuntu-latest
  needs: path-filter
  strategy:
    matrix:
      shard: ['1/3', '2/3', '3/3']
```

- **Runtime**: Ubuntu latest × 3 shards
- **Node.js**: Version 20
- **Package Manager**: npm with caching
- **Test Command**: `jest --bail --testPathPatterns=pbt --shard=N/3` (parallel workers per shard)
- **Summary Job**: `Backend PBT Tests` aggregates shard results for branch protection
- **Conditional Execution**: Runs only if backend or shared files changed (or on empty PR or path-filter failure)

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

- **Runtime**: Ubuntu latest
- **Node.js**: Version 20
- **Package Manager**: npm with caching
- **Test Command**: `npx vitest --run --exclude '**/App.performance.test.jsx'`
- **Conditional Execution**: Runs only if frontend or shared files changed (or on empty PR or path-filter failure)

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

### Performance Test Exclusion

The frontend tests exclude `App.performance.test.jsx` because:
- Performance tests have 90-second timeouts
- They can cause CI pipeline timeouts
- They're designed for local performance profiling

To run performance tests locally:
```bash
cd frontend
npx vitest run App.performance.test.jsx
```

### Parallel Execution

All jobs run simultaneously for fast feedback:
- **Backend Unit Tests**: ~60 unit test files, parallel Jest workers with per-worker SQLite databases
- **Backend PBT Tests**: 145 PBT files split across 3 shards, each shard runs parallel Jest workers
- **Frontend Tests**: Vitest parallel execution

Per-worker database isolation (`test-expenses-worker-{JEST_WORKER_ID}.db`) allows Jest to run test files in parallel instead of sequentially, significantly reducing CI time.

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
- **Security Audit** — npm audit on backend and frontend dependencies
- **Backend Unit Tests** — Jest unit tests from `backend/`
- **Backend PBT Shard 1/3, 2/3, 3/3** — PBT test shards (run in parallel)
- **Backend PBT Tests** — Summary check that passes when all shards pass
- **Frontend Tests** — Vitest tests from `frontend/`

On merge to main, additional jobs run:
- **Build and Push to GHCR** — Builds Docker image and pushes to GHCR
- **Deployment Health Check** — Verifies the image, triggers rollback on failure

The branch protection requires `Backend Unit Tests`, `Backend PBT Tests`, and `Frontend Tests` to pass before merging. Branch protection rules enforce this — GitHub will block the merge button until all required checks pass.

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
For local merges: `git merge --no-ff`

## Docker Build & Push (GHCR)

### Location

Integrated into `.github/workflows/ci.yml` as the `build-and-push-ghcr` job.

### Triggers

| Event | Branches | Description |
|-------|----------|-------------|
| `push` | `main` | Runs after tests pass when code is merged to main |

### What It Does

1. Checks out the repository
2. Sets up Docker Buildx
3. Authenticates to GHCR
4. Builds the Docker image once and loads it into the local Docker daemon (tagged with SHA and version)
5. Runs Trivy vulnerability scan — fails on CRITICAL/HIGH findings (see [Docker Image Scanning](#docker-image-scanning-trivy))
6. Generates full vulnerability report, uploads scan artifact, and writes workflow summary
7. Pushes the already-built image to `ghcr.io/krazykrazz/expense-tracker` (no rebuild, only if scan passes)
8. Creates or updates a GitHub release with a docker-compose file

### GHCR Integration

**The CI workflow builds and pushes images to GHCR on merge to main.** The `build-and-push-ghcr` job in `ci.yml` handles this automatically:

- Builds the Docker image after all tests pass
- Pushes to `ghcr.io/krazykrazz/expense-tracker` with SHA, version, and `latest` tags
- Creates GitHub releases with docker-compose files attached
- Includes OCI image labels for deployment traceability

#### Deployment Health Check

```yaml
deployment-health-check:
  runs-on: ubuntu-latest
  needs: [build-and-push-ghcr]
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
```

- Pulls the newly built image and starts a container
- Runs health checks on backend and frontend endpoints
- On failure: triggers automatic rollback to previous image
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

## Viewing Workflow Results

### GitHub Actions Tab

1. Go to your repository on GitHub
2. Click **Actions** in the top navigation
3. Select a workflow from the left sidebar
4. Click on a specific run to see details

### Workflow Run Details

Each run shows:
- **Summary**: Overall status and duration
- **Jobs**: Individual job status (Backend Tests, Frontend Tests)
- **Logs**: Detailed output from each step
- **Artifacts**: Uploaded files (deployment metadata records)

### Pull Request Checks

When you open a PR:
1. CI workflow runs automatically
2. Status appears in the PR's "Checks" section
3. Click "Details" to view logs
4. Merge is blocked if checks fail (branch protection is active)

## Troubleshooting

### Common Issues

#### Path Filtering Not Working as Expected

**Symptoms:**
- Tests run when they should be skipped
- Tests skip when they should run

**Debug steps:**
1. Check the workflow summary for path filter results
2. Verify file patterns match your changes
3. Look for shared infrastructure files in your PR
4. Check if the PR is empty (no file changes)

**Path filter fail-safe behavior:**
- If path-filter job fails → All tests run
- If PR is empty → All tests run
- If shared files changed → All tests run

#### Tests Skipped But Branch Protection Blocks Merge

**This should not happen** with the status aggregator jobs. If it does:
1. Check that branch protection requires `Backend Tests Status` and `Frontend Tests Status` (not the individual test jobs)
2. Verify the aggregator jobs ran and reported success
3. Check workflow logs for the aggregator job output

### Common Issues

#### Tests Pass Locally But Fail in CI

**Possible causes:**
- Missing dependencies in `package.json`
- Environment-specific code paths
- Timing-sensitive tests
- File path case sensitivity (Linux is case-sensitive)

**Solutions:**
- Run `npm ci` locally to match CI environment
- Check for hardcoded paths
- Add appropriate test timeouts
- Use consistent file naming

#### CI Workflow Not Triggering

**Check:**
- For direct pushes: only `main` triggers CI
- For feature branches: CI triggers via `pull_request` when a PR is opened against `main`
- Workflow file is in `.github/workflows/`
- YAML syntax is valid
- GitHub Actions is enabled for the repository
- Changes are not exclusively in `paths-ignore` paths (docs, markdown, steering files)

#### Slow CI Runs

**Optimizations already in place:**
- npm dependency caching
- Parallel job execution
- Performance test exclusion

**Additional options:**
- Use test sharding for large test suites
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

### Viewing Detailed Logs

1. Go to the failed workflow run
2. Click on the failed job
3. Expand the failed step
4. Look for error messages in red

### Re-running Failed Workflows

1. Go to the failed workflow run
2. Click "Re-run all jobs" or "Re-run failed jobs"
3. Useful for transient failures (network issues, etc.)

## Configuration Reference

### Environment Variables

| Variable | Job | Value | Purpose |
|----------|-----|-------|---------|
| `NODE_ENV` | Backend | `test` | Set by cross-env in npm test |
| `CI` | Both | `true` | Set automatically by GitHub |

### Caching

npm dependencies are cached using:
```yaml
cache: 'npm'
cache-dependency-path: backend/package-lock.json  # or frontend/
```

Cache is invalidated when `package-lock.json` changes.

### Timeouts

Default GitHub Actions timeout: 6 hours per job

Individual test timeouts:
- Jest (backend): 30 seconds per test
- Vitest (frontend): 30 seconds per test

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

1. Pin action versions (e.g., `@v4` not `@latest`)
2. Use caching to speed up builds
3. Keep workflows simple and focused
4. Document any non-obvious configurations

## Related Documentation

- [CI Optimization Roadmap](./CI_OPTIMIZATION_ROADMAP.md) - Planned and completed CI improvements
- [CI/CD Troubleshooting Guide](./CI_TROUBLESHOOTING.md) - Common issues and debugging steps
- [Feature Branch Workflow](./FEATURE_BRANCH_WORKFLOW.md) - Branch strategy and promotion process
- [Pre-deployment Checklist](../../.kiro/steering/pre-deployment.md) - Steps before deploying
- [Docker Documentation](../guides/DOCKER.md) - Docker setup and usage

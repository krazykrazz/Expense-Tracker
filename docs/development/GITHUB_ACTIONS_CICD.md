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
- `Backend Unit Tests` — Jest unit tests from `backend/`
- `Backend PBT Tests` — Jest property-based tests from `backend/`
- `Frontend Tests` — Vitest tests from `frontend/`

> **Note**: A legacy `Backend Tests` check may appear in GitHub's status check list — this is from before the CI was split into unit/PBT jobs and is not used by the current workflow.

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

Before pushing to GHCR, the `build-and-push-ghcr` job scans the built Docker image using [Trivy](https://github.com/aquasecurity/trivy-action):

- Scans for `CRITICAL` and `HIGH` severity vulnerabilities
- Scan results are uploaded as a workflow artifact (30-day retention)
- Results are included in the workflow summary
- If Trivy itself fails (tool error, not a vulnerability finding), the build continues with a warning

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
3. Waits for initialization (10s)
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
| `enable_security_scan` | `true` | Enable/disable security scanning |

These can be set when manually triggering the workflow from the Actions tab.

## CI Workflow

### Location

`.github/workflows/ci.yml`

### Triggers

| Event | Branches | Description |
|-------|----------|-------------|
| `push` | `main`, `feature/**` | Runs on every push to main or feature branches |
| `pull_request` | `main` | Runs when PRs are opened/updated against main |

### Jobs

The CI workflow runs multiple parallel job groups:

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
  working-directory: backend
```

- **Runtime**: Ubuntu latest
- **Node.js**: Version 20
- **Package Manager**: npm with caching
- **Test Command**: `npm run test:unit:ci` (Jest, parallel workers with per-worker database isolation)

#### Backend PBT Tests (Sharded)

```yaml
backend-pbt-shards:
  runs-on: ubuntu-latest
  strategy:
    matrix:
      shard: ['1/3', '2/3', '3/3']
```

- **Runtime**: Ubuntu latest × 3 shards
- **Node.js**: Version 20
- **Package Manager**: npm with caching
- **Test Command**: `jest --bail --testPathPatterns=pbt --shard=N/3` (parallel workers per shard)
- **Summary Job**: `Backend PBT Tests` aggregates shard results for branch protection

#### Frontend Tests

```yaml
frontend-tests:
  runs-on: ubuntu-latest
  working-directory: frontend
```

- **Runtime**: Ubuntu latest
- **Node.js**: Version 20
- **Package Manager**: npm with caching
- **Test Command**: `npx vitest --run --exclude '**/App.performance.test.jsx'`

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
- **Build and Push to GHCR** — Builds Docker image, scans with Trivy, pushes to GHCR
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

| Option | Command | When to Use |
|--------|---------|-------------|
| Merge commit | `--merge` | Default, preserves branch history |
| Squash | `--squash` | Combine all commits into one |
| Rebase | `--rebase` | Linear history, no merge commit |

We recommend `--merge` (default) to preserve the feature branch history.

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
4. Builds the Docker image with SHA, version, and `latest` tags
5. Pushes to `ghcr.io/krazykrazz/expense-tracker`
6. Creates or updates a GitHub release with a docker-compose file

### GHCR Integration

**The CI workflow builds and pushes images to GHCR on merge to main.** The `build-and-push-ghcr` job in `ci.yml` handles this automatically:

- Builds the Docker image after all tests pass
- Scans the image with Trivy before pushing (fails on CRITICAL/HIGH findings)
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
- **Artifacts**: Uploaded files (Trivy scan results, deployment metadata records)

### Pull Request Checks

When you open a PR:
1. CI workflow runs automatically
2. Status appears in the PR's "Checks" section
3. Click "Details" to view logs
4. Merge is blocked if checks fail (branch protection is active)

## Troubleshooting

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
- Branch name matches pattern (`main` or `feature/**`)
- Workflow file is in `.github/workflows/`
- YAML syntax is valid
- GitHub Actions is enabled for the repository

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

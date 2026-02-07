# GitHub Actions CI/CD

**Last Updated**: January 27, 2026  
**Status**: Active

This document provides detailed documentation for the GitHub Actions CI/CD workflows used in the Expense Tracker application.

## Overview

The project uses two GitHub Actions workflows:

1. **CI Workflow** (`ci.yml`) - Automated testing on pushes and pull requests
2. **Docker Workflow** (`docker.yml`) - Docker image builds on merge to main

### PR-Based CI Integration

**CI runs automatically on all Pull Requests to main.** This is the primary way to verify code before it reaches the main branch.

When you create a PR (using `promote-feature.ps1` or `create-pr-from-main.ps1`):
1. GitHub Actions triggers the CI workflow
2. Both backend and frontend tests run in parallel
3. Results appear as status checks on the PR
4. You can merge once all checks pass

## CI Workflow

### Location

`.github/workflows/ci.yml`

### Triggers

| Event | Branches | Description |
|-------|----------|-------------|
| `push` | `main`, `feature/**` | Runs on every push to main or feature branches |
| `pull_request` | `main` | Runs when PRs are opened/updated against main |

### Jobs

The CI workflow runs two parallel jobs:

#### Backend Tests

```yaml
backend-tests:
  runs-on: ubuntu-latest
  working-directory: backend
```

- **Runtime**: Ubuntu latest
- **Node.js**: Version 20
- **Package Manager**: npm with caching
- **Test Command**: `npm test` (Jest with --runInBand)

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

Both test jobs run simultaneously (no `needs` dependency), providing:
- Faster feedback (~3-5 minutes total)
- Independent failure reporting
- Efficient use of CI resources

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

Each PR shows two checks:
- **Backend Tests** - Jest tests from `backend/`
- **Frontend Tests** - Vitest tests from `frontend/`

Both must pass (green checkmark) before merging.

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

## Docker Workflow

### Location

`.github/workflows/docker.yml`

### Triggers

| Event | Branches | Description |
|-------|----------|-------------|
| `push` | `main` | Runs when code is merged to main |
| `workflow_dispatch` | - | Manual trigger from GitHub UI |

### What It Does

1. Checks out the repository
2. Extracts version from `package.json`
3. Sets up Docker Buildx
4. Builds the Docker image with version tags
5. Generates a build summary

### Important Limitation: localhost:5000 Registry

**The Docker workflow builds but does NOT push images.**

Why? GitHub Actions runners cannot access `localhost:5000` because:
- GitHub runners are remote machines
- They have no network access to your local machine
- The local Docker registry is only accessible from your development machine

### Local Deployment

For actual deployment to your local registry, use the PowerShell script:

```powershell
# Build and push with latest tag
.\build-and-push.ps1 -Tag latest

# Build and push with specific version
.\build-and-push.ps1 -Tag 4.12.0

# Multi-platform build (x86_64 and ARM64)
.\build-and-push.ps1 -Tag latest -MultiPlatform
```

### Future Registry Integration

If you set up an external registry (Docker Hub, GitHub Container Registry, AWS ECR), you can modify the workflow to push:

```yaml
# Example: Push to GitHub Container Registry
- name: Login to GitHub Container Registry
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    push: true  # Enable pushing
    tags: ghcr.io/${{ github.repository }}:${{ steps.version.outputs.version }}
```

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
- **Artifacts**: Any uploaded files (none currently)

### Pull Request Checks

When you open a PR:
1. CI workflow runs automatically
2. Status appears in the PR's "Checks" section
3. Click "Details" to view logs
4. Merge is blocked if checks fail (if branch protection enabled)

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

- [Feature Branch Workflow](./FEATURE_BRANCH_WORKFLOW.md) - Branch strategy and promotion process
- [Pre-deployment Checklist](../../.kiro/steering/pre-deployment.md) - Steps before deploying
- [Docker Documentation](../guides/DOCKER.md) - Docker setup and usage

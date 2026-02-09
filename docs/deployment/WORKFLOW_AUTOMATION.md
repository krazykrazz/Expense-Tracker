# Deployment Workflow Automation

This document describes the automated enforcement mechanisms for the SHA-based deployment workflow.

## Overview

To prevent workflow mistakes (like version bumps on feature branches), we've implemented multiple layers of enforcement:

1. **Git Hooks** (client-side) - Blocks commits with version changes on feature branches
2. **GitHub Actions** (server-side) - Validates PRs don't contain version bumps
3. **Deployment Script** - Automates the entire deployment process in correct order

## Setup

### 1. Install Git Hooks

Run once after cloning the repository:

```powershell
.\scripts\install-git-hooks.ps1
```

This installs a pre-commit hook that prevents version bumps on feature branches.

### 2. Verify GitHub Actions

The `version-check.yml` workflow runs automatically on all PRs to main. No setup required.

## Usage

### Automated Deployment (Recommended)

Use the deployment script to handle everything automatically:

```powershell
# PATCH version bump (bug fixes)
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Bug fixes and improvements"

# MINOR version bump (new features)
.\scripts\deploy-to-production.ps1 -BumpType MINOR -Description "Added analytics dashboard"

# MAJOR version bump (breaking changes)
.\scripts\deploy-to-production.ps1 -BumpType MAJOR -Description "Database schema migration"

# Dry run (see what would happen)
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Test" -DryRun

# Skip staging (deploy directly to production)
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Hotfix" -SkipStaging
```

**What the script does:**
1. Verifies you're on main branch
2. Checks for uncommitted changes
3. Pulls latest from origin
4. Calculates new version number
5. Updates all version files
6. Updates CHANGELOG.md
7. Prompts for BackupSettings.jsx update
8. Builds frontend
9. Commits version bump (creates release SHA)
10. Builds SHA Docker image
11. Deploys to staging
12. Waits for your confirmation
13. Deploys to production
14. Pushes to origin

### Hotfix Workflow

For urgent production fixes, use the `create-pr-from-main.ps1` script:

```powershell
# 1. Make changes on main (or create hotfix branch)
.\scripts\create-pr-from-main.ps1 -Title "Fix: Critical bug description"

# 2. After PR is merged, pull main
git checkout main
git pull origin main

# 3. Deploy with version bump (use -SkipStaging for urgent fixes)
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Critical bug fix" -SkipStaging
```

**Important:** Hotfix branches follow the same rules as feature branches:
- ❌ No version bumps on hotfix branches
- ✅ Version bumps only on main after merge
- ✅ Use `-SkipStaging` flag for urgent production fixes

### Manual Deployment

If you prefer manual control, follow the documented workflow in `DEPLOYMENT_WORKFLOW.md`.

## Enforcement Mechanisms

### Pre-Commit Hook

**Location:** `.git/hooks/pre-commit`

**What it does:**
- Runs before every commit
- Checks if you're on a feature or hotfix branch
- Scans staged files for version changes
- Blocks commit if version bump detected on non-main branch

**Applies to branches:**
- `feature/*` - Feature branches
- `hotfix/*` - Hotfix branches

**Example output:**
```
❌ ERROR: Version bump detected on feature/hotfix branch!

Version bumps must only happen on 'main' branch after merge.

Current branch: hotfix/20260208-143022
Modified file: frontend/package.json

To fix:
  1. Unstage version changes: git reset HEAD frontend/package.json
  2. Commit other changes
  3. Merge to main first, then bump version
```

**Bypass (not recommended):**
```powershell
git commit --no-verify -m "message"
```

### GitHub Actions Check

**Location:** `.github/workflows/version-check.yml`

**What it does:**
- Runs on every PR to main
- Checks if PR contains version changes
- Fails the PR if version bump detected
- Provides clear error message with instructions

**Applies to:**
- All PRs to main (feature branches, hotfix branches, etc.)

**Example output:**
```
❌ ERROR: Version bump detected in Pull Request!

Version bumps must NOT be included in feature/hotfix branch PRs.
They should only happen on 'main' AFTER the PR is merged.

Correct workflow:
  1. Merge this PR to main (without version changes)
  2. On main: Update version in all locations
  3. On main: Commit version bump
  4. Build and deploy from that commit

See: docs/deployment/DEPLOYMENT_WORKFLOW.md
```

**Cannot be bypassed** - PR cannot be merged until check passes.

### Deployment Script Validation

**Location:** `scripts/deploy-to-production.ps1`

**What it does:**
- Enforces correct branch (must be main)
- Checks for clean working directory
- Ensures latest code from origin
- Automates version bump in correct order
- Builds and deploys with correct SHA

**Cannot be bypassed** - Script exits with error if conditions not met.

## Troubleshooting

### Hook Not Running

If the pre-commit hook isn't running:

1. Check if it's installed:
   ```powershell
   Test-Path .git/hooks/pre-commit
   ```

2. Reinstall:
   ```powershell
   .\scripts\install-git-hooks.ps1
   ```

3. Verify it's executable (Unix-like systems):
   ```bash
   ls -l .git/hooks/pre-commit
   chmod +x .git/hooks/pre-commit
   ```

### GitHub Action Failing

If the version-check workflow fails incorrectly:

1. Check the workflow run logs in GitHub Actions tab
2. Verify the version files haven't been modified
3. If false positive, check the regex patterns in the workflow

### Deployment Script Errors

Common issues:

**"Must be on 'main' branch"**
- Solution: `git checkout main`

**"Uncommitted changes detected"**
- Solution: Commit or stash changes first

**"Failed to pull from origin"**
- Solution: Resolve merge conflicts, then retry

**"Frontend build failed"**
- Solution: Fix build errors, then retry

## Disabling Enforcement (Not Recommended)

### Disable Git Hook

Remove the hook file:
```powershell
Remove-Item .git/hooks/pre-commit
```

### Disable GitHub Action

Add to `.github/workflows/version-check.yml`:
```yaml
on:
  pull_request:
    branches: [main]
    paths-ignore:
      - '**'  # Ignore all files (disables workflow)
```

**Warning:** Disabling enforcement removes safeguards against workflow mistakes.

## Best Practices

1. **Always use the deployment script** for production deployments
2. **Never bypass the pre-commit hook** unless absolutely necessary
3. **Let GitHub Actions run** on all PRs before merging
4. **Test in staging** before promoting to production
5. **Document any manual deployments** in deployment logs

## See Also

- [Complete Deployment Workflow](DEPLOYMENT_WORKFLOW.md)
- [SHA-Based Containers](SHA_BASED_CONTAINERS.md)
- [Pre-Deployment Checklist](../../.kiro/steering/pre-deployment.md)

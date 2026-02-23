# Complete Deployment Workflow

This document describes the end-to-end workflow for deploying features to production using the pull-and-promote container model.

## Overview

The deployment workflow ensures:
- Feature branches never contain version bumps
- Version bumps happen via release branch PRs merged to `main`
- CI is the single source of truth for Docker image builds
- Same binary artifact moves through staging → production
- Full traceability via git SHA tags

> **Note:** The application version was rebased from 5.17.5 to 1.0.0 as part of the migration consolidation. All version examples below use the post-rebase numbering scheme starting from 1.0.0.

## Complete Workflow

### Phase 1: Feature Development

1. **Create feature branch**:
   ```powershell
   git checkout -b feature/my-feature
   ```

2. **Implement feature** (no version changes)

3. **Commit feature work**:
   ```powershell
   git add -A
   git commit -m "feat: implement my-feature"
   ```

### Phase 2: Feature Promotion

4. **Create Pull Request**:
   ```powershell
   .\scripts\promote-feature.ps1 -FeatureName my-feature
   ```

5. **Wait for CI to pass** on the PR

6. **Merge PR** via GitHub web UI

7. **Switch to main and pull**:
   ```powershell
   git checkout main
   git pull origin main
   ```

### Phase 3: Version Bump via Release Branch (PR-based)

Branch protection on `main` blocks direct pushes. Version bumps go through a release branch + PR:

8. **Create release branch**:
   ```powershell
   git checkout -b release/v1.0.1
   ```

9. **Update version in all 6 locations**:
   - `frontend/package.json`, `backend/package.json`
   - `frontend/src/App.jsx` (footer)
   - `CHANGELOG.md`
   - `frontend/src/components/BackupSettings.jsx` (changelog)
   - `frontend/src/components/SystemModal.jsx` (changelog)

10. **Build frontend** with new version:
    ```powershell
    cd frontend; npm run build; cd ..
    ```

11. **Commit, push, and create PR**:
    ```powershell
    git add -A
    git commit -m "v1.0.1: Feature description"
    git push -u origin release/v1.0.1
    gh pr create --base main --head release/v1.0.1 --title "Release v1.0.1: Feature description"
    ```

12. **Wait for CI to pass** on the PR, then merge:
    ```powershell
    gh pr merge release/v1.0.1 --merge --delete-branch
    ```

13. **Tag the merge commit on main**:
    ```powershell
    git checkout main
    git pull origin main
    git tag -a "v1.0.1" -m "Release v1.0.1: Feature description"
    git push origin v1.0.1
    ```

### Phase 4: Pull and Deploy

14. **Wait for CI** to build and push the Docker image to GHCR

15. **Pull and promote to staging**:
    ```powershell
    .\scripts\build-and-push.ps1 -Environment staging
    ```

16. **Test in staging**:
    - Verify version shows correctly in UI footer
    - Test new features
    - Check logs for errors

17. **Promote to production** (same image, just retag):
    ```powershell
    .\scripts\build-and-push.ps1 -Environment latest
    ```

18. **Verify production**

### Phase 5: Cleanup

19. **Delete feature branch** (release branch is automatically cleaned up — remote branch deleted by PR merge, local branch deleted by the deploy script after switching back to main):
    ```powershell
    git branch -d feature/my-feature
    git push origin --delete feature/my-feature
    ```

## Automated Deployment

Use `deploy-to-production.ps1` to automate the entire PR-based release workflow:

```powershell
# PATCH version bump
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Bug fixes"

# MINOR version bump
.\scripts\deploy-to-production.ps1 -BumpType MINOR -Description "New feature"

# Dry run
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Test" -DryRun

# Skip staging (hotfix)
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Hotfix" -SkipStaging
```

The script handles: release branch → version bump → PR → CI → merge → tag → wait for Docker build → staging → production. Fully compatible with branch protection on `main`.

## Quick Reference

```powershell
# 1. Merge feature via PR (done via GitHub)

# 2. Switch to main and pull
git checkout main; git pull origin main

# 3. Create release branch
git checkout -b release/v1.0.1

# 4. Version bump (update all 6 files)

# 5. Build frontend
cd frontend; npm run build; cd ..

# 6. Commit, push, create PR
git add -A; git commit -m "v1.0.1: Description"
git push -u origin release/v1.0.1
gh pr create --base main --head release/v1.0.1 --title "Release v1.0.1"

# 7. Wait for CI, merge PR
gh pr merge release/v1.0.1 --merge --delete-branch

# 8. Tag merge commit on main
git checkout main; git pull origin main
git tag -a "v1.0.1" -m "Release v1.0.1: Description"
git push origin v1.0.1

# 9. Wait for CI Docker build, then promote to staging
.\scripts\build-and-push.ps1 -Environment staging

# 10. Test in staging...

# 11. Promote to production
.\scripts\build-and-push.ps1 -Environment latest
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

CI is the single source of truth. Use `-LocalBuild` only for testing Dockerfile changes.

### ❌ Version Bump on Feature Branch

Version bumps go on a dedicated `release/vX.Y.Z` branch, never on feature branches. The release branch is merged to `main` via PR.

### ❌ Deploying Before CI Completes

Always wait for CI to build the image before promoting. The script will error if the SHA image isn't available in GHCR yet.

## Rollback Procedure

1. **Find previous working SHA** from git history:
   ```powershell
   git log --oneline
   ```

2. **Pull and retag**:
   ```powershell
   docker pull ghcr.io/krazykrazz/expense-tracker:def5678
   docker tag ghcr.io/krazykrazz/expense-tracker:def5678 ghcr.io/krazykrazz/expense-tracker:latest
   docker push ghcr.io/krazykrazz/expense-tracker:latest
   ```

3. **Restart production container**:
   ```powershell
   docker-compose -f "G:\My Drive\Media Related\docker\media-applications.yml" up -d expense-tracker
   ```

## See Also

- [SHA-Based Containers](SHA_BASED_CONTAINERS.md) - Detailed SHA workflow documentation
- [Workflow Automation](WORKFLOW_AUTOMATION.md) - Automated enforcement

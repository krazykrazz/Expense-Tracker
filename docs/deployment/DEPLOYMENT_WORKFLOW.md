# Complete Deployment Workflow

This document describes the end-to-end workflow for deploying features to production using the pull-and-promote container model.

## Overview

The deployment workflow ensures:
- Feature branches never contain version bumps
- Version bumps happen on `main` after feature merge
- CI is the single source of truth for Docker image builds
- Same binary artifact moves through staging → production
- Full traceability via git SHA tags

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

### Phase 3: Version Bump & Push (on main)

8. **Update version in all locations**:
   - `frontend/package.json`, `backend/package.json`
   - `frontend/src/App.jsx` (footer)
   - `CHANGELOG.md`
   - `frontend/src/components/BackupSettings.jsx` (changelog)

9. **Build frontend** with new version:
   ```powershell
   cd frontend; npm run build; cd ..
   ```

10. **Commit version bump** (creates release SHA):
    ```powershell
    git add -A
    git commit -m "v5.8.1: Feature description"
    git tag -a "v5.8.1" -m "Release v5.8.1: Feature description"
    ```

11. **Push to origin** (triggers CI build):
    ```powershell
    git push origin main
    git push origin v5.8.1
    ```

### Phase 4: Pull and Deploy

12. **Wait for CI** to build and push the Docker image to GHCR

13. **Pull and promote to staging**:
    ```powershell
    .\scripts\build-and-push.ps1 -Environment staging
    ```

14. **Test in staging**:
    - Verify version shows correctly in UI footer
    - Test new features
    - Check logs for errors

15. **Promote to production** (same image, just retag):
    ```powershell
    .\scripts\build-and-push.ps1 -Environment latest
    ```

16. **Verify production**

### Phase 5: Cleanup

17. **Delete feature branch**:
    ```powershell
    git branch -d feature/my-feature
    git push origin --delete feature/my-feature
    ```

## Automated Deployment

Use `deploy-to-production.ps1` to automate the entire process:

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

The script handles: version bump → commit → tag → push → wait for CI → pull → staging → production.

## Quick Reference

```powershell
# 1. Merge feature via PR (done via GitHub)

# 2. Switch to main and pull
git checkout main; git pull origin main

# 3. Version bump (update files manually or use deploy-to-production.ps1)

# 4. Build frontend
cd frontend; npm run build; cd ..

# 5. Commit and tag
git add -A; git commit -m "v5.8.1: Description"
git tag -a "v5.8.1" -m "Release v5.8.1: Description"

# 6. Push (triggers CI build)
git push origin main; git push origin v5.8.1

# 7. Wait for CI, then promote to staging
.\scripts\build-and-push.ps1 -Environment staging

# 8. Test in staging...

# 9. Promote to production
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

Version bumps create the release SHA and must happen on `main` after merge.

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

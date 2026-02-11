# Complete Deployment Workflow

This document describes the end-to-end workflow for deploying features to production using the SHA-based container model.

## Overview

The deployment workflow ensures:
- Feature branches never contain version bumps
- Version bumps happen on `main` after feature merge
- Docker images are built once with the correct version
- Same binary artifact moves through staging → production
- Full traceability via git SHA tags

## Complete Workflow

### Phase 1: Feature Development

1. **Create feature branch** (if not already on one):
   ```powershell
   git checkout -b feature/my-feature
   ```

2. **Implement feature** (no version changes):
   - Write code
   - Write tests
   - Update documentation
   - **DO NOT** update version numbers

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
   
   This will:
   - Sync with main
   - Run tests
   - Push feature branch
   - Create PR

5. **Wait for CI to pass** on the PR

6. **Merge PR** via GitHub web UI or:
   ```powershell
   gh pr merge --squash  # or --merge or --rebase
   ```

7. **Switch to main and pull**:
   ```powershell
   git checkout main
   git pull origin main
   ```

### Phase 3: Version Bump (on main)

8. **Determine version bump type**:
   - MAJOR: Breaking changes, schema changes
   - MINOR: New features
   - PATCH: Bug fixes

9. **Update version in all locations**:
   - `frontend/package.json`
   - `backend/package.json`
   - `frontend/src/App.jsx` (footer)
   - `frontend/src/components/SystemModal.jsx` (changelog)

10. **Update CHANGELOG.md**:
    ```markdown
    ## [5.8.1] - 2026-02-08
    
    ### Added
    - Feature description
    
    ### Fixed
    - Bug fix description
    ```

11. **Build frontend** with new version:
    ```powershell
    cd frontend
    npm run build
    cd ..
    ```

12. **Commit version bump** (creates release SHA):
    ```powershell
    git add -A
    git commit -m "v5.8.1: Feature description"
    ```

### Phase 4: Docker Build and Deploy

13. **Build SHA image** (once, with correct version):
    ```powershell
    .\scripts\build-and-push.ps1
    ```
    
    Output shows:
    ```
    SHA Image: ghcr.io/krazykrazz/expense-tracker:abc1234
    Version: 5.8.1
    Git SHA: abc1234
    ```

14. **Deploy to staging**:
    ```powershell
    .\scripts\build-and-push.ps1 -Environment staging
    ```
    
    This tags the SHA image as `staging` and deploys to `expense-tracker-test` container.

15. **Test in staging**:
    - Verify version shows correctly in UI footer
    - Test new features
    - Check logs for errors
    - Verify database migrations (if any)

16. **Promote to production** (same SHA, just retag):
    ```powershell
    .\scripts\build-and-push.ps1 -Environment latest
    ```
    
    This tags the same SHA image as `latest` and deploys to `expense-tracker` container.

17. **Verify production**:
    - Check version in UI
    - Verify features work
    - Monitor logs

### Phase 5: Cleanup

18. **Delete feature branch** (if not already deleted):
    ```powershell
    git branch -d feature/my-feature
    git push origin --delete feature/my-feature
    ```

19. **Push version tag to origin**:
    ```powershell
    git push origin v5.8.1
    ```

20. **Document deployment**:
    - Note SHA deployed to production
    - Record any issues encountered
    - Update deployment logs if maintained

## Quick Reference

### Feature Branch → Production

```powershell
# 1. Merge feature via PR (done via GitHub)

# 2. Switch to main and pull
git checkout main
git pull origin main

# 3. Version bump (update files manually)
# Edit: frontend/package.json, backend/package.json, App.jsx, SystemModal.jsx, CHANGELOG.md

# 4. Build frontend
cd frontend && npm run build && cd ..

# 5. Commit version bump
git add -A && git commit -m "v5.8.1: Description"
git tag -a "v5.8.1" -m "Release v5.8.1: Description"

# 6. Build SHA image
.\scripts\build-and-push.ps1

# 7. Deploy to staging
.\scripts\build-and-push.ps1 -Environment staging

# 8. Test in staging...

# 9. Promote to latest (production)
.\scripts\build-and-push.ps1 -Environment latest

# 10. Push tag to origin
git push origin v5.8.1
```

## Common Mistakes to Avoid

### ❌ Version Bump on Feature Branch

**Wrong:**
```powershell
git checkout feature/my-feature
# Update version to 5.8.1
git commit -m "v5.8.1: My feature"
# Merge to main
```

**Why it's wrong:**
- Creates wrong SHA for the release
- Docker image built from feature branch SHA
- Version bump commit is not on main

**Right:**
```powershell
# Merge feature to main first (no version changes)
git checkout main
# Now update version to 5.8.1
git commit -m "v5.8.1: My feature"
# Build Docker image from this SHA
```

### ❌ Building Docker Image Before Version Bump

**Wrong:**
```powershell
git checkout main
.\scripts\build-and-push.ps1  # Builds with old version
# Update version to 5.8.1
git commit -m "v5.8.1: My feature"
```

**Why it's wrong:**
- Docker image contains old version number
- SHA doesn't match the version bump commit

**Right:**
```powershell
git checkout main
# Update version to 5.8.1
git commit -m "v5.8.1: My feature"
.\scripts\build-and-push.ps1  # Builds with new version
```

### ❌ Rebuilding for Production

**Wrong:**
```powershell
.\scripts\build-and-push.ps1 -Environment staging
# Test in staging...
.\scripts\build-and-push.ps1  # Rebuild for production
.\scripts\build-and-push.ps1 -Environment production
```

**Why it's wrong:**
- Rebuilds create different binary artifacts
- "Works in staging but not prod" issues
- Defeats purpose of SHA-based workflow

**Right:**
```powershell
.\scripts\build-and-push.ps1  # Build once
.\scripts\build-and-push.ps1 -Environment staging  # Tag and deploy
# Test in staging...
.\scripts\build-and-push.ps1 -Environment latest  # Just retag, no rebuild
```

## Rollback Procedure

If production deployment has issues:

1. **Find previous working SHA** from git history:
   ```powershell
   git log --oneline
   ```

2. **Retag that SHA for production**:
   ```powershell
   docker tag ghcr.io/krazykrazz/expense-tracker:def5678 ghcr.io/krazykrazz/expense-tracker:latest
   docker push ghcr.io/krazykrazz/expense-tracker:latest
   ```

3. **Restart production container**:
   ```powershell
   docker-compose -f "G:\My Drive\Media Related\docker\media-applications.yml" up -d expense-tracker
   ```

4. **Verify rollback**:
   - Check version in UI
   - Verify functionality restored

## Troubleshooting

### Version Mismatch in Docker Image

**Symptom:** UI shows old version after deployment

**Cause:** Docker image was built before version bump commit

**Fix:**
1. Ensure version bump is committed
2. Rebuild SHA image: `.\scripts\build-and-push.ps1`
3. Redeploy: `.\scripts\build-and-push.ps1 -Environment latest`

### Container Won't Start

**Check logs:**
```powershell
docker logs expense-tracker
# or
docker logs expense-tracker-test
```

**Common issues:**
- Database migration failed
- Port already in use
- Volume mount issues

### Wrong Image Deployed

**Verify running image:**
```powershell
docker inspect expense-tracker | Select-String "Image"
```

**Should show:** `ghcr.io/krazykrazz/expense-tracker:latest`

## See Also

- [SHA-Based Containers](SHA_BASED_CONTAINERS.md) - Detailed SHA workflow documentation
- [Pre-Deployment Checklist](../../.kiro/steering/pre-deployment.md) - Pre-deployment checks
- [Version Management](../../.kiro/steering/versioning.md) - Version bump rules
- [Git Commit Control](../../.kiro/steering/git-commits.md) - Commit and PR workflow

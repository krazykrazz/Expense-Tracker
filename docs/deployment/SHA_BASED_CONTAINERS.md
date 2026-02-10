# SHA-Based Container Deployment

## Overview

This project uses a SHA-based container build model for immutable, traceable deployments:

1. **Build once** with git SHA tag (immutable identifier)
2. **Tag for environments** (staging, production) pointing to SHA images
3. **Promote by retagging**, not rebuilding

## Benefits

- **Build Once, Deploy Everywhere**: Same binary artifact moves through all environments
- **Immutability**: SHA tags never change, ensuring consistency
- **Traceability**: SHA links directly to git commit
- **Fast Rollbacks**: Retag to previous SHA
- **No "works in staging but not prod"**: Exact same image in all environments

## Workflow

### Prerequisites: Version Bump on Main

**CRITICAL**: Version bumps must happen on `main` AFTER feature branch merges, not before.

**Correct Order:**
1. Complete feature work on feature branch (no version changes)
2. Merge feature branch to `main` via PR
3. On `main`: Update version in all locations + CHANGELOG + build frontend
4. Commit version bump (this creates the release SHA)
5. Build SHA image with the release version

**Why This Order Matters:**
- The SHA image contains the version number from `package.json`
- Version bump creates the "release commit" SHA
- This SHA becomes the immutable identifier for that version
- Same binary artifact (with correct version) moves through all environments

### 1. Build Image (First Time)

Build the image and tag it with the current git SHA:

```powershell
.\scripts\build-and-push.ps1
```

**What happens:**
- Gets current git SHA (e.g., `abc1234`)
- Reads version from `backend/package.json` (e.g., `4.12.8`)
- Builds image: `localhost:5000/expense-tracker:abc1234`
- Pushes SHA-tagged image to registry
- Image is now available but not deployed

**Output:**
```
SHA Image: localhost:5000/expense-tracker:abc1234
Version: 4.12.8
Git SHA: abc1234
```

### 2. Deploy to Staging

Tag the SHA image for staging and deploy:

```powershell
.\scripts\build-and-push.ps1 -Environment staging
```

**What happens:**
- Checks if SHA image exists (skips build if already built)
- Tags SHA image as `staging`: `localhost:5000/expense-tracker:staging`
- Pushes staging tag
- Deploys to `expense-tracker-test` container

**Output:**
```
SHA image already exists: localhost:5000/expense-tracker:abc1234
Skipping build (image already built for this commit)
Environment Tag: localhost:5000/expense-tracker:staging
Deployed to: expense-tracker-test
```

### 3. Test in Staging

Verify the deployment works correctly in staging environment.

### 4. Promote to Production

Promote the same SHA image to production (just retag):

```powershell
.\scripts\build-and-push.ps1 -Environment latest
```

**What happens:**
- Uses the SAME SHA image (no rebuild)
- Tags SHA image as `latest`: `localhost:5000/expense-tracker:latest`
- Pushes latest tag
- Deploys to `expense-tracker` container

**Output:**
```
SHA image already exists: localhost:5000/expense-tracker:abc1234
Skipping build (image already built for this commit)
Environment Tag: localhost:5000/expense-tracker:latest
Deployed to: expense-tracker
```

## Command Reference

### Basic Commands

```powershell
# Build SHA image only (no deploy)
.\scripts\build-and-push.ps1 -BuildOnly

# Build and deploy to staging
.\scripts\build-and-push.ps1 -Environment staging

# Promote to production (retag existing SHA)
.\scripts\build-and-push.ps1 -Environment latest

# Build multi-platform image
.\scripts\build-and-push.ps1 -MultiPlatform

# Skip deployment step
.\scripts\build-and-push.ps1 -Environment staging -SkipDeploy
```

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-Environment` | Target environment: `staging` or `latest` | None (build only) |
| `-Registry` | Docker registry URL | `localhost:5000` |
| `-MultiPlatform` | Build for linux/amd64 and linux/arm64 | False |
| `-BuildOnly` | Build SHA image but don't tag for environment | False |
| `-SkipDeploy` | Skip container deployment | False |
| `-SkipAuth` | Skip registry authentication check | False |
| `-ComposeFile` | Path to docker-compose file | `G:\My Drive\Media Related\docker\media-applications.yml` |

## Image Tags

### SHA Tags (Immutable)

Format: `localhost:5000/expense-tracker:<git-sha>`

Example: `localhost:5000/expense-tracker:abc1234`

- **Never changes** - immutable identifier
- **Links to git commit** - full traceability
- **Kept forever** - source of truth for all deployments

### Environment Tags (Floating)

Format: `localhost:5000/expense-tracker:<environment>`

Examples:
- `localhost:5000/expense-tracker:staging`
- `localhost:5000/expense-tracker:latest`

- **Points to latest deployed SHA** in that environment
- **Changes with each deployment** - always points to current version
- **Used by docker-compose** to pull correct image

## Rollback Procedure

To rollback to a previous version:

1. **Find the previous SHA** from git history or deployment logs
2. **Retag that SHA** for the environment:

```powershell
# Example: Rollback production to SHA def5678
docker tag localhost:5000/expense-tracker:def5678 localhost:5000/expense-tracker:latest
docker push localhost:5000/expense-tracker:latest

# Restart container
docker-compose -f "G:\My Drive\Media Related\docker\media-applications.yml" up -d expense-tracker
```

## Environment Mapping

| Environment | Docker Compose Service | Container Name | Docker Tag |
|-------------|------------------------|----------------|------------|
| `staging` | `expense-tracker-test` | expense-tracker-test | `staging` |
| `latest` | `expense-tracker` | expense-tracker | `latest` |

## Best Practices

### 1. Version Bump on Main Only

**NEVER bump versions on feature branches.** Version bumps create the release SHA and must happen on `main`:

```powershell
# ✅ Good - Version bump on main after merge
git checkout main
# Update version in package.json files, CHANGELOG, SystemModal.jsx
npm run build  # Build frontend with new version
git add -A
git commit -m "v4.12.8: Feature description"
# Now build SHA image with correct version
.\scripts\build-and-push.ps1

# ❌ Bad - Version bump on feature branch
git checkout feature/my-feature
# Update version... NO! This creates wrong SHA
```

### 2. Always Build First

Before deploying to any environment, ensure the SHA image is built:

```powershell
# Build once (after version bump on main)
.\scripts\build-and-push.ps1

# Then deploy to staging
.\scripts\build-and-push.ps1 -Environment staging

# Then promote to latest (production)
.\scripts\build-and-push.ps1 -Environment latest
```

### 3. Test in Staging First

Never deploy directly to production without testing in staging:

```powershell
# ✅ Good
.\scripts\build-and-push.ps1 -Environment staging
# ... test in staging ...
.\scripts\build-and-push.ps1 -Environment latest

# ❌ Bad
.\scripts\build-and-push.ps1 -Environment latest  # Skipped staging!
```

### 4. Keep SHA Tags Forever

SHA-tagged images are your audit trail. Never delete them from the registry.

### 5. Document Deployments

Keep a record of which SHA is deployed to each environment:

```
2026-02-08: Deployed abc1234 to production (v4.12.8)
2026-02-07: Deployed def5678 to staging (v4.12.7)
```

## Troubleshooting

### Image Already Exists

If you see "SHA image already exists", the script will skip the build and use the existing image. This is expected behavior.

### Registry Not Accessible

Ensure your local Docker registry is running:

```powershell
docker ps | Select-String "registry"
```

### Container Won't Start

Check container logs:

```powershell
docker logs expense-tracker
# or
docker logs expense-tracker-test
```

### Wrong Image Deployed

Verify which image is running:

```powershell
docker inspect expense-tracker | Select-String "Image"
```

## Migration from Old Workflow

### Old Workflow (Tag-based)

```powershell
.\scripts\build-and-push.ps1 -Tag staging
.\scripts\build-and-push.ps1 -Tag latest
```

### New Workflow (SHA-based)

```powershell
.\scripts\build-and-push.ps1 -Environment staging
.\scripts\build-and-push.ps1 -Environment latest
```

**Key Differences:**
- Old: Rebuilt image for each tag
- New: Build once, retag for environments
- Old: Tags were `staging`, `latest`, `dev`
- New: Environments are `staging`, `latest`

## See Also

- [Pre-Deployment Checklist](../../.kiro/steering/pre-deployment.md)
- [Version Management](../../.kiro/steering/versioning.md)
- [Git Commit Control](../../.kiro/steering/git-commits.md)

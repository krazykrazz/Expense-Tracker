# Feature Branch Preview Deployment

## Overview

The feature preview deployment system allows you to test feature branches in Docker containers before merging to main. This provides a production-like environment for focused testing without affecting staging or production deployments.

## Benefits

- **Isolated Testing**: Test feature branches in containers without affecting other environments
- **Production-Like**: Same Docker environment as staging/production
- **No Conflicts**: Runs on different ports (3001/2425) alongside other containers
- **Quick Iteration**: Build once, test, rebuild as needed
- **Easy Cleanup**: Stop and remove preview containers with one command

## Workflow

### 1. Develop on Feature Branch

```powershell
# Create and switch to feature branch
git checkout -b feature/my-feature

# Make your changes
# ... code changes ...

# Commit your work
git add -A
git commit -m "feat: implement my feature"
```

### 2. Deploy Preview Container

```powershell
# Build and deploy preview
.\scripts\deploy-feature-preview.ps1
```

**What happens:**
- Builds SHA-tagged Docker image from current commit
- Tags image as `preview-<branch-name>` (e.g., `preview-feature-my-feature`)
- Pushes to local registry
- Starts preview container on ports 3001/2425
- Uses isolated `preview-data` volume

**Output:**
```
Preview deployment complete!
Frontend: http://localhost:3001
Backend API: http://localhost:2425
Branch: feature/my-feature
SHA: abc1234
```

### 3. Test Your Feature

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:2425/api/health

Test your feature thoroughly in the containerized environment.

### 4. Iterate if Needed

Make changes, rebuild, and redeploy:

```powershell
# Make code changes
# ... edit files ...

# Commit changes
git add -A
git commit -m "fix: address feedback"

# Rebuild and redeploy
.\scripts\deploy-feature-preview.ps1
```

### 5. Stop Preview Container

When done testing:

```powershell
.\scripts\deploy-feature-preview.ps1 -Stop
```

This stops and removes the preview container.

### 6. Promote to Main

Once testing is complete, promote your feature branch:

```powershell
.\scripts\promote-feature.ps1 -FeatureName my-feature
```

This creates a PR, runs CI, and prepares for merge to main.

## Command Reference

### Basic Commands

```powershell
# Build and deploy preview
.\scripts\deploy-feature-preview.ps1

# Build only (no deploy)
.\scripts\deploy-feature-preview.ps1 -SkipDeploy

# Deploy existing image (no rebuild)
.\scripts\deploy-feature-preview.ps1 -SkipBuild

# Stop and remove preview container
.\scripts\deploy-feature-preview.ps1 -Stop
```

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-Registry` | Docker registry URL | `localhost:5000` |
| `-SkipBuild` | Skip building image (use existing) | False |
| `-SkipDeploy` | Build image but don't deploy container | False |
| `-Stop` | Stop and remove preview container | False |

## Port Mapping

| Environment | Frontend Port | Backend Port | Container Name |
|-------------|---------------|--------------|----------------|
| **Preview** | 3001 | 2425 | expense-tracker-preview |
| Staging | 2627 | 2424 (internal) | expense-tracker-test |
| Production | 2424 | 2424 (internal) | expense-tracker |

Preview uses different ports to avoid conflicts with staging and production.

## Data Isolation

Each environment uses a separate data volume:

- **Preview**: `./preview-data/` - Isolated test data
- **Staging**: `./staging-data/` - Copy of production data for testing
- **Production**: `./config/` - Real production data

The preview environment starts with an empty database. You can:
- Seed test data manually
- Copy a backup from staging/production
- Use the app to create test data

## Image Tags

Preview images are tagged with the branch name:

```
localhost:5000/expense-tracker:abc1234              # SHA tag (immutable)
localhost:5000/expense-tracker:preview-feature-my-feature  # Preview tag (floating)
```

The preview tag is updated each time you deploy from that branch.

## Complete Example Workflow

```powershell
# 1. Create feature branch
git checkout -b feature/settings-split

# 2. Implement feature
# ... make changes ...
git add -A
git commit -m "feat: split settings into separate modals"

# 3. Deploy preview for testing
.\scripts\deploy-feature-preview.ps1

# 4. Test at http://localhost:3001
# ... manual testing ...

# 5. Fix issues found during testing
# ... make changes ...
git add -A
git commit -m "fix: address modal state issues"

# 6. Redeploy with fixes
.\scripts\deploy-feature-preview.ps1

# 7. Test again
# ... verify fixes ...

# 8. Stop preview when done
.\scripts\deploy-feature-preview.ps1 -Stop

# 9. Promote to main via PR
.\scripts\promote-feature.ps1 -FeatureName settings-split
```

## Comparison with Other Environments

### Local Development (npm run dev)
- **Pros**: Fast hot-reload, easy debugging
- **Cons**: Not containerized, different from production
- **Use for**: Active development, quick iterations

### Feature Preview (docker-compose.preview.yml)
- **Pros**: Production-like environment, isolated testing
- **Cons**: Slower rebuild, no hot-reload
- **Use for**: Pre-merge testing, container-specific issues

### Staging (docker-compose.yml --profile staging)
- **Pros**: Production data copy, final validation
- **Cons**: Only for merged code, shared environment
- **Use for**: Post-merge testing before production

### Production (docker-compose.yml)
- **Pros**: Real environment, real data
- **Cons**: Can't test unmerged code
- **Use for**: Actual deployments

## Recommended Workflow

```
Local Dev → Feature Preview → PR/CI → Staging → Production
   ↓            ↓                ↓        ↓         ↓
 npm run    docker preview    GitHub   merged    deployed
   dev                         Actions   code      code
```

1. **Local Dev**: Rapid development with hot-reload
2. **Feature Preview**: Container testing before merge
3. **PR/CI**: Automated tests on pull request
4. **Staging**: Final validation with production data
5. **Production**: Deploy to users

## Troubleshooting

### Preview Container Won't Start

Check if ports are already in use:

```powershell
# Check what's using port 3001
netstat -ano | findstr :3001

# Check what's using port 2425
netstat -ano | findstr :2425
```

If ports are in use, stop the conflicting service or modify `docker-compose.preview.yml` to use different ports.

### Image Build Fails

Ensure you're on a feature branch (not main):

```powershell
git branch --show-current
```

The script prevents building from main to avoid confusion with the main deployment workflow.

### Container Logs

View preview container logs:

```powershell
docker logs expense-tracker-preview

# Follow logs in real-time
docker logs -f expense-tracker-preview
```

### Clean Up Old Images

Remove old preview images:

```powershell
# List preview images
docker images | Select-String "preview"

# Remove specific preview image
docker rmi localhost:5000/expense-tracker:preview-old-branch

# Remove all unused images
docker image prune -a
```

## Best Practices

### 1. Test in Preview Before PR

Always deploy to preview and test before creating a PR:

```powershell
# ✅ Good
.\scripts\deploy-feature-preview.ps1
# ... test thoroughly ...
.\scripts\promote-feature.ps1 -FeatureName my-feature

# ❌ Bad
.\scripts\promote-feature.ps1 -FeatureName my-feature  # Skipped preview testing!
```

### 2. Use Fresh Data

Start with a clean database or copy a recent backup:

```powershell
# Option 1: Start fresh (empty database)
# Just deploy - preview-data will be created empty

# Option 2: Copy staging data
Copy-Item -Path "staging-data\expenses.db" -Destination "preview-data\expenses.db"
```

### 3. Stop Preview When Done

Don't leave preview containers running indefinitely:

```powershell
# Stop when done testing
.\scripts\deploy-feature-preview.ps1 -Stop
```

### 4. Clean Up Preview Data

Remove preview data between features:

```powershell
# Remove preview data directory
Remove-Item -Recurse -Force preview-data
```

### 5. Document Preview Testing

In your PR description, mention that you tested in preview:

```markdown
## Testing

- ✅ Tested locally with npm run dev
- ✅ Tested in preview container (http://localhost:3001)
- ✅ Verified with production-like data
```

## See Also

- [SHA-Based Container Deployment](SHA_BASED_CONTAINERS.md)
- [Feature Branch Workflow](../development/FEATURE_BRANCH_WORKFLOW.md)
- [Deployment Workflow](DEPLOYMENT_WORKFLOW.md)

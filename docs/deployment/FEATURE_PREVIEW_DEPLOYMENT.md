# Feature Branch Preview Deployment

## Overview

The feature preview deployment system allows you to test feature branches in Docker containers before merging to main. This provides a production-like environment for focused testing without affecting staging or production deployments.

## Benefits

- **Isolated Testing**: Test feature branches in containers without affecting other environments
- **Production-Like**: Same Docker environment as staging/production
- **No Conflicts**: Runs on host port 3001 alongside staging (2627) and production (2424)
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
- Refuses to run on `main`
- Stops the preview container if it is already running
- Runs `npm run build` in `frontend/` as a pre-check (the image builds its own frontend bundle)
- Removes any existing local `expense-tracker:<sha>` image and rebuilds it from the working tree with `docker build`
- Tags the image locally as `expense-tracker:preview-<branch-name>` (`/` replaced by `-`, e.g. `preview-feature-my-feature`). Nothing is pushed to a registry
- Starts `expense-tracker-preview` from `docker-compose.preview.yml` on host port 3001
- Uses the isolated `./preview-data` directory mounted at `/config`

**Output (abridged):**
```
Preview deployment complete!
Frontend: http://localhost:3001
Backend API: http://localhost:2425
Branch: feature/my-feature
SHA: abc1234
```

> The script's "Backend API" line is wrong: `docker-compose.preview.yml` maps only `3001:2424`. The API is served from the same port: http://localhost:3001/api/health.

**Note**: When run through automation tools, the script may not display console output, but it executes successfully. Verify deployment by:
- Checking Docker images: `docker images | Select-String "preview"`
- Checking running containers: `docker ps --filter "name=expense-tracker-preview"`
- Accessing the preview URLs above

Full colored output is displayed when run directly in a PowerShell terminal.

### 3. Test Your Feature

- **App**: http://localhost:3001
- **API health**: http://localhost:3001/api/health

The container runs with `NODE_ENV=production` and `APP_ENV=preview`; `APP_ENV` is what `/api/version` reports as the environment. The preview environment displays a **purple banner** at the top with the text "PREVIEW ENVIRONMENT - Testing feature branch before merge" and an eye icon (👁️). This visual indicator helps distinguish the preview environment from:
- **Staging** (orange banner 🧪)
- **Development** (blue banner 🔧)
- **Production** (no banner)

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

This runs `docker-compose -f docker-compose.preview.yml down`, stopping and removing the preview container. The container uses `restart: unless-stopped`, so it otherwise comes back after a Docker restart.

### 6. Promote to Main

Once testing is complete, promote your feature branch:

```powershell
.\scripts\promote-feature.ps1 -FeatureName my-feature
```

This merges the latest `main` into the branch, runs the frontend and backend tests locally (unless `-SkipTests`), pushes the branch and opens a PR. CI then runs on the PR.

## Command Reference

### Basic Commands

```powershell
# Build and deploy preview
.\scripts\deploy-feature-preview.ps1

# Build only (no deploy)
.\scripts\deploy-feature-preview.ps1 -SkipDeploy

# Deploy existing local image for the current commit (no rebuild)
.\scripts\deploy-feature-preview.ps1 -SkipBuild

# Stop and remove preview container
.\scripts\deploy-feature-preview.ps1 -Stop
```

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `-SkipBuild` | Reuse the existing local `expense-tracker:<sha>` image (fails if it does not exist) | False |
| `-SkipDeploy` | Build image but don't deploy container | False |
| `-Stop` | Stop and remove preview container | False |

## Port Mapping

| Environment | Host Port | Container Port | Container Name |
|-------------|-----------|----------------|----------------|
| **Preview** | 3001 | 2424 | expense-tracker-preview |
| Staging | 2627 | 2424 | expense-tracker-test |
| Production | 2424 | 2424 | expense-tracker |

The app and API share one port in every environment. Preview uses a different host port to avoid conflicts with staging and production.

## Data Isolation

Each environment uses a separate data volume:

- **Preview**: `./preview-data/` - Isolated test data
- **Staging**: `./staging-data/` - Copy of production data for testing
- **Production**: `./config/` - Real production data (when production runs from the repo `docker-compose.yml`)

Each directory is mounted at `/config` and has the same layout (`database/expenses.db`, `backups/`, `config/`, `invoices/`, `statements/`).

If `./preview-data` is empty, the preview starts with an empty database. You can:
- Seed test data manually
- Copy a backup from staging/production
- Use the app to create test data

`./preview-data` persists between preview runs.

## Image Tags

Preview images exist only locally (no registry needed):

```
expense-tracker:abc1234              # SHA tag (immutable)
expense-tracker:preview-feature-my-feature  # Preview tag (floating)
```

The preview tag is updated each time you deploy from that branch. Because the image is built from the working tree, uncommitted changes are included.

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
```

If the port is in use, stop the conflicting service or change the host port in `docker-compose.preview.yml`.

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
docker rmi expense-tracker:preview-old-branch

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

# Option 2: Copy staging data (stop the preview container first)
New-Item -ItemType Directory -Force preview-data\database | Out-Null
Copy-Item -Path "staging-data\database\expenses.db" -Destination "preview-data\database\expenses.db"
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

- [Deployment Workflow](DEPLOYMENT_WORKFLOW.md)
- [Feature Branch Workflow](../development/FEATURE_BRANCH_WORKFLOW.md)
- [Staging Environment](../development/STAGING_ENVIRONMENT.md)

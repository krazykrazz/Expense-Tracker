# Feature Branch Promotion Model

**Last Updated**: January 24, 2026  
**Status**: Active

This document outlines the feature branch promotion workflow for the Expense Tracker application, ensuring clean development practices and stable main branch deployments.

## Branch Strategy

### Branch Types

1. **main** - Production-ready code, always deployable
2. **feature/[feature-name]** - Individual feature development
3. **hotfix/[issue-description]** - Critical production fixes
4. **release/[version]** - Release preparation (optional for small team)

### Branch Naming Convention

- **Feature branches**: `feature/budget-alert-notifications`
- **Hotfix branches**: `hotfix/fix-merchant-analytics-calculation`
- **Release branches**: `release/v4.10.0` (if used)

## Feature Development Workflow

### 1. Starting a New Feature

```bash
# Ensure main is up to date
git checkout main
git pull origin main

# Create and switch to feature branch
git checkout -b feature/budget-alert-notifications

# Push feature branch to remote
git push -u origin feature/budget-alert-notifications
```

### 2. Development Process

```bash
# Make changes and commit regularly
git add .
git commit -m "feat: implement BudgetAlertBanner component"

# Push changes to feature branch
git push origin feature/budget-alert-notifications

# Keep feature branch updated with main (recommended weekly)
git checkout main
git pull origin main
git checkout feature/budget-alert-notifications
git merge main
```

### 3. Feature Completion and Testing

Before promoting to main, ensure:
- [ ] All feature tasks completed
- [ ] All tests passing (unit, property-based, integration)
- [ ] Code reviewed (self-review minimum)
- [ ] Documentation updated
- [ ] Version numbers updated
- [ ] CHANGELOG.md updated

### 4. Promotion to Main

```bash
# Final sync with main
git checkout main
git pull origin main
git checkout feature/budget-alert-notifications
git merge main

# Run final tests
npm test  # or your test command

# Switch to main and merge feature
git checkout main
git merge feature/budget-alert-notifications

# Push to main
git push origin main

# Clean up feature branch (optional)
git branch -d feature/budget-alert-notifications
git push origin --delete feature/budget-notifications
```

## Hotfix Workflow

For critical production issues:

```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/fix-critical-bug

# Make fix and test
# ... make changes ...
git add .
git commit -m "fix: resolve critical calculation error"

# Merge back to main
git checkout main
git merge hotfix/fix-critical-bug
git push origin main

# Clean up
git branch -d hotfix/fix-critical-bug
git push origin --delete hotfix/fix-critical-bug
```

## Automated Scripts

### Create Feature Branch Script

Create `scripts/create-feature-branch.ps1`:

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$FeatureName
)

$BranchName = "feature/$FeatureName"

Write-Host "Creating feature branch: $BranchName" -ForegroundColor Green

# Ensure we're on main and up to date
git checkout main
git pull origin main

# Create and switch to feature branch
git checkout -b $BranchName

# Push to remote
git push -u origin $BranchName

Write-Host "Feature branch '$BranchName' created and pushed to remote" -ForegroundColor Green
Write-Host "You can now start development on this branch" -ForegroundColor Yellow
```

### Promote Feature Script

Create `scripts/promote-feature.ps1`:

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$FeatureName,
    [switch]$SkipTests
)

$BranchName = "feature/$FeatureName"

Write-Host "Promoting feature branch: $BranchName to main" -ForegroundColor Green

# Ensure we're on the feature branch
git checkout $BranchName

# Sync with main
Write-Host "Syncing with main..." -ForegroundColor Yellow
git checkout main
git pull origin main
git checkout $BranchName
git merge main

if ($LASTEXITCODE -ne 0) {
    Write-Host "Merge conflicts detected. Please resolve and try again." -ForegroundColor Red
    exit 1
}

# Run tests unless skipped
if (-not $SkipTests) {
    Write-Host "Running tests..." -ForegroundColor Yellow
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Tests failed. Please fix and try again." -ForegroundColor Red
        exit 1
    }
}

# Merge to main
Write-Host "Merging to main..." -ForegroundColor Yellow
git checkout main
git merge $BranchName

# Push to main
git push origin main

Write-Host "Feature '$FeatureName' successfully promoted to main!" -ForegroundColor Green
Write-Host "Consider deleting the feature branch: git branch -d $BranchName" -ForegroundColor Yellow
```

## Integration with Existing Workflow

### Version Management

When promoting features, follow the existing version management rules:

1. **Determine version bump type**:
   - MAJOR: Breaking changes, database schema changes
   - MINOR: New features (like budget-alert-notifications)
   - PATCH: Bug fixes, small improvements

2. **Update all version locations**:
   - `frontend/package.json`
   - `backend/package.json`
   - `frontend/src/App.jsx` (footer)
   - `frontend/src/components/BackupSettings.jsx` (changelog)

3. **Update CHANGELOG.md** with new version entry

### Docker Integration

The existing Docker build and push process remains the same:

```powershell
# After promoting to main
.\build-and-push.ps1 -Tag latest
```

### Pre-deployment Checklist Integration

Before promoting any feature, run through the existing pre-deployment checklist:

1. **Specification Review**: Check `.kiro/specs/` for completeness
2. **Design Document Review**: Ensure implementation matches design
3. **Code Quality**: Check for TODO/FIXME comments
4. **Documentation**: Update README, feature docs
5. **Testing**: All tests passing
6. **Version Management**: Proper version bump applied

## CI/CD Integration

### GitHub Actions Workflows

This project uses GitHub Actions for automated testing and Docker builds. The CI/CD integration works seamlessly with the feature branch model.

### Automated Test Execution

When you push to a feature branch or create a pull request, GitHub Actions automatically runs tests:

| Event | Branches | What Runs |
|-------|----------|-----------|
| Push | `main`, `feature/**` | Backend + Frontend tests |
| Pull Request | `main` | Backend + Frontend tests |
| Merge to main | `main` | Docker build (optional) |

### How CI/CD Interacts with Feature Branches

1. **During Development**: Every push to your feature branch triggers the CI workflow
2. **Pull Requests**: Opening a PR to main shows test status as a check
3. **Before Promotion**: Ensure all CI checks pass before merging to main
4. **After Merge**: Docker build workflow runs automatically on main

### Viewing Workflow Results

#### From GitHub UI
1. Navigate to your repository on GitHub
2. Click the **Actions** tab
3. Select a workflow run to see details
4. Click on individual jobs (Backend Tests, Frontend Tests) for logs

#### From Pull Requests
1. Open your pull request
2. Scroll to the "Checks" section at the bottom
3. Click "Details" next to any check to see logs
4. All checks must pass (green) before merging

#### Status Indicators
- ✅ **Green checkmark**: All tests passed
- ❌ **Red X**: Tests failed - click for details
- 🟡 **Yellow dot**: Tests in progress
- ⚪ **Gray circle**: Tests pending/queued

### CI Workflow Details

The CI workflow (`.github/workflows/ci.yml`) runs:

**Backend Tests** (Jest):
- Runs in `backend/` directory
- Uses Node.js 20
- Executes `npm test` with `--runInBand` flag
- Tests run sequentially to avoid database conflicts

**Frontend Tests** (Vitest):
- Runs in `frontend/` directory
- Uses Node.js 20
- Excludes performance tests (`App.performance.test.jsx`)
- Tests run in parallel for speed

Both jobs run simultaneously for faster feedback (~3-5 minutes total).

### Docker Build Workflow

The Docker workflow (`.github/workflows/docker.yml`) runs on merge to main:

- Builds the Docker image to verify Dockerfile correctness
- Tags with version from `package.json`
- **Does NOT push** to registry (localhost:5000 not accessible from GitHub)

For actual deployment, use the local script:
```powershell
.\build-and-push.ps1 -Tag latest
```

### Updated Promotion Checklist

Before promoting a feature branch, verify:

- [ ] All feature tasks completed
- [ ] All tests passing locally
- [ ] **CI workflow passing on GitHub** ← New
- [ ] Code reviewed (self-review minimum)
- [ ] Documentation updated
- [ ] Version numbers updated
- [ ] CHANGELOG.md updated

### Troubleshooting CI Failures

**Tests pass locally but fail in CI:**
- Check for environment-specific issues
- Ensure all dependencies are in `package.json`
- Look for timing-sensitive tests

**CI is slow:**
- Tests run in parallel by default
- Performance tests are excluded
- npm dependencies are cached

**Docker build fails:**
- Check Dockerfile syntax
- Verify all required files are present
- Review build logs in Actions tab

See [GITHUB_ACTIONS_CICD.md](./GITHUB_ACTIONS_CICD.md) for detailed CI/CD documentation.

## Branch Protection Rules

### Recommended Git Settings

```bash
# Prevent accidental pushes to main
git config branch.main.pushRemote no_push

# Set up main branch to require explicit merge
git config branch.main.merge refs/heads/main
```

### GitHub/GitLab Protection (if using remote)

If using GitHub or GitLab, consider these protection rules for main:

- Require pull request reviews
- Require status checks to pass
- Require branches to be up to date before merging
- Restrict pushes to main branch

## Feature Branch Lifecycle

### 1. Planning Phase
- Create spec in `.kiro/specs/[feature-name]/`
- Review requirements, design, and tasks
- Estimate effort and timeline

### 2. Development Phase
- Create feature branch
- Implement tasks incrementally
- Commit frequently with descriptive messages
- Push to feature branch regularly

### 3. Testing Phase
- Run all tests (unit, property-based, integration)
- Manual testing of feature functionality
- Cross-browser testing (if applicable)
- Performance testing

### 4. Review Phase
- Self-review code changes
- Update documentation
- Verify all requirements met
- Check integration with existing features

### 5. Promotion Phase
- Sync with main branch
- Final testing
- Merge to main
- Deploy and monitor

## Commit Message Convention

Use conventional commit format:

```
type(scope): description

feat(alerts): add budget alert notification banners
fix(merchant): resolve calculation error in analytics
docs(readme): update feature list with alerts
test(budget): add property tests for alert thresholds
refactor(components): extract common alert logic
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `style`, `chore`

## Rollback Strategy

If issues are discovered after promotion:

### Quick Rollback
```bash
# Revert the merge commit
git revert -m 1 <merge-commit-hash>
git push origin main
```

### Feature Branch Rollback
```bash
# Create hotfix branch to remove feature
git checkout -b hotfix/rollback-feature-name
# Remove feature code
git commit -m "fix: rollback problematic feature"
git checkout main
git merge hotfix/rollback-feature-name
git push origin main
```

## Best Practices

### Do's
- ✅ Keep feature branches focused on single features
- ✅ Commit frequently with descriptive messages
- ✅ Sync with main regularly to avoid conflicts
- ✅ Run tests before promoting
- ✅ Update documentation with features
- ✅ Use descriptive branch names

### Don'ts
- ❌ Don't work directly on main branch
- ❌ Don't create long-lived feature branches (>2 weeks)
- ❌ Don't merge without testing
- ❌ Don't skip version updates
- ❌ Don't forget to update CHANGELOG.md
- ❌ Don't leave feature branches undeleted

## Troubleshooting

### Merge Conflicts
```bash
# When conflicts occur during merge
git status  # See conflicted files
# Edit files to resolve conflicts
git add .
git commit -m "resolve merge conflicts"
```

### Lost Changes
```bash
# Find lost commits
git reflog
git checkout <commit-hash>
git checkout -b recovery-branch
```

### Accidental Main Push
```bash
# If you accidentally pushed to main
git revert HEAD
git push origin main
```

## Integration with Kiro Specs

This workflow integrates seamlessly with the existing spec-driven development:

1. **Spec Creation**: Create specs on main branch
2. **Feature Development**: Implement spec tasks on feature branch
3. **Task Tracking**: Use existing task status tools
4. **Property Testing**: Run PBT tests on feature branch
5. **Documentation**: Update docs before promotion

## Example: Budget Alert Notifications

Here's how the budget alert notifications feature would follow this workflow:

```bash
# 1. Create feature branch
git checkout main
git pull origin main
git checkout -b feature/budget-alert-notifications
git push -u origin feature/budget-alert-notifications

# 2. Implement tasks from .kiro/specs/budget-alert-notifications/tasks.md
# ... development work ...

# 3. Regular commits
git add .
git commit -m "feat(alerts): implement BudgetAlertBanner component"
git push origin feature/budget-alert-notifications

# 4. Before promotion
git checkout main
git pull origin main
git checkout feature/budget-alert-notifications
git merge main
npm test

# 5. Promote to main
git checkout main
git merge feature/budget-alert-notifications
git push origin main

# 6. Build and deploy
.\build-and-push.ps1 -Tag latest
```

---

This feature branch model provides structure while maintaining the flexibility needed for rapid development and deployment.
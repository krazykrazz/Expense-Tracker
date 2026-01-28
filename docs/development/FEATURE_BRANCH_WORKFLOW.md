# Feature Branch Promotion Model

**Last Updated**: January 27, 2026  
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

### 4. Promotion to Main (via PR)

The default promotion method creates a Pull Request, allowing CI to run before merging:

```powershell
# Run the promotion script (creates a PR by default)
.\scripts\promote-feature.ps1 -FeatureName budget-alert-notifications
```

The script will:
1. Sync your feature branch with main
2. Run local tests (unless `-SkipTests` is used)
3. Push the feature branch to origin
4. Create a PR via GitHub CLI (or provide web UI instructions)

See [PR Workflow](#pr-workflow) below for details.

## PR Workflow

**Default behavior**: The promotion script creates a Pull Request instead of directly merging to main. This allows CI to run and verify the code before it reaches main.

### Why Use PRs?

- **CI Verification**: GitHub Actions runs automatically on PRs to main
- **Visibility**: Clear place to see test status before merging
- **Review**: Opportunity for code review (even self-review)
- **History**: Clean merge commits in git history

### Using the Promotion Script

```powershell
# Create a PR for your feature (default behavior)
.\scripts\promote-feature.ps1 -FeatureName your-feature

# Skip local tests (CI will still run on the PR)
.\scripts\promote-feature.ps1 -FeatureName your-feature -SkipTests

# Force promotion even with incomplete tasks
.\scripts\promote-feature.ps1 -FeatureName your-feature -Force
```

### PR Creation Methods

#### Method 1: GitHub CLI (Recommended)

If you have the [GitHub CLI](https://cli.github.com/) installed, the script creates the PR automatically:

```
🔗 Creating Pull Request via GitHub CLI...

🎉 Pull Request created successfully!

PR URL: https://github.com/user/repo/pull/123

Next steps:
1. CI will run automatically on the PR
2. Check CI status at the PR page
3. When CI passes and ready to merge:
   gh pr merge --merge --delete-branch
   Or merge via the GitHub web UI
```

#### Method 2: Web UI Fallback

If GitHub CLI is not installed, the script provides a URL for manual PR creation:

```
⚠️  GitHub CLI (gh) not found
To install: https://cli.github.com/

Create your PR manually via the GitHub web UI:

Open this URL to create the PR:
https://github.com/user/repo/compare/main...feature/your-feature?expand=1

Suggested PR title: Your Feature
```

### After Creating the PR

1. **CI runs automatically** - GitHub Actions tests run on the PR
2. **Check status** - View results on the PR page or Actions tab
3. **Merge when ready** - Use web UI or CLI:
   ```bash
   gh pr merge --merge --delete-branch
   ```
4. **Pull changes** - Update your local main:
   ```bash
   git checkout main
   git pull origin main
   ```

### When to Use Direct Merge

The `-DirectMerge` flag bypasses PR creation and merges directly to main:

```powershell
.\scripts\promote-feature.ps1 -FeatureName your-feature -DirectMerge
```

Use direct merge when:
- **CI already verified** - You ran CI on the feature branch
- **Emergency hotfix** - Critical fix needed immediately
- **Documentation-only** - Changes that don't affect code behavior
- **Local-only development** - Not using GitHub for this project

**Note**: Direct merge still runs local tests and uses `--no-ff` for clean history.

### Legacy Promotion (Manual)

For reference, the manual promotion process (equivalent to `-DirectMerge`):

```bash
# Final sync with main
git checkout main
git pull origin main
git checkout feature/budget-alert-notifications
git merge main

# Run final tests
npm test

# Switch to main and merge feature
git checkout main
git merge --no-ff feature/budget-alert-notifications

# Push to main
git push origin main

# Clean up feature branch (optional)
git branch -d feature/budget-alert-notifications
git push origin --delete feature/budget-alert-notifications
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

## Quick Fix PR Workflow

For changes made directly on main that need CI verification before pushing, use the `create-pr-from-main.ps1` script.

### When to Use Quick Fix PR

Use this workflow when you've:
- Made a quick bug fix directly on main
- Updated version numbers or documentation on main
- Made changes that should go through CI before pushing

### Using the Script

```powershell
# Create a PR from changes on main
.\scripts\create-pr-from-main.ps1 -Title "Fix calculation error in budget alerts"

# With optional description
.\scripts\create-pr-from-main.ps1 -Title "Update dependencies" -Description "Bump lodash to fix security vulnerability"
```

### How It Works

1. **Verifies you're on main** - Script only works from main branch
2. **Handles uncommitted changes** - Prompts to commit if needed
3. **Creates temporary branch** - Named `hotfix/YYYYMMDD-HHMMSS`
4. **Pushes branch to origin** - Makes it available for PR
5. **Resets main** - Removes local commits from main
6. **Creates PR** - Via GitHub CLI or provides web UI URL

### Example Output

```
🔧 Creating PR from main branch changes

✅ On main branch

📝 Uncommitted changes detected:
 M backend/services/budgetService.js

You have unstaged changes.
Stage and commit all changes? (y/n) y
💾 Staging and committing all changes...
✅ Changes committed

🔍 Checking for local commits...
✅ Found local commits:
   abc1234 Fix calculation error in budget alerts

🌿 Creating temporary branch: hotfix/20260127-143022
✅ Branch created
📤 Pushing branch to origin...
✅ Branch pushed to origin

🔄 Resetting main to origin/main...

🔗 Creating Pull Request via GitHub CLI...

🎉 Pull Request created successfully!

PR URL: https://github.com/user/repo/pull/124

Next steps:
1. CI will run automatically on the PR
2. Check CI status at the PR page
3. When CI passes, merge the PR:
   gh pr merge hotfix/20260127-143022 --merge --delete-branch
   Or merge via the GitHub web UI

4. After merging, pull the changes:
   git pull origin main

📍 You are now on the main branch
The hotfix branch 'hotfix/20260127-143022' is ready for PR review
```

### After Merging

Once the PR is merged:

```bash
# Pull the merged changes back to main
git pull origin main
```

### Quick Fix vs Feature Branch

| Scenario | Use |
|----------|-----|
| New feature development | Feature branch + `promote-feature.ps1` |
| Quick bug fix on main | `create-pr-from-main.ps1` |
| Version bump on main | `create-pr-from-main.ps1` |
| Documentation update | Either (or direct push if no CI needed) |
| Emergency hotfix | `create-pr-from-main.ps1` or direct push |

## Automated Scripts

### Create Feature Branch Script

The `scripts/create-feature-branch.ps1` script automates feature branch creation:

```powershell
# Create a new feature branch
.\scripts\create-feature-branch.ps1 -FeatureName budget-alert-notifications
```

This script:
1. Ensures you're on an up-to-date main branch
2. Creates the feature branch
3. Pushes it to the remote

### Promote Feature Script

The `scripts/promote-feature.ps1` script handles feature promotion with PR support:

```powershell
# Create a PR (default behavior)
.\scripts\promote-feature.ps1 -FeatureName budget-alert-notifications

# Available parameters:
#   -FeatureName    (required) Name of the feature (without 'feature/' prefix)
#   -SkipTests      Skip running local tests before promotion
#   -Force          Proceed even with incomplete tasks or uncommitted changes
#   -DirectMerge    Bypass PR and merge directly to main
```

**Default behavior (PR workflow)**:
1. Verifies feature branch exists
2. Checks for uncommitted changes
3. Syncs with main (merges main into feature)
4. Runs local tests (unless `-SkipTests`)
5. Pushes feature branch to origin
6. Creates PR via GitHub CLI (or provides web UI URL)

**With `-DirectMerge` flag**:
1. Steps 1-4 same as above
2. Merges feature to main with `--no-ff`
3. Pushes to origin/main
4. Offers to delete feature branch

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
- [ ] **CI workflow passing on GitHub** (after PR is created)
- [ ] Code reviewed (self-review minimum)
- [ ] Documentation updated
- [ ] Version numbers updated
- [ ] CHANGELOG.md updated

### PR Merge Checklist

After creating a PR:

- [ ] CI checks pass (green checkmark on PR)
- [ ] No merge conflicts
- [ ] Ready to merge

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
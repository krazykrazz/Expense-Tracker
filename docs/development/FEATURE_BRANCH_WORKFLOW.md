# Feature Branch Workflow

Branch conventions and the local scripts that create branches and open PRs. Related documents:

- [Deployment Workflow](../deployment/DEPLOYMENT_WORKFLOW.md) — the end-to-end process (PR → staging → release → production)
- [Agent instructions](../../.github/copilot-instructions.md) — branch protection and merge rules (summary)
- [GitHub Actions CI/CD](./GITHUB_ACTIONS_CICD.md) — the checks that run on a PR

## Branches

| Branch | Created by | Notes |
|--------|------------|-------|
| `main` | — | Protected: PRs only, required checks `Backend Tests Status` and `Frontend Tests Status`, branch must be up to date, signed commits, merge commits only |
| `feature/<kebab-name>` | `create-feature-branch.ps1` or `git checkout -b` | Promoted with `promote-feature.ps1` |
| `hotfix/<yyyyMMdd-HHmmss>` | `create-pr-from-main.ps1` | Temporary branch for commits made on local `main` |
| `release/vX.Y.Z` | Release workflow (`release.yml`) | The only branches that may change version numbers |

Other prefixes (e.g. `docs/...`) work with plain `git` and `gh pr create`; the scripts below only handle `feature/` and `hotfix/`.

The pre-commit hook installed by `.\scripts\install-git-hooks.ps1` blocks staged version bumps on `feature/*` and `hotfix/*` branches, and the `Version Consistency Check` workflow flags them on any non-`release/*` PR. See [Version-Bump Guardrails](../deployment/DEPLOYMENT_WORKFLOW.md#version-bump-guardrails).

## Choosing a Path

| Situation | Use |
|-----------|-----|
| New feature or multi-commit work | Feature branch + `promote-feature.ps1` |
| Small fix already committed (or ready to commit) on local `main` | `create-pr-from-main.ps1` |
| Version bump / release | Release workflow — see [Deployment Workflow](../deployment/DEPLOYMENT_WORKFLOW.md#phase-4-release-version-bump) |

All paths end in a PR; nothing can be pushed to `main` directly.

## Scripts

Run all scripts from the repository root in PowerShell. PR creation needs the [GitHub CLI](https://cli.github.com/) (`gh`); without it the scripts print a compare URL for creating the PR in the browser.

### create-feature-branch.ps1

```powershell
.\scripts\create-feature-branch.ps1 -FeatureName my-feature
```

Checks out `main`, pulls `origin/main`, fails if `feature/my-feature` already exists locally, creates it and pushes it with upstream tracking. Its "next steps" output still points at `.kiro/specs/<name>/tasks.md`; specs now live in `specs/`.

### promote-feature.ps1

```powershell
.\scripts\promote-feature.ps1 -FeatureName my-feature
.\scripts\promote-feature.ps1 -FeatureName my-feature -SkipTests
.\scripts\promote-feature.ps1 -FeatureName my-feature -CreateIssue -IssueLabel enhancement
```

| Parameter | Description |
|-----------|-------------|
| `-FeatureName` | Required. Branch name without the `feature/` prefix |
| `-SkipTests` | Skip the local test run (CI still runs on the PR) |
| `-Force` | Proceed with uncommitted changes or incomplete spec tasks |
| `-CreateIssue` | Create a GitHub issue first and add `Closes #N` to the PR body |
| `-IssueLabel` | `bug` (default), `enhancement` or `chore` |

Steps:
1. Requires `feature/<name>` to exist locally and checks it out
2. If any `backend/config/database/*.db-shm` / `*.db-wal` files are tracked, untracks them and commits the removal
3. Stops on uncommitted changes unless `-Force`
4. Pulls `origin/main` into local `main` and merges `main` into the feature branch; stops on conflicts
5. Unless `-SkipTests`, runs `npm run test:parallel` in `frontend/` and then `backend/`, and stops if either fails
6. If `.kiro/specs/<name>/tasks.md` exists, stops unless every task is checked or `-Force` is set. `.kiro/` is no longer in the repository, so this check does not run
7. Pushes the branch and runs `gh pr create --base main` with the title `feat: <Title Cased Name>`. If a PR already exists it prints its URL

The script never merges. Merge the PR once the required checks pass (`gh pr merge <number> --merge --delete-branch`).

### create-pr-from-main.ps1

For commits made on local `main` (which cannot be pushed directly):

```powershell
.\scripts\create-pr-from-main.ps1 -Title "fix: correct budget rounding"
.\scripts\create-pr-from-main.ps1 -Title "fix: correct budget rounding" -Description "Details" -CreateIssue
```

| Parameter | Description |
|-----------|-------------|
| `-Title` | Required. PR title, and the commit message if the script commits for you |
| `-Description` | PR summary (defaults to the title) |
| `-ResetMainToOrigin` | After pushing the branch, `git reset --hard origin/main` on local `main` (asks you to type `RESET`) |
| `-CreateIssue` / `-IssueLabel` | As for `promote-feature.ps1` |

Steps:
1. Requires the current branch to be `main`
2. With uncommitted changes, offers to commit them with `-Title` as the message: staged changes only if anything is staged, otherwise everything (`git add -A`). Declining exits
3. Fetches `origin/main` and stops if there are no commits in `origin/main..HEAD`
4. Creates `hotfix/<yyyyMMdd-HHmmss>` at `HEAD`, pushes it and returns to `main`
5. Leaves local `main` unchanged unless `-ResetMainToOrigin`
6. Opens the PR with `gh pr create --base main`

After the PR merges, `git pull origin main` brings local `main` up to date (a fast-forward, since the merge commit contains your commits).

### git-helpers.ps1

Dot-source it to load helper functions into the current session:

```powershell
. .\scripts\git-helpers.ps1
```

| Function | Action |
|----------|--------|
| `Show-Branches` | List local and remote branches |
| `Show-Status` | `git status` plus the last 5 commits |
| `Show-FeatureBranches` | Local `feature/*` branches with last-commit age |
| `Sync-WithMain` | Pull `origin/main` into `main`, then merge `main` into the current branch |
| `New-FeatureBranch [-Name]` | Calls `create-feature-branch.ps1` |
| `Promote-Feature [-Name] [-SkipTests]` | Calls `promote-feature.ps1`; the name defaults to the current `feature/*` branch |
| `Remove-FeatureBranch [-Name]` | Deletes `feature/<name>` locally (`git branch -d`) and on `origin` |
| `Show-Help` | List the functions |

## OLD_CONTENT_BELOW

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
   - `frontend/src/components/SystemModal.jsx` (changelog)
   - `frontend/src/utils/changelog.js` (centralized in-app changelog data)

3. **Update CHANGELOG.md** with new version entry

### Docker Integration

The existing Docker build and push process targets GHCR:

```powershell
# After promoting to main - build and push to GHCR
.\scripts\build-and-push.ps1
```

### Pre-deployment Checklist Integration

Before promoting any feature, run through the existing pre-deployment checklist:

1. **Specification Review**: Check `specs/` for completeness
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

**Backend Unit Tests** (Jest):
- Runs in `backend/` directory
- Uses Node.js 20
- Parallel Jest workers with per-worker SQLite database isolation
- Executes `npm run test:unit:ci`

**Backend PBT Tests** (Jest, sharded):
- 145 PBT test files split across 3 parallel shards
- Each shard runs parallel Jest workers
- Reduced iterations (`FAST_CHECK_NUM_RUNS=15`) for CI speed
- Summary job aggregates results for branch protection

**Frontend Tests** (Vitest):
- Runs in `frontend/` directory
- Uses Node.js 20
- Excludes performance tests (`App.performance.test.jsx`)
- Tests run in parallel for speed

All jobs run simultaneously for fast feedback.

### Docker Build Workflow

The Docker build is integrated into the CI workflow (`ci.yml`). On merge to main, after all tests pass, the `build-and-push-ghcr` job:

- Builds the Docker image
- Pushes to GHCR with SHA, version, and `latest` tags
- Creates GitHub releases

For local deployment:
```powershell
.\scripts\build-and-push.ps1 -Environment latest
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

Branch protection is **active** on the `main` branch with the following rules:

- **Require pull requests** — Direct pushes to `main` are blocked
- **Required status checks**: `Backend Unit Tests`, `Backend PBT Shard 1/3`, `Backend PBT Shard 2/3`, `Backend PBT Shard 3/3`, `Frontend Tests`
- **Require branches to be up to date** before merging

### Impact on Workflow

- The `-DirectMerge` flag on `promote-feature.ps1` will be rejected by GitHub
- All changes to `main` must go through a PR with passing CI
- Emergency hotfixes still go through PRs — use `create-pr-from-main.ps1` for fast turnaround

### Local Git Settings (Optional)

```bash
# Prevent accidental pushes to main
git config branch.main.pushRemote no_push

# Set up main branch to require explicit merge
git config branch.main.merge refs/heads/main
```

## Feature Branch Lifecycle

### 1. Planning Phase
- Create spec in `specs/[feature-name]/`
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

# 2. Implement tasks from specs/budget-alert-notifications/tasks.md
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
.\scripts\build-and-push.ps1 -Tag latest
```

---

This feature branch model provides structure while maintaining the flexibility needed for rapid development and deployment.
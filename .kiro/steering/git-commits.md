# Git Commit Control

## ⚠️ MANDATORY: Feature Branch for Spec Implementation ⚠️

**THIS IS THE FIRST THING TO DO when implementing spec tasks:**

1. Run `git branch --show-current`
2. **If on `main`**: Automatically create a feature branch named `feature/<spec-name>` and switch to it. No need to ask - just do it and inform the user.
3. **If already on a feature branch**: Ask the user whether to:
   - Continue on the current branch (if the specs are related), OR
   - Create a new feature branch for the new spec
4. Inform the user what branch you're working on.

This ensures all spec work is isolated and can be cleanly merged with `--no-ff`.

---

## ⚠️ Branch Protection Active on `main`

Branch protection rules are enabled on the `main` branch in GitHub. This means:

- **Direct pushes to `main` are blocked** — all changes must go through a Pull Request
- **Required status checks must pass before merging**: `Backend Unit Tests`, `Backend PBT Tests`, `Frontend Tests`
- **Branches must be up to date** with `main` before merging
- The `-DirectMerge` flag on `promote-feature.ps1` will **not work** — GitHub will reject the push

All merges to `main` must go through the PR workflow with passing CI.

---

## Commit Control

The agent can auto-commit in specific scenarios, but otherwise defers to the user.

## Auto-Commit Allowed Scenarios

The agent MAY automatically commit (using `git add -A && git commit -m "message"`) in these cases:

1. **After completing all spec tasks** - When all tasks in a spec's `tasks.md` are marked complete
2. **Version bumps during deployment** - When pushing to production, commit version changes automatically
3. **When explicitly requested** - User says "commit", "commit this", "go ahead and commit", etc.

## Auto-Commit Rules

When auto-committing:
- Use descriptive commit messages (e.g., "feat: implement insurance-claim-reminders spec" or "v4.12.8: bug fixes")
- For spec completions, reference the spec name in the commit message
- For deployments, include the version number
- Inform the user what was committed

## Default Behavior (No Auto-Commit)

For all other scenarios, the agent should:
1. **DO** make all code changes, version updates, and file modifications as requested
2. **DO** inform the user when changes are ready to be committed
3. **DO** suggest a commit message when appropriate
4. **DO NOT** commit without falling into one of the allowed scenarios above

## When User Asks to Deploy/Push to Production

1. Make all necessary code changes
2. Update version numbers in all required locations
3. Update CHANGELOG.md and in-app changelog
4. Build the frontend
5. Build and push the Docker image
6. **Auto-commit** the version bump with message like `v4.12.8: <brief description>`
7. Inform the user what was committed and deployed

## Suggested Commit Strategy

When the user is ready to commit, suggest batching related changes:

- **Feature commits**: One commit per complete feature
- **Bug fix commits**: Batch related fixes into single commits when possible
- **Version bumps**: Include version changes with the feature/fix they relate to

## Feature Branch Merges

**IMPORTANT**: Always use `--no-ff` (no fast-forward) when merging feature branches into main.

### Why --no-ff?

- Preserves the feature branch as a distinct line in git history
- Creates a merge commit that clearly shows when a feature was integrated
- Makes it easy to see all commits that were part of a feature
- Allows easy revert of an entire feature if needed

### Merge Command

When merging a feature branch, always use:

```bash
git checkout main
git merge --no-ff feature/branch-name -m "Merge feature/branch-name: description"
```

### Example

```bash
# Good - preserves branch history
git merge --no-ff feature/multi-invoice-support -m "Merge feature/multi-invoice-support: improved invoice upload UX"

# Bad - loses branch topology (don't do this)
git merge feature/multi-invoice-support
```

The `scripts/promote-feature.ps1` script already uses `--no-ff` by default.

---

## PR-Based Workflow (Default)

**IMPORTANT**: PR-based promotion is now the default workflow. This ensures CI runs before code reaches main.

### Feature Branch Promotion

When promoting a feature branch to main, use the `promote-feature.ps1` script:

```powershell
.\scripts\promote-feature.ps1 -FeatureName your-feature
```

**What the script does:**
1. Verifies the feature branch exists
2. Checks for uncommitted changes
3. Syncs with main (merges main into feature branch)
4. Runs local tests (unless `-SkipTests` is used)
5. Pushes the feature branch to origin
6. Creates a PR via GitHub CLI (or provides web UI URL)
7. Outputs the PR URL and next steps

**After PR creation:**
1. GitHub Actions CI runs automatically on the PR
2. Check CI status on the PR page
3. If CI passes, merge via web UI or `gh pr merge`
4. Delete the feature branch

### Quick Fixes on Main

When making quick changes directly on main (bug fixes, version bumps, etc.), use the `create-pr-from-main.ps1` script:

```powershell
.\scripts\create-pr-from-main.ps1 -Title "Fix: description of fix"
```

**What the script does:**
1. Verifies you're on the main branch
2. Creates a temporary hotfix branch (e.g., `hotfix/20260127-143022`)
3. Pushes the branch and creates a PR
4. Switches back to main
5. Provides instructions to pull merged changes

### When to Use Each Script

| Scenario | Script to Use |
|----------|---------------|
| Promoting a feature branch | `promote-feature.ps1 -FeatureName <name>` |
| Quick fix made on main | `create-pr-from-main.ps1 -Title "<description>"` |

### Direct Merge (Blocked by Branch Protection)

The `-DirectMerge` flag on `promote-feature.ps1` is **no longer usable** for merging to `main`. Branch protection rules reject direct pushes. All merges must go through a PR with passing CI status checks.

### Agent Guidance

When assisting with feature promotion:
1. **Always use PR workflow** — Use `promote-feature.ps1` without `-DirectMerge`
2. **For quick fixes on main** — Use `create-pr-from-main.ps1`
3. **Never suggest `-DirectMerge`** — Branch protection will block it

When assisting with changes directly on main:
1. After making changes, suggest using `create-pr-from-main.ps1`
2. Explain that this ensures CI runs before the changes are finalized
3. Provide the command with an appropriate title

---

## Example Workflow

```
User: "push to production"

Agent actions:
1. Update version to X.Y.Z
2. Update CHANGELOG.md
3. Update BackupSettings.jsx changelog
4. Build frontend
5. Build and push Docker image
6. Auto-commit: git add -A && git commit -m "v4.12.7: Description of changes"

Agent response:
"Deployed v4.12.7 to Docker registry and committed the version bump."
```

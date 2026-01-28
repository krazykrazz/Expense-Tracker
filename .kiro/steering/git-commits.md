# Git Commit Control

## ⚠️ MANDATORY: Feature Branch Check for Spec Implementation ⚠️

**THIS IS THE FIRST THING TO DO when implementing spec tasks:**

1. Run `git branch --show-current`
2. If on `main`, STOP and ask user about creating a feature branch
3. Do NOT write any code until the branch question is resolved

See `.kiro/steering/spec-task-execution.md` for the full rule (triggered automatically when reading tasks.md files).

---

## User-Controlled Commits

**IMPORTANT**: The user controls when git commits are made. The agent should NOT automatically commit changes.

## Rules

1. **DO NOT** run `git add` or `git commit` automatically after making changes
2. **DO NOT** commit as part of the deployment/build process unless explicitly asked
3. **DO** make all code changes, version updates, and file modifications as requested
4. **DO** inform the user when changes are ready to be committed
5. **DO** suggest a commit message when appropriate, but let the user decide when to commit

## When User Asks to Deploy/Push to Production

1. Make all necessary code changes
2. Update version numbers in all required locations
3. Update CHANGELOG.md and in-app changelog
4. Build the frontend
5. Build and push the Docker image
6. **STOP** - Do not commit automatically
7. Inform the user: "Changes are ready. When you're ready to commit, you can use: `git add -A && git commit -m 'your message'`"

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
| Emergency hotfix (skip CI) | `promote-feature.ps1 -FeatureName <name> -DirectMerge` |
| CI already verified on branch | `promote-feature.ps1 -FeatureName <name> -DirectMerge` |

### Direct Merge (Bypass PR)

Use the `-DirectMerge` flag only when:
- Making an emergency hotfix that needs immediate deployment
- CI was already run and verified on the feature branch
- The change is documentation-only and doesn't affect code

```powershell
.\scripts\promote-feature.ps1 -FeatureName your-feature -DirectMerge
```

### Agent Guidance

When assisting with feature promotion:
1. **Default to PR workflow** - Use `promote-feature.ps1` without `-DirectMerge`
2. **For quick fixes on main** - Use `create-pr-from-main.ps1`
3. **Only suggest `-DirectMerge`** when the user explicitly needs to bypass CI

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

Agent response:
"Deployed v4.12.7 to Docker registry. Changes are staged but not committed.

When ready, commit with:
git add -A && git commit -m 'v4.12.7: Description of changes'"
```

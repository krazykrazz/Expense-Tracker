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

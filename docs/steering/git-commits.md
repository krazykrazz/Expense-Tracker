# Git & Deployment Workflow

## Feature Branch Rule

When implementing spec tasks:
0. Resolve the spec from `specs/<feature-name>/` (active) or `specs/archive/<feature-name>/` (completed/historical)
1. Check current branch with `git status --branch --short` (NOT `git branch --show-current` — single-line git commands get their output swallowed by tool output pruning; `git status --branch --short` produces enough output to survive pruning)
2. If on `main`: automatically create `feature/<spec-name>` and switch to it
3. If on a feature branch: ask user whether to continue or create a new branch

## Branch Protection

`main` has branch protection enabled:
- Direct pushes blocked — all changes go through PRs
- Required CI checks: `Backend Tests Status`, `Frontend Tests Status`
- Branches must be up to date with `main`

## Auto-Commit Rules

The agent may auto-commit only when:
1. All spec tasks are complete
2. Version bumps during deployment
3. User explicitly requests it

Use descriptive messages (e.g., `feat: implement insurance-claim-reminders spec`).
For all other changes, inform the user and suggest a commit message.

## Feature Branch Promotion

Always use PR workflow:

```powershell
.\scripts\promote-feature.ps1 -FeatureName your-feature
```

This syncs with main, pushes the branch, and creates a PR. After CI passes, merge via web UI or `gh pr merge`.

For quick fixes made on main:

```powershell
.\scripts\create-pr-from-main.ps1 -Title "Fix: description"
```

For bug fixes and hotfixes, always create a GitHub issue for tracking by adding `-CreateIssue`:

```powershell
.\scripts\create-pr-from-main.ps1 -Title "Fix: description" -CreateIssue
.\scripts\create-pr-from-main.ps1 -Title "Fix: description" -CreateIssue -IssueLabel bug
.\scripts\create-pr-from-main.ps1 -Title "chore: cleanup" -CreateIssue -IssueLabel chore
```

This creates a GitHub issue first, then links the PR with `Closes #N` so the issue auto-closes on merge. Labels: `bug` (default), `enhancement`, `chore`.

## Merge Strategy

Merge commits only — squash and rebase are disabled via GitHub repository ruleset. This preserves signed commits and branch topology.

- PRs: `gh pr merge <number> --merge --delete-branch`
- Local: `git merge --no-ff` (the `promote-feature.ps1` script handles this)

## Deployment Workflow (PR-based, branch protection compatible)

Automated via `deploy-to-production.ps1`:

```powershell
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Bug fixes"
.\scripts\deploy-to-production.ps1 -BumpType MINOR -Description "New feature"
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Test" -DryRun
```

The script handles the full flow:
1. Creates `release/vX.Y.Z` branch from main
2. Bumps version in all 7 locations, builds frontend
3. Commits, pushes branch, creates PR via `gh` CLI
4. Waits for CI checks to pass on the PR
5. Merges PR (merge commit), deletes release branch
6. Tags the merge commit on main
7. Waits for CI to build Docker image on GHCR
8. Promotes: staging → confirm → production (latest)

Manual steps (if script times out or needs intervention):
- Merge PR via GitHub web UI when CI passes
- Tag on main: `git tag -a "vX.Y.Z" -m "Release vX.Y.Z: description"` then `git push origin vX.Y.Z`
- Promote: `.\scripts\build-and-push.ps1 -Environment staging` then `-Environment latest`

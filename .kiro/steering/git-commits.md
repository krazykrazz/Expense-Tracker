# Git & Deployment Workflow

## Feature Branch Rule

When implementing spec tasks:
1. Check current branch with `git branch --show-current`
2. If on `main`: automatically create `feature/<spec-name>` and switch to it
3. If on a feature branch: ask user whether to continue or create a new branch

## Branch Protection

`main` has branch protection enabled:
- Direct pushes blocked — all changes go through PRs
- Required CI checks: `Backend Unit Tests`, `Backend PBT Tests`, `Frontend Tests`
- Branches must be up to date with `main`
- `-DirectMerge` flag will NOT work

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

## Merge Strategy

Always use `--no-ff` for feature branch merges (preserves branch topology). The `promote-feature.ps1` script handles this.

## Deployment Workflow (on main only)

1. Verify on `main` branch
2. Update version in all 5 locations (see `versioning.md`)
3. Build frontend: `cd frontend && npm run build`
4. Commit: `git add -A && git commit -m "v5.X.Y: description"`
5. Tag: `git tag -a "v5.X.Y" -m "Release v5.X.Y: description"`
6. Build & push SHA image: `.\scripts\build-and-push.ps1`
7. Deploy staging: `.\scripts\build-and-push.ps1 -Environment staging`
8. Test staging
9. Promote to production: `.\scripts\build-and-push.ps1 -Environment latest`
10. Push tag: `git push origin v5.X.Y`

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

Checks out `main`, pulls `origin/main`, fails if `feature/my-feature` already exists locally, creates it and pushes it with upstream tracking. Its "next steps" output points at `specs/<name>/spec.md`.

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
6. If `specs/<name>/` exists, counts the task checkboxes in its `spec.md` (or `tasks.md` for older specs) and stops unless every task is checked or `-Force` is set
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

## Branch Protection Rules

`main` is protected by a repository ruleset:

- **Pull requests required** — direct pushes to `main` are rejected
- **Required status checks**: `Backend Tests Status` and `Frontend Tests Status` (aggregate jobs; they pass as skipped when CI's path filter finds no relevant changes)
- **Branches must be up to date** with `main` before merging
- **Signed (verified) commits**
- **Merge commits only** — squash and rebase are disabled. Keep a branch current by merging `main` into it, not rebasing

Emergency fixes also go through a PR — use `create-pr-from-main.ps1` for fast turnaround.

## Specs

Feature work starts from `specs/<feature-name>/spec.md` (requirements, design and tasks in one file). Implement on `feature/<feature-name>`, tick the task checkboxes as you go (`promote-feature.ps1` checks them), and move the spec to `specs/archive/` once merged.

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

Never bump versions on feature or hotfix branches; releases are cut by the Release workflow (see [Deployment Workflow](../deployment/DEPLOYMENT_WORKFLOW.md)).

## Rollback Strategy

Revert through a PR, since `main` cannot be pushed to directly:

```powershell
git fetch origin
git checkout -b hotfix/revert-my-feature origin/main
git revert -m 1 <merge-commit-sha>
git push -u origin hotfix/revert-my-feature
gh pr create --base main --title "revert: my-feature" --body "Reverts #<pr>"
```

To roll back a deployment without changing code, retag a known-good image — see [Rollback Procedure](../deployment/DEPLOYMENT_WORKFLOW.md#rollback-procedure).

## Troubleshooting

### Merge Conflicts
```bash
git merge main      # conflicts are reported here
git status          # list conflicted files
# resolve, then
git add <files>
git commit
```

### Lost Changes
```bash
git reflog
git checkout -b recovery-branch <commit-hash>
```

### Committed on Local `main` by Mistake
Run `.\scripts\create-pr-from-main.ps1 -Title "..."` to move the commits onto a `hotfix/` branch and open a PR.
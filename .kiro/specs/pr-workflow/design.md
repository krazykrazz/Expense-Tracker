# Design Document: Simple PR Workflow

## Overview

This design document outlines a lightweight PR workflow for the Expense Tracker project. The solution updates the existing promotion script to create PRs instead of direct merges, and adds a new script for creating PRs from quick fixes on main. This allows CI to run before code reaches main. No branch protection rules are required.

## Architecture

### Feature Branch Workflow

```
Feature Branch → Create PR → CI Runs → Review Results → Merge PR → Delete Branch
```

1. Developer works on a feature branch
2. When ready, run `promote-feature.ps1` which creates a PR
3. GitHub Actions CI runs automatically on the PR
4. Developer checks CI results on GitHub
5. If CI passes, merge via web UI or `gh pr merge`
6. Delete the feature branch

### Quick Fix Workflow (changes on main)

```
Changes on Main → Create Temp Branch → Create PR → CI Runs → Merge PR → Pull Changes
```

1. Developer makes changes directly on main (bug fix, version bump, etc.)
2. Run `create-pr-from-main.ps1` which creates a temporary branch and PR
3. GitHub Actions CI runs automatically on the PR
4. If CI passes, merge via web UI or `gh pr merge`
5. Pull the merged changes back to local main

### Key Design Decisions

1. **No branch protection** - Relies on developer discipline rather than server-side enforcement
2. **CI visibility** - PRs provide a clear place to see CI status before merging
3. **Flexibility** - Direct merge still available via `-DirectMerge` flag for quick fixes
4. **Minimal tooling** - Uses existing `gh` CLI, falls back to web UI instructions

## Components

### 1. Updated Promotion Script (`scripts/promote-feature.ps1`)

**Updated Interface:**
```powershell
.\scripts\promote-feature.ps1 -FeatureName <string> [-SkipTests] [-DirectMerge]
```

**Parameters:**
- `FeatureName` (required): Name of the feature (without `feature/` prefix)
- `SkipTests`: Skip running local tests before creating PR
- `DirectMerge`: Bypass PR workflow and merge directly (existing behavior)

**Updated Behavior:**
1. Verify feature branch exists
2. Check for uncommitted changes
3. Sync with main (merge main into feature branch)
4. Run local tests (unless `-SkipTests`)
5. Push feature branch to origin
6. **NEW**: Create PR via `gh pr create` (or provide web UI URL)
7. Output PR URL and next steps

**When `-DirectMerge` is used:**
- Performs the existing direct merge behavior
- Useful when CI was already verified on the feature branch

### 2. Quick Fix PR Script (`scripts/create-pr-from-main.ps1`)

**Interface:**
```powershell
.\scripts\create-pr-from-main.ps1 -Title <string> [-Description <string>]
```

**Parameters:**
- `Title` (required): PR title describing the change
- `Description` (optional): PR description

**Behavior:**
1. Verify on main branch
2. Check for uncommitted changes (commit them if present)
3. Create a temporary branch (e.g., `hotfix/YYYYMMDD-HHMMSS`)
4. Push the temporary branch
5. Create PR via `gh pr create` (or provide web UI URL)
6. Output PR URL and next steps
7. Switch back to main and provide instructions to pull after merge

### PR Creation Logic

```powershell
# Check if gh CLI is available
$ghAvailable = Get-Command gh -ErrorAction SilentlyContinue

if ($ghAvailable) {
    # Create PR via CLI
    $prUrl = gh pr create --base main --head "feature/$FeatureName" --title $title --body $body
    Write-Host "PR created: $prUrl"
    Write-Host "CI will run automatically. Check status at the PR page."
} else {
    # Provide web UI instructions
    $repoUrl = git remote get-url origin
    # Convert to compare URL
    Write-Host "GitHub CLI not available. Create PR manually:"
    Write-Host "  $compareUrl"
}
```

### PR Title Generation

Convert feature name to readable title:
- `budget-alerts` → `Budget Alerts`
- `multi-invoice-support` → `Multi Invoice Support`

```powershell
function ConvertTo-PRTitle {
    param([string]$FeatureName)
    return ($FeatureName -replace '-', ' ') -replace '\b(\w)', { $_.Groups[1].Value.ToUpper() }
}
```

## Documentation Updates

### Files to Update

1. **`docs/development/FEATURE_BRANCH_WORKFLOW.md`**
   - Add section on PR workflow
   - Explain CI integration
   - Document when to use direct merge

2. **`.kiro/steering/git-commits.md`**
   - Add guidance for PR-based promotion
   - Explain the workflow to the agent

### Workflow Documentation Content

```markdown
## PR Workflow

When promoting a feature branch to main:

1. Run `.\scripts\promote-feature.ps1 -FeatureName your-feature`
2. The script creates a PR to main
3. GitHub Actions CI runs automatically
4. Check CI status on the PR page
5. If CI passes, merge the PR via web UI or `gh pr merge`
6. Delete the feature branch

### When to Use Direct Merge

Use `-DirectMerge` flag when:
- Making a quick bug fix that doesn't need CI verification
- CI was already run on the feature branch
- Emergency hotfix needed immediately
```

## Error Handling

### GitHub CLI Not Available

When `gh` is not installed:
1. Detect via `Get-Command gh -ErrorAction SilentlyContinue`
2. Output instructions for manual PR creation
3. Provide the GitHub compare URL
4. Exit successfully (not an error, just a different path)

### Push Failures

When push to origin fails:
1. Report the error
2. Suggest checking remote access
3. Exit with error code

## Testing Strategy

This feature is primarily PowerShell scripts and documentation. Testing approach:

1. **Manual testing** - Test the script with a real feature branch
2. **Documentation review** - Verify docs are accurate and complete

No automated tests needed for this feature.

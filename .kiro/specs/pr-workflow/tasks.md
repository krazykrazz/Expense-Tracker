# Implementation Plan: PR Workflow

## Overview

This implementation adds a Pull Request-based workflow to the existing feature branch promotion model. The approach updates the existing promotion script to create PRs by default (with direct merge fallback), adds a new script for quick fixes on main, and updates documentation and steering files.

## Tasks

- [x] 1. Update Promotion Script for PR Creation
  - [x] 1.1 Refactor `scripts/promote-feature.ps1` to create PRs by default
    - Replace direct merge logic with PR creation as the default behavior
    - Add `-DirectMerge` switch parameter to retain direct merge capability
    - Keep existing functionality: branch verification, uncommitted changes check, sync with main, test execution
    - _Requirements: 1.1, 1.7_

  - [x] 1.2 Add GitHub CLI detection and PR creation logic
    - Detect `gh` CLI availability using `Get-Command gh -ErrorAction SilentlyContinue`
    - Push feature branch to origin before PR creation
    - Execute `gh pr create --base main --head "feature/$FeatureName" --title $title --body $body`
    - Output PR URL after successful creation
    - _Requirements: 1.2, 1.5, 1.6_

  - [x] 1.3 Add web UI fallback when GitHub CLI unavailable
    - Extract repository URL from `git remote get-url origin`
    - Convert to GitHub compare URL format
    - Display instructions for manual PR creation
    - _Requirements: 1.3_

  - [x] 1.4 Add PR title generation function
    - Create `ConvertTo-PRTitle` function to convert kebab-case to Title Case
    - Example: `budget-alerts` → `Budget Alerts`
    - _Requirements: 1.4_

  - [x] 1.5 Update script output messages for PR workflow
    - Show PR URL after creation
    - Display next steps: check CI status, merge when ready
    - Provide `gh pr merge` command suggestion
    - _Requirements: 1.6_

- [x] 2. Create Quick Fix PR Script
  - [x] 2.1 Create `scripts/create-pr-from-main.ps1` with parameter handling
    - Accept `-Title` (required) and `-Description` (optional) parameters
    - Verify current branch is main
    - Exit with error if not on main branch
    - _Requirements: 3.1_

  - [x] 2.2 Add uncommitted changes handling
    - Detect uncommitted changes using `git status --porcelain`
    - Prompt user to commit staged changes if present
    - Support both staged changes and recent commits
    - _Requirements: 3.5_

  - [x] 2.3 Add temporary branch creation logic
    - Generate branch name with timestamp: `hotfix/YYYYMMDD-HHMMSS`
    - Create branch using `git checkout -b $branchName`
    - Push branch to origin
    - _Requirements: 3.2_

  - [x] 2.4 Add PR creation logic with CLI/web fallback
    - Detect GitHub CLI availability
    - Create PR using `gh pr create` if available
    - Provide web UI URL fallback if CLI unavailable
    - _Requirements: 3.3_

  - [x] 2.5 Add post-PR instructions
    - Switch back to main branch after PR creation
    - Display instructions to pull merged changes: `git pull origin main`
    - Provide `gh pr merge` command suggestion
    - _Requirements: 3.4_

- [x] 3. Checkpoint - Scripts complete
  - Ensure scripts work correctly, ask the user if questions arise.

- [x] 4. Update Documentation
  - [x] 4.1 Update `docs/development/FEATURE_BRANCH_WORKFLOW.md` with PR workflow
    - Add "PR Workflow" section explaining the new default behavior
    - Document that CI runs automatically on PRs to main
    - Include instructions for both CLI (`gh pr create`) and web UI methods
    - Document when `-DirectMerge` flag is acceptable
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 4.2 Add quick fix PR workflow section to documentation
    - Document `create-pr-from-main.ps1` usage
    - Explain when to use quick fix workflow vs feature branch workflow
    - Include example commands and expected output
    - _Requirements: 2.1_

  - [x] 4.3 Update `docs/development/GITHUB_ACTIONS_CICD.md`
    - Add note about CI running automatically on PRs to main
    - Explain how to check CI status on PR page
    - Document the PR merge process after CI passes
    - _Requirements: 2.2_

- [x] 5. Update Steering Files
  - [x] 5.1 Update `.kiro/steering/git-commits.md` with PR workflow guidance
    - Add section explaining PR-based promotion is now the default
    - Guide agent to use `promote-feature.ps1` for feature promotion
    - Guide agent to use `create-pr-from-main.ps1` for quick fixes on main
    - Document when each script should be used
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 6. Final Checkpoint
  - Ensure all documentation is accurate, ask the user if questions arise.

## Notes

- This feature is primarily PowerShell scripts and documentation - no automated tests needed
- Manual testing with a real feature branch is recommended for Task 1
- The implementation builds on existing feature branch infrastructure
- No database changes or version bump required for this feature


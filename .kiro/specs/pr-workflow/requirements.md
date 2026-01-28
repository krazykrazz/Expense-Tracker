# Requirements Document

## Introduction

This document defines the requirements for implementing a simple Pull Request (PR) based workflow for the Expense Tracker project. The goal is to use PRs to trigger CI checks before merging to main, without requiring GitHub branch protection rules (which aren't available on private repos without a paid plan).

## Glossary

- **PR_System**: The Pull Request workflow including scripts and documentation
- **CI_Pipeline**: The existing GitHub Actions CI workflow that runs tests on PRs
- **Feature_Branch**: A git branch following the `feature/*` naming convention
- **Promotion_Script**: The PowerShell script (`promote-feature.ps1`) used to promote features

## Requirements

### Requirement 1: PR-Based Promotion Script

**User Story:** As a developer, I want the promotion script to create PRs instead of direct merges, so that CI runs before code reaches main.

#### Acceptance Criteria

1. THE Promotion_Script SHALL create a PR to main instead of directly merging
2. WHEN creating a PR, THE script SHALL use GitHub CLI (`gh`) if available
3. WHEN GitHub CLI is not available, THE script SHALL provide the web UI URL for manual PR creation
4. THE script SHALL auto-generate a PR title from the feature branch name
5. THE script SHALL push any unpushed commits before creating the PR
6. WHEN a PR is created, THE script SHALL output the PR URL
7. THE script SHALL retain a `-DirectMerge` flag for cases where direct merge is preferred

### Requirement 2: Documentation Updates

**User Story:** As a developer, I want documentation explaining the PR workflow, so that I understand the process.

#### Acceptance Criteria

1. THE PR_System SHALL update `docs/development/FEATURE_BRANCH_WORKFLOW.md` to document the PR-based workflow
2. THE documentation SHALL explain that CI runs automatically on PRs to main
3. THE documentation SHALL include instructions for both CLI and web UI methods
4. THE documentation SHALL explain when direct merge is acceptable

### Requirement 3: Quick Fix PR Script

**User Story:** As a developer, I want a script to create PRs from commits made directly on main, so that CI runs before pushing.

#### Acceptance Criteria

1. THE PR_System SHALL provide a script to create a PR from uncommitted or committed changes on main
2. THE script SHALL create a temporary branch from the current main state
3. THE script SHALL create a PR from the temporary branch to main
4. WHEN the PR is merged, THE script SHALL provide instructions to pull the merged changes
5. THE script SHALL work with both staged changes and recent commits

### Requirement 4: Steering File Updates

**User Story:** As a developer using Kiro, I want the agent to understand the PR workflow, so that it guides me correctly.

#### Acceptance Criteria

1. THE PR_System SHALL update `.kiro/steering/git-commits.md` to reference the PR workflow
2. WHEN the agent assists with feature promotion, THE steering files SHALL guide it to create PRs
3. WHEN the agent makes changes directly on main, THE steering files SHALL guide it to use the quick fix PR script
4. THE steering files SHALL explain the PR workflow for both feature branches and direct main changes
